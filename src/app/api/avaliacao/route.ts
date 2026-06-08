import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logLeadCaptured, logApiTelemetry } from "../../../lib/telemetry";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let requestBody: any = null;

  const sendResponse = (res: NextResponse, errorDetails?: any) => {
    const durationMs = Date.now() - startTime;
    logApiTelemetry("POST", "/api/avaliacao", durationMs, res.status, requestBody, errorDetails);
    return res;
  };

  try {
    // 1. Safe JSON parsing of incoming evaluation payload
    requestBody = await request.json().catch(() => null);
    
    if (!requestBody) {
      return sendResponse(
        NextResponse.json(
          { error: "Corpo da requisição inválido ou ausente." },
          { status: 400 }
        ),
        "Corpo da requisição inválido ou ausente."
      );
    }

    const { marca, modelo, ano, estado, nome, telefone, webhookUrl, tipo_veiculo } = requestBody;

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

    // 3. Extract tracking identifier from request body or cookies (Antigravity Tracker ID)
    const cookieStore = await cookies();
    const agUid = requestBody.ag_uid || requestBody.agUid || cookieStore.get("ag_uid")?.value || "ag_ref_nao_localizado";

    // 4. Construct n8n webhook payload
    const n8nPayload = {
      marca,
      modelo,
      ano: Number(ano),
      estado,
      nome,
      telefone,
      ag_uid: agUid,
      tipo_veiculo: tipo_veiculo || "carros",
      utm_source: request.nextUrl.searchParams.get("utm_source") || undefined,
      utm_medium: request.nextUrl.searchParams.get("utm_medium") || undefined,
      utm_campaign: request.nextUrl.searchParams.get("utm_campaign") || undefined,
      created_at: new Date().toISOString(),
    };

    // 5. Send POST request to n8n Captura Lead Webhook
    const n8nWebhookUrl = webhookUrl?.trim() || process.env.NEXT_PUBLIC_N8N_WEBHOOK_AVALIACAO_URL || process.env.N8N_WEBHOOK_AVALIACAO_URL || "https://n8n.v2o5.com.br/webhook/sdr-captura-lead";
    
    const response = await fetch(n8nWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(n8nPayload),
    });

    // 6. Invoke Telemetry Hook
    logLeadCaptured({
      marca,
      modelo,
      ano,
      estado,
      nome,
      telefone,
      agUid,
      status: response.status,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.warn(`[Webhook n8n] Captura error response [${response.status}]: ${errorText}`);
      
      return sendResponse(
        NextResponse.json(
          { error: "Falha na sincronização externa com o webhook do CRM." },
          { status: 502 }
        ),
        `Falha no Webhook CRM com status ${response.status}: ${errorText}`
      );
    }

    return sendResponse(
      NextResponse.json({
        success: true,
        message: "Lead de avaliação capturado e encaminhado com sucesso.",
        ref: agUid,
      })
    );
  } catch (error: any) {
    console.error("[API Avaliação] Unhandled error captured:", error);
    return sendResponse(
      NextResponse.json(
        { error: "Erro interno no servidor ao processar a avaliação." },
        { status: 500 }
      ),
      error?.message || error
    );
  }
}

