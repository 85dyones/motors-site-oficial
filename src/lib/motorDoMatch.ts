import type { Veiculo } from "../types";
import { divergenciaDeCarroceria } from "./coerenciaDoCadastro";
import { modeloEVersaoParaExibir } from "./estoqueTabela";
import { nomeTemOAno } from "./nomeDoVeiculo";
import {
  ANO_DE_REFERENCIA_DAS_TAXAS,
  calculateFinancing,
  IDADE_ACIMA_DA_QUAL_A_TAXA_VARIA_MAIS,
  type SimulationParams,
  type SimulationResult,
} from "./finance-calculator";
import type { ParcelaParaTexto } from "./textoDaParcela";
import {
  carroceriaDe,
  cilindradaDe,
  combustivelDe,
  ehAutomatico,
  ehMoto,
  epocaDe,
  fichaVazia,
  ITENS_DA_FICHA,
  itemNaFicha,
  itensQueConstam,
  modeloBase,
  motorTurbo,
  normalizar,
  precoDoCarro,
  tracao4x4,
  type EstadoDoFato,
} from "./fichaDoMotor";

/**
 * O motor do Garagem Profiler: "Três do Pátio".
 *
 * Spec: `docs/superpowers/specs/2026-09-25-garagem-profiler-tres-do-patio-design.md`.
 *
 * ---------------------------------------------------------------------------
 * O que ele promete
 * ---------------------------------------------------------------------------
 * Três carros do pátio de hoje, cada um com o que atende do pedido, o que não
 * atende e o que pesa contra — tudo conferível na ficha. Nenhuma nota: o
 * "53% COMPATÍVEL" do motor anterior não dizia o que faltava, e quem lê
 * "53%" entende "não me ouviram".
 *
 * Três regras que o motor anterior não tinha, e que o teste de regressão
 * (`tests/motor-do-match.test.ts`) trava sobre o estoque real:
 *
 *   1. **O resultado nunca contradiz um filtro.** Quem pediu automático não vê
 *      manual; quem pediu SUV não vê hatch; moto não entra em quiz de carro.
 *   2. **O preço tem piso e teto.** Nada acima do teto (decisão do dono em
 *      25/09). Abaixo do piso só entra para completar uma faixa com menos de
 *      três carros, e rotulado: "abaixo da sua faixa, sobram R$ X".
 *   3. **Os três são diferentes de verdade.** Um modelo por vez (os três Ka
 *      contam como um) e, se os dois primeiros são o mesmo tipo de carro, o
 *      terceiro muda câmbio, carroceria ou época.
 *
 * Quando o pátio não tem o pedido, o motor diz isso e calcula o "e se": qual
 * filtro, afrouxado, traz quantos carros.
 *
 * Sem import de `./supabase`, pelo mesmo motivo de `fichaDoMotor.ts`.
 */

// ---------------------------------------------------------------------------
// Faixas de orçamento (pergunta 01, aba FAIXA)
// ---------------------------------------------------------------------------

export interface FaixaDeOrcamento {
  id: string;
  min: number;
  /** `null` = sem teto: só a faixa "acima de R$ X", e só se houver carro nela. */
  max: number | null;
  titulo: string;
  quantos: number;
}

/** As faixas de reserva, para quando o estoque ainda não chegou ou falhou. */
export const CORTES_DE_RESERVA = [50000, 65000, 90000] as const;

/** A faixa de cima vai até este múltiplo do próprio piso (25/09). */
export const TETO_DA_FAIXA_DE_CIMA = 1.5;

/** VALOR EXATO: a faixa começa nesta fração do valor digitado (25/09). */
export const PISO_DO_VALOR_EXATO = 0.7;

const arredondaCinco = (n: number) => Math.round(n / 5000) * 5000;

