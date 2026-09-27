/**
 * Finance Calculator Engine
 * Calculates simulated vehicle financing parcels based on realistic coefficient matrices.
 *
 * ---------------------------------------------------------------------------
 * 2026-09-25 — ano de referência congelado e CET de verdade
 * ---------------------------------------------------------------------------
 * A idade do carro saía de `new Date().getFullYear()`: em 1º de janeiro todo
 * carro envelhecia um ano de uma vez, e várias parcelas subiam sozinhas — no
 * site e no Garagem Profiler, que filtra pela parcela. A idade agora conta a
 * partir de `ANO_DE_REFERENCIA_DAS_TAXAS`, que muda junto com as taxas.
 *
 * O CET era `(total pago / valor financiado)^(1/n) − 1`, que não é CET: dava
 * menos que a própria taxa (≈ 12% a.a. para 1,95% a.m.). CET é a taxa interna
 * de retorno do fluxo — o que o cliente recebe contra as parcelas que paga —,
 * e por isso sempre fica acima da taxa de juros quando há IOF.
 */

/**
 * O ano contra o qual a idade do carro é medida. Muda junto com a tabela de
 * taxas, na mesma revisão — nunca sozinho, pelo relógio.
 */
export const ANO_DE_REFERENCIA_DAS_TAXAS = 2026;

/**
 * As taxas mensais estimadas por perfil — média de mercado, e não taxa de um
 * banco. Decisão do dono em 25/09/2026: "as taxas são estimadas, verifique a
 * média de mercado em pelo menos 5 bancos".
 *
 * Fonte: Banco Central, "Taxas de juros de operações de crédito", modalidade
 * Aquisição de veículos – Prefixado, Pessoa Física (API Olinda `taxaJuros`,
 * `TaxasJurosDiariaPorInicioPeriodo`), média das janelas de 10/07 a
 * 11/09/2026, consultada em 27/09/2026. Doze instituições que financiam
 * seminovo em loja multimarca — ficaram de fora os bancos de montadora (taxa
 * promocional de carro novo da marca) e os regionais:
 *
 *   Caixa 1,05 · Safra 1,69 · Banco do Brasil 1,78 · Santander 1,86 ·
 *   Porto 1,94 · Bradesco Financiamentos 1,95 · C6 1,96 · Itaú 2,06 ·
 *   BV 2,27 · Omni 2,27 · Pan 2,88 · Daycoval 3,24   (% a.m.)
 *
 *   média 2,08 · mediana 1,95 · 1º quartil 1,84 · 3º quartil 2,27
 *
 * Perfil bom fica no 1º quartil, o regular na mediana, o de risco no 3º
 * quartil. O número do BC mistura carro novo e usado, e seminovo costuma sair
 * mais caro que a média — por isso a tela sempre diz que é estimativa e que a
 * taxa depende da análise. Revisar junto com `ANO_DE_REFERENCIA_DAS_TAXAS`.
 */
export const TAXAS_ESTIMADAS = {
  excelente: 0.0184,
  regular: 0.0195,
  risco: 0.0227,
} as const;

/** De quando são as taxas acima — vai no aviso da tela. */
export const REFERENCIA_DAS_TAXAS = "média de 12 bancos, Banco Central, jul–set/2026";

export interface SimulationParams {
  vehiclePrice: number;
  vehicleYear: number;
  downPaymentValue: number;
  installments: number; // e.g., 24, 36, 48, 60
  occupation: "publico" | "aposentado" | "clt" | "autonomo" | "outros";
}

export interface SimulationResult {
  perfil_calculado: "Excelente" | "Regular" | "Risco";
  parcela_mensal: number;
  taxa_aplicada_mes_pct: number;
  valor_liquido_financiado: number;
  valor_com_taxas_e_iof: number;
  total_pago_ao_final: number;
  cet_anual_real_pct: number;
}

