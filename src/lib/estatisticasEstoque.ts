import type { Veiculo } from "../types";

/**
 * Números do estoque que a home afirma ao cliente.
 *
 * Existe isolado por um motivo concreto: a régua do hero exibia "12 ANOS"
 * como tempo de casa, um default escrito à mão no componente, que nenhum
 * dado alimentava — entrou junto com o redesign Modernist e ninguém tinha
 * como conferir. Indicador de vitrine é afirmação; afirmação precisa sair de
 * dado real e ficar testável. Daí uma função pura por número.
 */

/**
 * Quantas marcas distintas o estoque disponível tem.
 *
 * Normaliza caixa e espaço porque o feed do RevendaMais entrega a mesma marca
 * em grafias diferentes ("VW", "vw ", "Vw") — contar sem normalizar inflaria o
 * número, que é justamente o erro que esta função existe para não cometer.
 */
export function contarMarcas(veiculos: Pick<Veiculo, "marca">[]): number {
  const marcas = new Set<string>();
  for (const veiculo of veiculos ?? []) {
    const marca = (veiculo?.marca || "").trim().toUpperCase();
    if (marca) marcas.add(marca);
  }
  return marcas.size;
}
