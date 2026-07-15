/**
 * Finance Calculator Engine
 * Calculates simulated vehicle financing parcels based on realistic coefficient matrices.
 */

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
  
  const currentYear = new Date().getFullYear();
  const idade_carro = Math.max(0, currentYear - ano_veiculo);
  
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
      taxa_mensal = 0.0145;  // Excelente (1.45% a.m.)
  } else if (pontos >= 45) {
      taxa_mensal = 0.0195;  // Médio / Regular (1.95% a.m.)
  } else {
      taxa_mensal = 0.0265;  // Risco Alto (2.65% a.m.)
  }

  // 4. Impostos Reais (IOF Crédito PF)
  const tac = 950.00;  // Tarifa média de Cadastro do mercado
  const iof_fixo = valor_financiar_puro * 0.0038;
  const dias_iof = Math.min(meses * 30, 365);
  const iof_diario = valor_financiar_puro * (0.000082 * dias_iof); // Alíquota oficial de 0,0082% ao dia
  const iof_total = iof_fixo + iof_diario;
  
  // Valor de cálculo total (Tabela Price)
  const pv = valor_financiar_puro + tac + iof_total;
  
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
  const cet_mensal = Math.pow(total_pago / valor_financiar_puro, 1 / n) - 1;
  const cet_anual = (Math.pow(1 + cet_mensal, 12) - 1) * 100;

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
