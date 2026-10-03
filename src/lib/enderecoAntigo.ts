import type { MarcaConhecida } from "./fichaPerdida";
import { ehSegmentoDePdp, slugificar } from "./veiculoUrl";

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
 *
 * As funções recebem o ÍNDICE DE MARCAS do recorte do não encontrado
 * (`recorteDoNaoEncontrado`, guardado por uma hora), e não o estoque: o espaço
 * de endereços falsos é ilimitado, e a decisão de 13/09 é que o ramo de não
 * encontrado nunca lê o estoque inteiro a cada pedido. Na pane, quem chama cai
 * no 404 (ou em `/estoque`), como antes.
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
 * O mesmo caminho em minúsculas, quando ele difere do pedido.
 *
 * `null` quando não há o que corrigir. A comparação é com o próprio resultado
 * de `toLowerCase`, e não com uma faixa de letras: há caractere "maiúsculo"
 * por faixa (o `×`) que não tem minúscula, e o destino igual à origem seria um
 * laço de redirecionamento.
 */
export function caminhoEmMinusculas(segmentos: string[]): string | null {
  const limpos = segmentos.map(semEscape);
  if (!limpos.some((s) => s !== s.toLowerCase())) return null;
  return "/" + limpos.map((s) => encodeURIComponent(s.toLowerCase())).join("/");
}

/** Para onde vai a ficha antiga de um anúncio que o banco não conhece. */
export function destinoDeFichaAntiga(
  categoria: string,
  marca: string,
  modelo: string,
  marcas: MarcaConhecida[],
): string {
  const segmento = semEscape(categoria).toLowerCase();
  if (!ehSegmentoDePdp(segmento)) return "/estoque";
  const slugMarca = slugificar(semEscape(marca));
  const slugModelo = slugificar(semEscape(modelo));
  const hub = marcas.find((m) => m.segmento === segmento && m.slug === slugMarca);
  if (!hub) return "/estoque";
  if (hub.modelos.some((m) => m.slug === slugModelo)) return `/${segmento}/${slugMarca}/${slugModelo}`;
  return `/${segmento}/${slugMarca}`;
}

/**
 * `/multipla/modelo-marca/UP`: o catálogo antigo listava por modelo, sem a
 * marca no endereço. Procura o modelo em todas as marcas; com um só hub que
 * bate, vai para ele. Sem nenhum, ou com mais de um, fica a vitrine.
 */
export function destinoDeModeloDoCatalogoAntigo(modelo: string, marcas: MarcaConhecida[]): string {
  const slug = slugificar(semEscape(modelo));
  const achados = marcas.flatMap((marca) =>
    marca.modelos.filter((m) => m.slug === slug).map((m) => `/${marca.segmento}/${marca.slug}/${m.slug}`),
  );
  return achados.length === 1 ? achados[0] : "/estoque";
}