function rotuloDeValor(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}mil`;
  return v.toLocaleString("pt-BR");
}

/**
 * As faixas saem do pátio, por QUANTIL — cada uma leva cerca de um quarto do
 * estoque. A regra de 28/08 continua (ver o histórico em `CarMatch.tsx`); o
 * que mudou em 25/09 é a ponta de cima.
 *
 * A última faixa era "acima de R$ 115 mil", sem teto nenhum, e quem a escolhia
 * com R$ 130 mil na cabeça recebia o BMW X4 de R$ 318.900 em primeiro lugar.
 * Agora ela vai até 1,5× o próprio piso; o que passar disso vira uma opção
 * "acima de R$ X" separada, que só aparece se houver carro nela.
 *
 * `precos` são os preços vigentes do que está à venda, em qualquer ordem.
 */
export function faixasDoPatio(precos: readonly number[]): FaixaDeOrcamento[] {
  const ordenados = precos.filter((p) => p > 0).sort((a, b) => a - b);

  const montar = (cortes: readonly number[], lista: readonly number[]): FaixaDeOrcamento[] => {
    const ultimo = cortes[cortes.length - 1] ?? 0;
    const tetoDoUltimo = arredondaCinco(ultimo * TETO_DA_FAIXA_DE_CIMA);
    const limites = [0, ...cortes, tetoDoUltimo];
    const faixas: FaixaDeOrcamento[] = limites.slice(0, -1).map((lo, i) => {
      const hi = limites[i + 1];
      return {
        id: `faixa-${i}`,
        min: lo,
        max: hi,
        titulo: lo === 0 ? `Até R$ ${rotuloDeValor(hi)}` : `R$ ${rotuloDeValor(lo)} a R$ ${rotuloDeValor(hi)}`,
        // `>=`, como o motor (`preço >= piso`): um carro exatamente no corte
        // aparece no resultado das duas faixas, e a contagem tem de dizer isso.
        quantos: lista.filter((p) => p >= lo && p <= hi).length,
      };
    });
    faixas.push({
      id: `faixa-${faixas.length}`,
      min: tetoDoUltimo,
      max: null,
      titulo: `Acima de R$ ${rotuloDeValor(tetoDoUltimo)}`,
      quantos: lista.filter((p) => p >= tetoDoUltimo).length,
    });
    return faixas;
  };

  // Sem estoque em mãos — carregando, ou a consulta falhou. As faixas de
  // reserva mantêm a pergunta respondível, e a de cima, sem carro para contar,
  // não some: sem estoque não há como saber que ela está vazia.
  if (ordenados.length < 4) return montar(CORTES_DE_RESERVA, ordenados);

  const quantil = (f: number) => ordenados[Math.min(ordenados.length - 1, Math.floor(ordenados.length * f))];
  const cortes = [...new Set([quantil(0.25), quantil(0.5), quantil(0.75)].map(arredondaCinco))]
    .filter((c) => c > 0)
    .sort((a, b) => a - b);

  const faixas = montar(cortes, ordenados);
  const comCarro = faixas.filter((f) => f.quantos > 0);
  return comCarro.length > 0 ? comCarro : faixas;
}

/**
 * O piso da aba VALOR EXATO: 70% do valor, arredondado ao milhar. "Até R$ 80
 * mil" quer dizer "algo perto de R$ 80 mil", não "qualquer coisa até lá".
 */
export function pisoDoValorExato(valor: number): number {
  return Math.round((valor * PISO_DO_VALOR_EXATO) / 1000) * 1000;
}

// ---------------------------------------------------------------------------
// Critérios
// ---------------------------------------------------------------------------

/** Filtros que cortam. O preço fica fora: ele nunca é afrouxado pelo "e se". */
export type ChaveDeFiltro = "portas" | "automatico" | "carroceria" | "ano" | "km" | "diesel";

export type ChaveDePreferencia =
  | "novo"
  | "automatico"
  | "equipado"
  | "flex"
  | "motor-ate-1-6"
  | "hatch-ou-seda"
  | "carga"
  | "diesel"
  | "4x4"
  | "turbo"
  | "couro"
  | "multimidia"
  | "manual"
  | "camera"
  | "sensor"
  | "seguranca";

export interface Criterios {
  /** 0 = sem piso. */
  piso: number;
  /** `null` = sem teto (a faixa "acima de R$ X", ou texto livre sem valor). */
  teto: number | null;
  portas4: boolean;
  automatico: boolean;
  /** Carrocerias aceitas, na grafia do cadastro. `null` = qualquer uma. */
  carrocerias: readonly string[] | null;
  /** Ano mínimo — "2020 ou mais novo" na pergunta do que não pode faltar. */
  anoMin: number | null;
  /** Quilometragem máxima — "até 80 mil km". */
  kmMax: number | null;
  diesel: boolean;
  /**
   * POR MÊS: a parcela que cabe no mês. Quando existe, ela é a faixa — o
   * carro passa se a parcela dele (a conta do simulador) couber, e o teto e
   * o piso de PREÇO ficam de fora.
   */
  parcela: ParcelaPedida | null;
  preferencias: readonly ChaveDePreferencia[];
  /** Frases que a tela mostra antes dos carros ("esportivo não temos hoje"). */
  avisos: readonly string[];
}

export type Ocupacao = SimulationParams["occupation"];
export const OCUPACOES: readonly Ocupacao[] = ["clt", "publico", "aposentado", "autonomo", "outros"];
export const PRAZOS_DO_POR_MES = [24, 36, 48, 60] as const;

/**
 * O que a pessoa disse na aba POR MÊS.
 *
 * `entrada` é a estimativa DELA — o dinheiro e o que ela espera que o carro
 * da troca cubra (decisão do dono em 25/09). O site nunca soma a FIPE da
 * troca à entrada: quem avalia o carro é a /avaliacao, e o consultor.
 */
export interface ParcelaPedida {
  /** A parcela que cabe no mês: o teto. */
  max: number;
  /** Abaixo disto o carro fica "abaixo da faixa" — 70% da parcela, como o VALOR EXATO. */
  min: number;
  entrada: number;
  prazo: number;
  ocupacao: Ocupacao;
}

/** A parcela deste carro para este pedido — a mesma conta do simulador da ficha. */
export function simularParcela(v: Veiculo, p: ParcelaPedida): SimulationResult {
  const preco = precoDoCarro(v);
  return calculateFinancing({
    vehiclePrice: preco,
    vehicleYear: v.ano,
    // Entrada maior que o carro não vira parcela negativa: o carro sai à vista.
    downPaymentValue: Math.min(Math.max(0, p.entrada), preco),
    installments: p.prazo,
    occupation: p.ocupacao,
  });
}

/** Onde o carro cai na faixa do cliente: o preço, ou a parcela no POR MÊS. */
function valorNaFaixa(v: Veiculo, c: Criterios): number {
  return c.parcela ? simularParcela(v, c.parcela).parcela_mensal : precoDoCarro(v);
}

/** O carro está na faixa (e não abaixo dela)? O teto já passou por `passaNosFiltros`. */
export function naFaixaDoCliente(v: Veiculo, c: Criterios): boolean {
  return valorNaFaixa(v, c) >= (c.parcela ? c.parcela.min : c.piso);
}

/** Picape de trabalho é Utilitário no cadastro (Saveiro Robust, decisão de 27/08). */
export const CARROCERIAS_DE_CARGA = ["Picape", "Utilitário", "Van"] as const;

/**
 * As respostas do quiz de hoje, pelos ids que o `CarMatch` e os leads antigos
 * já usam. Os ids não mudam: são chave de `TAGS_DA_RESPOSTA` e de dado gravado.
 */
export interface RespostasDoProfiler {
  orcamento: { min: number; max: number | null };
  objetivo?: string;
  experiencia?: string;
  estilo?: string;
}

/**
 * Cada resposta de hoje traduzida em FATO — a tabela da seção 6 da spec.
 *
 * O que é filtro corta; o que é preferência só ordena. A régua para escolher:
 * vira filtro apenas o que a própria opção promete com todas as letras
 * ("Espaço para a família" → 4 portas; "Câmbio automático e fácil de
 * manobrar" → automático; a carroceria escolhida). O resto é gosto, e gosto
 * não tira carro da tela.
 */
export function criteriosDasRespostas(r: RespostasDoProfiler): Criterios {
  const preferencias: ChaveDePreferencia[] = [];
  const avisos: string[] = [];
  let portas4 = false;
  let automatico = false;
  let carrocerias: readonly string[] | null = null;

  switch (r.objetivo) {
    case "family":
      portas4 = true;
      break;
    case "status": // "Um carro melhor que o meu"
      preferencias.push("novo", "automatico", "equipado");
      break;
    case "efficiency": // "Rodar barato na cidade"
      preferencias.push("flex", "motor-ate-1-6", "hatch-ou-seda");
      break;
    case "offroad": // "Trabalho e estrada"
      preferencias.push("carga", "diesel", "4x4");
      break;
  }

  switch (r.experiencia) {
    case "performance":
      preferencias.push("turbo");
      break;
    case "comfort":
      preferencias.push("automatico", "couro", "multimidia");
      break;
    case "tech": // "Facilidade no dia a dia — câmbio automático e fácil de manobrar"
      automatico = true;
      break;
    case "economy":
      preferencias.push("flex", "motor-ate-1-6", "novo");
      break;
  }

  switch (r.estilo) {
    case "suv":
      carrocerias = ["SUV"];
      break;
    case "sedan":
      carrocerias = ["Sedan"];
      break;
    case "hatch":
      carrocerias = ["Hatch"];
      break;
    case "pickup":
      carrocerias = CARROCERIAS_DE_CARGA;
      break;
    case "sport":
      // Nenhum carro do pátio é esportivo ou cupê. Prometer e entregar sedã
      // era o que o motor anterior fazia em silêncio. Quem marca esportivo
      // quer carro de passeio: picape e utilitário ficam de fora, e o turbo
      // passa na frente.
      carrocerias = ["Hatch", "Sedan", "SUV"];
      preferencias.push("turbo");
      avisos.push("Esportivo ou cupê não temos no pátio hoje. No lugar, mostramos hatch, sedã e SUV, com os de motor turbo na frente.");
      break;
  }

  // Preferência que já é filtro não pontua duas vezes.
  const unicas = [...new Set(preferencias)].filter((p) => !(p === "automatico" && automatico));

  return {
    piso: Math.max(0, r.orcamento.min || 0),
    teto: r.orcamento.max && r.orcamento.max > 0 ? r.orcamento.max : null,
    portas4,
    automatico,
    carrocerias,
    anoMin: null,
    kmMax: null,
    diesel: false,
    parcela: null,
    preferencias: unicas,
    avisos,
  };
}

// ---------------------------------------------------------------------------
// As perguntas da fase 2 (25/09): fatos, e não desejos
// ---------------------------------------------------------------------------

/** 02 · O que o carro vai levar. */
export type Leva = "eu" | "familia" | "carga";
/** 03 · Que jeito de carro (várias). Perua inclui minivan. */
export type Jeito = "Hatch" | "Sedan" | "SUV" | "Perua";
/** 04 · Trocar marcha no trânsito. */
export type PreferenciaDeCambio = "so_automatico" | "prefiro_automatico" | "tanto_faz" | "prefiro_manual";
/** 05 · O que não pode faltar (até três). */
export type ItemQueNaoPodeFaltar =
  | "2020-ou-mais-novo"
  | "ate-80-mil-km"
  | "diesel"
  | "camera"
  | "multimidia"
  | "sensor"
  | "seguranca"
  | "turbo"
  | "4x4";

/** O corte de "2020 ou mais novo" — um número só para o filtro, a opção e o "e se". */
export const ANO_DO_ITEM_NOVO = 2020;
/** O corte de "até 80 mil km". */
export const KM_DO_ITEM_POUCO_RODADO = 80000;
const milKm = (n: number) => `${Math.round(n / 1000)} mil km`;

/**
 * O que a pergunta 05 oferece, e o que cada item faz com o estoque.
 *
 * `corta`: ano, km e diesel são campos do sync — dá para prometer. Os itens de
 * ficha só ordenam, porque ficha vazia não prova carro sem o item (doze
 * carros chegaram do RevendaMais sem opcional nenhum).
 */
export const ITENS_QUE_NAO_PODEM_FALTAR: readonly {
  id: ItemQueNaoPodeFaltar;
  rotulo: string;
  corta: boolean;
  /** Só aparece para quem vai levar carga. */
  soComCarga?: boolean;
}[] = [
  { id: "2020-ou-mais-novo", rotulo: `${ANO_DO_ITEM_NOVO} ou mais novo`, corta: true },
  { id: "ate-80-mil-km", rotulo: `Até ${milKm(KM_DO_ITEM_POUCO_RODADO)}`, corta: true },
  { id: "diesel", rotulo: "Diesel", corta: true, soComCarga: true },
  { id: "camera", rotulo: "Câmera de ré", corta: false },
  { id: "multimidia", rotulo: "Central multimídia", corta: false },
  { id: "sensor", rotulo: "Sensor de estacionamento", corta: false },
  { id: "seguranca", rotulo: "Segurança além do obrigatório", corta: false },
  { id: "turbo", rotulo: "Motor turbo", corta: false },
  { id: "4x4", rotulo: "Tração 4x4", corta: false },
];

/** O limite da pergunta 05 — mais que isso vira lista de desejos, não critério. */
export const MAXIMO_DO_QUE_NAO_PODE_FALTAR = 3;

const CARROCERIAS_DO_JEITO: Record<Jeito, readonly string[]> = {
  Hatch: ["Hatch"],
  Sedan: ["Sedan"],
  SUV: ["SUV"],
  Perua: ["Perua", "Van"],
};

export interface PerfilDoQuiz {
  orcamento: { min: number; max: number | null };
  /** POR MÊS — quando vem, é ela que faz a faixa, e `orcamento` é ignorado. */
  parcela?: { max: number; entrada: number; prazo: number; ocupacao: Ocupacao } | null;
  leva?: Leva | null;
  jeitos?: readonly Jeito[];
  cambio?: PreferenciaDeCambio | null;
  naoPodeFaltar?: readonly ItemQueNaoPodeFaltar[];
}

/**
 * As respostas da fase 2 viram critérios. Mesma régua da fase 1: filtro só o
 * que a opção promete com todas as letras ("Família, criança na cadeirinha" →
 * 4 portas; "Só automático"; a carroceria marcada; ano, km e diesel), e o
 * resto só ordena.
 *
 * Com carga, a carroceria é a de carga e a pergunta do jeito nem aparece.
 */
export function criteriosDoPerfil(p: PerfilDoQuiz): Criterios {
  const preferencias: ChaveDePreferencia[] = [];
  let carrocerias: readonly string[] | null = null;

  if (p.leva === "carga") carrocerias = CARROCERIAS_DE_CARGA;
  else if (p.jeitos && p.jeitos.length > 0) {
    carrocerias = [...new Set(p.jeitos.flatMap((j) => CARROCERIAS_DO_JEITO[j] ?? []))];
  }

  if (p.cambio === "prefiro_automatico") preferencias.push("automatico");
  if (p.cambio === "prefiro_manual") preferencias.push("manual");

  const itens = new Set((p.naoPodeFaltar ?? []).slice(0, MAXIMO_DO_QUE_NAO_PODE_FALTAR));
  for (const item of itens) {
    if (item === "camera" || item === "multimidia" || item === "sensor" || item === "seguranca" || item === "turbo" || item === "4x4") {
      preferencias.push(item);
    }
  }

  const parcela: ParcelaPedida | null =
    p.parcela && p.parcela.max > 0
      ? {
          max: p.parcela.max,
          min: Math.round(p.parcela.max * PISO_DO_VALOR_EXATO),
          entrada: Math.max(0, p.parcela.entrada || 0),
          prazo: p.parcela.prazo,
          ocupacao: p.parcela.ocupacao,
        }
      : null;

  return {
    piso: parcela ? 0 : Math.max(0, p.orcamento.min || 0),
    teto: parcela ? null : p.orcamento.max && p.orcamento.max > 0 ? p.orcamento.max : null,
    parcela,
    portas4: p.leva === "familia",
    automatico: p.cambio === "so_automatico",
    carrocerias,
    anoMin: itens.has("2020-ou-mais-novo") ? ANO_DO_ITEM_NOVO : null,
    kmMax: itens.has("ate-80-mil-km") ? KM_DO_ITEM_POUCO_RODADO : null,
    // Diesel só vale com carga: fora dela a opção nem aparece.
    diesel: itens.has("diesel") && p.leva === "carga",
    preferencias,
    avisos: [],
  };
}

/** O mesmo pedido sem um filtro — a base do "e se". */
export function semFiltro(c: Criterios, chave: ChaveDeFiltro): Criterios {
  if (chave === "portas") return { ...c, portas4: false };
  if (chave === "automatico") return { ...c, automatico: false };
  if (chave === "ano") return { ...c, anoMin: null };
  if (chave === "km") return { ...c, kmMax: null };
  if (chave === "diesel") return { ...c, diesel: false };
  return { ...c, carrocerias: null };
}

/**
 * Quantos carros passam em tudo e estão na faixa. É o número que as opções do
 * quiz mostram ANTES do toque ("Só automático (1)") — a mesma conta do
 * resultado, rodando no navegador sobre o estoque que o CarMatch já baixou.
 */
export function quantosNaFaixa(estoque: readonly Veiculo[], c: Criterios): number {
  return carrosNaFaixa(estoque, c).length;
}

/** Os carros dessa conta — para a tela dizer quantos deles têm o item na ficha. */
export function carrosNaFaixa(estoque: readonly Veiculo[], c: Criterios): Veiculo[] {
  return estoque.filter((v) => elegivel(v) && passaNosFiltros(v, c) && naFaixaDoCliente(v, c));
}

// ---------------------------------------------------------------------------
// Preferências: o que cada uma quer dizer num carro
// ---------------------------------------------------------------------------

interface DefinicaoDePreferencia {
  /** Como o pedido aparece na lista do card, na voz do cliente. */
  rotulo: string;
  avaliar: (v: Veiculo) => EstadoDoFato;
  /** O fato que contradiz o pedido, para o "pesa contra": "é 2014". */
  contradicao?: (v: Veiculo) => string;
}

const itemDaFicha = (id: string) => ITENS_DA_FICHA.find((i) => i.id === id)!;

const combustivelLegivel = (v: Veiculo) => (v.combustivel || "outro combustível").toLowerCase();

/** "sedã", "SUV", "picape" — a carroceria como se fala, e não como se cadastra. */
function carroceriaLegivel(v: Veiculo): string {
  const t = carroceriaDe(v);
  if (!t) return "outra carroceria";
  if (t === "Sedan") return "sedã";
  if (t === "SUV") return "SUV";
  return t.toLowerCase();
}

export const PREFERENCIAS: Record<ChaveDePreferencia, DefinicaoDePreferencia> = {
  novo: {
    rotulo: "2020 ou mais novo",
    avaliar: (v) => (v.ano >= 2020 ? "atende" : "nao-atende"),
    contradicao: (v) => `é ${v.ano}`,
  },
  automatico: {
    rotulo: "câmbio automático",
    avaliar: (v) => {
      const a = ehAutomatico(v);
      return a === null ? "nao-consta" : a ? "atende" : "nao-atende";
    },
    contradicao: () => "é manual",
  },
  equipado: {
    // Ficha pobre não prova carro pobre — por isso a contagem baixa fica em
    // `nao-consta`, e não em `nao-atende`.
    rotulo: "bem equipado (4 itens ou mais na ficha)",
    avaliar: (v) => (itensQueConstam(v) >= 4 ? "atende" : "nao-consta"),
  },
  flex: {
    rotulo: "flex",
    avaliar: (v) => {
      const c = combustivelDe(v);
      if (!c) return "nao-consta";
      return c.includes("flex") ? "atende" : "nao-atende";
    },
    contradicao: (v) => `é ${combustivelLegivel(v)}`,
  },
  "motor-ate-1-6": {
    rotulo: "motor até 1.6",
    avaliar: (v) => {
      const cil = cilindradaDe(v);
      if (cil === null) return "nao-consta";
      return cil <= 1.6 ? "atende" : "nao-atende";
    },
    contradicao: (v) => `motor ${cilindradaDe(v)?.toFixed(1)}`,
  },
  "hatch-ou-seda": {
    rotulo: "hatch ou sedã",
    avaliar: (v) => {
      const t = normalizar(carroceriaDe(v));
      if (!t) return "nao-consta";
      return t === "hatch" || t === "sedan" ? "atende" : "nao-atende";
    },
    contradicao: (v) => `é ${carroceriaLegivel(v)}`,
  },
  carga: {
    rotulo: "caçamba ou espaço de carga",
    avaliar: (v) => {
      const t = normalizar(carroceriaDe(v));
      if (!t) return "nao-consta";
      return CARROCERIAS_DE_CARGA.some((c) => normalizar(c) === t) ? "atende" : "nao-atende";
    },
    contradicao: (v) => `é ${carroceriaLegivel(v)}`,
  },
  diesel: {
    rotulo: "diesel",
    avaliar: (v) => {
      const c = combustivelDe(v);
      if (!c) return "nao-consta";
      return c.includes("diesel") ? "atende" : "nao-atende";
    },
    contradicao: (v) => `é ${combustivelLegivel(v)}`,
  },
  "4x4": {
    rotulo: "tração 4x4",
    avaliar: tracao4x4,
    contradicao: () => "a versão é 4x2",
  },
  turbo: {
    rotulo: "motor turbo",
    avaliar: motorTurbo,
  },
  couro: {
    rotulo: "bancos em couro",
    avaliar: (v) => itemNaFicha(v, itemDaFicha("couro")),
  },
  multimidia: {
    rotulo: "central multimídia",
    avaliar: (v) => itemNaFicha(v, itemDaFicha("multimidia")),
  },
  manual: {
    rotulo: "câmbio manual",
    avaliar: (v) => {
      const a = ehAutomatico(v);
      return a === null ? "nao-consta" : a ? "nao-atende" : "atende";
    },
    contradicao: () => "é automático",
  },
  camera: {
    rotulo: "câmera de ré",
    avaliar: (v) => itemNaFicha(v, itemDaFicha("camera")),
  },
  sensor: {
    rotulo: "sensor de estacionamento",
    avaliar: (v) => itemNaFicha(v, itemDaFicha("sensor")),
  },
  seguranca: {
    // Airbag lateral ou de cortina, controle de estabilidade ou de tração: o
    // que passa do obrigatório e a ficha consegue dizer. Não há ISOFIX nem nota
    // do Latin NCAP no cadastro, e a spec registra essa lacuna.
    rotulo: "segurança além do obrigatório",
    avaliar: (v) =>
      ["airbag-lateral", "airbag-cortina", "estabilidade", "controle-tracao"].some(
        (id) => itemNaFicha(v, itemDaFicha(id)) === "atende",
      )
        ? "atende"
        : "nao-consta",
  },
};

/** +2 atende, 0 não consta, −1 não atende. Interna: nunca vai para a tela. */
const PESO: Record<EstadoDoFato, number> = { atende: 2, "nao-consta": 0, "nao-atende": -1 };

function pontuacao(v: Veiculo, prefs: readonly ChaveDePreferencia[]): number {
  return prefs.reduce((soma, p) => soma + PESO[PREFERENCIAS[p].avaliar(v)], 0);
}

// ---------------------------------------------------------------------------
// Quem pode entrar
// ---------------------------------------------------------------------------

/**
 * O que nunca entra no Profiler, qualquer que seja o pedido: moto, carro sem
 * preço e carro cuja carroceria cadastrada contradiz o nome.
 *
 * O último é a F-250 2008 cadastrada como Hatch: pela carroceria ela passaria
 * no filtro de hatch e sumiria do de picape — as duas coisas erradas. Ela
 * volta sozinha quando o cadastro for corrigido; o alerta já aparece no
 * editor do /admin (`divergenciaDeCarroceria`).
 */
export function elegivel(v: Veiculo): boolean {
  if (ehMoto(v)) return false;
  if (!(precoDoCarro(v) > 0)) return false;
  return divergenciaDeCarroceria(v) === null;
}

/** Filtros de carro e teto; o piso fica de fora, porque ele só separa faixa. */
export function passaNosFiltros(v: Veiculo, c: Criterios): boolean {
  if (c.teto !== null && precoDoCarro(v) > c.teto) return false;
  if (c.parcela && simularParcela(v, c.parcela).parcela_mensal > c.parcela.max) return false;
  if (c.portas4 && !((v.portas ?? 0) >= 4)) return false;
  if (c.automatico && ehAutomatico(v) !== true) return false;
  if (c.carrocerias) {
    const t = normalizar(carroceriaDe(v));
    if (!c.carrocerias.some((x) => normalizar(x) === t)) return false;
  }
  if (c.anoMin !== null && v.ano < c.anoMin) return false;
  if (c.kmMax !== null && !(v.quilometragem <= c.kmMax)) return false;
  if (c.diesel && !combustivelDe(v).includes("diesel")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export type LugarDoCartao = "principal" | "tambem" | "outro-caminho" | "abaixo-da-faixa";

export interface PedidoNoCartao {
  rotulo: string;
  estado: EstadoDoFato;
}

export interface CartaoDoMatch {
  veiculo: Veiculo;
  lugar: LugarDoCartao;
  /** O rótulo em caixa alta sobre o card. */
  rotuloDoLugar: string;
  /** Um fato em que este carro é o ÚNICO vencedor entre os cartões. */
  manchete: string;
  /** Cada preferência do cliente e o estado dela neste carro. */
  pedidos: PedidoNoCartao[];
  atende: number;
  pesaContra: string | null;
  /** POR MÊS: a parcela estimada, com CET e total — o que a regra de crédito pede junto. */
  parcela: ParcelaDoCartao | null;
}

/** A parcela de um cartão — tudo o que `textoDaParcela` precisa para dizer a oferta inteira. */
export type ParcelaDoCartao = ParcelaParaTexto;

function parcelaDoCartao(v: Veiculo, c: Criterios): ParcelaDoCartao | null {
  return c.parcela ? parcelaDoPedido(v, c.parcela) : null;
}

/** A oferta inteira deste carro para este pedido — para cartão, carta e lista. */
export function parcelaDoPedido(v: Veiculo, p: ParcelaPedida): ParcelaDoCartao {
  const r = simularParcela(v, p);
  return {
    valor: r.parcela_mensal,
    prazo: p.prazo,
    entrada: Math.min(p.entrada, precoDoCarro(v)),
    taxaMes: r.taxa_aplicada_mes_pct,
    cetAno: r.cet_anual_real_pct,
    total: r.total_pago_ao_final,
    aVista: precoDoCarro(v),
    taxaVariaMais: ANO_DE_REFERENCIA_DAS_TAXAS - v.ano > IDADE_ACIMA_DA_QUAL_A_TAXA_VARIA_MAIS,
  };
}

export interface SugestaoESe {
  filtro: ChaveDeFiltro;
  rotulo: string;
  /** Quantos carros entram a mais NA FAIXA — os que a tela vai mostrar. */
  entram: number;
  melhor: { id: string; nome: string; preco: number; ano: number } | null;
}

export interface Recomendacao {
  cartoes: CartaoDoMatch[];
  /** Os outros que passam em tudo e estão na faixa, na ordem do motor. */
  outros: Veiculo[];
  /** Quantos passam nos filtros E estão na faixa de preço. */
  naFaixa: number;
  /** Os filtros ativos, em texto de tela ("4 portas ou mais", "até R$ 75 mil"). */
  filtros: string[];
  avisos: string[];
  eSe: SugestaoESe[];
  /** `false` na faixa "acima de" e no texto livre sem valor: a tela não fala em teto. */
  temTeto: boolean;
  /** POR MÊS: o que a pessoa disse — a tela fala em parcela, e não em teto de preço. */
  parcelaPedida: ParcelaPedida | null;
  /** "Já pensou neste?" — ou `null` quando nenhum carro merece a carta. */
  coringa: Coringa | null;
}

/**
 * "Já pensou neste?" — um carro que a pessoa não pediu, e que o pátio tem
 * motivo para mostrar.
 *
 * É a porta de descoberta dentro do resultado: o carro fica dentro do teto e
 * passa em todos os filtros (o piso não conta — pode ser mais barato), atende
 * tudo o que o 1º cartão atende e VENCE o 1º em pelo menos dois fatos de uma
 * lista fechada. É o caminho pelo qual o entusiasta com R$ 130 mil acha a
 * Tiguan 2.0 TSI 4Motion de R$ 70.900, que nenhuma pergunta o levaria a pedir.
 *
 * O `oQueMuda` é obrigatório na tela: surpresa sem o custo escrito vira
 * empurrão.
 */
export interface Coringa {
  veiculo: Veiculo;
  /** O carro com que ele foi comparado — o 1º cartão. */
  comparadoCom: string;
  vantagens: string[];
  oQueMuda: string[];
  /** Custa menos que o piso da faixa: a tela não pode dizer "cabe na sua faixa". */
  abaixoDaFaixa: boolean;
  parcela: ParcelaDoCartao | null;
}

const reais = (n: number) => `R$ ${Math.round(n).toLocaleString("pt-BR")}`;

function milhares(n: number): string {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  return `R$ ${Math.round(n / 1000).toLocaleString("pt-BR")} mil`;
}

/**
 * "Chevrolet Spin 2014", e não "Chevrolet Spin Advantage 1.8 8V Econo.Flex 5P
 * Aut. 2014": o feed embute a versão no modelo, e o corte é o mesmo do título
 * dos cards. `nomeTemOAno` evita o "March 1.6 Rio 2016 2016".
 */
export function nomeCurto(v: Pick<Veiculo, "marca" | "modelo" | "versao" | "ano">): string {
  const { modelo } = modeloEVersaoParaExibir(v.modelo, v.versao ?? "");
  const nome = `${v.marca} ${modelo}`.replace(/\s+/g, " ").trim();
  return nomeTemOAno(nome, v.ano) ? nome : `${nome} ${v.ano}`;
}

function filtrosLegiveis(c: Criterios): string[] {
  const saida: string[] = [];
  if (c.parcela) {
    const entrada = c.parcela.entrada > 0 ? `, com ${milhares(c.parcela.entrada)} de entrada` : ", sem entrada";
    saida.push(`parcela até ${reais(c.parcela.max)}/mês em ${c.parcela.prazo}×${entrada}`);
  }
  if (c.piso > 0 && c.teto !== null) saida.push(`de ${milhares(c.piso)} a ${milhares(c.teto)}`);
  else if (c.teto !== null) saida.push(`até ${milhares(c.teto)}`);
  else if (c.piso > 0) saida.push(`acima de ${milhares(c.piso)}`);
  if (c.portas4) saida.push("4 portas ou mais");
  if (c.automatico) saida.push("só automático");
  if (c.carrocerias) {
    const nomes = c.carrocerias.map((t) => (t === "Sedan" ? "sedã" : t === "SUV" ? "SUV" : t.toLowerCase()));
    saida.push(nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} ou ${nomes.at(-1)}` : nomes[0]);
  }
  if (c.anoMin !== null) saida.push(`${c.anoMin} ou mais novo`);
  if (c.kmMax !== null) saida.push(`até ${Math.round(c.kmMax / 1000)} mil km`);
  if (c.diesel) saida.push("diesel");
  return saida;
}