export function calculateFinancing(params: SimulationParams): SimulationResult {
  // 1. Base do Financiamento
  const valor_veiculo = params.vehiclePrice;
  const valor_entrada = params.downPaymentValue;
  const meses = params.installments;
  const ocupacao = params.occupation;
  const ano_veiculo = params.vehicleYear;
  
  const valor_financiar_puro = valor_veiculo - valor_entrada;
  const pct_entrada = valor_veiculo > 0 ? (valor_entrada / valor_veiculo) * 100 : 0;
  
  const idade_carro = Math.max(0, ANO_DE_REFERENCIA_DAS_TAXAS - ano_veiculo);
  
  // 2. Sistema de Pontuação para Risco Presumido
  let pontos = 0;
  
  // Pontos Ocupação
  if (["publico", "aposentado"].includes(ocupacao)) {
    pontos += 30;
  } else if (ocupacao === "clt") {
    pontos += 20;
  } else {
    pontos += 10; // Autônomos / Outros
  }
      
  // Pontos Entrada
  if (pct_entrada >= 40) {
    pontos += 40;
  } else if (pct_entrada >= 20) {
    pontos += 20;
  }
  
  // Pontos Idade do Carro
  if (idade_carro <= 0) {
    pontos += 30;
  } else if (idade_carro >= 1 && idade_carro <= 5) {
    pontos += 15;
  }
  
  // 3. Definição da Taxa com base nos Pontos
  let taxa_mensal = 0;
  if (pontos >= 80) {
      taxa_mensal = TAXAS_ESTIMADAS.excelente;
  } else if (pontos >= 45) {
      taxa_mensal = TAXAS_ESTIMADAS.regular;
  } else {
      taxa_mensal = TAXAS_ESTIMADAS.risco;
  }

  // 4. Impostos Reais (IOF Crédito PF)
  // Sem TAC desde 21/09/2026, por ordem do dono: a tarifa de abertura de
  // crédito não é cobrada de pessoa física desde 2008, e o site não soma
  // tarifa nenhuma à estimativa. Tirar os R$ 950 também fecha um defeito
  // antigo: com entrada igual ao preço, a conta financiava a tarifa sozinha
  // e mostrava parcela de um carro já pago.
  const iof_fixo = valor_financiar_puro * 0.0038;
  const dias_iof = Math.min(meses * 30, 365);
  const iof_diario = valor_financiar_puro * (0.000082 * dias_iof); // Alíquota oficial de 0,0082% ao dia
  const iof_total = iof_fixo + iof_diario;
  
  // Valor de cálculo total (Tabela Price)
  const pv = valor_financiar_puro + iof_total;
  
  // 5. Cálculo da Parcela (Tabela Price)
  const i = taxa_mensal;
  const n = meses;
  
  // If no financing needed
  if (pv <= 0) {
    return {
      perfil_calculado: pontos >= 80 ? "Excelente" : pontos >= 45 ? "Regular" : "Risco",
      parcela_mensal: 0,
      taxa_aplicada_mes_pct: taxa_mensal * 100,
      valor_liquido_financiado: 0,
      valor_com_taxas_e_iof: 0,
      total_pago_ao_final: 0,
      cet_anual_real_pct: 0
    };
  }

  const pmt = pv * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
  
  const total_pago = pmt * n;
  const cet_anual = (Math.pow(1 + cetMensal(valor_financiar_puro, pmt, n), 12) - 1) * 100;

  return {
      perfil_calculado: pontos >= 80 ? "Excelente" : pontos >= 45 ? "Regular" : "Risco",
      parcela_mensal: pmt,
      taxa_aplicada_mes_pct: taxa_mensal * 100,
      valor_liquido_financiado: valor_financiar_puro,
      valor_com_taxas_e_iof: pv,
      total_pago_ao_final: total_pago,
      cet_anual_real_pct: cet_anual
  };
}

/**
 * A taxa mensal que iguala o que o cliente recebe (`liberado`) ao valor
 * presente das `n` parcelas — a definição do CET. Bissecção: o valor presente
 * cai conforme a taxa sobe, e 0 a 100% a.m. cercam qualquer financiamento real.
 */
export function cetMensal(liberado: number, parcela: number, n: number): number {
  if (!(liberado > 0) || !(parcela > 0) || !(n > 0)) return 0;
  const valorPresente = (r: number) => (r === 0 ? parcela * n : (parcela * (1 - Math.pow(1 + r, -n))) / r);
  let baixo = 0;
  let alto = 1;
  // 60 bissecções em [0, 1] já passam da precisão de um double.
  for (let k = 0; k < 60; k++) {
    const meio = (baixo + alto) / 2;
    if (valorPresente(meio) > liberado) baixo = meio;
    else alto = meio;
  }
  return (baixo + alto) / 2;
}
