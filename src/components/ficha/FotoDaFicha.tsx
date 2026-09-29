"use client";

import Image, { type ImageProps } from "next/image";
import FotoPropriaDoCard from "../modernist/FotoPropriaDoCard";
import { ehFotoPropria } from "../../lib/fotosDoVeiculo";

/**
 * Uma foto da galeria da ficha: a foto NOSSA pelo redimensionamento do
 * Storage, a do carro57 pelo otimizador.
 *
 * Até 29/09 a galeria, as miniaturas e a tela cheia mandavam toda foto ao
 * `/_next/image`, inclusive as do bucket `veiculos`. É a mesma cota que estourou
 * (402) e levou o card a usar `FotoPropriaDoCard` na tarefa 1.9 — a ficha
 * tinha ficado de fora. A regra é a do card, num lugar só.
 */
export default function FotoDaFicha(props: Omit<ImageProps, "loader" | "unoptimized"> & { src: string }) {
  // `alt` vem nas props; o lint não enxerga através do spread.
  // eslint-disable-next-line jsx-a11y/alt-text
  return ehFotoPropria(props.src) ? <FotoPropriaDoCard {...props} /> : <Image {...props} />;
}
