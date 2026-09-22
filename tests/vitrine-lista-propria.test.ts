import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";

/**
 * Uma lista servia a duas superfícies com capacidades diferentes: o banner da
 * home (teto de 3, agora 4) e a TV do showroom (sem teto). Era impossível
 * curá-la bem para as duas — e o sintoma medido em 21/09 foi uma lista de 9
 * ids com 5 carros mortos dentro.
 *
 * A separação é por FALLBACK DE LEITURA, sem migração: enquanto `vitrine_tv`
 * não existir no banco, a TV mostra exatamente o que mostra hoje. A primeira
 * publicação na tela nova cria a linha e aposenta a herança.
 */
describe("a TV lê a lista dela", () => {
  const vitrine = lerCodigo("src/app/vitrine/page.tsx");

  it("prefere a lista própria", () => {
    expect(vitrine).toMatch(/settings\.vitrineTv/);
  });

  it("cai na herança do banner enquanto a linha nova não existe", () => {
    expect(vitrine).toMatch(/carouselVehicleIds/);
  });

  it("a preferência vem ANTES da herança", () => {
    const iPropria = vitrine.indexOf("vitrineTv");
    const iHeranca = vitrine.indexOf("carouselVehicleIds");
    expect(iPropria).toBeGreaterThanOrEqual(0);
    expect(iPropria).toBeLessThan(iHeranca);
  });
});

describe("a fiação do campo novo", () => {
  it("settings lê a linha vitrine_tv", () => {
    const settings = lerCodigo("src/lib/settings.ts");
    expect(settings).toMatch(/"vitrine_tv"/);
    expect(settings).toMatch(/vitrineTv,/);
  });

  it("a rota aceita e grava o campo", () => {
    const rota = lerCodigo("src/app/api/settings/route.ts");
    expect(rota).toMatch(/vitrineTv/);
    expect(rota).toMatch(/id: "vitrine_tv"/);
  });
});