/** Ano mais novo, menos km, menor preço, id — o desempate de sempre, e estável. */
function ordenar(carros: Veiculo[], prefs: readonly ChaveDePreferencia[]): Veiculo[] {
  const pontos = new Map(carros.map((v) => [v.id, pontuacao(v, prefs)]));
  return [...carros].sort(
    (a, b) =>
      pontos.get(b.id)! - pontos.get(a.id)! ||
      b.ano - a.ano ||
      a.quilometragem - b.quilometragem ||
      precoDoCarro(a) - precoDoCarro(b) ||
      String(a.id).localeCompare(String(b.id)),
  );
}

function difereEmEixo(a: Veiculo, b: Veiculo): boolean {
  return (
    ehAutomatico(a) !== ehAutomatico(b) ||
    normalizar(carroceriaDe(a)) !== normalizar(carroceriaDe(b)) ||
    epocaDe(a.ano) !== epocaDe(b.ano)
  );
}

/**
 * Os três, com diversidade — ver a regra 3 no topo do arquivo.
 *
 * Três passadas, cada uma mais frouxa: primeiro modelo diferente com a regra
 * do eixo; depois só modelo diferente; por fim o que sobrar. Dois do mesmo
 * modelo só aparecem quando a faixa não tem três modelos.
 */
