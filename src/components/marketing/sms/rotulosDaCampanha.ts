import { DESTINOS_SEM_CARRO, ROTULO_DO_DESTINO, type DestinoSemCarro } from "../../../lib/smsCampanhas";

/**
 * Os textos que o formulário e o monitor das campanhas de SMS escrevem do
 * mesmo jeito: o tempo desde a compra e para onde o link leva.
 */

/** 12 → "1 ano", 18 → "1 ano e meio", 24 → "2 anos". O que não é ano cheio nem ano e meio sai em meses. */
export function rotuloDoTempoDeCompra(meses: number): string {
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  if (anos >= 1 && resto === 0) return `${anos} ${anos === 1 ? "ano" : "anos"}`;
  if (anos >= 1 && resto === 6) return `${anos} ${anos === 1 ? "ano" : "anos"} e meio`;
  return `${meses} ${meses === 1 ? "mês" : "meses"}`;
}

/** "O estoque" → "o estoque": o rótulo do destino no meio de uma frase. */
export const destinoNaFrase = (destino: DestinoSemCarro) => ROTULO_DO_DESTINO[destino].charAt(0).toLowerCase() + ROTULO_DO_DESTINO[destino].slice(1);

const ehOCaminho = (destino: string, caminho: string) => destino === caminho || destino.startsWith(`${caminho}/`) || destino.startsWith(`${caminho}?`);

/**
 * Para onde leva o link de uma campanha, a partir do caminho gravado nela:
 * a ficha (carro ou moto), um dos destinos sem carro, ou o próprio caminho
 * quando não é nenhum deles. Vazio quando a campanha não diz.
 */
export function rotuloDoDestinoDoLink(destino: string | null | undefined): string {
  const d = (destino ?? "").trim();
  if (d === "") return "";
  if (d.startsWith("/carros") || d.startsWith("/motos")) return "a ficha do carro";
  const chave = (Object.keys(DESTINOS_SEM_CARRO) as DestinoSemCarro[]).find((k) => ehOCaminho(d, DESTINOS_SEM_CARRO[k]));
  return chave ? destinoNaFrase(chave) : d;
}
