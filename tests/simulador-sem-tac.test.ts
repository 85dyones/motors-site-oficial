import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ANO_DE_REFERENCIA_DAS_TAXAS,
  calculateFinancing,
  cetMensal,
  PARAMETROS_DE_FABRICA,
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
    const r = calculateFinancing({ ...base, downPaymentValue: 20000 }, PARAMETROS_DE_FABRICA);
    const saldo = 40000;
    const iof = saldo * 0.0038 + saldo * 0.000082 * 365;
    expect(r.valor_liquido_financiado).toBe(saldo);
    expect(r.valor_com_taxas_e_iof).toBeCloseTo(saldo + iof, 6);
  });

  it("entrada igual ao preço não gera parcela", () => {
    const r = calculateFinancing({ ...base, downPaymentValue: 60000 }, PARAMETROS_DE_FABRICA);
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it("as três taxas saem da faixa do mercado, em ordem", () => {
    // Dezoito instituições, jul–set/2026: de 1,05% (Caixa) a 3,34% (Omni CFI) a.m.
    expect(TAXAS_ESTIMADAS.excelente).toBeLessThan(TAXAS_ESTIMADAS.regular);
    expect(TAXAS_ESTIMADAS.regular).toBeLessThan(TAXAS_ESTIMADAS.risco);
    for (const t of Object.values(TAXAS_ESTIMADAS)) {
      expect(t).toBeGreaterThanOrEqual(0.0105);
      expect(t).toBeLessThanOrEqual(0.0334);
    }
  });

  it("o CET fica acima da taxa de juros — IOF entra no custo", () => {
    const r = calculateFinancing({ ...base, vehicleYear: ANO_DE_REFERENCIA_DAS_TAXAS - 3 }, PARAMETROS_DE_FABRICA);
    const jurosAoAno = (Math.pow(1 + r.taxa_aplicada_mes_pct / 100, 12) - 1) * 100;
    expect(r.cet_anual_real_pct).toBeGreaterThan(jurosAoAno);
    // A fórmula antiga dava ≈ 12% a.a. para 1,95% a.m. — abaixo da taxa.
    expect(r.cet_anual_real_pct).toBeGreaterThan(25);
  });

  it("o CET bate com um cálculo feito por fora", () => {
    // R$ 60 mil, R$ 20 mil de entrada, 48×, CLT, carro de 3 anos: 1,95% a.m.
    // Conferido na revisão de 27/09 por Newton sobre o fluxo (+liberado,
    // −parcela × 48): parcela R$ 1.334,38 e CET 28,528% a.a. — um valor fixo,
    // e não a mesma fórmula da implementação.
    const r = calculateFinancing({ ...base, vehicleYear: ANO_DE_REFERENCIA_DAS_TAXAS - 3 }, PARAMETROS_DE_FABRICA);
    expect(r.parcela_mensal).toBeCloseTo(1334.38, 2);
    expect(r.cet_anual_real_pct).toBeCloseTo(28.528, 2);
    expect(cetMensal(40000, 1334.38, 48)).toBeCloseTo(Math.pow(1.28528, 1 / 12) - 1, 5);
  });

  it("a idade do carro conta do ano de referência, e não do relógio", () => {
    // Em 1º de janeiro nenhuma parcela sobe sozinha: a mesma simulação na
    // véspera e no dia seguinte, com o relógio fingido.
    const simular = () =>
      calculateFinancing({ ...base, vehicleYear: ANO_DE_REFERENCIA_DAS_TAXAS - 5 }, PARAMETROS_DE_FABRICA).parcela_mensal;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${ANO_DE_REFERENCIA_DAS_TAXAS}-12-31T12:00:00Z`));
    const vespera = simular();
    vi.setSystemTime(new Date(`${ANO_DE_REFERENCIA_DAS_TAXAS + 1}-01-02T12:00:00Z`));
    expect(simular()).toBe(vespera);
  });
});
