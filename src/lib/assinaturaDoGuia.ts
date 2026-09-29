/**
 * A assinatura visível de um guia: quem escreve e quando.
 *
 * ---------------------------------------------------------------------------
 * Por que existe (2026-09-21)
 * ---------------------------------------------------------------------------
 * O `Article` do JSON-LD sempre teve `datePublished`, `dateModified` e
 * `author` (`lib/schemaGuia.ts`). A página não mostrava nenhum dos três: o
 * leitor via trilha, título e corpo, e nenhuma data. Conteúdo sobre laudo,
 * fraude e documentação sem data à vista não diz se ainda vale — e o dado
 * marcado que não aparece na tela é sinal mais fraco do que o visível.
 *
 * O autor mostrado é o MESMO do schema. Até 21/09 era a loja; o dono decidiu
 * no mesmo dia que os guias são dele: "Dyones Oliveira, Motors Store". Autor
 * pessoa é sinal de experiência que autor organização não dá, e a loja não
 * some — continua `publisher`, e o autor declara `worksFor` para ela.
 */

/**
 * Quem assina os guias. Um só por enquanto, por decisão do dono (2026-09-21).
 *
 * No dia em que outra pessoa escrever, isto vira coluna na linha do guia — o
 * lugar é `guias` no banco, não uma segunda constante aqui.
 */
export const AUTOR_DOS_GUIAS = { nome: "Dyones Oliveira", cargo: "Fundador" } as const;

/** "Dyones Oliveira, Motors Store" — a loja pelo nome que o `#dealer` publica. */
export function assinaturaDoAutor(nomeDaLoja: string | null | undefined): string {
  const loja = (nomeDaLoja ?? "").trim();
  return loja ? `${AUTOR_DOS_GUIAS.nome}, ${loja}` : AUTOR_DOS_GUIAS.nome;
}

const FUSO = "America/Sao_Paulo";

const POR_EXTENSO = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: FUSO,
});

const DIA = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: FUSO,
});

/** "2026-09-05T09:00:00-03:00" → "5 de setembro de 2026", no fuso da loja. */
export function dataPorExtenso(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return POR_EXTENSO.format(data);
}

/**
 * As duas datas caem no mesmo dia do calendário de Curitiba?
 *
 * Editar um erro de digitação no mesmo dia da publicação não é "atualização"
 * para quem lê — mostrar as duas iguais só polui a linha.
 */
export function mesmoDiaEmCuritiba(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return true;
  return DIA.format(da) === DIA.format(db);
}
