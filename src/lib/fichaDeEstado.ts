/** Operações puras sobre a lista da ficha de estado — o editor só as chama. */
import type { ItemDeEstado } from "./repasse";

export const ITEM_VAZIO: ItemDeEstado = { descricao: "", local: "", foto: null, orcamento: null, estetico: false };

export function comItem(itens: ItemDeEstado[], indice: number, parcial: Partial<ItemDeEstado>): ItemDeEstado[] {
  return itens.map((item, i) => (i === indice ? { ...item, ...parcial } : item));
}

export function semItem(itens: ItemDeEstado[], indice: number): ItemDeEstado[] {
  return itens.filter((_, i) => i !== indice);
}
