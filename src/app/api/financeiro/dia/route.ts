import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { dataDeHoje, resumoDoDia } from "../../../../lib/financeiroDia";
import { STATUS_EM_ABERTO } from "../../../../lib/alcada";

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
 *
 * ---------------------------------------------------------------------------
 * Por que a busca varre em lotes
 * ---------------------------------------------------------------------------
 * O PostgREST devolve no máximo **1000 linhas por chamada** — a restrição que
 * `/api/pessoas/duplicatas` já enuncia. `contas em aberto até a data` não tem
 * teto natural: a loja chegou a 709 em agosto de 2026, e passando de mil o
 * `pagarVencidas` e os totais em dinheiro desta tela seriam a soma da PRIMEIRA
 * PÁGINA, apresentada como o total. Numa tela que abre toda manhã para dizer
 * quanto sai de caixa hoje, isso é a pior forma de erro que o módulo produz:
 * um número menor que o real, com cara de exato.
 *
 * É o mesmo defeito que enterrou um lançamento na posição 709 e que a lista de
 * contas acabou de ser paginada para eliminar — uma fatia apresentada como se
 * fosse o conjunto.
 */

const POR_LOTE = 1000;
/** 20 lotes = 20 mil contas em aberto. Muito além de qualquer revenda. */
const TETO_DE_LOTES = 20;

interface Pagina<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Varre uma consulta em páginas até ela acabar de verdade.
 *
 * `completo: false` quando o teto de lotes foi atingido e ainda vinha linha —
 * a varredura parou antes do fim, e quem lê o resumo precisa saber que o
 * número é parcial em vez de recebê-lo como total.
 */
async function varrer<T>(
  pagina: (inicio: number, fim: number) => PromiseLike<Pagina<T>>,
): Promise<{ linhas: T[]; completo: boolean; erro: string | null }> {
  const linhas: T[] = [];

  for (let lote = 0; lote < TETO_DE_LOTES; lote++) {
    const inicio = lote * POR_LOTE;
    const { data, error } = await pagina(inicio, inicio + POR_LOTE - 1);
    if (error) return { linhas, completo: false, erro: error.message };

    const recebidas = data ?? [];
    linhas.push(...recebidas);
    // Lote incompleto significa fim da consulta — não há próxima página.
    if (recebidas.length < POR_LOTE) return { linhas, completo: true, erro: null };
  }

  return { linhas, completo: false, erro: null };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const pedida = request.nextUrl.searchParams.get("data");
    const data = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : dataDeHoje();

    // `.order("id")` não é cosmético: sem ordem estável, duas páginas de um
    // mesmo `range` podem repetir e pular linhas, e a soma sairia errada de um
    // jeito que nenhum teste local reproduz.
    const [abertas, liquidadas, movimentacoes] = await Promise.all([
      varrer((inicio, fim) =>
        supabase
          .from("contas")
          .select(`*, categoria:categorias_financeiras (nome, cor, icone)`)
          .in("status", [...STATUS_EM_ABERTO])
          .lte("data_vencimento", data)
          .order("id", { ascending: true })
          .range(inicio, fim),
      ),
      varrer((inicio, fim) =>
        supabase
          .from("contas")
          .select(`*, categoria:categorias_financeiras (nome, cor, icone)`)
          .eq("status", "pago")
          .eq("data_pagamento", data)
          .order("id", { ascending: true })
          .range(inicio, fim),
      ),
      varrer((inicio, fim) =>
        supabase
          .from("movimentacoes")
          .select("id, tipo, valor, descricao, data_movimentacao, forma_pagamento")
          .eq("data_movimentacao", data)
          .order("id", { ascending: true })
          .range(inicio, fim),
      ),
    ]);

    const erro = abertas.erro || liquidadas.erro || movimentacoes.erro;
    if (erro) {
      return NextResponse.json({ error: erro }, { status: 500 });
    }

    const resumo = resumoDoDia(
      [...abertas.linhas, ...liquidadas.linhas],
      movimentacoes.linhas,
      data,
    );

    // `completo: false` diz que a varredura bateu o teto e o resumo é parcial.
    // Sem este campo, um total truncado é indistinguível de um total exato.
    return NextResponse.json({
      ...resumo,
      completo: abertas.completo && liquidadas.completo && movimentacoes.completo,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
