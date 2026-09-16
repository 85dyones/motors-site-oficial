export type EstadoDaJanela = "na" | "fora" | "sem";

/**
 * Os três estados de `manutencoes.dentro_da_janela`.
 *
 * `sem` é "não havia janela para casar com este serviço" — que NÃO é atraso e
 * NÃO é cumprimento. Antes do plano vitalício o banco só gravava true/false;
 * hoje grava null, e todo consumidor que colapsar três em dois passa a mentir
 * para um dos lados.
 *
 * `undefined` cai em `sem` de propósito: o valor chega de `res.json()` em
 * algumas chamadas, e campo ausente não é motivo para afirmar nada.
 */
export function classificarJanela(dentro: boolean | null | undefined): EstadoDaJanela {
  if (dentro === true) return "na";
  if (dentro === false) return "fora";
  return "sem";
}
