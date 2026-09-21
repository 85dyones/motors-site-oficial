import { describe, it, expect } from "vitest";
import { calculateFinancing } from "../src/lib/finance-calculator";

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
