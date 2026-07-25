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
