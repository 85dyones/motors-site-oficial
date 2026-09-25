import type { Veiculo } from "../types";
import { divergenciaDeCarroceria } from "./coerenciaDoCadastro";
import { modeloEVersaoParaExibir } from "./estoqueTabela";
import { nomeTemOAno } from "./nomeDoVeiculo";
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
        quantos: lista.filter((p) => p > lo && p <= hi).length,
      };
    });
    faixas.push({
      id: `faixa-${faixas.length}`,
      min: tetoDoUltimo,
      max: null,
      titulo: `Acima de R$ ${rotuloDeValor(tetoDoUltimo)}`,
      quantos: lista.filter((p) => p > tetoDoUltimo).length,
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
export type ChaveDeFiltro = "portas" | "automatico" | "carroceria";

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
  | "multimidia";

export interface Criterios {
  /** 0 = sem piso. */
  piso: number;
  /** `null` = sem teto (a faixa "acima de R$ X", ou texto livre sem valor). */
  teto: number | null;
  portas4: boolean;
  automatico: boolean;
  /** Carrocerias aceitas, na grafia do cadastro. `null` = qualquer uma. */
  carrocerias: readonly string[] | null;
  preferencias: readonly ChaveDePreferencia[];
  /** Frases que a tela mostra antes dos carros ("esportivo não temos hoje"). */
  avisos: readonly string[];
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
    preferencias: unicas,
    avisos,
  };
}

/** O mesmo pedido sem um filtro — a base do "e se". */
export function semFiltro(c: Criterios, chave: ChaveDeFiltro): Criterios {
  if (chave === "portas") return { ...c, portas4: false };
  if (chave === "automatico") return { ...c, automatico: false };
  return { ...c, carrocerias: null };
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
  if (c.portas4 && !((v.portas ?? 0) >= 4)) return false;
  if (c.automatico && ehAutomatico(v) !== true) return false;
  if (c.carrocerias) {
    const t = normalizar(carroceriaDe(v));
    if (!c.carrocerias.some((x) => normalizar(x) === t)) return false;
  }
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
  if (c.piso > 0 && c.teto !== null) saida.push(`de ${milhares(c.piso)} a ${milhares(c.teto)}`);
  else if (c.teto !== null) saida.push(`até ${milhares(c.teto)}`);
  else if (c.piso > 0) saida.push(`acima de ${milhares(c.piso)}`);
  if (c.portas4) saida.push("4 portas ou mais");
  if (c.automatico) saida.push("só automático");
  if (c.carrocerias) {
    const nomes = c.carrocerias.map((t) => (t === "Sedan" ? "sedã" : t === "SUV" ? "SUV" : t.toLowerCase()));
    saida.push(nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} ou ${nomes.at(-1)}` : nomes[0]);
  }
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
  } else if (abaixoDaFaixa) {
    // Nunca "passa em tudo": ele passa nos filtros, mas não na faixa de preço.
    manchete = "Passa nos seus filtros e custa menos do que a faixa que você escolheu.";
  } else if (naFaixa === 1) {
    manchete = "O único do pátio que passa nos seus filtros hoje.";
  } else if (pedidos.length > 0) {
    manchete = `Atende ${atende} de ${pedidos.length} do que você pediu.`;
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
    } else if (fichaVazia(v)) {
      pesaContra = "Itens de série não informados na ficha. Pergunte ao consultor.";
    }
  }

  return { veiculo: v, manchete, pedidos, atende, pesaContra };
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
};

/**
 * Recomenda a partir de um estoque JÁ filtrado por `disponiveisDe` — quem
 * chama decide o que está à venda; o motor decide o que serve.
 */
export function recomendar(estoque: readonly Veiculo[], c: Criterios): Recomendacao {
  const base = estoque.filter(elegivel);
  const passam = base.filter((v) => passaNosFiltros(v, c));
  const naFaixa = ordenar(passam.filter((v) => precoDoCarro(v) >= c.piso), c.preferencias);

  const tres = escolherTres(naFaixa);

  // Decisão 2 do dono (25/09): faixa com menos de três completa com o mais
  // perto ABAIXO do piso, sempre rotulado. "Mais perto" é o preço: o mais caro
  // dos que sobram vem primeiro, e a pontuação só desempata. A primeira versão
  // ordenava pela pontuação e completava 115–175 mil com um Soul de R$ 76.900,
  // pulando um X1 que ficava R$ 100 abaixo do piso — achado da revisão.
  const completando = passam
    .filter((v) => precoDoCarro(v) < c.piso)
    .sort((a, b) => precoDoCarro(b) - precoDoCarro(a) || pontuacao(b, c.preferencias) - pontuacao(a, c.preferencias))
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
        ? c.teto !== null
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
    const dentro = new Set(passam.map((v) => v.id));
    for (const filtro of ativos) {
      const frouxo = semFiltro(c, filtro);
      const novos = ordenar(
        base.filter((v) => !dentro.has(v.id) && passaNosFiltros(v, frouxo) && precoDoCarro(v) >= c.piso),
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

  return {
    cartoes,
    outros: naFaixa.filter((v) => !tres.includes(v)),
    naFaixa: naFaixa.length,
    filtros: filtrosLegiveis(c),
    avisos: [...c.avisos],
    eSe,
    temTeto: c.teto !== null,
  };
}
