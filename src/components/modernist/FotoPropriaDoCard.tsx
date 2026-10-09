"use client";

import Image, { type ImageProps } from "next/image";
import { versaoWebDaFoto } from "../../lib/fotosDoVeiculo";
import { useSurgimento } from "./useSurgimento";

/**
 * A capa do card quando a foto é NOSSA (bucket `veiculos`): a versão `web`
 * gravada no envio (1280 px, WebP, ~90 KB), direto do CDN do Supabase.
 *
 * De 29/09 a 09/10 o card pedia cada largura do `srcset` ao redimensionamento
 * do Storage. Ele cobra por foto de origem distinta no mês, com 100 incluídas
 * no Pro, e a cota acabava no primeiro dia (ver `urlDaVersaoGravada`). O card
 * só tem uma versão gravada que lhe serve, então não há `srcset` a montar:
 * vai `unoptimized`. Se a coluna trouxer a `zap` (1600 px, JPEG — o degrau de
 * `url_imagem`), troca pela `web` irmã.
 *
 * Mora num arquivo cliente por causa do esmaecimento (`useSurgimento`).
 * Continua sendo `next/image`: com `priority`, é ele que põe o
 * `<link rel="preload">` da capa no `<head>` — o que as três primeiras capas
 * do `/estoque` precisam para o LCP.
 */
export default function FotoPropriaDoCard(props: Omit<ImageProps, "loader" | "unoptimized"> & { src: string }) {
  // A foto esmaece ao chegar, menos a prioritária (ver `useSurgimento`).
  const surgimento = useSurgimento({ imediata: Boolean(props.priority || props.preload), onLoad: props.onLoad, onError: props.onError });
  // `alt` vem nas props; o lint não enxerga através do spread.
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image {...props} {...surgimento} src={versaoWebDaFoto(props.src) ?? props.src} unoptimized />;
}
