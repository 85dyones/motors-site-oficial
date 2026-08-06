/**
 * Recomendação de avaliação — regra de precificação de compra da Motors.
 *
 * Isto NÃO vai para a tela. O cliente nunca vê um valor de oferta antes da
 * vistoria presencial; o que ele vê é a referência FIPE. Esta recomendação
 * viaja no JSON que o webhook do n8n recebe, para o consultor abrir o lead já
 * com a faixa sugerida e os sinais que a justificam.
 *
 * A regra, como o dono definiu em 2026-08-06:
 *
 *   · carro em ótimo estado ................ 10% abaixo da FIPE
 *   · carro com reparos leves .............. entre 15% e 20% abaixo
 *   · km alto (acima de 150.000) e avarias
 *     maiores .............................. pelo menos 30% abaixo
 *
 * O formulário pergunta mecânica e funilaria em escalas separadas, então a
 * regra precisa de um mapeamento explícito entre as duas escalas e as três
 * faixas. O mapeamento abaixo foi confirmado pelo dono na mesma data:
 *
 *   10%     → mecânica {excelente, bom}  E  funilaria {impecável}
 *   15–20%  → qualquer combinação intermediária
 *   min 30% → mecânica {ruim}  OU  funilaria {avariado}
 *
 * Sobre a quilometragem: a frase da regra une km alto e avarias maiores. Aqui
 * ela é aplicada ao pé da letra — km alto só fecha a faixa de 30% quando o
 * veículo já está na faixa de avarias. Nos demais casos o km alto entra como
 * sinal para o consultor, sem mexer no percentual: rebaixar a faixa por conta
 * própria seria inventar um número que a regra não dá.
 */

export type EstadoMecanico = "excelente" | "bom" | "atencao" | "ruim";
export type EstadoConservacao = "impecavel" | "riscos" | "reparos" | "avariado";

export type FaixaAvaliacao = "otimo" | "reparos_leves" | "avarias_maiores";

/** Acima disto a quilometragem conta como alta para a regra. */
export const LIMITE_KM_ALTO = 150000;

export interface RecomendacaoAvaliacao {
  faixa: FaixaAvaliacao;
  /** Rótulo legível, para o consultor ler direto no card do lead. */
  faixa_label: string;
  /** Desconto sugerido sobre a FIPE, em pontos percentuais. */
  desconto_min: number;
  /** `null` quando a regra diz "pelo menos X%", sem teto definido. */
  desconto_max: number | null;
  km_acima_do_limite: boolean;
  /** Por que caiu nesta faixa — uma linha por motivo. */
  sinais: string[];
  /** Valor sugerido em reais, quando a FIPE numérica está disponível. */
  valor_sugerido_min: number | null;
  valor_sugerido_max: number | null;
  resumo: string;
}

const ROTULO_MECANICA: Record<EstadoMecanico, string> = {
  excelente: "mecânica excelente",
  bom: "mecânica boa",
  atencao: "mecânica requer atenção",
  ruim: "mecânica ruim",
};

const ROTULO_CONSERVACAO: Record<EstadoConservacao, string> = {
  impecavel: "funilaria impecável",
  riscos: "pequenos riscos de uso",
  reparos: "amassados leves",
  avariado: "avariado / batido",
};

function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/**
 * Converte o texto que a API da FIPE devolve ("R$ 67.142,00") em número.
 * Devolve `null` quando não dá para ler — melhor omitir o valor sugerido do
 * que mandar um número errado para o consultor.
 */
export function fipeParaNumero(fipeValor: string | null | undefined): number | null {
  if (!fipeValor) return null;
  const digitos = String(fipeValor).replace(/[^\d]/g, "");
  if (!digitos) return null;
  const numero = Number(digitos) / 100;
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

export function recomendarAvaliacao(entrada: {
  estadoMecanico: string;
  estadoConservacao: string;
  quilometragem: number | null;
  fipeValor?: string | null;
}): RecomendacaoAvaliacao {
  const mecanica = entrada.estadoMecanico as EstadoMecanico;
  const conservacao = entrada.estadoConservacao as EstadoConservacao;
  const km = typeof entrada.quilometragem === "number" && entrada.quilometragem >= 0
    ? entrada.quilometragem
    : null;

  const kmAcima = km !== null && km > LIMITE_KM_ALTO;

  const sinais: string[] = [];
  if (ROTULO_MECANICA[mecanica]) sinais.push(ROTULO_MECANICA[mecanica]);
  if (ROTULO_CONSERVACAO[conservacao]) sinais.push(ROTULO_CONSERVACAO[conservacao]);
  if (km !== null) {
    sinais.push(`${km.toLocaleString("pt-BR")} km`);
  }

  let faixa: FaixaAvaliacao;
  let descontoMin: number;
  let descontoMax: number | null;
  let faixaLabel: string;

  const temAvariaMaior = mecanica === "ruim" || conservacao === "avariado";
  const emOtimoEstado =
    (mecanica === "excelente" || mecanica === "bom") && conservacao === "impecavel";

  if (temAvariaMaior) {
    faixa = "avarias_maiores";
    descontoMin = 30;
    descontoMax = null;
    faixaLabel = "Avarias maiores — pelo menos 30% abaixo da FIPE";
    if (kmAcima) {
      sinais.push(
        `quilometragem acima de ${LIMITE_KM_ALTO.toLocaleString("pt-BR")} km somada a avarias maiores: é o caso previsto na regra dos 30%`,
      );
    }
  } else if (emOtimoEstado) {
    faixa = "otimo";
    descontoMin = 10;
    descontoMax = 10;
    faixaLabel = "Ótimo estado — 10% abaixo da FIPE";
  } else {
    faixa = "reparos_leves";
    descontoMin = 15;
    descontoMax = 20;
    faixaLabel = "Reparos leves — entre 15% e 20% abaixo da FIPE";
  }

  // Km alto fora da faixa de avarias não mexe no percentual: a regra só
  // prevê os 30% quando ele vem acompanhado de avarias maiores. Fica como
  // alerta para o consultor decidir na vistoria.
  if (kmAcima && faixa !== "avarias_maiores") {
    sinais.push(
      `atenção: acima de ${LIMITE_KM_ALTO.toLocaleString("pt-BR")} km — avaliar na vistoria se puxa a faixa para baixo`,
    );
  }

  const fipeNumerico = fipeParaNumero(entrada.fipeValor);
  // O maior desconto produz o MENOR valor: min de valor ↔ max de desconto.
  const valorSugeridoMin =
    fipeNumerico !== null && descontoMax !== null
      ? Math.round(fipeNumerico * (1 - descontoMax / 100))
      : null;
  const valorSugeridoMax =
    fipeNumerico !== null ? Math.round(fipeNumerico * (1 - descontoMin / 100)) : null;

  let resumo: string;
  if (fipeNumerico === null) {
    resumo = faixaLabel;
  } else if (descontoMax === null) {
    resumo = `${faixaLabel} — teto de ${formatarReais(valorSugeridoMax as number)}`;
  } else if (descontoMin === descontoMax) {
    resumo = `${faixaLabel} — ${formatarReais(valorSugeridoMax as number)}`;
  } else {
    resumo = `${faixaLabel} — de ${formatarReais(valorSugeridoMin as number)} a ${formatarReais(valorSugeridoMax as number)}`;
  }

  return {
    faixa,
    faixa_label: faixaLabel,
    desconto_min: descontoMin,
    desconto_max: descontoMax,
    km_acima_do_limite: kmAcima,
    sinais,
    valor_sugerido_min: valorSugeridoMin,
    valor_sugerido_max: valorSugeridoMax,
    resumo,
  };
}
