import { NextResponse, type NextRequest } from "next/server";
import { ehTabelaOuColunaAusente } from "../../../../lib/erroDeSchema";
import { autorizarConteudo, revalidarCluster } from "../../../../lib/portaDeGuias";

export const dynamic = "force-dynamic";

/**
 * O cabeçalho da seção `/guias` — gravar.
 *
 * Só PUT, e a razão é a mesma que faz `/api/hubs/textos` não ter POST nem
 * DELETE: aqui o banco é OVERRIDE. A linha ou existe ou não, o texto do código
 * é o padrão, e não há o que criar nem o que apagar — só o que sobrescrever.
 * Limpar os dois campos devolve a seção ao automático, e é por isso que a rota
 * ACEITA string vazia em vez de recusá-la como o publicador de guia faz.
 *
 * A leitura não mora aqui: a página pública lê direto do banco por
 * `lib/secaoDeGuias.ts`, e a tela do painel recebe o gravado junto da listagem
 * em `GET /api/guias` — uma chamada, não duas.
 */

/** O teto do banco. Cortar aqui evita erro cru do Postgres na cara de quem digita. */
const TETO = 300;

/**
 * A régua da meta description da casa.
 *
 * Não é trava: quem decide o texto é o dono, e recusar por 3 caracteres seria
 * pior que uma description truncada no SERP. Sai como AVISO junto do 200, e a
 * tela mostra o contador ao lado do campo. Mesmo raciocínio do CHECK de 300 na
 * migração, que existe para impedir abuso e não para vigiar estilo.
 */
const REGUA_DESCRIPTION = 155;

function texto(bruto: unknown): string {
  return typeof bruto === "string" ? bruto.trim().slice(0, TETO) : "";
}

/** Erro de schema vira 503 com frase; o resto vira 500. Mesma resposta nos dois verbos. */
function falha(error: { message: string; code?: string }) {
  if (ehTabelaOuColunaAusente(error)) {
    return NextResponse.json(
      { error: "A tabela do cabeçalho ainda não existe neste ambiente." },
      { status: 503 },
    );
  }
  return NextResponse.json({ error: error.message }, { status: 500 });
}

/**
 * PUT — grava SÓ o que veio no corpo.
 *
 * ---------------------------------------------------------------------------
 * Por que parcial, e não a linha inteira
 * ---------------------------------------------------------------------------
 * A primeira versão substituía a linha toda, e campo vazio significava "volte
 * ao texto do código". Isso fazia duas intenções muito diferentes produzirem a
 * MESMA requisição:
 *
 *     "apague o meu texto"        →  PUT {tituloSeo:"", resumo:""}
 *     "não sei o que tem lá"      →  PUT {tituloSeo:"", resumo:""}
 *
 * A segunda acontece quando a tela não consegue LER o cabeçalho: os campos
 * ficam em branco, e em branco é indistinguível de "está no automático". Cinco
 * rodadas de revisão acharam cinco caminhos diferentes até esse estado — GET
 * falhando inteiro, GET falhando só na metade do cabeçalho, resposta 200 com
 * corpo ilegível — e cada um exigiu uma trava nova na interface.
 *
 * Travar caminho é cercar buraco. Aqui o buraco foi tapado: **chave ausente no
 * corpo significa "não mexa nesta coluna"**. Um formulário em branco por falha
 * de leitura manda `{}` e não muda nada, porque não há o que mudar. A trava
 * deixou de ser necessária para a segurança — o estado ruim parou de ser
 * expressável.
 *
 * Apagar continua possível, e é o DELETE abaixo: uma ação com nome próprio,
 * que a tela pede com confirmação.
 */
export async function PUT(request: NextRequest) {
  const auth = await autorizarConteudo();
  if (auth.erro) return auth.erro;

  const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  // `in` e não valor-verdade: `""` é uma edição legítima ("limpei este campo"),
  // e só a AUSÊNCIA da chave significa "não toquei".
  const alteracoes: Record<string, unknown> = {};
  if (corpo && "tituloSeo" in corpo) alteracoes.titulo_seo = texto(corpo.tituloSeo);
  if (corpo && "resumo" in corpo) alteracoes.resumo = texto(corpo.resumo);

  if (Object.keys(alteracoes).length === 0) {
    // Nada a fazer, e dizer isso é melhor que fingir que gravou: a tela não
    // pode anunciar "salvo" sobre uma requisição que não mudou nada.
    return NextResponse.json({ error: "Nada foi alterado." }, { status: 400 });
  }

  const tabela = auth.supabase!.from("cabecalho_dos_guias");
  const carimbo = { ...alteracoes, atualizado_por: auth.user!.id };

  // UPDATE primeiro. Se não houver linha, INSERT — a migração entrega a tabela
  // vazia de propósito, então a primeira gravação é sempre um insert. Não dá
  // para usar `upsert` aqui: ele escreve a linha inteira, que é exatamente o
  // que este desenho deixou de fazer.
  let { data, error } = await tabela
    .update(carimbo)
    .eq("secao", "guias")
    .select("titulo_seo, resumo")
    .maybeSingle();

  if (error) return falha(error);

  if (!data) {
    ({ data, error } = await tabela
      .insert({ secao: "guias", ...carimbo })
      .select("titulo_seo, resumo")
      .maybeSingle());
    if (error) return falha(error);
  }

  // O índice sai do cache na hora. Sem isto o texto novo esperaria a janela de
  // uma hora do ISR — e quem acabou de salvar veria a página velha e concluiria
  // que não salvou.
  revalidarCluster();

  const avisos: string[] = [];
  const resumo = typeof alteracoes.resumo === "string" ? alteracoes.resumo : "";
  if (resumo.length > REGUA_DESCRIPTION) {
    avisos.push(
      `O resumo tem ${resumo.length} caracteres. A busca costuma cortar em ${REGUA_DESCRIPTION} — o fim da frase pode não aparecer.`,
    );
  }

  return NextResponse.json({ cabecalho: data, avisos });
}

/**
 * DELETE — devolve a seção ao texto do código.
 *
 * Apagar virou ação com nome próprio, e é o contrário do que ela era: antes
 * acontecia como efeito de salvar campos vazios, o que a tornava alcançável
 * por acidente. Agora é preciso pedir, e a tela pede com confirmação.
 *
 * Não é destrutivo de verdade — o texto do código volta a valer e nada mais
 * muda —, mas tira do ar o que alguém escreveu, então merece um verbo próprio.
 */
export async function DELETE() {
  const auth = await autorizarConteudo();
  if (auth.erro) return auth.erro;

  const { error } = await auth
    .supabase!.from("cabecalho_dos_guias")
    .delete()
    .eq("secao", "guias");

  if (error) return falha(error);

  revalidarCluster();
  return NextResponse.json({ cabecalho: { titulo_seo: null, resumo: null }, avisos: [] });
}
