import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/**
 * Enriches and cleans the payload for better usability in n8n/webhooks
 */
async function enrichPayload(event: string, payload: any, supabase: any): Promise<any> {
  if (!payload) return null;

  // Helper to fetch vehicle info
  const getVehicleInfo = async (vehicleId: string | null, embeddedVehicle?: any) => {
    if (embeddedVehicle) {
      return `${embeddedVehicle.marca} ${embeddedVehicle.modelo} (${embeddedVehicle.ano})`;
    }
    if (!vehicleId) return null;
    try {
      const { data } = await supabase
        .from("estoque_motors")
        .select("marca, modelo, ano")
        .eq("id", vehicleId)
        .maybeSingle();
      return data ? `${data.marca} ${data.modelo} (${data.ano})` : null;
    } catch {
      return null;
    }
  };

  // Os eventos do caixa legado (conta_*, recorrente_*, compra_*, fornecedor_*)
  // foram aposentados em 2026-08-28 junto com o módulo financeiro — decisão do
  // dono: o financeiro renasce do zero sobre o razão do handoff (spec 30).
  // Quando o razão emitir eventos, eles ganham nomes novos aqui e no
  // WEBHOOKS_N8N.md; os antigos não voltam.

  // Aporte/retirada de investidor (briefing 2026-08-21). `valor` é sempre
  // positivo — o lado mora em `tipo`, como nos contadores de conta_vencida.
  if (event.startsWith("investidor_")) {
    const veiculo = await getVehicleInfo(payload.veiculo_id, payload.veiculo?.marca ? payload.veiculo : undefined);
    let investidor = payload.investidor?.nome || null;
    if (!investidor && payload.investidor_id) {
      try {
        const { data } = await supabase
          .from("investidores")
          .select("nome")
          .eq("id", payload.investidor_id)
          .maybeSingle();
        investidor = data?.nome || null;
      } catch {
        investidor = null;
      }
    }
    return {
      id: payload.id,
      investidor,
      tipo: payload.tipo,
      valor: Number(payload.valor),
      data: payload.data,
      descricao: payload.descricao,
      forma_pagamento: payload.forma_pagamento || null,
      veiculo,
      observacoes: payload.observacoes || null
    };
  }

  return payload;
}

/**
 * Dispatches an administrative event webhook payload if configured and enabled.
 */
export async function dispatchAdminWebhook(event: string, payload: any) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn("[WebhookDispatcher] Supabase keys missing, skipping dispatch.");
      return;
    }
    
    // 1. Fetch webhook settings (bypass RLS using service key if available)
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: row } = await supabase
      .from("site_settings")
      .select("data")
      .eq("id", "webhooks")
      .maybeSingle();

    if (!row || !row.data) {
      console.info("[WebhookDispatcher] Webhook settings not found in database, skipping dispatch.");
      return;
    }

    const webhooks = row.data;
    const notificationsUrl = webhooks.webhookNotificacoesUrl || process.env.N8N_ADMIN_WEBHOOK_URL;
    
    if (!notificationsUrl) {
      console.info("[WebhookDispatcher] Notifications webhook URL is not configured, skipping dispatch.");
      return;
    }

    // 2. Check if event is enabled in the checklist
    const eventsConfig = webhooks.events || {};
    const isEnabled = eventsConfig[event] !== false; // default to true if not defined

    if (!isEnabled) {
      console.info(`[WebhookDispatcher] Event "${event}" is disabled by configuration.`);
      return;
    }

    // Enrich and sanitize payload
    const enrichedData = await enrichPayload(event, payload, supabase);

    // 3. Dispatch the payload
    const secretToken = webhooks.apiSecretToken || process.env.N8N_SECRET_TOKEN;

    console.log(`[WebhookDispatcher] Dispatching administrative event "${event}" to ${notificationsUrl}`);
    const res = await fetch(notificationsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Event": event,
        ...(secretToken && secretToken.trim() !== "" ? { "Authorization": `Bearer ${secretToken.trim()}` } : {})
      },
      body: JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data: enrichedData
      })
    });

    if (res.ok) {
      console.log(`[WebhookDispatcher] Successfully dispatched event "${event}" to webhook.`);
    } else {
      const text = await res.text().catch(() => "");
      console.warn(`[WebhookDispatcher] Webhook returned status ${res.status} for event "${event}": ${text}`);
    }
  } catch (err: any) {
    console.error(`[WebhookDispatcher] Failed to dispatch event "${event}":`, err.message);
  }
}
