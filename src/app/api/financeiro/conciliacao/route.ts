import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ErroDeOfx, lerOfx } from "../../../../lib/ofx";
import {
  conciliar,
  resumirConciliacao,
  type LinhaDoBanco,
  type MovimentacaoDoCaixa,
} from "../../../../lib/conciliacao";

export const dynamic = "force-dynamic";

/** Janela padrão da tela: o mês corrente é o recorte de quem fecha o caixa. */
function janelaPadrao(): { inicio: string; fim: string } {
  const hoje = new Date();
  const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  const iso = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return { inicio: iso(primeiro), fim: iso(ultimo) };
}

function periodoDe(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const padrao = janelaPadrao();
  const valida = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  return {
    inicio: valida(p.get("inicio")) ?? padrao.inicio,
    fim: valida(p.get("fim")) ?? padrao.fim,
  };
}

/**
 * Busca os dois lados da conciliação num período.
 *
 * A janela das movimentações é ALARGADA pela tolerância: um pagamento
 * registrado no dia 30 compensa no dia 2 do mês seguinte, e sem a folga ele
 * apareceria como "só no banco" na virada — um falso achado todo mês.
 */
async function ladosDoPeriodo(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  inicio: string,
  fim: string,
  toleranciaEmDias: number,
) {
  const desloca = (data: string, dias: number) => {
    const d = new Date(`${data}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  };

  const [extrato, movimentacoes] = await Promise.all([
    supabase
      .from("extrato_bancario")
      .select("*")
      .gte("data", inicio)
      .lte("data", fim)
      .order("data", { ascending: true }),
    supabase
      .from("movimentacoes")
      .select("id, tipo, valor, descricao, data_movimentacao, forma_pagamento")
      .gte("data_movimentacao", desloca(inicio, -toleranciaEmDias))
      .lte("data_movimentacao", desloca(fim, toleranciaEmDias))
      .order("data_movimentacao", { ascending: true }),
  ]);

  return { extrato, movimentacoes };
}

const TOLERANCIA = 3;

/**
 * O estado da conciliação — GET /api/financeiro/conciliacao?inicio&fim
 *
 * Somente leitura, de propósito: nada é casado aqui. O motor roda sobre as
 * linhas ainda não conciliadas para produzir SUGESTÕES, e o casamento
 * automático acontece no POST. GET que grava é a armadilha clássica — um
 * refresh do navegador não pode conciliar caixa.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { inicio, fim } = periodoDe(request);
    const { extrato, movimentacoes } = await ladosDoPeriodo(supabase, inicio, fim, TOLERANCIA);

    const erro = extrato.error || movimentacoes.error;
    if (erro) {
      return NextResponse.json({ error: erro.message }, { status: 500 });
    }

    const linhas = extrato.data ?? [];
    const movs = movimentacoes.data ?? [];
    const jaConciliadas = new Set(
      linhas.filter((l) => l.movimentacao_id).map((l) => l.movimentacao_id as string),
    );

    // O motor só enxerga o que ainda está solto dos DOIS lados.
    const resultado = conciliar(
      linhas.filter((l) => !l.movimentacao_id) as unknown as LinhaDoBanco[],
      movs.filter((m) => !jaConciliadas.has(m.id)) as unknown as MovimentacaoDoCaixa[],
      { toleranciaEmDias: TOLERANCIA },
    );

    return NextResponse.json({
      periodo: { inicio, fim },
      linhas,
      movimentacoes: movs,
      // `casados` aqui é o que o POST casaria — a tela mostra como "pronto
      // para conciliar", não como já conciliado.
      prontasParaCasar: resultado.casados,
      sugestoes: resultado.sugestoes,
      soNoBanco: resultado.soNoBanco,
      soNoSistema: resultado.soNoSistema,
      resumo: {
        ...resumirConciliacao(resultado),
        // O resumo do motor só conhece o que está solto; o total da tela
        // precisa somar o que já foi conciliado em execuções anteriores.
        conciliadas: linhas.filter((l) => l.movimentacao_id).length,
        linhasDoBanco: linhas.length,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Importa extrato e/ou casa o que for inequívoco —
 * POST { conteudo?: string, conta?: string, inicio?, fim? }
 *
 * Sem `conteudo`, só roda o casamento: serve para quando movimentações novas
 * aparecem depois da importação (a baixa de ontem que ela lançou hoje).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { inicio, fim } = periodoDe(request);

    let importadas = 0;
    let repetidas = 0;
    let banco: string | null = null;
    let conta: string = typeof body.conta === "string" && body.conta.trim() ? body.conta.trim() : "";

    if (typeof body.conteudo === "string" && body.conteudo.trim()) {
      let extrato;
      try {
        extrato = lerOfx(body.conteudo);
      } catch (e) {
        // O motivo da recusa é do usuário, não do log: ele diz o que baixar.
        if (e instanceof ErroDeOfx) {
          return NextResponse.json({ error: e.message }, { status: 400 });
        }
        throw e;
      }

      banco = extrato.banco;
      conta = conta || extrato.conta || "padrao";

      const linhas = extrato.lancamentos.map((l) => ({
        banco,
        conta,
        fitid: l.fitid,
        data: l.data,
        valor: l.valor,
        tipo: l.tipo,
        descricao: l.descricao,
        importado_por: user.id,
      }));

      // `ignoreDuplicates` sobre (conta, fitid): reimportar extrato sobreposto
      // é o fluxo NORMAL — ela baixa "últimos 30 dias" toda semana. O índice
      // único é a régua; aqui só se pede ao PostgREST que não trate a colisão
      // como erro.
      const { data: inseridas, error } = await supabase
        .from("extrato_bancario")
        .upsert(linhas, { onConflict: "conta,fitid", ignoreDuplicates: true })
        .select("id");

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      importadas = inseridas?.length ?? 0;
      repetidas = linhas.length - importadas;
    }

    // Casamento automático — só o par inequívoco. O resto vira sugestão para
    // uma pessoa confirmar em /conciliacao/[id].
    const { extrato: doBanco, movimentacoes } = await ladosDoPeriodo(
      supabase,
      inicio,
      fim,
      TOLERANCIA,
    );
    if (doBanco.error || movimentacoes.error) {
      return NextResponse.json(
        { error: (doBanco.error || movimentacoes.error)!.message },
        { status: 500 },
      );
    }

    const linhasDoBanco = doBanco.data ?? [];
    const jaConciliadas = new Set(
      linhasDoBanco.filter((l) => l.movimentacao_id).map((l) => l.movimentacao_id as string),
    );
    const resultado = conciliar(
      linhasDoBanco.filter((l) => !l.movimentacao_id) as unknown as LinhaDoBanco[],
      (movimentacoes.data ?? []).filter((m) => !jaConciliadas.has(m.id)) as unknown as MovimentacaoDoCaixa[],
      { toleranciaEmDias: TOLERANCIA },
    );

    const agora = new Date().toISOString();
    let casadas = 0;
    for (const c of resultado.casados) {
      const linha = linhasDoBanco.find((l) => l.fitid === c.fitid);
      if (!linha) continue;
      const { error } = await supabase
        .from("extrato_bancario")
        .update({
          movimentacao_id: c.movimentacaoId,
          conciliado_em: agora,
          conciliado_por: user.id,
          conciliado_como: "automatico",
        })
        .eq("id", linha.id)
        // Só concilia o que ainda está solto: se outra aba casou no meio do
        // caminho, esta atualização não desfaz o que já foi feito.
        .is("movimentacao_id", null);
      if (!error) casadas++;
    }

    return NextResponse.json({
      importadas,
      repetidas,
      casadas,
      aConfirmar: resultado.sugestoes.length,
      banco,
      conta: conta || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