export function escolherTres(ordenados: Veiculo[]): Veiculo[] {
  const escolhidos: Veiculo[] = [];
  const modelos = new Set<string>();
  const entra = (v: Veiculo) => {
    escolhidos.push(v);
    modelos.add(modeloBase(v));
  };

  for (const v of ordenados) {
    if (escolhidos.length === 3) break;
    if (modelos.has(modeloBase(v))) continue;
    if (escolhidos.length === 2 && !difereEmEixo(escolhidos[1], escolhidos[0]) && !difereEmEixo(v, escolhidos[0])) continue;
    entra(v);
  }
  for (const v of ordenados) {
    if (escolhidos.length === 3) break;
    if (escolhidos.includes(v) || modelos.has(modeloBase(v))) continue;
    entra(v);
  }
  for (const v of ordenados) {
    if (escolhidos.length === 3) break;
    if (!escolhidos.includes(v)) entra(v);
  }
  return escolhidos;
}

// ---------------------------------------------------------------------------
// O porquê de cada cartão
// ---------------------------------------------------------------------------

/** O único dono do melhor valor entre os cartões, ou `null` se há empate. */
function unicoVencedor(cartoes: Veiculo[], valor: (v: Veiculo) => number, maior: boolean): Veiculo | null {
  if (cartoes.length < 2) return null;
  const melhor = cartoes.reduce((m, v) => (maior ? Math.max(m, valor(v)) : Math.min(m, valor(v))), maior ? -Infinity : Infinity);
  const donos = cartoes.filter((v) => valor(v) === melhor);
  return donos.length === 1 ? donos[0] : null;
}

