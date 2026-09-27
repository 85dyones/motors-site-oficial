import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";
import {
  ANO_DE_REFERENCIA_DAS_TAXAS,
  calculateFinancing,
  cetMensal,
  TAXAS_ESTIMADAS,
} from "../src/lib/finance-calculator";

/**
 * 21/09/2026, ordem do dono: "remova TAC". A tarifa de abertura de crédito
 * não é cobrada de pessoa física desde 2008, e o simulador somava R$ 950 a
 * todo valor financiado. O valor financiado agora é o saldo mais o IOF.
 */
describe("simulador de financiamento sem TAC", () => {
  const base = {
    vehiclePrice: 60000,
    vehicleYear: new Date().getFullYear() - 3,
    installments: 48,
    occupation: "clt" as const,
  };

  it("o valor com taxas é o saldo mais o IOF, sem tarifa somada", () => {
    const r = calculateFinancing({ ...base, downPaymentValue: 20000 });
    const saldo = 40000;
    const iof = saldo * 0.0038 + saldo * 0.000082 * 365;
    expect(r.valor_liquido_financiado).toBe(saldo);
    expect(r.valor_com_taxas_e_iof).toBeCloseTo(saldo + iof, 6);
  });

  it("entrada igual ao preço não gera parcela", () => {
    const r = calculateFinancing({ ...base, downPaymentValue: 60000 });
    expect(r.parcela_mensal).toBe(0);
    expect(r.valor_com_taxas_e_iof).toBe(0);
  });
});

/**
 * 25/09/2026: taxas pela média de mercado, ano de referência congelado e CET
 * de verdade — ver o topo de `lib/finance-calculator.ts`.
 */
describe("simulador: taxas, ano e CET", () => {
  const base = { vehiclePrice: 60000, downPaymentValue: 20000, installments: 48, occupation: "clt" as const };

  it("as três taxas saem da faixa do mercado, em ordem", () => {
    // Doze bancos, jul–set/2026: de 1,05% (Caixa) a 3,24% (Daycoval) a.m.
    expect(TAXAS_ESTIMADAS.excelente).toBeLessThan(TAXAS_ESTIMADAS.regular);
    expect(TAXAS_ESTIMADAS.regular).toBeLessThan(TAXAS_ESTIMADAS.risco);
    for (const t of Object.values(TAXAS_ESTIMADAS)) {
      expect(t).toBeGreaterThanOrEqual(0.0105);
      expect(t).toBeLessThanOrEqual(0.0324);
    }
  });

  it("o CET fica acima da taxa de juros — IOF entra no custo", () => {
    const r = calculateFinancing({ ...base, vehicleYear: ANO_DE_REFERENCIA_DAS_TAXAS - 3 });
    const jurosAoAno = (Math.pow(1 + r.taxa_aplicada_mes_pct / 100, 12) - 1) * 100;
    expect(r.cet_anual_real_pct).toBeGreaterThan(jurosAoAno);
    // A fórmula antiga dava ≈ 12% a.a. para 1,95% a.m. — abaixo da taxa.
    expect(r.cet_anual_real_pct).toBeGreaterThan(25);
  });

  it("o CET reproduz a parcela: o valor presente das parcelas é o valor liberado", () => {
    const r = calculateFinancing({ ...base, vehicleYear: ANO_DE_REFERENCIA_DAS_TAXAS - 3 });
    const c = cetMensal(r.valor_liquido_financiado, r.parcela_mensal, 48);
    const vp = (r.parcela_mensal * (1 - Math.pow(1 + c, -48))) / c;
    expect(vp).toBeCloseTo(r.valor_liquido_financiado, 2);
  });

  it("a idade do carro conta do ano de referência, e não do relógio", () => {
    // Em 1º de janeiro nenhuma parcela sobe sozinha.
    const codigo = lerCodigo("src/lib/finance-calculator.ts");
    expect(codigo).not.toContain("getFullYear()");
    const r = calculateFinancing({ ...base, downPaymentValue: 30000, vehicleYear: ANO_DE_REFERENCIA_DAS_TAXAS });
    expect(r.perfil_calculado).toBe("Excelente");
  });
});
