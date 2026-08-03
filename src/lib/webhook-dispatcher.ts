import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/**
 * Enriches and cleans the payload for better usability in n8n/webhooks
 */
async function enrichPayload(event: string, payload: any, supabase: any): Promise<any> {
  if (!payload) return null;

  // Helper to fetch category name
  const getCategoryName = async (categoryId: string | null, embeddedCategory?: any) => {
    if (embeddedCategory) {
      return `${embeddedCategory.icone || "📁"} ${embeddedCategory.nome}`;
    }
    if (!categoryId) return "Outros";
    try {
      const { data } = await supabase
        .from("categorias_financeiras")
        .select("nome, icone")
        .eq("id", categoryId)
        .maybeSingle();
      return data ? `${data.icone || "📁"} ${data.nome}` : "Outros";
    } catch {
      return "Outros";
    }
  };

  // Helper to resolve purchases category text enum to friendly name
  const getPurchaseCategoryFriendly = (cat: string | null) => {
    if (!cat) return "Outros";
    const map: Record<string, string> = {
      peca_reposicao: "🔧 Peça de Reposição",
      acessorio: "🎒 Acessório",
      material_escritorio: "🏢 Material de Escritório",
      material_limpeza: "🧼 Material de Limpeza",
      combustivel: "⛽ Combustível",
      ferramenta: "🛠️ Ferramenta",
      outro: "📁 Outro"
    };
    return map[cat] || cat;
  };

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

  if (event.startsWith("conta_")) {
    const categoria = await getCategoryName(payload.categoria_id, payload.categoria);
    const veiculo = await getVehicleInfo(payload.veiculo_id, payload.veiculo);
    return {
      id: payload.id,
      tipo: payload.tipo,
      descricao: payload.descricao,
      valor: Number(payload.valor),
      vencimento: payload.data_vencimento,
      pagamento: payload.data_pagamento || null,
      status: payload.status,
      categoria,
      parceiro: payload.tipo === "pagar" ? payload.fornecedor : payload.cliente,
      forma_pagamento: payload.forma_pagamento || null,
      parcela: payload.total_parcelas > 1 ? `${payload.parcela_atual} de ${payload.total_parcelas}` : "1 de 1"
    };
  }

  if (event.startsWith("recorrente_")) {
    const categoria = await getCategoryName(payload.categoria_id, payload.categoria);
    return {
      id: payload.id,
      descricao: payload.descricao,
      valor: Number(payload.valor),
      frequencia: payload.frequencia,
      dia_vencimento: payload.dia_vencimento,
      categoria,
      fornecedor: payload.fornecedor || null,
      forma_pagamento: payload.forma_pagamento || null,
      ativa: payload.ativa !== false
    };
  }

  if (event.startsWith("compra_")) {
    const categoria = getPurchaseCategoryFriendly(payload.categoria);
    const veiculo = await getVehicleInfo(payload.veiculo_id, payload.veiculo);
    return {
      id: payload.id,
      descricao: payload.descricao,
      valor: Number(payload.valor_total || payload.valor),
      data_compra: payload.data_compra,
      categoria,
      fornecedor: payload.fornecedor || null,
      veiculo,
      nota_fiscal: payload.nota_fiscal || null,
      status: payload.status
    };
  }

  if (event.startsWith("fornecedor_")) {
    return {
      id: payload.id,
      nome: payload.nome,
      tipo: payload.tipo,
      documento: payload.documento || null,
      telefone: payload.telefone || null,
      email: payload.email || null
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
