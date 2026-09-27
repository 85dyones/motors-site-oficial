/**
 * O texto de crédito do site, num lugar só: a parcela nunca aparece sozinha.
 *
 * O Código de Defesa do Consumidor (art. 54-B, §3º, na redação da Lei
 * 14.181/2021) pede, junto de oferta a prazo, o custo efetivo total e a soma
 * total a pagar, com e sem financiamento. A revisão de 27/09 achou dois
 * lugares que falhavam nisso: a lista "outros" do Profiler, com a parcela
 * sozinha, e um "total" que era só a soma das parcelas, escrito ao lado da
 * entrada — num carro de R$ 60 mil com R$ 20 mil de entrada, "total R$ 64
 * mil" lido contra o preço parece R$ 4 mil de custo, e o custo é R$ 24 mil.
 *
 * Por isso quem mostra parcela no site monta o texto aqui, e o teste confere
 * as quatro partes: parcela, CET, total a prazo e preço à vista.
 */
import { IDADE_ACIMA_DA_QUAL_A_TAXA_VARIA_MAIS } from "./finance-calculator";

export interface ParcelaParaTexto {
  valor: number;
  prazo: number;
  entrada: number;
  taxaMes: number;
  cetAno: number;
  /** A soma das parcelas. */
  total: number;
  /** O preço à vista do carro. */
  aVista: number;
  /** Carro acima do último degrau de idade do simulador. */
  taxaVariaMais: boolean;
}

/** O que a simulação é, e o que não é — vai junto de toda parcela. */
export const AVISO_DA_SIMULACAO =
  "Simulação, não é oferta de crédito: o banco, a taxa e a aprovação saem da análise de crédito.";

const dinheiro = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (n: number, casas: number) => n.toFixed(casas).replace(".", ",");

/** Entrada mais parcelas: o que se paga a prazo, no total. */
export function totalAPrazo(p: Pick<ParcelaParaTexto, "entrada" | "total">): number {
  return p.entrada + p.total;
}

export interface TextoDaParcela {
  /** "≈ 48× R$ 1.298" — ou, sem nada a financiar, a frase que diz isso. */
  parcela: string;
  /** Entrada, taxa, CET, total das parcelas, total a prazo e à vista. */
  detalhe: string;
  /** Uma linha só, para listas: parcela, CET e total a prazo. */
  compacto: string;
  /** Aviso para carro mais velho que o último degrau; `null` nos outros. */
  cautela: string | null;
}

export function textoDaParcela(p: ParcelaParaTexto): TextoDaParcela {
  const cautela = p.taxaVariaMais
    ? `Carro com mais de ${IDADE_ACIMA_DA_QUAL_A_TAXA_VARIA_MAIS} anos: aprovação e taxa variam mais de banco para banco.`
    : null;
  if (!(p.valor > 0)) {
    return {
      parcela: "A entrada que você disse cobre o carro.",
      detalhe: `à vista ${dinheiro(p.aVista)}`,
      compacto: "a entrada cobre o carro",
      cautela: null,
    };
  }
  const entrada = p.entrada > 0 ? `entrada ${dinheiro(p.entrada)}` : "sem entrada";
  const aPrazo = dinheiro(totalAPrazo(p));
  return {
    parcela: `≈ ${p.prazo}× ${dinheiro(p.valor)}`,
    detalhe:
      `${entrada} · taxa estimada ${pct(p.taxaMes, 2)}% a.m. · CET ${pct(p.cetAno, 1)}% a.a. · ` +
      `total das parcelas ${dinheiro(p.total)} · total a prazo ${aPrazo} (à vista ${dinheiro(p.aVista)})`,
    compacto: `≈ ${p.prazo}× ${dinheiro(p.valor)} (CET ${pct(p.cetAno, 1)}% a.a., total a prazo ${aPrazo})`,
    cautela,
  };
}
