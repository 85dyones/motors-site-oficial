import { classificarJanela, type EstadoDaJanela } from "./janela";

/**
 * Como a loja lê `manutencoes.dentro_da_janela`.
 *
 * Os três estados são do banco, não da tela: `true` cumpriu, `false` havia
 * janela e o serviço não a cumpriu, `null` não havia janela. Tratar `null`
 * como `false` era o defeito que o plano vitalício corrigiu — e continua
 * possível em revisão avulsa e em carro que saiu da Garagem.
 *
 * A classificação em si vive em `classificarJanela` (achado da revisão da
 * Task 5, ronda 1: reimplementada em quatro lugares). Este módulo só decide
 * o texto do selo para cada estado.
 */
export type TomDoSelo = "na" | "fora" | "sem";

const TEXTO_DO_SELO: Record<EstadoDaJanela, string> = {
  na: "NA JANELA",
  fora: "FORA DA JANELA",
  sem: "SEM JANELA",
};

export function seloDaJanela(dentro: boolean | null): { texto: string; tom: TomDoSelo } {
  const tom = classificarJanela(dentro);
  return { texto: TEXTO_DO_SELO[tom], tom };
}
