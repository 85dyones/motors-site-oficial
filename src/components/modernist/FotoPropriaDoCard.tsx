"use client";

import Image, { type ImageProps } from "next/image";
import { useState, type SyntheticEvent } from "react";
import { versaoCardDaFoto, versaoWebDaFoto } from "../../lib/fotosDoVeiculo";
import { useSurgimento } from "./useSurgimento";

/**
 * A capa do card quando a foto é NOSSA (bucket `veiculos`).
 *
 * Desde 16/10/2026 pede a versão `card` (640 px, WebP, ~35 KB) gravada no
 * envio — a mesma medida da `_G_` do carro57 — e, se ela não existir (foto
 * enviada antes de 16/10 e ainda não passada pelo script
 * `gerar-card-das-fotos.js`), cai na `web` (1280 px) no `onError`. Antes era
 * sempre a `web`, ~90 a 200 KB por card.
 *
 * `unoptimized`: nenhuma das duas passa por transformação (decisão de 09/10;
 * ver `urlDaVersaoGravada`). Continua sendo `next/image` pelo `preload` da
 * capa prioritária e pelo `sizes`.
 */
export default function FotoPropriaDoCard(props: Omit<ImageProps, "loader" | "unoptimized"> & { src: string }) {
  const [semCard, setSemCard] = useState(false);
  const card = versaoCardDaFoto(props.src);
  const web = versaoWebDaFoto(props.src) ?? props.src;
  const src = card && !semCard ? card : web;

  const aoFalhar = (e: SyntheticEvent<HTMLImageElement>) => {
    if (card && !semCard) {
      setSemCard(true);
      return;
    }
    props.onError?.(e);
  };
  // A foto esmaece ao chegar, menos a prioritária (ver `useSurgimento`).
  const surgimento = useSurgimento({ imediata: Boolean(props.priority || props.preload), onLoad: props.onLoad, onError: aoFalhar });
  // `alt` vem nas props; o lint não enxerga através do spread.
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image {...props} {...surgimento} src={src} unoptimized />;
}
