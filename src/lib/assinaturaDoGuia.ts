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
/**
 * `apresentacao` é o que o dono pediu em 30/09: ele NÃO é o fundador da loja
 * (o site dizia isso desde 29/09, errado). É profissional com mais de dez anos
 * de mercado. A mesma frase vai para o `/sobre` e para o `description` do nó
 * `Person` no schema: texto e dado estruturado dizem a mesma coisa. Não pôr
 * cargo aqui sem ele dizer qual.
 */
export const AUTOR_DOS_GUIAS = {
  nome: "Dyones Oliveira",
  apresentacao: "profissional com mais de dez anos de mercado",
} as const;

/**
 * A segunda linha do bloco de autor do guia (tarefa 4.11, 30/09):
 * "Profissional com mais de dez anos de mercado · Motors Store". A loja pelo
 * nome que o `#dealer` publica; sem nome, só a apresentação.
 */
export function apresentacaoDoAutor(nomeDaLoja: string | null | undefined): string {
  const loja = (nomeDaLoja ?? "").trim();
  const frase = AUTOR_DOS_GUIAS.apresentacao.charAt(0).toUpperCase() + AUTOR_DOS_GUIAS.apresentacao.slice(1);
  return loja ? `${frase} · ${loja}` : frase;
}

/** "DO": primeira letra do primeiro e do último nome, para o monograma. */
export function iniciaisDoAutor(): string {
  const partes = AUTOR_DOS_GUIAS.nome.trim().split(/\s+/);
  const primeira = partes[0]?.charAt(0) ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1].charAt(0) : "";
  return (primeira + ultima).toUpperCase();
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
