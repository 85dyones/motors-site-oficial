import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { lerCodigo } from "./fonte";
import { PARAMETROS_DE_FABRICA } from "../src/lib/finance-calculator";
import { AVISO_DA_SIMULACAO } from "../src/lib/textoDaParcela";

/**
 * O simulador da ficha — tarefa 2.5 da revisão de UI de 29/09/2026.
 *
 * Três defeitos de hierarquia: a parcela, na cor de ação e a 38 px, competia
 * com o preço à vista; o aviso de crédito ia espremido em oito linhas de 11 px
 * na coluna da parcela; e o texto sobre as taxas ocupava cinco linhas antes do
 * primeiro controle no celular.
 *
 * O que NÃO pode ser recolhido é o que a lei pede junto da oferta: CET, total a
 * prazo, o aviso de que não é oferta e o agente financiador. Esse texto tem que
 * estar fora do `<details>`.
 */

async function desenhar(): Promise<string> {
  const { default: CalculadoraFinanciamento } = await import("../src/components/CalculadoraFinanciamento");
  return renderToStaticMarkup(
    createElement(CalculadoraFinanciamento, {
      vehicleId: "1",
      vehiclePrice: 89900,
      vehicleYear: 2021,
      vehicleName: "Jeep Renegade",
      parametros: PARAMETROS_DE_FABRICA,
      onSimulateClick: () => {},
    }),
  );
}

const pxDe = (classe: string, prefixo = "") =>
  Number(classe.match(new RegExp(`(?:^|\\s)${prefixo}text-\\[(\\d+)px\\]`))?.[1] ?? NaN);

describe("a parcela fica abaixo do preço à vista", () => {
  it("em tinta, não na cor de ação", async () => {
    const html = await desenhar();
    const classe = html.match(/data-numero="parcela" class="([^"]*)"/)?.[1] ?? "";
    expect(classe).toContain("text-mt-ink");
    expect(classe).not.toContain("text-mt-accent");
  });

  it("menor que o preço, no celular e no desktop", async () => {
    const parcela = (await desenhar()).match(/data-numero="parcela" class="([^"]*)"/)?.[1] ?? "";
    // O preço da coluna lateral da ficha, lido da fonte: é ele a régua.
    const pdp = lerCodigo("src/components/PDPClientWrapper.tsx");
    const preco = pdp.slice(pdp.lastIndexOf("<div", pdp.indexOf("{formatPrice(finalPrice)}")), pdp.indexOf("{formatPrice(finalPrice)}"));
    const precoCelular = pxDe(preco);
    const precoDesktop = pxDe(preco, "lg:");
    expect(precoCelular).toBeGreaterThan(0);
    expect(pxDe(parcela)).toBeLessThan(precoCelular);
    expect(pxDe(parcela, "lg:")).toBeLessThan(precoDesktop);
  });
});

describe("o texto legal", () => {
  it("o aviso de crédito e os bancos ficam à mostra, a 12 px, fora do recolhível", async () => {
    const html = await desenhar();
    const fora = html.replace(/<details[\s\S]*?<\/details>/g, "");
    expect(fora).toContain(AVISO_DA_SIMULACAO);
    expect(fora).toContain("Bancos parceiros:");
    expect(fora).toContain("CET");
    const aviso = html.match(/<p class="([^"]*)">Simulação, não é oferta/)?.[1] ?? "";
    expect(pxDe(aviso)).toBe(12);
  });

  it("como a taxa é estimada fica num <details>, fechado por padrão", async () => {
    const html = await desenhar();
    const detalhes = html.match(/<details[^>]*>([\s\S]*?)<\/details>/);
    expect(detalhes).not.toBeNull();
    expect(detalhes![0]).not.toMatch(/<details[^>]*\sopen/);
    expect(detalhes![1]).toContain("Valores incluem IOF");
    expect(detalhes![1]).toContain(`Taxas estimadas pela ${PARAMETROS_DE_FABRICA.fonteDasTaxas}`);
  });
});

describe("os botões de prazo", () => {
  it("dizem qual está escolhido e têm altura de toque", async () => {
    const html = await desenhar();
    expect(html).toMatch(/role="group" aria-labelledby="calc-prazo"/);
    const botoes = [...html.matchAll(/<button type="button" aria-pressed="(true|false)" class="([^"]*)">(\d+)×<\/button>/g)];
    expect(botoes.map((b) => b[3])).toEqual(["24", "36", "48", "60"]);
    expect(botoes.filter((b) => b[1] === "true").map((b) => b[3])).toEqual(["48"]);
    for (const b of botoes) expect(b[2]).toContain("h-11");
  });
});
