/**
 * As regras de FLUXO do quiz do Garagem Profiler (`components/CarMatch.tsx`):
 * que perguntas esta pessoa vê, em que ordem, e o perfil que vai para o motor.
 *
 * Moram fora do componente para serem testadas por comportamento
 * (`tests/perguntas-do-profiler.test.ts`) — a conta de pular pergunta erra em
 * silêncio: a tela só mostra a pergunta seguinte, e ninguém percebe que uma
 * resposta escondida continuou cortando carro.
 *
 * O que é FATO de carro (filtro, preferência, contagem) é do motor
 * (`lib/motorDoMatch.ts`); aqui só se decide o caminho.
 */
import type { Veiculo } from "../types";
import { ehAutomatico } from "./fichaDoMotor";
import {
  carrosNaFaixa,
  criteriosDoPerfil,
  type ItemQueNaoPodeFaltar,
  type Jeito,
  type Leva,
  type PerfilDoQuiz,
  type PreferenciaDeCambio,
} from "./motorDoMatch";

export interface RespostasDoQuiz {
  budgetMin: number;
  budgetMax: number;
  leva: Leva | "";
  /** `null` = ainda não respondida; `[]` = "Tanto faz". */
  jeitos: Jeito[] | null;
  cambio: PreferenciaDeCambio | "";
  /** `null` = ainda não respondida; `[]` = "Nada disso". */
  naoPodeFaltar: ItemQueNaoPodeFaltar[] | null;
  /** Perguntado no resultado, e opcional: prazo não escolhe carro. */
  timeline: "immediate" | "researching" | "future" | "";
}

export const RESPOSTAS_EM_BRANCO: RespostasDoQuiz = {
  budgetMin: 0,
  budgetMax: 0,
  leva: "",
  jeitos: null,
  cambio: "",
  naoPodeFaltar: null,
  timeline: "",
};

export type EstadoQuiz = "intro" | "q1" | "q2" | "q3" | "q4" | "q5" | "loading" | "results";

/**
 * As cinco perguntas, na ordem. Alimenta a régua de progresso e a lista do
 * painel lateral — antes as duas coisas tinham cada uma a sua lista.
 */
export const PERGUNTAS = [
  { id: "q1", numero: "01", rotulo: "ORÇAMENTO" },
  { id: "q2", numero: "02", rotulo: "QUEM VAI" },
  { id: "q3", numero: "03", rotulo: "JEITO DE CARRO" },
  { id: "q4", numero: "04", rotulo: "CÂMBIO" },
  { id: "q5", numero: "05", rotulo: "NÃO PODE FALTAR" },
] as const;

export type IdDaPergunta = (typeof PERGUNTAS)[number]["id"];

/** O teto da resposta, ou `null` na faixa "acima de" e no texto sem valor. */
export function tetoDe(budgetMax: number): number | null {
  return !budgetMax || budgetMax >= Number.MAX_SAFE_INTEGER ? null : budgetMax;
}

/** As respostas até a 03 — o que decide se a 04 ainda separa carros. */
export function perfilAteOJeito(a: RespostasDoQuiz): PerfilDoQuiz {
  return {
    orcamento: { min: a.budgetMin, max: tetoDe(a.budgetMax) },
    leva: a.leva || null,
    // Com carga a carroceria já está decidida, e a 03 nem aparece.
    jeitos: a.leva === "carga" ? [] : (a.jeitos ?? []),
  };
}

/**
 * Quando tudo o que sobrou tem o mesmo câmbio, a 04 não tem o que separar: a
 * pergunta some e a tela diz o porquê. Até R$ 50 mil, no pátio de 25/09, os
 * carros eram todos manuais — perguntar "só automático?" ali só levava ao zero.
 */
export function cambioUnicoDe(a: RespostasDoQuiz, carros: readonly Veiculo[]): "automatico" | "manual" | null {
  const sobram = carrosNaFaixa(carros, criteriosDoPerfil(perfilAteOJeito(a)));
  if (sobram.length === 0) return null;
  const cambios = new Set(sobram.map((v) => ehAutomatico(v)));
  if (cambios.size !== 1 || cambios.has(null)) return null;
  return cambios.has(true) ? "automatico" : "manual";
}

/** O perfil que vai para o motor — o mesmo que a tela usa para contar. */
export function perfilDe(a: RespostasDoQuiz, carros: readonly Veiculo[]): PerfilDoQuiz {
  return {
    ...perfilAteOJeito(a),
    // Pergunta pulada não vale: quem tinha marcado "Só automático" e voltou
    // para um jeito que só tem manual não pode zerar o resultado por uma
    // resposta que a tela escondeu.
    cambio: cambioUnicoDe(a, carros) ? null : a.cambio || null,
    naoPodeFaltar: (a.naoPodeFaltar ?? []).filter((i) => i !== "diesel" || a.leva === "carga"),
  };
}

/** As perguntas que ESTA pessoa vai ver, na ordem. */
export function sequenciaDe(a: RespostasDoQuiz, carros: readonly Veiculo[]): IdDaPergunta[] {
  const pulaJeito = a.leva === "carga";
  const pulaCambio = cambioUnicoDe(a, carros) !== null;
  return PERGUNTAS.map((p) => p.id).filter((id) => !(id === "q3" && pulaJeito) && !(id === "q4" && pulaCambio));
}

export const ordemFixa = (id: IdDaPergunta) => PERGUNTAS.findIndex((p) => p.id === id);

/**
 * A próxima pergunta depois de `atual`, com as respostas JÁ atualizadas. A
 * conta é pela ordem fixa, e não pela posição na sequência: a própria
 * resposta pode tirar a pergunta atual da sequência (marcar carga some com a
 * 03 enquanto se está na 02).
 */
export function depoisDe(atual: IdDaPergunta, a: RespostasDoQuiz, carros: readonly Veiculo[]): EstadoQuiz {
  return sequenciaDe(a, carros).find((id) => ordemFixa(id) > ordemFixa(atual)) ?? "loading";
}

export function antesDe(atual: IdDaPergunta, a: RespostasDoQuiz, carros: readonly Veiculo[]): EstadoQuiz {
  return [...sequenciaDe(a, carros)].reverse().find((id) => ordemFixa(id) < ordemFixa(atual)) ?? "intro";
}

/** "7 carros", "1 carro", "0 nessa faixa" — o número antes do toque. */
export function textoDaContagem(n: number): string {
  if (n === 0) return "0 nessa faixa";
  return n === 1 ? "1 carro" : `${n} carros`;
}
