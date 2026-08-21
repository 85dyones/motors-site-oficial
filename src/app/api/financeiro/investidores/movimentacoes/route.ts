import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";
import { dispatchAdminWebhook } from "../../../../../lib/webhook-dispatcher";
import { validarMovimentacao } from "../../../../../lib/investidores";

export const dynamic = "force-dynamic";

/**
 * Movimentações de investidor — GET extrato, POST lançamento.
 *
 * O POST passa por `validarMovimentacao` (lib pura) ANTES do banco: o CHECK
 * de lá é a última defesa; a lib é a que devolve erro legível — inclusive a
 * regra que o SQL não alcança (movimentação em veículo exige `veiculo_id`).
 *
 * Cada lançamento dispara `investidor_movimento` no Formato C — aporte e
 * retirada são exatamente o tipo de evento que o dono pediu para chegar no
 * WhatsApp, e é o começo do "painel para eles saberem também".
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const investidorId = request.nextUrl.searchParams.get("investidor_id");

    let query = supabase
      .from("movimentacoes_investidor")
      .select(`*, investidor:investidores (nome)`)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false });

    if (investidorId) query = query.eq("investidor_id", investidorId);

    const { data: movimentacoes, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ movimentacoes });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const resultado = validarMovimentacao(await request.json());
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.erro }, { status: 400 });
    }

    const m = resultado.movimentacao;
    const { data: movimentacao, error } = await supabase
      .from("movimentacoes_investidor")
      .insert({
        investidor_id: m.investidor_id,
        tipo: m.tipo,
        valor: m.valor,
        descricao: m.descricao,
        ...(m.data ? { data: m.data } : {}),
        forma_pagamento: m.forma_pagamento,
        veiculo_id: m.veiculo_id,
        observacoes: m.observacoes,
        created_by: user.id,
      })
      .select(`*, investidor:investidores (nome)`)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await dispatchAdminWebhook("investidor_movimento", movimentacao).catch((err) =>
      console.error("[WebhookDispatch] Failed to dispatch investor movement event:", err.message)
    );

    return NextResponse.json({ movimentacao });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
