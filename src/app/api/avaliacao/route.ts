import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logLeadCaptured, logApiTelemetry } from "../../../lib/telemetry";
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
    console.error("[Avaliacao API] Turnstile validation failed:", error);
    return false;
  }
}



export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let requestBody: any = null;
  const supabase = await createServerSupabaseClient();

  const sendResponse = (res: NextResponse, errorDetails?: any) => {
    const durationMs = Date.now() - startTime;
    logApiTelemetry("POST", "/api/avaliacao", durationMs, res.status, requestBody, errorDetails);
    return res;
  };

  try {
    requestBody = await request.json().catch(() => null);
    
    if (!requestBody) {
      return sendResponse(
        NextResponse.json({ error: "Corpo da requisição inválido ou ausente." }, { status: 400 }),
        "Corpo da requisição inválido ou ausente."
      );
    }

    const { marca, modelo, ano, estado, nome, telefone, tipo_veiculo, turnstileToken } = requestBody;

    // 1. Verify Turnstile Captcha
    if (!turnstileToken) {
      return sendResponse(
        NextResponse.json({ error: "Token de segurança captcha ausente." }, { status: 400 }),
        "Token de segurança captcha ausente."
      );
    }

    const isHuman = await verifyTurnstileToken(turnstileToken);
    if (!isHuman) {
      return sendResponse(
        NextResponse.json({ error: "Falha na verificação de segurança (Anti-Spam)." }, { status: 403 }),
        "Falha na verificação de segurança (Anti-Spam)."
      );
    }

    // 2. Validate mandatory payload properties
    if (!marca || !modelo || !ano || !estado || !nome || !telefone) {
      return sendResponse(
        NextResponse.json(
          { error: "Campos obrigatórios ausentes: marca, modelo, ano, estado, nome e telefone são necessários." },
          { status: 400 }
        ),
        "Campos obrigatórios ausentes: marca, modelo, ano, estado, nome e telefone são necessários."
      );
    }

    // 3. Schema validation (Vehicle Type)
    const resolvedType = tipo_veiculo || "carros";
    if (!["carros", "motos", "caminhoes"].includes(resolvedType)) {
      return sendResponse(
        NextResponse.json({ error: "Categoria de veículo inválida." }, { status: 400 }),
        `Categoria de veículo inválida: ${resolvedType}`
      );
    }

    // 4. Schema validation (Phone number format validation)
    const phoneClean = telefone.replace(/\D/g, "");
    if (phoneClean.length < 10) {
      return sendResponse(
        NextResponse.json({ error: "Número de telefone inválido (deve conter DDD)." }, { status: 400 }),
        `Número de telefone muito curto: ${phoneClean}`
      );
    }

    const formattedPhone = phoneClean.length === 10 || phoneClean.length === 11
      ? (phoneClean.startsWith("55") ? phoneClean : `55${phoneClean}`)
      : phoneClean;
    const remoteJid = `${formattedPhone}@s.whatsapp.net`;

    // 5. Extract tracking identifier
    const cookieStore = await cookies();
    const agUid = requestBody.ag_uid || requestBody.agUid || cookieStore.get("ag_uid")?.value || "ag_ref_nao_localizado";

    // 6. Construct n8n webhook payload
    const n8nPayload = {
      remoteJid,
      telefone: formattedPhone,
      marca,
      modelo,
      ano: Number(ano),
      estado,
      nome,
      tipo_veiculo: resolvedType,
      fipe_valor: requestBody.fipe_valor || "",
      fipe_codigo: requestBody.fipe_codigo || "",
      ag_uid: agUid,
      utm_source: request.nextUrl.searchParams.get("utm_source") || undefined,
      utm_medium: request.nextUrl.searchParams.get("utm_medium") || undefined,
      utm_campaign: request.nextUrl.searchParams.get("utm_campaign") || undefined,
      created_at: new Date().toISOString()
    };

    // 7. Load webhook settings from database to get the configured custom URL
    const { data: webhooksRow } = await supabase
      .from("site_settings")
      .select("*")
      .eq("id", "webhooks")
      .maybeSingle();

    const webhooks = webhooksRow?.data || {};
    const dbSecretToken = webhooks.apiSecretToken;
    const secretToken = dbSecretToken || process.env.N8N_SECRET_TOKEN;

    const n8nWebhookUrl = webhooks.webhookAvaliacaoUrl?.trim() 
      || process.env.N8N_WEBHOOK_AVALIACAO_URL 
      || "https://n8n.v2o5.com.br/webhook/sdr-captura-lead";

    // 8. Send POST request to n8n with secret token authentication
    const response = await fetch(n8nWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secretToken && secretToken.trim() !== "" ? { "Authorization": `Bearer ${secretToken.trim()}` } : {})
      },
      body: JSON.stringify(n8nPayload)
    });

    // 9. Invoke Telemetry Hook
    logLeadCaptured({
      marca,
      modelo,
      ano,
      estado: `Auto-Avaliação (${resolvedType})`,
      nome,
      telefone,
      agUid,
      status: response.status
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.warn(`[Webhook n8n Proxy] Evaluation error response [${response.status}]: ${errorText}`);
    }

    return sendResponse(
      NextResponse.json({
        success: true,
        message: "Lead de avaliação processado com sucesso.",
        ref: agUid
      })
    );
  } catch (error: any) {
    console.error("[API Avaliação] Unhandled error captured:", error);
    return sendResponse(
      NextResponse.json({ error: "Erro interno no servidor ao processar a avaliação." }, { status: 500 }),
      error?.message || error
    );
  }
}
