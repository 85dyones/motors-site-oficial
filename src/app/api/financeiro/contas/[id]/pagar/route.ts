import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../../lib/supabase-server";
import { dispatchAdminWebhook } from "../../../../../../lib/webhook-dispatcher";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { data_pagamento, forma_pagamento } = body;

    if (!data_pagamento || !forma_pagamento) {
      return NextResponse.json({ error: "Data de pagamento e Forma de pagamento são obrigatórias" }, { status: 400 });
    }

    // 1. Fetch account details to know the amount and type (pagar/receber)
    const { data: conta, error: fetchError } = await supabase
      .from("contas")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !conta) {
      return NextResponse.json({ error: fetchError?.message || "Conta não encontrada" }, { status: 404 });
    }

    if (conta.status === "pago") {
      return NextResponse.json({ error: "Esta conta já foi marcada como paga" }, { status: 400 });
    }

    // 2. Mark account as paid
    const { data: updatedConta, error: updateError } = await supabase
      .from("contas")
      .update({
        status: "pago",
        data_pagamento,
        forma_pagamento,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 3. Register transaction in movimentacoes
    const tipoMovimentacao = conta.tipo === "pagar" ? "saida" : "entrada";
    const { error: moveError } = await supabase
      .from("movimentacoes")
      .insert({
        conta_id: id,
        tipo: tipoMovimentacao,
        valor: conta.valor,
        descricao: `Baixa de conta: ${conta.descricao}`,
        data_movimentacao: data_pagamento,
        forma_pagamento,
        created_by: user.id
      });

    if (moveError) {
      // We don't rollback payment here but we log the error
      console.error("[MoveLog] Failed to register transaction movement log:", moveError.message);
    }

    await dispatchAdminWebhook("conta_paga", updatedConta).catch((err) =>
      console.error("[WebhookDispatch] Failed to dispatch account paid event:", err.message)
    );

    return NextResponse.json({ conta: updatedConta });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
