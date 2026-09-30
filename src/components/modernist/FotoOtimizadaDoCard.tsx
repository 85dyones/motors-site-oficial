"use client";

import Image, { type ImageProps } from "next/image";
import { useSurgimento } from "./useSurgimento";

/**
 * A capa do card quando a foto vem do carro57: `next/image` com o otimizador
 * da Vercel, como sempre foi (ver o comentário longo em `CardVeiculo`).
 *
 * Mora num arquivo cliente só pelo esmaecimento (`useSurgimento`, 30/09): o
 * card é desenhado por componentes de servidor, e o evento `load` da foto só
 * existe do lado do cliente. A irmã para a foto nossa é `FotoPropriaDoCard`.
 */
export default function FotoOtimizadaDoCard(props: Omit<ImageProps, "loader">) {
  const surgimento = useSurgimento({ imediata: Boolean(props.priority || props.preload), onLoad: props.onLoad, onError: props.onError });
  // `alt` vem nas props; o lint não enxerga através do spread.
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image {...props} {...surgimento} />;
}
