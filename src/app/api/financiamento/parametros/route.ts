import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { lerLinhaDoFinanciamento, validarVigenciaNova } from "../../../../lib/parametrosDoFinanciamento";
import {
  autorizarEdicaoDoFinanciamento,
  ETIQUETA_DO_FINANCIAMENTO,
} from "../../../../lib/parametrosDoFinanciamento-servidor";

export const dynamic = "force-dynamic";

/**
 * `POST /api/financiamento/parametros` — abre uma vigência nova das condições
 * do simulador (taxas, ano de referência, ano mais antigo financiado, bancos
 * parceiros e a fonte das taxas).
 *
 * Quem grava é a função `financiamento_nova_vigencia` (migração
 * 20260928120000), numa transação só: encerra a vigente hoje e insere a nova.
 * Valor vigente nunca sofre UPDATE (D-T1.7) — a história de cada taxa que o
 * site já mostrou fica no banco.
 *
 * Três camadas, a mesma régua: a tela só aparece para Administrador e
 * Financeiro, esta rota confere a sessão e o papel, e a função confere o papel
 * de novo com `auth.uid()`. A validação daqui é a dos CHECKs da tabela, para
 * a tela mostrar o erro por extenso em vez de um código de banco.
 */
export async function POST(request: NextRequest) {
  const porta = await autorizarEdicaoDoFinanciamento();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status });

  const corpo = await request.json().catch(() => null);
  const validacao = validarVigenciaNova(corpo);
  if (!validacao.ok) {
    return NextResponse.json({ error: "Confira os campos.", problemas: validacao.erros }, { status: 400 });
  }
  const v = validacao.valores;

  const { data, error } = await porta.supabase.rpc("financiamento_nova_vigencia", {
    p_taxa_excelente_am: v.taxaExcelenteAm,
    p_taxa_regular_am: v.taxaRegularAm,
    p_taxa_risco_am: v.taxaRiscoAm,
    p_ano_de_referencia: v.anoDeReferencia,
    p_ano_mais_antigo: v.anoMaisAntigo,
    p_bancos_parceiros: v.bancosParceiros,
    p_fonte_das_taxas: v.fonteDasTaxas,
    p_descricao: v.descricao,
  });

  if (error) {
    // A função ainda não existe no banco: a migração não foi aplicada.
    if (error.code === "PGRST202" || error.code === "42883") {
      return NextResponse.json(
        {
          error:
            "A tabela das condições do simulador ainda não existe no banco — falta aplicar a migração 20260928120000_parametros_financiamento.",
        },
        { status: 503 },
      );
    }
    if (error.code === "42501") return NextResponse.json({ error: error.message }, { status: 403 });
    // Duas pessoas salvando ao mesmo tempo: a segunda esbarra no índice de
    // uma vigente por loja. Nada se corrompe — mas ela precisa ver a que
    // ficou antes de decidir de novo.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Outra pessoa salvou uma vigência agora há pouco. Abra esta tela de novo e confira antes de salvar." },
        { status: 409 },
      );
    }
    if (error.code === "23514") {
      return NextResponse.json({ error: "O banco recusou os valores.", problemas: [error.message] }, { status: 400 });
    }
    console.error("[Financiamento] financiamento_nova_vigencia falhou:", error);
    return NextResponse.json({ error: "Não deu para gravar a vigência nova." }, { status: 500 });
  }

  // O site passa a simular com a vigência nova no próximo acesso — ficha,
  // /financiamento, /carro-perfeito e a /api/match leem do mesmo cache. Na
  // hora, e não "stale-while-revalidate": quem salva uma taxa espera vê-la.
  revalidateTag(ETIQUETA_DO_FINANCIAMENTO, { expire: 0 });

  const linha = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ parametros: lerLinhaDoFinanciamento(linha) });
}
