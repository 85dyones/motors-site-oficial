import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logLeadCaptured } from "../../../lib/telemetry";
import { createAdminSupabaseClient } from "../../../lib/supabase-server";
import { getCachedSettings } from "../../../lib/settings";
import { sendCapiEvent } from "../../../lib/meta-capi";

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
    const body = await request.json().catch(() => null);
    
    if (!body) {
      return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
    }

    const { cliente, veiculo, utm, intencao_busca, agUid, webhookUrl, turnstileToken } = body;

    // 1. Verify Turnstile Captcha (only mandatory for user modals that render captcha)
    const needsCaptcha = ["WhatsApp Card", "WhatsApp PDP", "CarMatch Recommendations", "Appraisal Chat", "WhatsApp Proposta", "WhatsApp Dúvidas"].includes(body.canal);

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
    //
    // Via `getCachedSettings`, não com o cliente da requisição: este POST vem de
    // visitante sem sessão, ou seja, papel `anon` — e desde
    // `20260812120000_rls_leitura_de_site_settings.sql` a linha `webhooks` não
    // é mais legível por anônimo (ela carrega o `apiSecretToken`). O `select`
    // daqui voltaria null e o lead sairia para o n8n SEM `Authorization`, em
    // silêncio, porque o disparo é não-bloqueante de propósito.
    const { webhooks: webhooksSalvos } = await getCachedSettings();
    const webhooks = webhooksSalvos || {};
    const dbSecretToken = webhooks.apiSecretToken;
    const secretToken = dbSecretToken || process.env.N8N_SECRET_TOKEN;

    let targetWebhookUrl = "";
    if (body.canal === "WhatsApp Proposta") {
      targetWebhookUrl = webhooks.webhookPropostaUrl?.trim() || webhooks.webhookUrl?.trim();
    } else if (body.canal === "WhatsApp Dúvidas") {
      targetWebhookUrl = webhooks.webhookDuvidasUrl?.trim() || webhooks.webhookUrl?.trim();
    } else {
      targetWebhookUrl = webhooks.webhookUrl?.trim();
    }

    if (!targetWebhookUrl) {
      targetWebhookUrl = process.env.N8N_WEBHOOK_LEAD_URL || "https://n8n.v2o5.com.br/webhook/lead-entrada";
    }

    // 4. Construct payload for n8n
    const cookieStore = await cookies();
    const resolvedAgUid = agUid || body.ag_uid || cookieStore.get("ag_uid")?.value || "ag_ref_nao_localizado";

    // Format phone clean and JID safely
    const rawWhatsapp = typeof cliente?.whatsapp === "string" ? cliente.whatsapp : "";
    const phoneClean = rawWhatsapp.replace(/\D/g, "");
    const formattedPhone = phoneClean.length === 10 || phoneClean.length === 11
      ? (phoneClean.startsWith("55") ? phoneClean : `55${phoneClean}`)
      : phoneClean;
    const remoteJid = formattedPhone ? `${formattedPhone}@s.whatsapp.net` : "";

    const n8nPayload = {
      remoteJid,
      telefone: formattedPhone,
      canal: body.canal || "N/A",
      mensagem: body.mensagem || "",
      tipo: body.tipo || "lead_whatsapp",
      cliente: {
        nome: cliente.nome,
        email: cliente.email || "",
        whatsapp: rawWhatsapp
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

    // 5.2 Persistência do lead — telas A1/A8/A9 do painel.
    //
    // Até 2026-08-07 o lead existia só no webhook do n8n: quem não abrisse o
    // n8n não tinha como saber que alguém pediu contato. Agora fica também no
    // nosso banco, com o que o dono decidiu guardar (nome, telefone,
    // interesse) e sem prazo de expiração.
    //
    // Mesma regra do webhook e da CAPI: **nunca bloqueia**. O visitante está
    // a caminho do WhatsApp, e falha de gravação nossa não pode segurá-lo —
    // perder o registro é ruim, travar o contato é pior.
    try {
      // `insert` na tabela `leads` exige contornar a RLS (não há policy de
      // INSERT para anônimo, de propósito), então usa a chave de serviço.
      const supabaseAdmin = createAdminSupabaseClient();

      // "Interesse" é o que a pessoa quer, na melhor forma disponível: o
      // veículo da ficha, senão o que ela digitou, senão a busca que fazia.
      const interesse =
        (veiculo && [veiculo.marca, veiculo.modelo, veiculo.versao].filter(Boolean).join(" ")) ||
        body.mensagem ||
        (intencao_busca && Object.values(intencao_busca).filter(Boolean).join(" · ")) ||
        null;

      const { error: erroLead } = await supabaseAdmin.from("leads").insert({
        nome: cliente.nome,
        telefone: formattedPhone || null,
        interesse,
        canal: body.canal || body.tipo || "site",
        veiculo_id: veiculo?.id ? Number(veiculo.id) || null : null,
        // `email` já existia na tabela e alguns formulários do site o
        // coletam — aproveitar a coluna evita perder o dado que já chega.
        email: cliente.email || null,
        // Coluna herdada da tabela de marketing que já existia em produção
        // (ver migração 20260811130000). Era `not null` sem default e sem
        // ninguém preenchendo, o que fazia TODO insert de lead ser recusado
        // — em silêncio, porque esta gravação não bloqueia o visitante.
        //
        // Agora é nulável, e preenchemos quando o cliente mandou o id do
        // evento: é o mesmo que vai para a CAPI do Meta, então o lead passa
        // a dar para cruzar com `capi_meta_*` na mesma linha.
        event_id: body.eventId || null,
      });

      if (erroLead) {
        console.warn("[Leads API] Falha ao gravar lead (não bloqueante):", erroLead.message);
      }
    } catch (erroPersistencia: any) {
      console.warn("[Leads API] Erro ao gravar lead (não bloqueante):", erroPersistencia?.message);
    }

    // 5.5 Meta CAPI — espelha o evento Lead disparado no browser (mesmo event_id = dedup)
    // Non-blocking: falha de CAPI nunca pode travar o retorno ao cliente.
    try {
      const { companySettings } = await getCachedSettings();
      const pixelId = companySettings?.metaPixelId || null;

      if (pixelId && body.eventId) {
        await sendCapiEvent({
          eventName: "Lead",
          eventId: body.eventId,
          eventSourceUrl: body.eventSourceUrl || null,
          userData: {
            email: cliente.email || null,
            phone: rawWhatsapp || null,
            fbp: body.fbp || null,
            fbc: body.fbc || null,
            externalId: resolvedAgUid,
            clientIpAddress:
              request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
              request.headers.get("x-real-ip"),
            clientUserAgent: request.headers.get("user-agent"),
          },
          customData: {
            content_ids: veiculo?.id ? [String(veiculo.id)] : undefined,
            content_type: "product",
            content_name: veiculo ? `${veiculo.marca} ${veiculo.modelo}` : undefined,
            value: veiculo?.preco,
            currency: "BRL",
          },
          pixelId,
        });
      }
    } catch (capiError) {
      console.warn("[Meta CAPI] Falha não-bloqueante no lead:", capiError);
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
