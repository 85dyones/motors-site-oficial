"use client";

import Image, { type ImageLoader, type ImageProps } from "next/image";
import { ehFotoPropria, urlDaFotoNaLargura, LARGURA_DA_VERSAO_ZAP } from "../../lib/fotosDoVeiculo";

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
  // `alt` vem nas props; o lint não enxerga através do spread.
  // eslint-disable-next-line jsx-a11y/alt-text
  return ehFotoPropria(props.src) ? <Image {...props} loader={carregador} /> : <Image {...props} />;
}
