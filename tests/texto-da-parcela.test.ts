import { describe, it, expect } from "vitest";
import { ANO_DE_REFERENCIA_DAS_TAXAS, calculateFinancing, PARAMETROS_DE_FABRICA } from "../src/lib/finance-calculator";
import { textoDaParcela, totalAPrazo, type ParcelaParaTexto } from "../src/lib/textoDaParcela";

/**
 * O texto de crédito do site (CDC, art. 54-B, §3º): a parcela nunca vai
 * sozinha — CET, total a prazo com a entrada e o preço à vista vão junto.
 * Revisão de 27/09: a lista "outros" mostrava a parcela sozinha, e o "total"
 * era só a soma das parcelas, escrito ao lado da entrada.
 */

function doSimulador(preco: number, entrada: number, prazo: number, ano: number): ParcelaParaTexto {
  const r = calculateFinancing({ vehiclePrice: preco, vehicleYear: ano, downPaymentValue: entrada, installments: prazo, occupation: "clt" }, PARAMETROS_DE_FABRICA);
  return {
    valor: r.parcela_mensal,
    prazo,
    entrada,
    taxaMes: r.taxa_aplicada_mes_pct,
    cetAno: r.cet_anual_real_pct,
    total: r.total_pago_ao_final,
    aVista: preco,
    taxaVariaMais: ANO_DE_REFERENCIA_DAS_TAXAS - ano > 5,
  };
}

describe("o texto de uma parcela", () => {
  const p = doSimulador(60000, 20000, 48, ANO_DE_REFERENCIA_DAS_TAXAS - 3);
  // O `toLocaleString` separa "R$" do número com espaço inquebrável.
  const semNbsp = (x: string) => x.replace(/\u00a0/g, " ");
  const bruto = textoDaParcela(p);
  const t = { ...bruto, detalhe: semNbsp(bruto.detalhe), compacto: semNbsp(bruto.compacto), parcela: semNbsp(bruto.parcela) };

  it("o total a prazo soma a entrada — e vem com o preço à vista", () => {
    // O caso da revisão: "total R$ 64 mil" ao lado de "entrada R$ 20 mil"
    // parecia R$ 4 mil de custo num carro de R$ 60 mil. São R$ 24 mil.
    expect(totalAPrazo(p)).toBeCloseTo(20000 + p.total, 6);
    expect(totalAPrazo(p)).toBeGreaterThan(84000);
    expect(t.detalhe).toContain(`total a prazo R$ ${Math.round(totalAPrazo(p)).toLocaleString("pt-BR")}`);
    expect(t.detalhe).toContain("(à vista R$ 60.000)");
    expect(t.detalhe).toContain("entrada R$ 20.000");
    expect(t.detalhe).toMatch(/CET \d+,\d% a\.a\./);
    expect(t.detalhe).toMatch(/total das parcelas R\$ [\d.]+/);
  });

  it("a linha curta das listas também leva CET e total a prazo", () => {
    expect(t.compacto).toMatch(/^≈ 48× R\$ [\d.]+ \(CET \d+,\d% a\.a\., total a prazo R\$ [\d.]+\)$/);
  });

  it("entrada que cobre o carro não vira '48× R$ 0'", () => {
    const zero = textoDaParcela(doSimulador(30000, 30000, 48, ANO_DE_REFERENCIA_DAS_TAXAS - 3));
    expect(zero.parcela).not.toMatch(/R\$ 0\b/);
    expect(zero.compacto).not.toMatch(/R\$ 0\b/);
  });

  it("carro com mais de 5 anos avisa que aprovação e taxa variam mais", () => {
    expect(textoDaParcela(doSimulador(40000, 10000, 48, ANO_DE_REFERENCIA_DAS_TAXAS - 12)).cautela).toMatch(/mais de 5 anos/);
    expect(t.cautela).toBeNull();
  });
});
