import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { dataDeHoje, resumoDoDia } from "../../../../lib/financeiroDia";

export const dynamic = "force-dynamic";

/**
 * O dia da operação — GET /api/financeiro/dia?data=YYYY-MM-DD
 *
 * A resposta a "o que precisa ser pago hoje?" (briefing 2026-08-21). Sem
 * `data`, responde o dia de HOJE no fuso da loja — ver `dataDeHoje` para o
 * porquê de não ser `toISOString()`.
 *
 * Quem decide o recorte é `resumoDoDia` (lib pura, testada); aqui só se
 * busca o bruto: contas em aberto até a data, contas liquidadas NA data e
 * movimentações da data. RLS (`has_finance_access`) é quem fecha a porta —
 * o mesmo desenho das outras rotas do módulo.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const pedida = request.nextUrl.searchParams.get("data");
    const data = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : dataDeHoje();

    const [abertas, liquidadas, movimentacoes] = await Promise.all([
      supabase
        .from("contas")
        .select(`*, categoria:categorias_financeiras (nome, cor, icone)`)
        .in("status", ["pendente", "vencido", "parcial"])
        .lte("data_vencimento", data),
      supabase
        .from("contas")
        .select(`*, categoria:categorias_financeiras (nome, cor, icone)`)
        .eq("status", "pago")
        .eq("data_pagamento", data),
      supabase
        .from("movimentacoes")
        .select("tipo, valor, descricao, data_movimentacao, forma_pagamento")
        .eq("data_movimentacao", data),
    ]);

    const erro = abertas.error || liquidadas.error || movimentacoes.error;
    if (erro) {
      return NextResponse.json({ error: erro.message }, { status: 500 });
    }

    const resumo = resumoDoDia(
      [...(abertas.data ?? []), ...(liquidadas.data ?? [])],
      movimentacoes.data ?? [],
      data,
    );

    return NextResponse.json(resumo);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
