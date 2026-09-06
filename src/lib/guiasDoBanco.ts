import { supabase } from "./supabase";
import type { Guia, SecaoDoGuia } from "./guias";
import type { PerguntaFrequente } from "../components/modernist/PaginaDeEstoque";
import { ehTabelaOuColunaAusente } from "./erroDeSchema";

/**
 * Os guias, lidos da tabela `guias`.
 *
 * ---------------------------------------------------------------------------
 * Por que aqui o banco é FONTE, e em `textos_de_hub` é override
 * ---------------------------------------------------------------------------
 * A distinção decide o tratamento de erro, então vale escrever. Uma página de
 * hub existe de qualquer jeito — ela é derivada do estoque, e a tabela só
 * sobrescreve o texto: linha ausente significa "use o gerado", e falha de
 * leitura cai no gerado sem ninguém perceber. Por isso `textoEditadoDoHub`
 * silencia o erro e devolve `null`.
 *
 * Guia não. Sem linha, a página não existe — o conteúdo é o registro. E é
 * justamente aí que `null` em cima de falha vira o pior resultado possível:
 *
 *   · a rota chamaria `notFound()` num guia que EXISTE;
 *   · o Next guarda esse 404 no ISR;
 *   · e o Google, que já indexou a URL, recebe 404 de uma página viva — que é
 *     como se desindexa conteúdo sem querer.
 *
 * O mesmo raciocínio que fez `EstoqueIndisponivelError` existir em vez de
 * devolver vitrine vazia (`lib/supabase.ts`, dois incidentes em 02-03/09):
 * falha de leitura ESTOURA, e a página não é servida. Erro é ruído de minutos;
 * 404 falso em conteúdo indexado custa semanas.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ A MIGRAÇÃO VEM ANTES DO DEPLOY
 * ---------------------------------------------------------------------------
 * O texto do primeiro guia não existe mais em código — ele saiu de
 * `lib/guias.ts` quando o conteúdo virou dado, e hoje mora só no seed da
 * migração `20260906160000_guias_no_banco`.
 *
 * Se este código subir antes dela, nada quebra: a leitura devolve lista vazia
 * (ver abaixo) e o build passa. Mas `/guias` fica no ar como hub VAZIO, com
 * link no rodapé de todas as páginas e anunciado no sitemap — que é o pior dos
 * dois mundos, porque convida o rastreador para uma página sem conteúdo.
 *
 * Ordem certa: aplicar a migração, depois deployar.
 */
export class GuiasIndisponiveisError extends Error {
  constructor(motivo: string) {
    super(`Guias indisponíveis: ${motivo}`);
    this.name = "GuiasIndisponiveisError";
  }
}

/** As colunas que o site lê. `estado` não entra: a RLS já filtra o publicado. */
const COLUNAS =
  "slug, titulo, titulo_seo, descricao, corpo, faq, saida, sobre, publicado_em, atualizado_em";

interface LinhaDeGuia {
  slug: string;
  titulo: string;
  titulo_seo: string | null;
  descricao: string;
  corpo: unknown;
  faq: unknown;
  saida: unknown;
  sobre: string[] | null;
  publicado_em: string | null;
  atualizado_em: string;
}

/**
 * Uma linha vira `Guia`, com o jsonb domado.
 *
 * `corpo`, `faq` e `saida` são `jsonb`: o banco devolve o que gravaram, e quem
 * grava é o painel. Um campo com formato estranho não pode derrubar a página
 * inteira — some do render, e o resto do guia continua servindo. A trava contra
 * formato ruim mora na API, na escrita, que é onde dá para avisar quem digitou.
 */
