import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Auth & Role check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // 1. Run update database function for overdue accounts
    await supabase.rpc("atualizar_contas_vencidas");

    // 2. Fetch configured n8n webhook URL
    const { data: webhookSettings } = await supabase
      .from("site_settings")
      .select("data")
      .eq("id", "webhooks")
      .single();

    const webhookUrl = webhookSettings?.data?.webhookNotificacoesUrl
      || webhookSettings?.data?.webhookUrl
      || process.env.NEXT_PUBLIC_N8N_WEBHOOK_LEAD_URL;

    if (!webhookUrl) {
      return NextResponse.json({ error: "Webhook URL de integrações não configurada" }, { status: 400 });
    }

    // Mesma resolução de token do webhook-dispatcher: campo do painel com a env
    // como fallback. Antes daqui saía `Bearer ` (token vazio) sempre, mesmo sem
    // token nenhum — o que, com autenticação ligada no n8n, vira 403.
    const secretToken = (webhookSettings?.data?.apiSecretToken || process.env.N8N_SECRET_TOKEN || "").trim();

    // Check if notifications for overdue accounts (conta_vencida) are enabled
    const eventsConfig = webhookSettings?.data?.events || {};
    const isContaVencidaEnabled = eventsConfig.conta_vencida !== false; // default to true if not defined

    if (!isContaVencidaEnabled) {
      console.log("[WebhookDispatch] Notification for overdue accounts (conta_vencida) is disabled in configurations.");
      return NextResponse.json({ success: true, message: "Notificação de contas vencidas desativada nas configurações." });
    }

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Fetch accounts to notify (pendente or vencido status)
    const { data: accounts, error: fetchError } = await supabase
      .from("contas")
      .select(`
        *,
        categoria:categorias_financeiras (nome, icone)
      `)
      .in("status", ["pendente", "vencido"]);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    let notifiedCount = 0;

    const formatPrice = (value: number) => {
      return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    };

    const formatDate = (dateStr: string) => {
      const parts = dateStr.split("-");
      return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
    };

    for (const c of accounts) {
      const dueDate = new Date(c.data_vencimento + "T12:00:00");
      // Difference in days
      const timeDiff = dueDate.getTime() - today.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

      let shouldNotify = false;
      let notificationType: "vencimento_proximo" | "vencido" | "lembrete" = "vencimento_proximo";
      let message = "";

      // Rules: 3 days before, 1 day before, today (vencendo hoje), or 7 days overdue
      if (daysDiff === 3 || daysDiff === 1) {
        shouldNotify = true;
        notificationType = "vencimento_proximo";
        message = `⚠️ *AVISO DE VENCIMENTO*\n\n📋 *Conta:* ${c.descricao}\n💰 *Valor:* ${formatPrice(c.valor)}\n📅 *Vence em:* ${formatDate(c.data_vencimento)} (${daysDiff === 1 ? "Amanhã" : "Em 3 dias"})\n🏢 *Parceiro:* ${c.fornecedor || c.cliente || "Geral"}\n\n_Motors Financeiro_`;
      } else if (daysDiff === 0) {
        shouldNotify = true;
        notificationType = "vencido";
        message = `🚨 *CONTA VENCENDO HOJE*\n\n📋 *Conta:* ${c.descricao}\n💰 *Valor:* ${formatPrice(c.valor)}\n📅 *Vence:* ${formatDate(c.data_vencimento)} (Hoje)\n🏢 *Parceiro:* ${c.fornecedor || c.cliente || "Geral"}\n\n_Motors Financeiro_`;
      } else if (daysDiff === -7) {
        shouldNotify = true;
        notificationType = "vencido";
        message = `🔥 *CONTA EM ATRASO (VENCIDA)*\n\n📋 *Conta:* ${c.descricao}\n💰 *Valor:* ${formatPrice(c.valor)}\n📅 *Venceu em:* ${formatDate(c.data_vencimento)} (Há 7 dias)\n🏢 *Parceiro:* ${c.fornecedor || c.cliente || "Geral"}\n\n⚠️ Por favor, providencie o pagamento para evitar juros.\n\n_Motors Financeiro_`;
      }

      if (shouldNotify) {
        // Check if we already notified this account for this specific type to avoid duplication
        const { data: alreadyNotified } = await supabase
          .from("notificacoes_financeiras")
          .select("id")
          .eq("conta_id", c.id)
          .eq("tipo", notificationType)
          .single();

        if (!alreadyNotified) {
          // Envia no Formato C do WEBHOOKS_N8N.md — { event, timestamp, data },
          // com o mesmo desenho de `data` que o webhook-dispatcher produz para o
          // prefixo `conta_`. Até 2026-08-12 esta rota mandava uma forma própria
          // ({ tipo, subtipo, conta, mensagem }), sem `event` nem `data`: o único
          // consumidor, o workflow adm-motors, rejeitava com "Payload inválido" e
          // o template de conta_vencida nunca chegava a rodar.
          //
          // `mensagem` saiu do corpo de propósito. Quem formata texto de WhatsApp
          // é o n8n, para os onze eventos. O `message` daqui segue sendo gravado
          // em `notificacoes_financeiras` como registro do que motivou o aviso.
          try {
            const webhookRes = await fetch(webhookUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Admin-Event": "conta_vencida",
                ...(secretToken ? { "Authorization": `Bearer ${secretToken}` } : {})
              },
              body: JSON.stringify({
                event: "conta_vencida",
                timestamp: new Date().toISOString(),
                data: {
                  id: c.id,
                  tipo: c.tipo,
                  descricao: c.descricao,
                  valor: Number(c.valor),
                  vencimento: c.data_vencimento,
                  pagamento: c.data_pagamento || null,
                  status: c.status,
                  categoria: c.categoria
                    ? `${c.categoria.icone || "📁"} ${c.categoria.nome}`
                    : "Outros",
                  parceiro: c.tipo === "pagar" ? c.fornecedor : c.cliente,
                  forma_pagamento: c.forma_pagamento || null,
                  parcela: c.total_parcelas > 1
                    ? `${c.parcela_atual} de ${c.total_parcelas}`
                    : "1 de 1",
                  // `conta_vencida` cobre os dois lados do vencimento, como diz o
                  // rótulo do painel. Quem separa é o subtipo; os dois contadores
                  // são sempre >= 0 para não obrigar o n8n a ler sinal.
                  subtipo: notificationType,
                  dias_atraso: Math.max(0, -daysDiff),
                  dias_para_vencer: Math.max(0, daysDiff)
                }
              })
            });

            if (!webhookRes.ok) {
              // Sem este aviso, uma recusa persistente é invisível: o registro
              // abaixo não é gravado, a rota devolve success com notifiedCount 0
              // e reprocessa as mesmas contas na execução seguinte, para sempre.
              const corpo = await webhookRes.text().catch(() => "");
              console.warn(
                `[WebhookDispatch] Webhook devolveu ${webhookRes.status} para a conta ${c.id}: ${corpo}`
              );
            } else {
              // Register notification success in db
              await supabase
                .from("notificacoes_financeiras")
                .insert({
                  conta_id: c.id,
                  tipo: notificationType,
                  mensagem: message,
                  enviada: true,
                  enviada_em: new Date().toISOString()
                });

              notifiedCount++;
            }
          } catch (err) {
            console.error(`[WebhookDispatch] Failed to notify account ${c.id}:`, err);
          }
        }
      }
    }

    return NextResponse.json({ success: true, notifiedCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
