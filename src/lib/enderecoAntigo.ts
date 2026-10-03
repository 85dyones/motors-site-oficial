import type { Veiculo } from "../types";
import { acharHubDeMarca, acharHubDeModelo, hubsDeMarca } from "./hubsDeEstoque";
import { ehSegmentoDePdp, type SegmentoDePdp } from "./veiculoUrl";

/**
 * Os endereços do site antigo (`motorsstoreoficial.com.br`, hospedado pelo
 * RevendaMais) que a virada de 20/09/2026 deixou cair em 404.
 *
 * Medido em 03/10/2026, no Search Console da propriedade antiga (90 dias) e
 * pedindo cada endereço ao site novo:
 *
 *   `/multipla/marca/VOLKSWAGEN`     53 impressões → `/carros/VOLKSWAGEN` → 404.
 *      O site antigo escrevia a marca em MAIÚSCULAS, e a regra de 20/09 foi
 *      medida com a marca em minúsculas.
 *   `/multipla/modelo-marca/UP`      85 impressões, 2 cliques → `/estoque`.
 *      Chegava, mas na vitrine inteira, com o hub do modelo existindo.
 *   `/carros/Ford/Jeep//…-4846154.html`  70 impressões → 404.
 *   `/carros/Volkswagen/Taos/…-7927166.html`  ainda no Google → 404.
 *      Anúncios que o site novo nunca conheceu: saíram do estoque antes de o
 *      banco existir. A ficha vendida que o banco conhece já vai para o hub
 *      (`destinoDoVeiculoArquivado`, regra do dono de 25/08); estas não tinham
 *      para onde ir.
 *
 * A regra é a mesma cascata das fichas arquivadas: modelo → marca → `/estoque`,
 * nunca a home. E só vale para endereço com cara de site antigo (`.html` no
 * fim): um endereço qualquer, digitado errado, continua sendo 404.
 */

function semEscape(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** O último segmento de uma ficha do RevendaMais termina em `.html`. */
export function ehFichaDoSiteAntigo(ultimoSegmento: string): boolean {
  return /\.html$/i.test(semEscape(ultimoSegmento));
}

/**
 * O mesmo caminho em minúsculas, quando algum segmento tem maiúscula.
 *
 * `null` quando não há o que corrigir: o chamador segue o fluxo normal.
 */
export function caminhoEmMinusculas(segmentos: string[]): string | null {
  const limpos = segmentos.map(semEscape);
  if (!limpos.some((s) => /[A-ZÀ-Ý]/.test(s))) return null;
  return "/" + limpos.map((s) => encodeURIComponent(s.toLowerCase())).join("/");
}

/** Para onde vai a ficha antiga de um anúncio que o banco não conhece. */
export function destinoDeFichaAntiga(
  categoria: string,
  marca: string,
  modelo: string,
  historico: Veiculo[],
  disponiveis: Veiculo[],
): string {
  const segmento = semEscape(categoria).toLowerCase();
  if (!ehSegmentoDePdp(segmento)) return "/estoque";
  const slugMarca = semEscape(marca).toLowerCase();
  const slugModelo = semEscape(modelo).toLowerCase();
  if (acharHubDeModelo(historico, disponiveis, segmento, slugMarca, slugModelo)) {
    return `/${segmento}/${slugMarca}/${slugModelo}`;
  }
  if (acharHubDeMarca(historico, disponiveis, segmento, slugMarca)) {
    return `/${segmento}/${slugMarca}`;
  }
  return "/estoque";
}

/**
 * `/multipla/modelo-marca/UP`: o catálogo antigo listava por modelo, sem a
 * marca no endereço. Procura o modelo em todas as marcas; com um só hub que
 * bate, vai para ele. Sem nenhum, ou com mais de um, fica a vitrine.
 */
export function destinoDeModeloDoCatalogoAntigo(
  modelo: string,
  historico: Veiculo[],
  disponiveis: Veiculo[],
): string {
  const slug = semEscape(modelo).toLowerCase().trim().replace(/\s+/g, "-");
  const achados: string[] = [];
  for (const segmento of ["carros", "motos"] as SegmentoDePdp[]) {
    for (const marca of hubsDeMarca(historico, disponiveis, segmento)) {
      for (const m of marca.modelos) {
        if (m.slug === slug) achados.push(`/${segmento}/${marca.slug}/${m.slug}`);
      }
    }
  }
  return achados.length === 1 ? achados[0] : "/estoque";
}
