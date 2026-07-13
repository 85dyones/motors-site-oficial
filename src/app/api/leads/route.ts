import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logLeadCaptured } from "../../../lib/telemetry";
import { createServerSupabaseClient } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

// Verify Cloudflare Turnstile token
async function verifyTurnstileToken(token: string): Promise<boolean> {
  try {
    const secret = process.env.TURNSTILE_SECRET_KEY || "1x0000000000000000000000000000000AA"; // Cloudflare Turnstile Test Secret Key
    
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`
    });

    const data = await response.json();
    return !!data.success;
  } catch (error) {
    console.error("[Leads API] Turnstile validation failed:", error);
    return false;
  }
}



export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const body = await request.json().catch(() => null);
    
    if (!body) {
      return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
    }

    const { cliente, veiculo, utm, intencao_busca, agUid, webhookUrl, turnstileToken } = body;

    // 1. Verify Turnstile Captcha (only mandatory for user modals that render captcha)
    const needsCaptcha = ["WhatsApp Card", "WhatsApp PDP", "CarMatch Recommendations", "Appraisal Chat"].includes(body.canal);

    if (needsCaptcha) {
      if (!turnstileToken) {
        return NextResponse.json({ error: "Token de segurança captcha ausente." }, { status: 400 });
      }

      const isHuman = await verifyTurnstileToken(turnstileToken);
      if (!isHuman) {
        return NextResponse.json({ error: "Falha na verificação de segurança (Anti-Spam)." }, { status: 403 });
      }
    }

    // 2. Validate mandatory payload properties (only nome is required; whatsapp is optional)
    if (!cliente || !cliente.nome) {
      return NextResponse.json({ error: "Dados de contato do cliente ausentes (nome obrigatório)." }, { status: 400 });
    }

    // 3. Load webhook settings from database to get the configured custom URL
    const { data: webhooksRow } = await supabase
      .from("site_settings")
      .select("*")
      .eq("id", "webhooks")
      .maybeSingle();

    const webhooks = webhooksRow?.data || {};
    const dbSecretToken = webhooks.apiSecretToken;
    const secretToken = dbSecretToken || process.env.N8N_SECRET_TOKEN;

    const targetWebhookUrl = webhooks.webhookUrl?.trim() 
      || process.env.N8N_WEBHOOK_LEAD_URL 
      || "https://n8n.v2o5.com.br/webhook/lead-entrada";

    // 4. Construct payload for n8n
    const cookieStore = await cookies();
    const resolvedAgUid = agUid || body.ag_uid || cookieStore.get("ag_uid")?.value || "ag_ref_nao_localizado";

    // Format phone clean and JID
    const phoneClean = cliente.whatsapp.replace(/\D/g, "");
    const formattedPhone = phoneClean.length === 10 || phoneClean.length === 11
      ? (phoneClean.startsWith("55") ? phoneClean : `55${phoneClean}`)
      : phoneClean;
    const remoteJid = `${formattedPhone}@s.whatsapp.net`;

    const n8nPayload = {
      remoteJid,
      telefone: formattedPhone,
      cliente: {
        nome: cliente.nome,
        email: cliente.email || "",
        whatsapp: cliente.whatsapp
      },
      veiculo: veiculo || null,
      utm: utm || {},
      intencao_busca: intencao_busca || {},
      ag_uid: resolvedAgUid,
      created_at: new Date().toISOString()
    };

    // 5. Send POST request to n8n Webhook with secret token authentication
    // Wrapped in try/catch: webhook failures must NEVER block the client's WhatsApp redirect
    let webhookStatus = 0;
    try {
      const response = await fetch(targetWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secretToken && secretToken.trim() !== "" ? { "Authorization": `Bearer ${secretToken.trim()}` } : {})
        },
        body: JSON.stringify(n8nPayload)
      });
      webhookStatus = response.status;

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.warn(`[Webhook n8n Proxy] Error response [${response.status}]: ${errorText}`);
      }
    } catch (webhookError: any) {
      console.warn(`[Webhook n8n Proxy] Network/fetch error (non-blocking): ${webhookError.message}`);
    }

    // 6. Invoke Telemetry Hook
    logLeadCaptured({
      marca: veiculo?.marca || "N/A",
      modelo: veiculo?.modelo || "N/A",
      ano: veiculo?.ano || 0,
      estado: "Fricção Concluída (Site)",
      nome: cliente.nome,
      telefone: cliente.whatsapp || "",
      agUid: resolvedAgUid,
      status: webhookStatus
    });

    return NextResponse.json({
      success: true,
      message: "Lead de atendimento processado com sucesso.",
      ref: resolvedAgUid
    });
  } catch (error: any) {
    console.error("[Leads API Proxy] Unhandled error:", error);
    return NextResponse.json({ error: "Erro interno no servidor ao processar o lead." }, { status: 500 });
  }
}
