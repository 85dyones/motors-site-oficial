import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";

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

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Fetch accounts to notify (pendente or vencido status)
    const { data: accounts, error: fetchError } = await supabase
      .from("contas")
      .select(`
        *,
        categoria:categorias_financeiras (nome)
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
          // Send Webhook to n8n
          try {
            const webhookRes = await fetch(webhookUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.N8N_SECRET_TOKEN || ""}`
              },
              body: JSON.stringify({
                tipo: "notificacao_financeira",
                subtipo: notificationType,
                conta: {
                  descricao: c.descricao,
                  valor: c.valor,
                  data_vencimento: c.data_vencimento,
                  categoria: c.categoria?.nome || "Geral",
                  fornecedor: c.fornecedor || c.cliente || "Geral",
                  status: c.status
                },
                mensagem: message
              })
            });

            if (webhookRes.ok) {
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
