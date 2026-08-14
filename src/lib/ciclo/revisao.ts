import { TOLERANCIA_KM } from "./vendaFechamento";

/**
 * A régua da verificação — manual v1.1 §1.5 e §5.7.
 *
 * O que decide se uma revisão vira procedência são duas coisas, e as duas
 * precisam ser verdade:
 *
 *   1. `confirmada_em` preenchido — a loja verificou, contra a foto da etiqueta;
 *   2. `dentro_da_janela = true` — a revisão caiu no prazo contratado.
 *
 * Lançar no diário de bordo não é o ativo. A verificação é.
 */

export const ORIGENS_DE_REGISTRO = ["loja", "parceiro", "cliente"] as const;
export type OrigemDeRegistro = (typeof ORIGENS_DE_REGISTRO)[number];

export interface JanelaDaRevisao {
  km_previsto: number | null;
  janela_fim: string; // ISO date
}

/**
 * A revisão caiu dentro da janela?
 *
 * O §1.5 diz que a tolerância vale para **a régua que venceu**: 30 dias se
 * venceu o calendário, 1.000 km se venceu o odômetro. Conferir as duas com
 * `E` produz exatamente essa regra, sem precisar descobrir qual venceu
 * primeiro — porque a régua que ainda NÃO venceu passa trivialmente:
 *
 *   • quem ainda não rodou o previsto tem `km < km_previsto < km_previsto+1000`;
 *   • quem ainda não chegou na data tem `data < prevista < janela_fim`.
 *
 * Então quem reprova nas duas pontas é sempre quem estourou a régua que
 * venceu. E antecipar nunca penaliza: quem faz antes passa nas duas.
 */
export function dentroDaJanela(
  dataServico: string,
  kmRegistrado: number,
  janela: JanelaDaRevisao,
): boolean {
  const noPrazo = dataServico <= janela.janela_fim;
  const noKm =
    janela.km_previsto === null || kmRegistrado <= janela.km_previsto + TOLERANCIA_KM;
  return noPrazo && noKm;
}

export interface DadosDaRevisao {
  veiculo_vendido_id?: string | null;
  data_servico?: string | null;
  km_registrado?: number | string | null;
  numero_revisao?: number | string | null;
  origem_registro?: OrigemDeRegistro | null;
  url_etiqueta_atual?: string | null;
  url_etiqueta_anterior?: string | null;
  parceiro_id?: string | null;
  valor_servico?: number | string | null;
  observacoes?: string | null;
  /** Só a loja verifica, e só quando lança o que ela própria conferiu. */
  confirmar?: boolean;
}

export interface ProblemaDaRevisao {
  campo: string;
  mensagem: string;
}

const vazio = (v: unknown) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/**
 * O que impede esta revisão de ser lançada no diário de bordo.
 *
 * A foto da etiqueta nova é obrigatória para **verificar**, não para lançar:
 * a emenda 01 diz que sem foto legível o lançamento fica *pendente*, e
 * pendente é estado válido — é o que a fila da A21 existe para resolver.
 */
export function validarRevisao(dados: DadosDaRevisao): ProblemaDaRevisao[] {
  const problemas: ProblemaDaRevisao[] = [];
  const falta = (campo: string, mensagem: string) => problemas.push({ campo, mensagem });

  if (vazio(dados.veiculo_vendido_id)) falta("veiculo_vendido_id", "Escolha o veículo.");
  if (vazio(dados.data_servico)) falta("data_servico", "Data do serviço é obrigatória.");
  if (vazio(dados.km_registrado)) {
    falta("km_registrado", "O KM do odômetro é o dado que o programa precisa.");
  } else {
    const km = Number(dados.km_registrado);
    if (!Number.isFinite(km) || km < 0) falta("km_registrado", "KM inválido.");
  }

  if (dados.confirmar && vazio(dados.url_etiqueta_atual)) {
    falta(
      "url_etiqueta_atual",
      "Para verificar é preciso a foto da etiqueta nova, com o KM legível.",
    );
  }

  return problemas;
}

export function revisaoPodeSerRegistrada(dados: DadosDaRevisao): boolean {
  return validarRevisao(dados).length === 0;
}
