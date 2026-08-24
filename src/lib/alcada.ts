/**
 * Aprovação de agendamento financeiro — a régua do papel Gestor.
 *
 * ---------------------------------------------------------------------------
 * Por que a régua NÃO é mais um valor
 * ---------------------------------------------------------------------------
 * Entre 2026-08-07 e 2026-08-21 a matriz A17 dizia "alçada de R$ 1.500 no
 * gerente", e em 2026-08-21 esta lib nasceu aplicando esse limite. No mesmo
 * dia o dono desfez a regra: *"essa regra de 1.500 reais não faz sentido no
 * financeiro, precisamos de duas novas roles também, investidor e gestor, que
 * terá o poder de aprovar os agendamentos financeiro"*.
 *
 * O motivo é do negócio, não de implementação: numa revenda, valor não mede
 * risco. Uma despesa nova de R$ 1.200 por mês compromete mais caixa do que
 * R$ 40.000 de um carro já negociado e coberto pela venda. Qualquer limite em
 * reais ou barraria o normal ou liberaria o perigoso — e obrigava alguém a
 * defender um número arbitrário.
 *
 * O que passa a decidir é o ATO:
 *
 *   - **agendar** um pagamento (conta a pagar que fica EM ABERTO) é decidir
 *     que dinheiro vai sair. Isso vai ao Gestor.
 *   - **registrar** um pagamento já feito é escrituração. O dinheiro já saiu;
 *     travar o registro não desfaz o gasto, só esconde o rastro — e lançar
 *     depois de pagar é o fluxo diário da adm/financeira (briefing
 *     2026-08-21). Não vai a ninguém.
 *
 * A régua mora aqui, pura e testada, e é consultada nas rotas — o desenho
 * declarado no cabeçalho de `permissoes.ts` para os pontos de alçada fina. O
 * banco guarda o vocabulário e a trilha
 * (`20260821150000_alcada_de_aprovacao.sql`).
 */

import type { Perfil } from "./permissoes";
import { podeFazer } from "./permissoes";

/** Status em que a conta ainda compromete pagamento futuro. */
const EM_ABERTO = new Set(["pendente", "vencido", "parcial"]);

/**
 * É um agendamento financeiro? Conta **a pagar** que fica em aberto — ou
 * seja, dinheiro que ainda vai sair. A pagar já quitada é registro; a receber
 * é faturamento, e ninguém precisa de licença para receber.
 */
export function ehAgendamento(tipo: string, status?: string | null): boolean {
  return tipo === "pagar" && EM_ABERTO.has(status ?? "pendente");
}

export interface LancamentoParaAprovacao {
  tipo: string;
  /** Status com que a conta nasce (ou passa a ter). Ausente = pendente. */
  status?: string | null;
  /** Papéis de painel de quem está lançando. */
  perfis: Perfil[] | string[];
}

/**
 * Este lançamento precisa subir para aprovação?
 *
 * Sim quando é agendamento e quem lança não tem, ele mesmo, o poder de
 * aprovar: pedir que o Gestor aprove o próprio agendamento seria burocracia
 * sem revisor. Quem responde por isso é a matriz — nenhum papel é citado por
 * nome aqui, então acrescentar um papel novo com poder de aprovação é uma
 * linha na A17, não uma edição nesta função.
 */
export function precisaDeAprovacao(l: LancamentoParaAprovacao): boolean {
  if (!ehAgendamento(l.tipo, l.status)) return false;
  return !podeDecidirAprovacao(l.perfis);
}

/**
 * Quem decide um agendamento parado na fila.
 *
 * A resposta é a linha "Aprovar agendamento financeiro" da matriz A17 —
 * Admin e Gestor. O Financeiro lança e NÃO aprova: quem agenda não libera o
 * próprio agendamento, que é a única coisa que faz a fila significar algo.
 */
export function podeDecidirAprovacao(perfis: Perfil[] | string[]): boolean {
  return podeFazer(perfis as Perfil[], "Aprovar agendamento financeiro") === "faz";
}

/**
 * Cadastrar uma despesa recorrente NOVA precisa de aprovação?
 *
 * Sim, pela mesma régua do agendamento — e com mais razão. Assinar uma
 * recorrente de R$ 1.200/mês compromete R$ 14.400 no ano sem que exista uma
 * única conta a pagar ainda; é o exemplo que derrubou a alçada por valor.
 *
 * O que NÃO passa por aqui é a GERAÇÃO mensal (`/recorrentes/gerar`): o
 * compromisso já foi assumido quando a recorrente foi aprovada, e mandar cada
 * parcela à fila criaria uma avalanche de aprovações idênticas todo mês —
 * o tipo de burocracia que faz a operação parar de usar a ferramenta.
 */
export function recorrenteNovaPrecisaDeAprovacao(perfis: Perfil[] | string[]): boolean {
  return !podeDecidirAprovacao(perfis);
}

/**
 * Quem enxerga os relatórios gerenciais e o DRE — linha própria na matriz
 * desde 2026-08-21, quando o Gestor ganhou "acesso aos relatórios".
 */
export function podeVerRelatorios(perfis: Perfil[] | string[]): boolean {
  return podeFazer(perfis as Perfil[], "Ver relatórios gerenciais e DRE") === "faz";
}

/**
 * Quem apaga um lançamento financeiro de verdade — só o Admin.
 *
 * Os demais cancelam (`status = 'cancelado'`), que preserva a linha e o
 * rastro. A régua está na RLS também (`20260821210000`): sem policy de
 * DELETE, o banco não apaga — esta função existe para a interface esconder o
 * botão e a rota devolver erro legível, não para ser a única barreira.
 */
export function podeExcluirLancamento(perfis: Perfil[] | string[]): boolean {
  return podeFazer(perfis as Perfil[], "Excluir lançamento financeiro") === "faz";
}

/**
 * Quem ajusta os valores do negócio do carro — a entrada (custo de aquisição)
 * e a saída (preço de venda). O pedido do dono para o Gestor, em uma pergunta
 * só, para as telas não terem que consultar duas linhas.
 */
export function podeAjustarValoresDoNegocio(perfis: Perfil[] | string[]): boolean {
  return (
    podeFazer(perfis as Perfil[], "Ver custo de aquisição e margem") === "faz" &&
    podeFazer(perfis as Perfil[], "Alterar preço acima de 5%") === "faz"
  );
}
