/**
 * Alçadas finas que sobreviveram à aposentadoria do módulo de caixa.
 *
 * Entre 2026-08-21 e 2026-08-28 esta lib carregou a régua completa de
 * aprovação de agendamento financeiro (lançar e aprovar como dois atos, fila
 * do Gestor, recorrente nova ao gestor). Em 2026-08-28 o dono aposentou o
 * módulo de caixa inteiro — nada ali tinha dado real — para o financeiro
 * renascer do zero sobre o razão de partidas dobradas do handoff (spec 30).
 * As funções de aprovação saíram junto com as telas que as consultavam; a
 * história da régua (por que alçada não é um valor em reais) está no git e
 * vale ser relida quando o razão trouxer aprovação de volta.
 *
 * O que fica é o que o restante do painel consulta:
 */

import type { Perfil } from "./permissoes";
import { podeFazer } from "./permissoes";

/**
 * Quem apaga um lançamento de verdade — só o Admin.
 *
 * Hoje governa as movimentações de investidor (aportes e retiradas): os
 * demais cancelam, apagar é do Admin. A régua está na RLS também
 * (`20260821210000`): sem policy de DELETE, o banco não apaga — esta função
 * existe para a interface esconder o botão e a rota devolver erro legível,
 * não para ser a única barreira.
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
