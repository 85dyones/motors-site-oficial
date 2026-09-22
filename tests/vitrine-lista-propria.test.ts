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
 *
 * ---------------------------------------------------------------------------
 * A herança mudou de endereço em 22/09 — e estas asserções foram junto
 * ---------------------------------------------------------------------------
 * Este bloco lia `src/app/vitrine/page.tsx`, porque era lá que a queda estava
 * escrita. Estava escrita SÓ lá, e esse era o defeito: os outros dois
 * consumidores (a tela de curadoria e a tabela de estoque) liam o campo cru,
 * mostravam a TV como vazia e a primeira publicação gravava `[]` por cima dos
 * 4 carros que estavam no ar no showroom. A queda passou para
 * `idsDaTvComHeranca`, em `src/lib/destaquesDoPainel.ts`, e o invariante
 * vigiado aqui é o MESMO — lista própria primeiro, herança depois. Quem cobra
 * que os três consumidores chamem a função é
 * `tests/lista-da-tv-uma-casa-so.test.ts`.
 */
describe("a TV lê a lista dela", () => {
  const casaDaHeranca = lerCodigo("src/lib/destaquesDoPainel.ts");

  it("prefere a lista própria", () => {
    expect(casaDaHeranca).toMatch(/settings\.vitrineTv/);
  });

  it("cai na herança do banner enquanto a linha nova não existe", () => {
    expect(casaDaHeranca).toMatch(/settings\.carouselVehicleIds/);
  });

  it("a preferência vem ANTES da herança", () => {
    const iPropria = casaDaHeranca.indexOf("settings.vitrineTv");
    const iHeranca = casaDaHeranca.indexOf("settings.carouselVehicleIds");
    expect(iPropria).toBeGreaterThanOrEqual(0);
    expect(iPropria).toBeLessThan(iHeranca);
  });

  it("a régua é `Array.isArray`, e não truthiness", () => {
    // `[]` é truthy e `[]` é falsy-em-intenção ao mesmo tempo: array vazio é
    // "o operador esvaziou a lista de propósito", não "a linha não existe".
    // Trocar a régua por `settings.vitrineTv ??` ou `if (settings.vitrineTv)`
    // faria a lista própria vazia herdar o banner — desfazendo na cara do
    // operador a decisão que ele acabou de publicar.
    expect(casaDaHeranca).toMatch(/Array\.isArray\(settings\.vitrineTv\)/);
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
