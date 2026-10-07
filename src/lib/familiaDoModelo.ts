/**
 * Marca e "família" de modelo, para comparar carros escritos de jeitos
 * diferentes (07/10/2026).
 *
 * O estoque do site escreve "t cross highline 250 tsi aut"; a exportação do
 * RevendaMais, "T CROSS HIGHLINE 250 TSI AUT VOLKSWAGEN"; o rótulo de um
 * interesse, "Volkswagen T-Cross Highline 2022". Para a campanha de SMS os
 * três são o mesmo carro, e é por aqui que eles se encontram.
 *
 * Arquivo próprio, sem importar nada: `smsCampanhas` e `baseDeMarketing`
 * precisam dele, e um importa o outro.
 */

const semAcentoMinusculo = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * A "família" do modelo: a primeira palavra, sem pontuação. "T CROSS HIGHLINE
 * 250 TSI" → "tcross"; "HR-V EX CVT" → "hrv"; "UP! TAKE" → "up"; "208 LIKE" →
 * "208". É o que deixa "quem olhou um Gol" achar o Gol 1.0 e o Gol 1.6, e o
 * que casa o texto do RevendaMais com o estoque do site, que escrevem a
 * versão de jeitos diferentes.
 *
 * É larga de propósito: "Corolla" e "Corolla Cross" caem juntos, "Onix" e
 * "Onix Plus" também. Para campanha, vizinho de família é público melhor do
 * que ninguém.
 */
export function familiaDoModelo(modelo: string | null | undefined): string {
  const palavras = semAcentoMinusculo(modelo ?? "").replace(/[^a-z0-9 -]/g, "").split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return "";
  // "novo voyage", "nova saveiro", "grand siena", "gran caravan": o adjetivo não é o modelo.
  const prefixo = ["novo", "nova", "new", "grand", "gran"].includes(palavras[0]) && palavras.length > 1 ? 1 : 0;
  let primeira = palavras[prefixo];
  // "t cross", "c 180": letra solta se junta com a seguinte.
  if (primeira.length === 1 && palavras[prefixo + 1]) primeira += palavras[prefixo + 1];
  return primeira.replace(/-/g, "");
}

/** A marca para comparar: "Volkswagen", "VOLKSWAGEN" e "volkswagen" são a mesma; "VW" e "GM" também. */
export function marcaCanonica(marca: string | null | undefined): string {
  const m = semAcentoMinusculo(marca ?? "").replace(/[^a-z0-9]/g, "");
  const APELIDOS: Record<string, string> = { vw: "volkswagen", gm: "chevrolet", mercedes: "mercedesbenz", mb: "mercedesbenz", caoachery: "chery" };
  return APELIDOS[m] ?? m;
}

/**
 * As famílias que um texto livre pode estar citando: cada palavra, e a letra
 * solta colada na seguinte ("t cross" → "tcross"). O ano no fim não conta:
 * "Peugeot 208 Griffe 1.6 2008" não é um 2008.
 */
export function familiasNoTexto(texto: string | null | undefined): Set<string> {
  const palavras = semAcentoMinusculo(texto ?? "")
    .replace(/[^a-z0-9 -]/g, " ")
    .replace(/ (19|20)\d{2}\s*$/, "")
    .split(/\s+/)
    .filter(Boolean);
  const familias = new Set<string>();
  palavras.forEach((p, i) => {
    familias.add(p.replace(/-/g, ""));
    if (p.length === 1 && palavras[i + 1]) familias.add(p + palavras[i + 1].replace(/-/g, ""));
  });
  return familias;
}