function unicoCom(cartoes: Veiculo[], teste: (v: Veiculo) => boolean): Veiculo | null {
  if (cartoes.length < 2) return null;
  const donos = cartoes.filter(teste);
  return donos.length === 1 ? donos[0] : null;
}

/** "o único SUV", "a única perua": a carroceria decide o gênero da frase. */
function unicaCarroceria(v: Veiculo): string {
  const t = carroceriaDe(v);
  if (t === "Sedan") return "o único sedã";
  if (t === "SUV") return "o único SUV";
  const nome = t.toLowerCase();
  const feminino = ["perua", "picape", "van", "minivan", "camionete"].includes(normalizar(t));
  return feminino ? `a única ${nome}` : `o único ${nome}`;
}

function juntar(frases: string[]): string {
  if (frases.length <= 1) return frases[0] ?? "";
  return `${frases.slice(0, -1).join(", ")} e ${frases.at(-1)}`;
}

/**
 * Manchete e "pesa contra" de cada cartão, sempre em comparação com os outros.
 *
 * Superlativo só com vencedor ÚNICO: dois 2025 entre os três não deixam
 * nenhum ser "o mais novo". Frase com empate era um dos riscos que a crítica
 * técnica levantou ("o mais barato" com dois Ka a R$ 53.900).
 */
