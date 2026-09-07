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
