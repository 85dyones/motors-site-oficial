import { QuickTag } from "@/types";

/**
 * Converts a text string into a clean, SEO-friendly URL slug.
 * E.g. "POLE POSITION MOTORS" -> "pole-position-motors"
 * "SUVs & 4x4" -> "suvs-4x4"
 */
export function slugifyTag(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s-]/g, "") // remove special chars except spaces/hyphens
    .trim()
    .replace(/\s+/g, "-") // replace spaces with hyphens
    .replace(/-+/g, "-"); // collapse multiple hyphens
}

/**
 * Formats a slugified tag string back to title display text.
 * E.g. "pole-position-motors" -> "POLE POSITION MOTORS"
 */
export function unslugifyTag(slug: string): string {
  if (!slug) return "";
  const cleaned = slug
    .replace(/-/g, " ")
    .replace(/quick tag /i, "")
    .trim();
  return cleaned.toUpperCase();
}

/**
 * Nome do destaque em caixa de frase, para começo de texto.
 * "BAIXA QUILOMETRAGEM" e "pole position motors" -> "Baixa quilometragem"
 *
 * O nome é digitado no painel e vai para o banco em caixa alta, mas o que já
 * está salvo pode estar em qualquer caixa — por isso normaliza os dois lados
 * em vez de só capitalizar a primeira letra.
 */
export function nomeEmFrase(nome: string): string {
  if (!nome) return "";
  return nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase();
}

/**
 * Nome do destaque para o meio de uma frase, onde caixa alta viraria grito.
 * "BAIXA QUILOMETRAGEM" -> "baixa quilometragem"
 *
 * Usado nos textos de SEO: `<title>` todo em maiúscula é candidato a ser
 * reescrito pelo Google, e "Carros BAIXA QUILOMETRAGEM em Curitiba" lê pior
 * na SERP do que a mesma frase em caixa normal.
 */
export function nomeEmMinuscula(nome: string): string {
  return nome ? nome.toLowerCase() : "";
}

/**
 * Finds a matching QuickTag from a list by ID, slug, or normalized name.
 */
export function findMatchingQuickTag(tags: QuickTag[], searchParam: string): QuickTag | undefined {
  if (!searchParam || !tags || tags.length === 0) return undefined;
  const target = searchParam.toLowerCase().trim();
  const targetSlug = slugifyTag(target);

  return tags.find((t) => {
    const idLower = t.id.toLowerCase();
    const idSlug = slugifyTag(t.id);
    const nameSlug = slugifyTag(t.name);
    return idLower === target || idSlug === targetSlug || nameSlug === targetSlug;
  });
}