function explicar(
  v: Veiculo,
  todos: Veiculo[],
  c: Criterios,
  naFaixa: number,
  abaixoDaFaixa: boolean,
): Omit<CartaoDoMatch, "lugar" | "rotuloDoLugar"> {
  const pedidos = c.preferencias.map((p) => ({ rotulo: PREFERENCIAS[p].rotulo, estado: PREFERENCIAS[p].avaliar(v) }));
  const atende = pedidos.filter((p) => p.estado === "atende").length;
  const grupo = todos.length === 2 ? "dos dois" : "dos três";

  const vitorias: string[] = [];
  if (unicoVencedor(todos, (x) => x.ano, true) === v) vitorias.push("o mais novo");
  if (unicoVencedor(todos, (x) => x.quilometragem, false) === v) vitorias.push("o de menor km");
  const maisBarato = unicoVencedor(todos, precoDoCarro, false) === v;
  if (maisBarato) vitorias.push("o mais barato");
  // No POR MÊS a pergunta é a parcela: a menor pode não ser a do mais barato
  // (carro com mais de 5 anos pega taxa maior).
  const parcelaDe = (x: Veiculo) => (c.parcela ? simularParcela(x, c.parcela).parcela_mensal : 0);
  const menorParcela = c.parcela !== null && unicoVencedor(todos, parcelaDe, false) === v;
  if (menorParcela && !maisBarato) vitorias.push("a menor parcela");
  if (unicoCom(todos, (x) => ehAutomatico(x) === true) === v) vitorias.push("o único automático");
  if (unicoCom(todos, (x) => combustivelDe(x).includes("diesel")) === v) vitorias.push("o único diesel");
  if (carroceriaDe(v) && unicoCom(todos, (x) => normalizar(carroceriaDe(x)) === normalizar(carroceriaDe(v))) === v) {
    vitorias.push(unicaCarroceria(v));
  }

  let manchete: string;
  if (vitorias.length > 0) {
    const frase = juntar(vitorias.slice(0, 2));
    manchete = `${frase.charAt(0).toUpperCase()}${frase.slice(1)} ${grupo}.`;
    // No card abaixo da faixa a sobra já está no rótulo, logo acima.
    if (maisBarato && c.teto !== null && !abaixoDaFaixa) manchete += ` Sobram ${reais(c.teto - precoDoCarro(v))} do seu teto.`;
    if (menorParcela && c.parcela && !abaixoDaFaixa) {
      manchete += ` Sobram ${reais(c.parcela.max - parcelaDe(v))} por mês.`;
    }
  } else if (abaixoDaFaixa) {
    // Nunca "passa em tudo": ele passa nos filtros, mas não na faixa de preço.
    manchete = c.parcela
      ? "Passa nos seus filtros e tem parcela menor do que a faixa que você escolheu."
      : "Passa nos seus filtros e custa menos do que a faixa que você escolheu.";
  } else if (naFaixa === 1) {
    manchete = "O único do pátio que passa nos seus filtros hoje.";
  } else if (pedidos.length > 0 && atende > 0) {
    manchete = `Atende ${atende} de ${pedidos.length} do que você pediu.`;
  } else if (pedidos.length > 0) {
    // "Atende 0 de 1" não é manchete: diz o que falta, e isso já está na lista
    // logo abaixo. No lugar, o que o carro é.
    const cambio = ehAutomatico(v) === true ? "automático" : ehAutomatico(v) === false ? "manual" : null;
    manchete = `${[String(v.ano), `${v.quilometragem.toLocaleString("pt-BR")} km`, cambio].filter(Boolean).join(", ")}.`;
  } else {
    manchete = "Passa em todos os seus filtros.";
  }

  let pesaContra: string | null = null;
  const contrario = c.preferencias.find((p) => PREFERENCIAS[p].avaliar(v) === "nao-atende");
  if (contrario) {
    const def = PREFERENCIAS[contrario];
    pesaContra = `Não atende ${def.rotulo}: ${def.contradicao ? def.contradicao(v) : "confira na ficha"}.`;
  } else if (unicoVencedor(todos, (x) => x.quilometragem, true) === v) {
    pesaContra = `O mais rodado ${grupo}: ${v.quilometragem.toLocaleString("pt-BR")} km.`;
  } else if (unicoVencedor(todos, (x) => x.ano, false) === v) {
    pesaContra = `O mais antigo ${grupo}: ${v.ano}.`;
  } else if (unicoVencedor(todos, precoDoCarro, true) === v) {
    pesaContra = `O mais caro ${grupo}.`;
  } else {
    const semFicha = c.preferencias.find((p) => PREFERENCIAS[p].avaliar(v) === "nao-consta");
    if (semFicha) {
      const r = PREFERENCIAS[semFicha].rotulo;
      pesaContra = `${r.charAt(0).toUpperCase()}${r.slice(1)}: não consta na ficha. Pergunte ao consultor.`;
    } else if (v.quilometragem >= KM_QUE_PESA_SOZINHO) {
      // Sem outro cartão para comparar, a quilometragem alta é o fato que pesa.
      pesaContra = `Rodou ${v.quilometragem.toLocaleString("pt-BR")} km.`;
    } else if (fichaVazia(v)) {
      pesaContra = "Itens de série não informados na ficha. Pergunte ao consultor.";
    }
  }

  return { veiculo: v, manchete, pedidos, atende, pesaContra, parcela: parcelaDoCartao(v, c) };
}

