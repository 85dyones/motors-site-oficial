import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logLeadCaptured, logApiTelemetry } from "../../../lib/telemetry";
import { createAdminSupabaseClient } from "../../../lib/supabase-server";
import { getCachedSettings } from "../../../lib/settings";
import { recomendarAvaliacao } from "../../../lib/avaliacaoRecomendacao";

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
    const rawTelefone = typeof telefone === "string" ? telefone : String(telefone || "");
    const phoneClean = rawTelefone.replace(/\D/g, "");
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
    //
    // A partir de 2026-08-06 o consultor recebe, além dos dados do veículo e
    // do contato, a recomendação de faixa de compra: o site coleta e sugere,
    // quem decide é a vistoria. O cliente não vê nada disso — ver
    // `lib/avaliacaoRecomendacao.ts`.
    //
    // A recomendação é recalculada aqui, no servidor, e não copiada do corpo
    // da requisição: o cliente é público e não pode ditar o preço que o
    // consultor lê. O que vem do cliente são os fatos (estado e km).
    const quilometragem =
      typeof requestBody.quilometragem === "number" && requestBody.quilometragem >= 0
        ? requestBody.quilometragem
        : null;

    const recomendacao = recomendarAvaliacao({
      estadoMecanico: String(requestBody.estado_mecanico || ""),
      estadoConservacao: String(requestBody.estado_conservacao || ""),
      quilometragem,
      fipeValor: requestBody.fipe_valor || "",
    });

    const n8nPayload = {
      remoteJid,
      telefone: formattedPhone,
      marca,
      modelo,
      ano: Number(ano),
      estado,
      estado_mecanico: requestBody.estado_mecanico || "",
      estado_conservacao: requestBody.estado_conservacao || "",
      quilometragem,
      observacoes: requestBody.observacoes || "",
      nome,
      tipo_veiculo: resolvedType,
      fipe_valor: requestBody.fipe_valor || "",
      fipe_codigo: requestBody.fipe_codigo || "",
      fipe_mes_referencia: requestBody.fipe_mes_referencia || "",
      recomendacao,
      ag_uid: agUid,
      utm_source: requestBody.utm?.utm_source || request.nextUrl.searchParams.get("utm_source") || undefined,
      utm_medium: requestBody.utm?.utm_medium || request.nextUrl.searchParams.get("utm_medium") || undefined,
      utm_campaign: requestBody.utm?.utm_campaign || request.nextUrl.searchParams.get("utm_campaign") || undefined,
      created_at: new Date().toISOString()
    };

    // 6.5 Persistência do lead de avaliação.
    //
    // Até 2026-08-11 esta rota não gravava nada: o pedido de avaliação vivia
    // só no webhook do n8n. Como aquele webhook aponta para um workflow
    // parado, todo pedido de avaliação estava sendo perdido — o mesmo que
    // acontecia com `/api/leads` antes da migração 20260811130000.
    //
    // Mesma regra de lá: **nunca bloqueia**. Quem preencheu a avaliação está
    // a caminho do WhatsApp, e falha de gravação nossa não pode segurá-lo.
    try {
      const supabaseAdmin = createAdminSupabaseClient();
      const { error: erroLead } = await supabaseAdmin.from("leads").insert({
        nome,
        telefone: formattedPhone || null,
        // O interesse aqui é o inverso do lead comum: a pessoa quer VENDER
        // este carro, não comprá-lo. O canal é o que distingue os dois no
        // kanban.
        interesse: [marca, modelo, ano].filter(Boolean).join(" ") || null,
        canal: "Avaliação",
        event_id: requestBody.eventId || null,
      });
      if (erroLead) {
        console.warn("[Avaliacao API] Falha ao gravar lead (não bloqueante):", erroLead.message);
      }
    } catch (erroPersistencia: any) {
      console.warn("[Avaliacao API] Erro ao gravar lead (não bloqueante):", erroPersistencia?.message);
    }

    // 7. Load webhook settings from database to get the configured custom URL
    //
    // Mesma razão de `/api/leads`: quem preenche a avaliação não tem sessão, e
    // desde `20260812120000_rls_leitura_de_site_settings.sql` a linha
    // `webhooks` não é legível pelo papel `anon`. `getCachedSettings` lê com a
    // chave de serviço, que passa por cima do RLS.
    const { webhooks: webhooksSalvos } = await getCachedSettings();
    const webhooks = webhooksSalvos || {};
    const dbSecretToken = webhooks.apiSecretToken;
    const secretToken = dbSecretToken || process.env.N8N_SECRET_TOKEN;

    const n8nWebhookUrl = webhooks.webhookAvaliacaoUrl?.trim() 
      || process.env.N8N_WEBHOOK_AVALIACAO_URL 
      || "https://n8n.v2o5.com.br/webhook/sdr-captura-lead";

    // 8. Send POST request to n8n with secret token authentication
    //
    // Envolvido em try/catch como em `/api/leads`: sem isto, n8n fora do ar
    // derruba o formulário de avaliação para o cliente. Uma indisponibilidade
    // da automação não pode virar indisponibilidade da loja — ainda mais
    // agora que o lead já foi gravado no banco logo acima.
    let response: Response | null = null;
    try {
      response = await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secretToken && secretToken.trim() !== "" ? { "Authorization": `Bearer ${secretToken.trim()}` } : {})
        },
        body: JSON.stringify(n8nPayload)
      });
    } catch (erroWebhook: any) {
      console.warn(`[Webhook n8n Proxy] Erro de rede na avaliação (não bloqueante): ${erroWebhook?.message}`);
    }

    // 9. Invoke Telemetry Hook
    logLeadCaptured({
      marca,
      modelo,
      ano,
      estado: `Auto-Avaliação (${resolvedType})`,
      nome,
      telefone,
      agUid,
      status: response?.status ?? 0
    });

    if (response && !response.ok) {
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
