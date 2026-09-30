"use client";

import Image, { type ImageLoader, type ImageProps } from "next/image";
import { urlDaFotoNaLargura } from "../../lib/fotosDoVeiculo";
import { useSurgimento } from "./useSurgimento";

/**
 * A capa do card quando a foto é NOSSA (bucket `veiculos`): `next/image` com o
 * redimensionamento do Storage no lugar do otimizador da Vercel.
 *
 * Mora num arquivo cliente só por causa do `loader`: o card é desenhado por
 * componentes de servidor (home, hubs, bairros), e função não atravessa a
 * fronteira servidor → cliente. Aqui ela nasce do lado do cliente.
 *
 * Continua sendo `next/image` de propósito: é ele que monta o `srcset` a partir
 * do `sizes` do card e, com `priority`, põe o `<link rel="preload">` da capa no
 * `<head>` — o que as três primeiras capas do `/estoque` precisam para o LCP.
 */
const carregador: ImageLoader = ({ src, width, quality }) =>
  urlDaFotoNaLargura(src, width, quality ?? 75);

export default function FotoPropriaDoCard(props: Omit<ImageProps, "loader" | "unoptimized">) {
  // A foto esmaece ao chegar, menos a prioritária (ver `useSurgimento`).
  const surgimento = useSurgimento({ imediata: Boolean(props.priority), onLoad: props.onLoad, onError: props.onError });
  // `alt` vem nas props; o lint não enxerga através do spread.
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image {...props} {...surgimento} loader={carregador} />;
}