// ---------------------------------------------------------------------------
// "Já pensou neste?"
// ---------------------------------------------------------------------------

/** Acima disto a quilometragem pesa contra mesmo sem outro carro para comparar. */
const KM_QUE_PESA_SOZINHO = 150000;

/** Diferença de preço que conta como vantagem — abaixo disso é ruído de negociação. */
const DIFERENCA_DE_PRECO_QUE_CONTA = 3000;
/** Diferença de km que conta: pelo menos 10 mil e 15% a menos. */
const DIFERENCA_DE_KM_QUE_CONTA = 10000;
const PROPORCAO_DE_KM_QUE_CONTA = 0.85;

/**
 * O coringa não sai por menos que isto do preço do 1º cartão.
 *
 * Sem piso nenhum, a revisão de 25/09 achou 98% das cartas abaixo da faixa do
 * cliente: um Kwid de R$ 58.900 "ganhando" de um X4 de R$ 318.900 por custar
 * R$ 260 mil a menos. A carta virava "o mais barato que passa nos filtros".
 * Com 60%, o caso que motivou a carta continua de pé — a Tiguan de R$ 70.900
 * para quem tinha R$ 91 a 130 mil —, e o Fusca 1976 para quem pediu um Polo
 * TSI deixa de aparecer.
 */
const PRECO_MINIMO_DO_CORINGA = 0.6;

const km = (n: number) => `${n.toLocaleString("pt-BR")} km`;

interface Comparacao {
  vantagens: string[];
  /** As vantagens que não são preço: são estas que precisam ser duas. */
  vantagensDeCarro: number;
  oQueMuda: string[];
}

/**
 * O coringa contra o 1º cartão, fato a fato — e nos DOIS sentidos.
 *
 * A primeira versão só listava o que o coringa ganhava e o que mudava em ano,
 * km, preço, câmbio e carroceria. O que ele PERDIA — portas, 4x4, diesel,
 * turbo, itens de ficha — ficava fora do O QUE MUDA, enquanto os itens de
 * ficha que ele tinha a mais entravam como vantagem. Surpresa com o custo
 * escondido é empurrão; a lista agora é simétrica.
 */
function compararComOPrimeiro(v: Veiculo, p: Veiculo): Comparacao {
  const vantagens: string[] = [];
  const oQueMuda: string[] = [];
  let vantagensDeCarro = 0;
  const ganha = (frase: string) => {
    vantagens.push(frase);
    vantagensDeCarro += 1;
  };

  if (v.ano > p.ano) ganha(`mais novo: ${v.ano}, contra ${p.ano}`);
  else if (v.ano < p.ano) oQueMuda.push(`é ${v.ano}, contra ${p.ano}`);

  const diferencaDeKm = p.quilometragem - v.quilometragem;
  if (diferencaDeKm >= DIFERENCA_DE_KM_QUE_CONTA && v.quilometragem <= p.quilometragem * PROPORCAO_DE_KM_QUE_CONTA) {
    ganha(`rodou menos: ${km(v.quilometragem)}, contra ${km(p.quilometragem)}`);
  } else if (v.quilometragem > p.quilometragem) {
    oQueMuda.push(`${km(v.quilometragem)}, contra ${km(p.quilometragem)}`);
  }

  // Preço é listado, mas não conta para as duas vantagens: "custa menos",
  // sozinho, fazia de qualquer carro barato um coringa.
  const diferencaDePreco = precoDoCarro(p) - precoDoCarro(v);
  if (diferencaDePreco >= DIFERENCA_DE_PRECO_QUE_CONTA) vantagens.push(`custa ${reais(diferencaDePreco)} a menos`);
  else if (diferencaDePreco < 0) oQueMuda.push(`custa ${reais(-diferencaDePreco)} a mais`);

  const autoV = ehAutomatico(v);
  const autoP = ehAutomatico(p);
  if (autoV === true && autoP === false) ganha("câmbio automático, contra manual");
  else if (autoV === false && autoP === true) oQueMuda.push("câmbio manual, contra automático");

  // Cilindrada só se compara entre motores do mesmo tipo: um 1.3 aspirado
  // não é "mais motor" que um 1.0 TSI — era o Fusca 1976 ganhando do Polo.
  const turboV = motorTurbo(v) === "atende";
  const turboP = motorTurbo(p) === "atende";
  if (turboV && !turboP) ganha("motor turbo");
  else if (!turboV && turboP) oQueMuda.push("motor sem turbo, contra turbo");
  else {
    const cilV = cilindradaDe(v);
    const cilP = cilindradaDe(p);
    if (cilV !== null && cilP !== null) {
      if (cilV > cilP + 0.05) ganha(`motor ${cilV.toFixed(1)}, contra ${cilP.toFixed(1)}`);
      else if (cilV < cilP - 0.05) oQueMuda.push(`motor ${cilV.toFixed(1)}, contra ${cilP.toFixed(1)}`);
    }
  }

  const quatroV = tracao4x4(v) === "atende";
  const quatroP = tracao4x4(p) === "atende";
  if (quatroV && !quatroP) ganha("tração 4x4");
  else if (!quatroV && quatroP) oQueMuda.push("sem tração 4x4");

  // Diesel não é vantagem para todo mundo; perder o diesel de quem tinha, é custo.
  if (combustivelDe(p).includes("diesel") && !combustivelDe(v).includes("diesel")) {
    oQueMuda.push(`${combustivelLegivel(v)}, não diesel`);
  }

  const portasV = v.portas ?? 0;
  const portasP = p.portas ?? 0;
  if (portasV > 0 && portasP > 0 && portasV < portasP) oQueMuda.push(`${portasV} portas, contra ${portasP}`);

  // A ficha só compara quando a do outro lado tem conteúdo: ficha vazia não
  // prova que falta o item. E os itens a mais contam como UMA vantagem, por
  // mais que sejam — senão uma ficha longa ganharia sozinha.
  if (!fichaVazia(p)) {
    const aMais = ITENS_DA_FICHA.filter((i) => itemNaFicha(v, i) === "atende" && itemNaFicha(p, i) !== "atende");
    if (aMais.length > 0) ganha(`${juntar(aMais.map((i) => i.rotulo))} na ficha`);
    if (fichaVazia(v)) {
      oQueMuda.push("itens de série não informados na ficha");
    } else {
      const aMenos = ITENS_DA_FICHA.filter((i) => itemNaFicha(p, i) === "atende" && itemNaFicha(v, i) !== "atende");
      if (aMenos.length > 0) {
        oQueMuda.push(`${juntar(aMenos.map((i) => i.rotulo))} não ${aMenos.length === 1 ? "consta" : "constam"} na ficha`);
      }
    }
  }

  if (normalizar(carroceriaDe(v)) !== normalizar(carroceriaDe(p)) && carroceriaDe(v)) {
    oQueMuda.push(`é ${carroceriaLegivel(v)}, não ${carroceriaLegivel(p)}`);
  }
  return { vantagens, vantagensDeCarro, oQueMuda };
}

