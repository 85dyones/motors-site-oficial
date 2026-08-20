/**
 * Como a loja lê `manutencoes.dentro_da_janela`.
 *
 * Os três estados são do banco, não da tela: `true` cumpriu, `false` havia
 * janela e o serviço não a cumpriu, `null` não havia janela. Tratar `null`
 * como `false` era o defeito que o plano vitalício corrigiu — e continua
 * possível em revisão avulsa e em carro que saiu da Garagem.
 */
export type TomDoSelo = "na" | "fora" | "sem";

export function seloDaJanela(dentro: boolean | null): { texto: string; tom: TomDoSelo } {
  if (dentro === true) return { texto: "NA JANELA", tom: "na" };
  if (dentro === false) return { texto: "FORA DA JANELA", tom: "fora" };
  return { texto: "SEM JANELA", tom: "sem" };
}
