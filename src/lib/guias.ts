import type { PerguntaFrequente } from "../components/modernist/PaginaDeEstoque";

/**
 * A forma de um guia. O CONTEÚDO vive no banco, não aqui.
 *
 * ---------------------------------------------------------------------------
 * Por que mudou de lugar
 * ---------------------------------------------------------------------------
 * Este arquivo nasceu em 2026-09-05 com o texto do primeiro guia dentro, num
 * array. Funcionava para publicar, e não funcionava para o que o dono pediu no
 * dia seguinte: *"preciso ser capaz de gerar novos guias e editar os criados no
 * painel, como já acontece com o texto das páginas"*.
 *
 * Texto em array de código significa que escrever um guia é abrir um PR. O
 * conteúdo passou para a tabela `guias` (migração `20260906…`), o painel edita
 * em `/admin/guias`, e o que sobra aqui é o CONTRATO — os tipos que a rota, o
 * schema e o painel compartilham.
 *
 * A diferença para `textos_de_hub` está escrita em `lib/guiasDoBanco.ts`, e ela
 * decide o tratamento de erro: lá o banco é override e a página existe sem ele;
 * aqui o banco é fonte, e falha de leitura não pode virar 404.
 */

export interface SecaoDoGuia {
  /** Vira `<h2>`. */
  titulo: string;
  paragrafos: string[];
}

export interface Guia {
  /** Fecha a URL: `/guias/{slug}`. */
  slug: string;
  /** O `<h1>` e o `headline` do `Article`. */
  titulo: string;
  /** `<title>` da aba — pode divergir do `<h1>` quando o SERP pede. */
  tituloSeo: string;
  descricao: string;
  /** ISO com fuso. `Article` exige data, e data ausente vale menos. */
  publicadoEm: string;
  atualizadoEm: string;
  corpo: SecaoDoGuia[];
  faq: PerguntaFrequente[];
  /**
   * A saída comercial. Guia sem destino é conteúdo que não devolve nada — a
   * régua do plano é que cada peça tenha exatamente uma.
   */
  saida: { rotulo: string; href: string; apoio: string };
  /** Os assuntos do `about` do `Article`. */
  sobre: string[];
}

/** O estado de publicação. Rascunho não sai no site nem no sitemap. */
export type EstadoDoGuia = "rascunho" | "publicado";

/**
 * O nome da seção, num lugar só.
 *
 * Até 07/09 ela se chamava "Guias de procedência" — um nome que anunciava UM
 * assunto num link presente em todas as páginas. O dono decidiu que `/guias` é
 * o conteúdo editorial da loja inteira (mercado, veículos, procedência,
 * financiamento, tendências), e o nome virou "Guias Motors".
 *
 * A constante existe porque a renomeação mostrou o custo do contrário: o mesmo
 * nome aparece em CINCO pontos que ninguém abre juntos — o `<h1>`, o degrau
 * visível da trilha nas duas rotas, o `CollectionPage.name`, o degrau do
 * `BreadcrumbList` e o rótulo do rodapé. A revisão do `qa-guardian` desfez a
 * renomeação em seis desses pontos, um a um, e a suíte cheia (2207 testes)
 * ficou verde nas seis: o site serviria quatro nomes diferentes para a mesma
 * seção sem ninguém notar.
 *
 * `tests/guias-publicam-o-grafo.test.ts` afirma que a saída RENDERIZADA de
 * cada ponto é igual a esta string. Renomear de novo é mexer aqui; escrever o
 * nome à mão em qualquer um dos pontos fica vermelho.
 *
 * NÃO é o `<title>` da aba, que é outra coisa de propósito: nome de seção não
 * tem demanda de busca, e o `<title>` é o sinal mais forte de tema da página.
 * Ver `app/guias/page.tsx`.
 */
export const NOME_DA_SECAO = "Guias Motors";

/**
 * O `<title>` da aba do índice — e por que ele NÃO é `NOME_DA_SECAO`.
 *
 * "Guias Motors" é o nome da seção e tem demanda de busca zero: ninguém digita
 * isso. O `<title>` é o sinal mais forte de tema da página, então aqui vão os
 * termos que alguém procura. Decisão do dono em 07/09.
 *
 * Nenhuma trava do projeto exige `<title>` == `<h1>`, e `tituloSeo` de cada
 * guia já documenta a mesma divergência ("pode divergir do `<h1>` quando o SERP
 * pede"). O índice passou a fazer o que os guias já faziam.
 */
export const TITULO_SEO_DA_SECAO = "Guias sobre seminovos, mercado e procedência";

/**
 * O resumo da seção. Aparece em QUATRO lugares, e é por isso que mora aqui.
 *
 * Sob o `<h1>`, na meta description, no card de compartilhamento do site e no
 * preview desse card no painel. Até 07/09 ele era 100% perícia cautelar — e era
 * ele, mais do que o título, que prendia a seção a um assunto só: trocar o nome
 * e deixar este parágrafo embaixo daria uma seção de procedência com nome novo.
 *
 * O que NÃO se alargou foi o ângulo. `REGUA_DO_GUIA` continua exigindo assunto
 * que a loja pratica, e a segunda frase é o contrato disso: assunto amplo,
 * ponto de vista de quem paga o exame e recusa o carro. Sem isso a seção vira
 * conteúdo genérico disputando com portal, onde a Motors perde por autoridade
 * de domínio.
 *
 * Cabe em 155 caracteres — a régua de meta description da casa, em
 * `conteudo-seo/rascunhos.json` e em `tests/promessa-publica.test.ts`. A versão
 * que a revisão pegou tinha 158 e o corte caía dentro de "passa".
 */
export const RESUMO_DA_SECAO =
  "Procedência, mercado e financiamento para comprar ou vender um seminovo. " +
  "Escrito por quem paga o exame em todo o estoque e recusa o carro que não passa.";

/**
 * O que a régua de entrada exige de um guia — e o que ela proíbe.
 *
 * Está aqui, e não só na cabeça de quem escreve, porque a tela do painel vai
 * mostrar isto ao lado do formulário. As três primeiras vieram do plano de
 * conteúdo; a quarta e a quinta vieram de erro cometido e corrigido no
 * primeiro guia, na revisão de 05/09.
 */
export const REGUA_DO_GUIA = [
  "Assunto que a loja pratica — não conteúdo genérico que disputa com portal.",
  "Escrito do lado de quem paga a perícia e recusa o carro, não de quem vende o exame.",
  "Uma saída comercial definida: nenhum guia termina sem destino.",
  "Nada de ranking de motivo de reprovação: a distribuição real não está publicada.",
  "O laudo fica na ficha ASSIM QUE A PERÍCIA É APROVADA — nunca 'o laudo de cada veículo'.",
] as const;