function escolherCoringa(base: readonly Veiculo[], c: Criterios, cartoes: readonly Veiculo[]): Coringa | null {
  const primeiro = cartoes[0];
  if (!primeiro) return null;

  const modelos = new Set(cartoes.map(modeloBase));
  const atendidasPeloPrimeiro = c.preferencias.filter((p) => PREFERENCIAS[p].avaliar(primeiro) === "atende");
  const precoMinimo = precoDoCarro(primeiro) * PRECO_MINIMO_DO_CORINGA;

  const candidatos = base
    .filter(
      (v) =>
        !cartoes.includes(v) &&
        !modelos.has(modeloBase(v)) &&
        passaNosFiltros(v, c) &&
        precoDoCarro(v) >= precoMinimo &&
        atendidasPeloPrimeiro.every((p) => PREFERENCIAS[p].avaliar(v) === "atende"),
    )
    .map((v) => ({ v, ...compararComOPrimeiro(v, primeiro) }))
    .filter((x) => x.vantagensDeCarro >= 2)
    // Mais vantagens de carro; no empate, o que muda menos; depois o mais
    // novo. Preço fica por último: desempatar pelo mais barato era o que
    // puxava a carta para o fundo da faixa.
    .sort(
      (a, b) =>
        b.vantagensDeCarro - a.vantagensDeCarro ||
        a.oQueMuda.length - b.oQueMuda.length ||
        b.v.ano - a.v.ano ||
        precoDoCarro(a.v) - precoDoCarro(b.v) ||
        String(a.v.id).localeCompare(String(b.v.id)),
    );

  const melhor = candidatos[0];
  if (!melhor) return null;
  return {
    veiculo: melhor.v,
    comparadoCom: nomeCurto(primeiro),
    vantagens: melhor.vantagens,
    oQueMuda: melhor.oQueMuda,
    abaixoDaFaixa: !naFaixaDoCliente(melhor.v, c),
    parcela: parcelaDoCartao(melhor.v, c),
  };
}

// ---------------------------------------------------------------------------
// A recomendação
// ---------------------------------------------------------------------------

const ROTULO_DO_LUGAR: Record<Exclude<LugarDoCartao, "abaixo-da-faixa">, string> = {
  principal: "O MAIS PERTO DO QUE VOCÊ PEDIU",
  tambem: "TAMBÉM ATENDE",
  "outro-caminho": "OUTRO CAMINHO",
};

const ROTULO_DO_E_SE: Record<ChaveDeFiltro, string> = {
  automatico: "Aceitar câmbio manual",
  carroceria: "Ver outras carrocerias",
  portas: "Aceitar 2 portas",
  ano: `Aceitar antes de ${ANO_DO_ITEM_NOVO}`,
  km: `Aceitar mais de ${milKm(KM_DO_ITEM_POUCO_RODADO)}`,
  diesel: "Aceitar flex ou gasolina",
};

/**
 * Recomenda a partir de um estoque JÁ filtrado por `disponiveisDe` — quem
 * chama decide o que está à venda; o motor decide o que serve.
 */
export function recomendar(estoque: readonly Veiculo[], c: Criterios): Recomendacao {
  const base = estoque.filter(elegivel);
  const passam = base.filter((v) => passaNosFiltros(v, c));
  const naFaixa = ordenar(passam.filter((v) => naFaixaDoCliente(v, c)), c.preferencias);

  const tres = escolherTres(naFaixa);

  // Decisão 2 do dono (25/09): faixa com menos de três completa com o mais
  // perto ABAIXO do piso, sempre rotulado. "Mais perto" é o preço: o mais caro
  // dos que sobram vem primeiro, e a pontuação só desempata. A primeira versão
  // ordenava pela pontuação e completava 115–175 mil com um Soul de R$ 76.900,
  // pulando um X1 que ficava R$ 100 abaixo do piso — achado da revisão.
  const completando = passam
    .filter((v) => !naFaixaDoCliente(v, c))
    // No POR MÊS, "mais perto" é a parcela mais alta dos que sobram.
    // Empate de parcela (duas em zero, quando a entrada cobre os dois) vai
    // pelo preço, como no modo à vista: o mais perto do que a pessoa pode é o
    // mais caro. Desempatar pela pontuação trazia um Ka de R$ 53.900 no lugar
    // de um Corolla Cross de R$ 134.900 que a entrada também cobria.
    .sort(
      (a, b) =>
        valorNaFaixa(b, c) - valorNaFaixa(a, c) ||
        precoDoCarro(b) - precoDoCarro(a) ||
        pontuacao(b, c.preferencias) - pontuacao(a, c.preferencias),
    )
    .slice(0, Math.max(0, 3 - tres.length));

  const todos = [...tres, ...completando];
  const cartoes: CartaoDoMatch[] = todos.map((v, i) => {
    const abaixoDaFaixa = completando.includes(v);
    let lugar: LugarDoCartao;
    if (abaixoDaFaixa) lugar = "abaixo-da-faixa";
    else if (i === 0) lugar = "principal";
    else if (i === 2 && difereEmEixo(v, todos[0])) lugar = "outro-caminho";
    else lugar = "tambem";

    const rotuloDoLugar =
      lugar === "abaixo-da-faixa"
        ? c.parcela
          ? `ABAIXO DA SUA FAIXA · SOBRAM ${reais(c.parcela.max - valorNaFaixa(v, c))} POR MÊS`
          : c.teto !== null
            ? `ABAIXO DA SUA FAIXA · SOBRAM ${reais(c.teto - precoDoCarro(v))}`
            : "ABAIXO DA SUA FAIXA"
        : ROTULO_DO_LUGAR[lugar];

    return { ...explicar(v, todos, c, naFaixa.length, abaixoDaFaixa), lugar, rotuloDoLugar };
  });

  // "E se": quando a FAIXA não fecha três — ainda que o complemento abaixo do
  // piso encha a tela. Cada filtro ativo é tirado sozinho e conta-se quem
  // entra a mais NA FAIXA, que é o que a tela mostra depois do clique. Contar
  // também os de baixo do piso prometia "+12 carros" e entregava cinco.
  const eSe: SugestaoESe[] = [];
  if (naFaixa.length < 3) {
    const ativos: ChaveDeFiltro[] = [];
    if (c.automatico) ativos.push("automatico");
    if (c.carrocerias) ativos.push("carroceria");
    if (c.portas4) ativos.push("portas");
    if (c.anoMin !== null) ativos.push("ano");
    if (c.kmMax !== null) ativos.push("km");
    if (c.diesel) ativos.push("diesel");
    const dentro = new Set(passam.map((v) => v.id));
    for (const filtro of ativos) {
      const frouxo = semFiltro(c, filtro);
      const novos = ordenar(
        base.filter((v) => !dentro.has(v.id) && passaNosFiltros(v, frouxo) && naFaixaDoCliente(v, c)),
        frouxo.preferencias,
      );
      if (novos.length === 0) continue;
      const m = novos[0];
      eSe.push({
        filtro,
        rotulo: ROTULO_DO_E_SE[filtro],
        entram: novos.length,
        melhor: { id: m.id, nome: nomeCurto(m), preco: precoDoCarro(m), ano: m.ano },
      });
    }
  }

  const coringa = escolherCoringa(base, c, todos);
  return {
    cartoes,
    // O coringa não se repete na lista de baixo: a carta já é o lugar dele.
    outros: naFaixa.filter((v) => !tres.includes(v) && v !== coringa?.veiculo),
    naFaixa: naFaixa.length,
    filtros: filtrosLegiveis(c),
    avisos: [...c.avisos],
    eSe,
    temTeto: c.teto !== null,
    parcelaPedida: c.parcela,
    coringa,
  };
}
