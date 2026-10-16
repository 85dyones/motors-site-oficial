"use client";

import Image, { type ImageProps } from "next/image";
import { useSurgimento } from "./useSurgimento";
import { carregadorDoCarro57, ehFotoDoCarro57, LADO_DO_CARD } from "../../lib/fotosDoCarro57";

/**
 * A capa do card quando a foto NÃO é nossa.
 *
 * Foto do carro57 vai pelas variantes que o próprio RevendaMais serve
 * (`lib/fotosDoCarro57.ts`, 16/10/2026): o `srcset` aponta para a `_S_`, a
 * `_M_` ou a `_G_`, e o card nunca passa da `_G_` (640 px, 48 KB) — era a
 * `_W_` de 224 KB passando pelo otimizador da Vercel, que respondia 402 quando
 * a cota acabava. Qualquer outra origem segue pelo otimizador, como sempre
 * foi (ver o comentário longo em `CardVeiculo`).
 *
 * Mora num arquivo cliente só pelo esmaecimento (`useSurgimento`, 30/09): o
 * card é desenhado por componentes de servidor, e o evento `load` da foto só
 * existe do lado do cliente. A irmã para a foto nossa é `FotoPropriaDoCard`.
 */
const carregadorDoCard = carregadorDoCarro57(LADO_DO_CARD);

export default function FotoOtimizadaDoCard(props: Omit<ImageProps, "loader">) {
  const surgimento = useSurgimento({ imediata: Boolean(props.priority || props.preload), onLoad: props.onLoad, onError: props.onError });
  // `alt` vem nas props; o lint não enxerga através do spread.
  if (typeof props.src === "string" && ehFotoDoCarro57(props.src)) {
    // eslint-disable-next-line jsx-a11y/alt-text
    return <Image {...props} {...surgimento} loader={carregadorDoCard} />;
  }
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image {...props} {...surgimento} />;
}
