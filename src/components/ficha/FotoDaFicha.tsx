"use client";

import Image, { type ImageLoader, type ImageProps } from "next/image";
import { ehFotoPropria, urlDaVersaoGravada, versaoWebDaFoto } from "../../lib/fotosDoVeiculo";
import { useSurgimento } from "../modernist/useSurgimento";

/**
 * Uma foto da galeria da ficha: a foto NOSSA pelas versões já gravadas no
 * bucket, a do carro57 pelo otimizador.
 *
 * Até 29/09 a galeria, as miniaturas e a tela cheia mandavam toda foto ao
 * `/_next/image`, inclusive as do bucket `veiculos` — a mesma cota da Vercel
 * que estourou (402). De 29/09 a 09/10 a foto nossa foi ao redimensionamento
 * do Supabase, e a galeria virou quase toda a conta dele: cada foto de cada
 * carro é uma "origem" cobrada (ver `urlDaVersaoGravada`).
 *
 * Agora o `srcset` escolhe entre as duas versões que o envio já gravou: a
 * `web` (1280 px) até essa largura e a `zap` (1600 px) acima — o carrossel em
 * tela retina e a tela cheia, onde a foto é ampliada. Miniatura e slide do
 * carrossel pedem a MESMA `web`, então o navegador baixa uma vez.
 *
 * Foto nossa sem `zap` (coluna sem par) não tem o que escolher: vai inteira,
 * `unoptimized`. Com o `loader`, o Next acusaria em dev um loader que "não
 * implementa a largura".
 */
const carregador: ImageLoader = ({ src, width }) => urlDaVersaoGravada(src, width);

export default function FotoDaFicha(props: Omit<ImageProps, "loader" | "unoptimized"> & { src: string }) {
  // A foto esmaece ao chegar, menos a prioritária: a capa da galeria e a da
  // tela cheia (ver `useSurgimento`).
  const surgimento = useSurgimento({ imediata: Boolean(props.priority || props.preload), onLoad: props.onLoad, onError: props.onError });
  // `alt` vem nas props; o lint não enxerga através do spread.
  if (!ehFotoPropria(props.src)) {
    // eslint-disable-next-line jsx-a11y/alt-text
    return <Image {...props} {...surgimento} />;
  }
  return versaoWebDaFoto(props.src) ? (
    // eslint-disable-next-line jsx-a11y/alt-text
    <Image {...props} {...surgimento} loader={carregador} />
  ) : (
    // eslint-disable-next-line jsx-a11y/alt-text
    <Image {...props} {...surgimento} unoptimized />
  );
}