function normalizar(linha: LinhaDeGuia): Guia {
  const corpo: SecaoDoGuia[] = Array.isArray(linha.corpo)
    ? (linha.corpo as SecaoDoGuia[]).filter(
        (s) => s && typeof s.titulo === "string" && Array.isArray(s.paragrafos),
      )
    : [];

  const faq: PerguntaFrequente[] = Array.isArray(linha.faq)
    ? (linha.faq as PerguntaFrequente[]).filter(
        (p) => p && typeof p.pergunta === "string" && typeof p.resposta === "string",
      )
    : [];

  const saidaBruta = linha.saida as Guia["saida"] | null;
  const saida =
    saidaBruta && typeof saidaBruta.href === "string" && saidaBruta.href.startsWith("/")
      ? saidaBruta
      : // Sem saída válida, o guia manda para o estoque. Guia sem destino é
        // conteúdo que não devolve nada — e um `href` quebrado é pior que o
        // destino genérico.
        { rotulo: "Ver o estoque", href: "/estoque", apoio: "O que entrou depois da perícia." };

  return {
    slug: linha.slug,
    titulo: linha.titulo,
    tituloSeo: linha.titulo_seo?.trim() || `${linha.titulo} | Motors Store`,
    descricao: linha.descricao,
    // `publicado_em` nulo não acontece em guia publicado (a API preenche ao
    // publicar), mas se acontecer o `dateModified` serve: data ausente no
    // `Article` vale menos, data inventada vale menos ainda.
    publicadoEm: linha.publicado_em ?? linha.atualizado_em,
    atualizadoEm: linha.atualizado_em,
    corpo,
    faq,
    saida,
    sobre: Array.isArray(linha.sobre) ? linha.sobre.filter(Boolean) : [],
  };
}

function exigirCliente() {
  if (!supabase) {
    throw new GuiasIndisponiveisError("cliente do Supabase não configurado");
  }
  return supabase;
}

/**
 * Os guias publicados, do mais recente para o mais antigo.
 *
 * Alimenta o índice `/guias`, o `generateStaticParams` e o sitemap. A RLS já
 * devolve só os publicados para quem lê sem sessão de staff — o filtro aqui é
 * cinto e suspensório, e documenta a intenção para quem ler a query.
 */
export async function listarGuiasPublicados(): Promise<Guia[]> {
  const cliente = exigirCliente();

  const { data, error } = await cliente
    .from("guias")
    .select(COLUNAS)
    .eq("estado", "publicado")
    .order("publicado_em", { ascending: false });

  if (error) {
    // Tabela ausente é AMBIENTE ATRASADO, não defeito — a migração ainda não
    // rodou aqui. Devolve lista vazia: o índice mostra "nenhum guia ainda" e o
    // resto do site segue. Estourar aqui derrubaria o build de qualquer
    // ambiente sem a migração, incluindo o primeiro deploy deste código.
    //
    // Qualquer OUTRO erro estoura, e essa é a diferença que o módulo inteiro
    // existe para manter: falha de leitura numa tabela que existe não pode
    // virar "não há guias".
    if (ehTabelaOuColunaAusente(error)) {
      console.warn("[Guias] Tabela ausente neste ambiente — a migração ainda não rodou.");
      return [];
    }
    throw new GuiasIndisponiveisError(error.message);
  }
  return (data ?? []).map((linha) => normalizar(linha as unknown as LinhaDeGuia));
}

/**
 * Um guia pelo slug, ou `null` quando ele REALMENTE não existe.
 *
 * A distinção entre "não existe" e "não deu para ler" é o assunto deste
 * módulo: o primeiro devolve `null` e a rota faz `notFound()`; o segundo
 * estoura e a página não é servida.
 */
export async function buscarGuiaPublicado(slug: string): Promise<Guia | null> {
  if (!slug) return null;
  const cliente = exigirCliente();

  const { data, error } = await cliente
    .from("guias")
    .select(COLUNAS)
    .eq("slug", slug)
    .eq("estado", "publicado")
    .maybeSingle();

  if (error) {
    // Sem tabela, nenhum guia existe — e `null` aqui vira 404, que é a resposta
    // correta para uma URL que ainda não tem conteúdo neste ambiente.
    if (ehTabelaOuColunaAusente(error)) return null;
    throw new GuiasIndisponiveisError(error.message);
  }
  return data ? normalizar(data as unknown as LinhaDeGuia) : null;
}
