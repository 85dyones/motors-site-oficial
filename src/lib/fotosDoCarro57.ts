import type { ImageLoader } from "next/image";

/**
 * As variantes que o S3 do RevendaMais (carro57) já serve de cada foto do
 * estoque — a "opção A" da `docs/DIAGNOSTICO_IMAGENS.md`, implementada em
 * 16/10/2026.
 *
 * Toda foto do feed chega como
 * `https://s3.carro57.com.br/FC/9037/<anúncio>_<n>_<V>_<hash>.jpeg`, e o `<V>`
 * é a variante. Trocar o token basta — medido em 16/10 na foto 23 do anúncio
 * 8171616, todas com `Cache-Control: max-age=31536000`:
 *
 * | token | lado maior | peso   |
 * |-------|------------|--------|
 * | `P`   |    72 px   |   2 KB |
 * | `S`   |   260 px   |  11 KB |
 * | `M`   |   485 px   |  31 KB |
 * | `G`   |   640 px   |  48 KB |
 * | `W`   |  1620 px   | 224 KB |
 * | `O`   |  1920 px   | 428 KB |
 *
 * Até aqui o card pegava a `W` de 224 KB e pagava ao otimizador da Vercel
 * para gerar o que a `G` de 48 KB já é — e era esse o maior consumidor da cota
 * que respondeu 402 em agosto (o card desenha todo veículo na home, no
 * catálogo, nos hubs e nas landings). Com o `loader`, a foto do carro57 sai da
 * cota: o `srcset` do `next/image` passa a apontar para as variantes, sem
 * transformação de ninguém.
 *
 * O que continua pelo otimizador, de propósito: a foto que é o LCP da página
 * (a capa da galeria da ficha e o hero da home). Lá o WebP redimensionado do
 * otimizador pesa um terço da `W` em JPEG, e são poucas fotos — uma por carro
 * e as curadas do banner —, que cabem em qualquer cota.
 *
 * `web_full_images` traz a `W` e `whatsapp_images` traz a `O` da MESMA foto
 * (a inversão card/ficha que o diagnóstico anotou). O `loader` normaliza as
 * duas para o mesmo endereço na mesma largura, então card e ficha passam a
 * compartilhar o cache do navegador.
 *
 * `P` não entra na escada: a 72 px ela borra até a miniatura de 33vw.
 */
export const VARIANTES_DO_CARRO57 = [
  { token: "S", lado: 260 },
  { token: "M", lado: 485 },
  { token: "G", lado: 640 },
  { token: "W", lado: 1620 },
  { token: "O", lado: 1920 },
] as const;

/** O teto do card: a `G` (640 px, 48 KB), como o diagnóstico recomendou. */
export const LADO_DO_CARD = 640;

/** O teto da folha impressa: a `W` já é maior que uma A4 a 150 dpi. */
export const LADO_DA_FOLHA = 1620;

const PADRAO_DA_FOTO = /^(https:\/\/s3\.carro57\.com\.br\/FC\/\d+\/\d+_\d+_)([PSMGWO])(_[0-9a-f]+\.(?:jpe?g|png|webp))$/i;

function semQuery(url: string | null | undefined): string {
  return (url ?? "").trim().split("?")[0];
}

/** A URL é uma foto do carro57 no formato em que as variantes existem? */
export function ehFotoDoCarro57(url: string | null | undefined): boolean {
  return PADRAO_DA_FOTO.test(semQuery(url));
}

/**
 * A variante mais leve que ainda cobre `largura`, limitada por `teto`.
 *
 * Fora do padrão, devolve a URL como veio: o chamador decide o que fazer com
 * ela (o card segue pelo otimizador, como sempre foi).
 */
export function varianteDoCarro57(url: string, largura: number, teto: number = Infinity): string {
  const casou = PADRAO_DA_FOTO.exec(semQuery(url));
  if (!casou) return url;
  const alvo = Math.min(largura, teto);
  const escolhida =
    VARIANTES_DO_CARRO57.find((v) => v.lado >= alvo) ?? VARIANTES_DO_CARRO57[VARIANTES_DO_CARRO57.length - 1];
  return `${casou[1]}${escolhida.token}${casou[3]}`;
}

/**
 * O `loader` do `next/image`: cada largura do `srcset` vira uma variante.
 *
 * `quality` não existe aqui — a variante é um arquivo pronto, e a Vercel não
 * entra no caminho.
 */
export function carregadorDoCarro57(teto?: number): ImageLoader {
  return ({ src, width }) => varianteDoCarro57(src, width, teto);
}
