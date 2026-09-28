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
import type { ParametrosDoFinanciamento } from "./finance-calculator";
import { ehAutomatico } from "./fichaDoMotor";
import {
  carrosNaFaixa,
  criteriosDoPerfil,
  MAXIMO_DO_QUE_NAO_PODE_FALTAR,
  type ItemQueNaoPodeFaltar,
  type Jeito,
  type Leva,
  type Ocupacao,
  type PerfilDoQuiz,
  type PreferenciaDeCambio,
  type Recomendacao,
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
  /**
   * A aba POR MÊS da 01. Quando vem, ela é a faixa e o orçamento em preço
   * não vale. `entrada` é a estimativa da própria pessoa (dinheiro e o que
   * ela espera da troca); `troca` só avisa que há carro — o site não o avalia.
   */
  porMes: PorMes | null;
}

export interface PorMes {
  parcela: number;
  entrada: number;
  prazo: number;
  ocupacao: Ocupacao;
  troca: boolean;
  /**
   * A vigência de `parametros_financiamento` com que a tela contou — a página
   * a lê no servidor e o `CarMatch` a põe aqui. Obrigatória: sem ela a
   * contagem poderia prometer outro número que o resultado.
   */
  parametros: ParametrosDoFinanciamento;
}

export const RESPOSTAS_EM_BRANCO: RespostasDoQuiz = {
  budgetMin: 0,
  budgetMax: 0,
  leva: "",
  jeitos: null,
  cambio: "",
  naoPodeFaltar: null,
  timeline: "",
  porMes: null,
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
    parcela: a.porMes
      ? {
          max: a.porMes.parcela,
          entrada: a.porMes.entrada,
          prazo: a.porMes.prazo,
          ocupacao: a.porMes.ocupacao,
          parametros: a.porMes.parametros,
        }
      : null,
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

// ---------------------------------------------------------------------------
// O toque — e o número que ele promete
// ---------------------------------------------------------------------------
//
// O número de cada opção sai da MESMA transição que o toque grava. A primeira
// versão contava encaixando a opção no perfil de agora, que já tinha as
// regras de pulo aplicadas ao caminho de antes do toque — e o toque muda essas
// regras: marcar só Hatch numa faixa em que os hatches são todos manuais tira
// o câmbio, e sair de carga devolve os jeitos escondidos. A revisão de 25/09
// achou 367 opções da 02 e da 03 prometendo um número e entregando outro.

/** Quantos carros sobram com estas respostas — o "SOBRAM N" depois do toque. */
export function quantosSobram(a: RespostasDoQuiz, carros: readonly Veiculo[]): number {
  return carrosNaFaixa(carros, criteriosDoPerfil(perfilDe(a, carros))).length;
}

/** 02 — e o diesel sai de quem deixa de levar carga: ele ocuparia uma das três vagas, escondido. */
export function comLeva(a: RespostasDoQuiz, leva: Leva): RespostasDoQuiz {
  return {
    ...a,
    leva,
    naoPodeFaltar:
      leva === "carga" || a.naoPodeFaltar === null ? a.naoPodeFaltar : a.naoPodeFaltar.filter((i) => i !== "diesel"),
  };
}

/**
 * 03 — marca ou desmarca um jeito. Desmarcar o último devolve a pergunta a
 * "sem resposta", e não a "Tanto faz": a pessoa não tocou em "Tanto faz".
 */
export function comJeitoAlternado(a: RespostasDoQuiz, jeito: Jeito): RespostasDoQuiz {
  const atuais = a.jeitos ?? [];
  const novos = atuais.includes(jeito) ? atuais.filter((j) => j !== jeito) : [...atuais, jeito];
  return { ...a, jeitos: novos.length > 0 ? novos : null };
}

export function comCambio(a: RespostasDoQuiz, cambio: PreferenciaDeCambio): RespostasDoQuiz {
  return { ...a, cambio };
}

/** 05 — marca ou desmarca um item. Com três marcados, um quarto não entra. */
export function comItemAlternado(a: RespostasDoQuiz, item: ItemQueNaoPodeFaltar): RespostasDoQuiz {
  const atuais = a.naoPodeFaltar ?? [];
  if (atuais.includes(item)) return { ...a, naoPodeFaltar: atuais.filter((i) => i !== item) };
  if (atuais.length >= MAXIMO_DO_QUE_NAO_PODE_FALTAR) return a;
  return { ...a, naoPodeFaltar: [...atuais, item] };
}

// ---------------------------------------------------------------------------
// O que sai do quiz
// ---------------------------------------------------------------------------

/**
 * O termo de busca que vai ao GA4, ao Pixel e à CAPI: os IDS das respostas,
 * e nada mais. Nunca o orçamento, nunca o texto livre, nunca rótulo.
 */
export function idsDasRespostas(perfil: PerfilDoQuiz): string[] {
  return [
    // Só a marca de que a pessoa usou o POR MÊS — nunca a parcela nem a entrada.
    perfil.parcela ? "por-mes" : "",
    perfil.leva ?? "",
    ...(perfil.jeitos ?? []),
    perfil.cambio ?? "",
    ...(perfil.naoPodeFaltar ?? []),
  ].filter(Boolean);
}

export interface CarroDoLead {
  veiculo: Veiculo;
  lugar: string;
  manchete: string;
  pesaContra: string | null;
  /** POR MÊS: a parcela estimada deste carro; `null` fora dele. */
  parcela: number | null;
}

/**
 * Os carros que o lead leva: os marcados em QUERO VER ESTE — a carta "Já
 * pensou neste?" inclusive, se a pessoa disse FAZ SENTIDO —, ou os três.
 *
 * A carta nunca entra sem ter sido marcada: ela é sugestão da loja, não pedido
 * do cliente. E no "me avise" e no pedido de ajuda não vai carro nenhum.
 */
export function carrosDoLead(
  recomendacao: Recomendacao | null,
  escolhidos: readonly string[],
  modo: "carros" | "aviso" | "ajuda",
): CarroDoLead[] {
  if (modo !== "carros" || !recomendacao) return [];
  const cartoes: CarroDoLead[] = recomendacao.cartoes.map((c) => ({
    veiculo: c.veiculo,
    lugar: c.lugar,
    manchete: c.manchete,
    pesaContra: c.pesaContra,
    parcela: c.parcela?.valor ?? null,
  }));
  const coringa = recomendacao.coringa ?? null;
  const daCarta: CarroDoLead[] = coringa
    ? [
        {
          veiculo: coringa.veiculo,
          lugar: "ja-pensou",
          manchete: `Já pensou neste? Contra o ${coringa.comparadoCom}: ${coringa.vantagens.join("; ")}.`,
          pesaContra: coringa.oQueMuda.length > 0 ? `O que muda: ${coringa.oQueMuda.join("; ")}.` : null,
          parcela: coringa.parcela?.valor ?? null,
        },
      ]
    : [];
  const marcados = [...cartoes, ...daCarta].filter((c) => escolhidos.includes(c.veiculo.id));
  return marcados.length > 0 ? marcados : cartoes;
}
