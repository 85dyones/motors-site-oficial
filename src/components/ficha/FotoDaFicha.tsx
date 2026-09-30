"use client";

import Image, { type ImageLoader, type ImageProps } from "next/image";
import { ehFotoPropria, urlDaFotoNaLargura, LARGURA_DA_VERSAO_ZAP } from "../../lib/fotosDoVeiculo";
import { useSurgimento } from "../modernist/useSurgimento";

/**
 * Uma foto da galeria da ficha: a foto NOSSA pelo redimensionamento do
 * Storage, a do carro57 pelo otimizador.
 *
 * Até 29/09 a galeria, as miniaturas e a tela cheia mandavam toda foto ao
 * `/_next/image`, inclusive as do bucket `veiculos`. É a mesma cota que estourou
 * (402) e levou o card a usar `FotoPropriaDoCard` na tarefa 1.9 — a ficha
 * tinha ficado de fora.
 *
 * O loader é próprio, e não o do card, por causa do teto: a galeria desenha a
 * versão `zap`, gravada com 1600 px, e é ampliada até a tela cheia. Com o teto
 * do card (1280, a versão `web`) a tela cheia e o carrossel em tela retina
 * recebiam menos pixel do que o otimizador entregava antes.
 */
const carregador: ImageLoader = ({ src, width, quality }) =>
  urlDaFotoNaLargura(src, width, quality ?? 75, LARGURA_DA_VERSAO_ZAP);

export default function FotoDaFicha(props: Omit<ImageProps, "loader" | "unoptimized"> & { src: string }) {
  // A foto esmaece ao chegar, menos a prioritária: a capa da galeria e a da
  // tela cheia (ver `useSurgimento`).
  const surgimento = useSurgimento({ imediata: Boolean(props.priority || props.preload), onLoad: props.onLoad, onError: props.onError });
  // `alt` vem nas props; o lint não enxerga através do spread.
  return ehFotoPropria(props.src) ? (
    // eslint-disable-next-line jsx-a11y/alt-text
    <Image {...props} {...surgimento} loader={carregador} />
  ) : (
    // eslint-disable-next-line jsx-a11y/alt-text
    <Image {...props} {...surgimento} />
  );
}
