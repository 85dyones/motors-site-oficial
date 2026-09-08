import { NextResponse, type NextRequest } from "next/server";
import { ehTabelaOuColunaAusente } from "../../../../lib/erroDeSchema";
import { autorizarConteudo, revalidarCluster } from "../../../../lib/portaDeGuias";

export const dynamic = "force-dynamic";

/**
 * O cabeçalho da seção `/guias` — gravar.
 *
 * Dois verbos, e a diferença entre eles é o desenho inteiro desta rota:
 *
 *   · **PUT** grava SÓ as colunas que vierem no corpo. Chave ausente significa
 *     “não mexa nesta coluna”, então um formulário em branco por falha de
 *     leitura não tem como apagar nada.
 *   · **DELETE** apaga a LINHA. É a única forma de tirar o registro do banco,
 *     e a tela pede confirmação antes.
 *
 * As duas devolvem a seção ao texto do código, e a diferença NÃO está na tela:
 * esvaziar os dois campos pelo PUT deixa a linha lá, com as colunas nulas (o
 * gatilho normaliza `''` para NULO); o DELETE tira a linha. O painel mostra o
 * mesmo estado nos dois casos — `podeVoltarAoPadrao` olha o texto carregado, e
 * "sem texto" é "sem texto" venha de onde vier.
 *
 * O que muda é o BANCO: sobrevivem ao PUT o registro e o carimbo
 * (`atualizado_por`, `atualizado_em`), que dizem quem mexeu por último; o
 * DELETE devolve a tabela ao estado em que a migração a entrega, vazia. É por
 * isso que o verbo separado vale a pena mesmo sem efeito visível: quem apaga
 * está dizendo "não quero mais um texto meu aqui", e não "quero este texto em
 * branco".
 *
 * Aqui o banco é OVERRIDE: a linha ou existe ou não, e o texto do código é o
 * padrão. Por isso o PUT ACEITA string vazia em vez de recusá-la como o
 * publicador de guia faz — esvaziar um campo que se leu é edição legítima.
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

    // 23505 = a chave primária já existe. Acontece quando duas gravações
    // chegam juntas na tabela vazia: as duas veem o UPDATE sem linha e as
    // duas tentam inserir. A perdedora refaz o UPDATE, que agora encontra a
    // linha — em vez de devolver "duplicate key value violates unique
    // constraint" na cara de quem escreveu um parágrafo.
    if (error?.code === "23505") {
      ({ data, error } = await tabela
        .update(carimbo)
        .eq("secao", "guias")
        .select("titulo_seo, resumo")
        .maybeSingle());
    }
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

  // `.select()` no delete, e não só o `error`: pelo caderno do projeto, RLS
  // não devolve erro — devolve VAZIO. Sem conferir o que saiu, uma policy
  // divergente faria o painel anunciar "voltou ao texto padrão" com o texto
  // ainda no ar. Zero linha aqui é desfecho legítimo (não havia override), mas
  // é diferente de "apaguei", e a resposta diz qual foi.
  const { data, error } = await auth
    .supabase!.from("cabecalho_dos_guias")
    .delete()
    .eq("secao", "guias")
    .select("secao");

  if (error) return falha(error);

  const apagou = Array.isArray(data) && data.length > 0;
  if (apagou) revalidarCluster();

  return NextResponse.json({
    cabecalho: { titulo_seo: null, resumo: null },
    apagou,
    avisos: [],
  });
}
