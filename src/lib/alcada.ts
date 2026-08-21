/**
 * Alçada de aprovação de contas a pagar — a linha de R$ 1.500 da matriz A17.
 *
 * "Lançar e aprovar contas a pagar — alçada de R$ 1.500 no gerente" está na
 * matriz desde o design doc, e até 2026-08-21 nenhuma rota aplicava. O
 * briefing do dono pediu exatamente o efeito dela: "avisos de contas que
 * subiram pra aprovação".
 *
 * A régua mora aqui — pura e testada — e é consultada nas rotas, como as
 * demais alçadas da matriz (o desenho declarado no cabeçalho de
 * `permissoes.ts`). O banco guarda o vocabulário e a trilha
 * (`20260821150000_alcada_de_aprovacao.sql`); quem decide se um lançamento
 * precisa de aprovação é o app.
 *
 * O que passa DIRETO, e por quê:
 *  - admin: a matriz diz "sem limite";
 *  - conta a receber: alçada é sobre comprometer gasto, não sobre faturar;
 *  - lançamento já pago ou cancelado: registro retroativo — o dinheiro já
 *    saiu; travar o registro não desfaz o gasto, só esconde o rastro (e o
 *    lançar-depois-de-pagar é hoje o fluxo diário da operação);
 *  - importação do RevendaMais e geração de recorrente: compromisso que já
 *    existe, não decisão nova — essas rotas nem consultam esta régua.
 */

import type { Perfil } from "./permissoes";
import { ALCADA_DO_PERFIL } from "./permissoes";

/**
 * R$ 1.500, derivado do TEXTO da matriz para as duas fontes nunca
 * divergirem: se a A17 mudar a alçada, este número muda junto — e o teste
 * quebra se o formato do texto deixar de ser parseável.
 */
export const ALCADA_DO_FINANCEIRO = (() => {
  const digitos = ALCADA_DO_PERFIL.financeiro.replace(/\D/g, "");
  const valor = parseInt(digitos, 10);
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error(
      `ALCADA_DO_PERFIL.financeiro não é parseável como valor: "${ALCADA_DO_PERFIL.financeiro}"`,
    );
  }
  return valor;
})();

/** Status em que a conta ainda compromete pagamento futuro. */
const EM_ABERTO = new Set(["pendente", "vencido", "parcial"]);

export interface LancamentoParaAlcada {
  tipo: string;
  /**
   * O valor TOTAL do lançamento, antes de dividir em parcelas — senão
   * parcelar em 4x de R$ 1.499 viraria a porta de evasão da régua.
   */
  valorTotal: number;
  /** Status com que a conta nasce (ou passa a ter). Ausente = pendente. */
  status?: string | null;
  perfis: Perfil[] | string[];
}

/**
 * Este lançamento precisa subir para aprovação?
 *
 * Exatamente na alçada passa: "alçada de R$ 1.500" é o que o gerente PODE,
 * inclusive — acima dela é do Admin.
 */
export function precisaDeAprovacao(l: LancamentoParaAlcada): boolean {
  if (l.perfis.includes("admin")) return false;
  if (l.tipo !== "pagar") return false;
  if (!EM_ABERTO.has(l.status ?? "pendente")) return false;
  return Number.isFinite(l.valorTotal) && l.valorTotal > ALCADA_DO_FINANCEIRO;
}

/**
 * Quem decide uma conta aguardando aprovação. A coluna de alçada da matriz é
 * a régua: "sem limite" é só do Admin — o próprio financeiro nunca aprova o
 * que ele mesmo não podia lançar.
 */
export function podeDecidirAprovacao(perfis: Perfil[] | string[]): boolean {
  return perfis.includes("admin");
}
