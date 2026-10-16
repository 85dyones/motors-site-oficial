"use client";

import Image, { type ImageLoader, type ImageProps } from "next/image";
import { ehFotoPropria, urlDaVersaoGravada, versaoWebDaFoto } from "../../lib/fotosDoVeiculo";
import { carregadorDoCarro57, ehFotoDoCarro57 } from "../../lib/fotosDoCarro57";
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
 * tela retina e a tela cheia, onde a foto é ampliada. No celular, miniatura e
 * slide do carrossel pedem a mesma `web`, e o navegador baixa uma vez.
 *
 * Foto nossa sem `zap` (coluna sem par) não tem o que escolher: vai inteira,
 * `unoptimized`. Com o `loader`, o Next acusaria em dev um loader que "não
 * implementa a largura".
 *
 * A foto do carro57 (16/10/2026): a capa da galeria — a prioritária, o LCP da
 * ficha — continua pelo otimizador da Vercel, porque o WebP dele a 1200 px
 * pesa um terço da `_W_` em JPEG e é UMA foto por carro. Todo o resto (os
 * outros slides, as miniaturas e a tela cheia) vai pelas variantes que o
 * próprio RevendaMais serve (`lib/fotosDoCarro57.ts`): `_M_` na miniatura,
 * `_W_` no slide, `_O_` só na tela cheia do desktop. Zero transformação, e
 * cada slide só é baixado quando a pessoa chega nele.
 */
const carregador: ImageLoader = ({ src, width }) => urlDaVersaoGravada(src, width);
const carregadorDoCarro57SemTeto = carregadorDoCarro57();

export default function FotoDaFicha(props: Omit<ImageProps, "loader" | "unoptimized"> & { src: string }) {
  // A foto esmaece ao chegar, menos a prioritária: a capa da galeria e a da
  // tela cheia (ver `useSurgimento`).
  const surgimento = useSurgimento({ imediata: Boolean(props.priority || props.preload), onLoad: props.onLoad, onError: props.onError });
  // `alt` vem nas props; o lint não enxerga através do spread.
  if (!ehFotoPropria(props.src)) {
    const prioritaria = Boolean(props.priority || props.preload);
    if (!prioritaria && ehFotoDoCarro57(props.src)) {
      // eslint-disable-next-line jsx-a11y/alt-text
      return <Image {...props} {...surgimento} loader={carregadorDoCarro57SemTeto} />;
    }
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
