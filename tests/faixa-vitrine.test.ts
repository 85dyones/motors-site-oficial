import { describe, it, expect } from "vitest";
import { inicioDaPagina, paginaDaFaixa } from "../src/lib/faixaVitrine";

/**
 * A vitrine roda sozinha numa TV o dia inteiro, sem ninguém olhando o
 * console. O que estes testes travam é a única coisa que quebraria em
 * silêncio: o carro grande na tela sair da faixa listada embaixo.
 */

const CARROS = ["a", "b", "c", "d", "e", "f", "g"]; // sete, como a curadoria real

describe("inicioDaPagina", () => {
  it("vira a página exatamente na fronteira", () => {
    expect(inicioDaPagina(0, 4)).toBe(0);
    expect(inicioDaPagina(3, 4)).toBe(0);
    expect(inicioDaPagina(4, 4)).toBe(4);
    expect(inicioDaPagina(7, 4)).toBe(4);
    expect(inicioDaPagina(8, 4)).toBe(8);
  });
});

describe("paginaDaFaixa", () => {
  it("a primeira página são os quatro primeiros, sem vazias", () => {
    const { inicio, visiveis, vazias } = paginaDaFaixa(CARROS, 1, 4);
    expect(inicio).toBe(0);
    expect(visiveis).toEqual(["a", "b", "c", "d"]);
    expect(vazias).toBe(0);
  });

  it("a última página completa com células vazias em vez de esticar", () => {
    const { inicio, visiveis, vazias } = paginaDaFaixa(CARROS, 5, 4);
    expect(inicio).toBe(4);
    expect(visiveis).toEqual(["e", "f", "g"]);
    expect(vazias).toBe(1);
    expect(visiveis.length + vazias).toBe(4);
  });

  it("o carro em exibição está SEMPRE na faixa visível", () => {
    // A invariante que dá razão a este arquivo, varrida em todo tamanho de
    // curadoria que a loja pode montar.
    for (let total = 1; total <= 20; total++) {
      const itens = Array.from({ length: total }, (_, i) => i);
      for (let atual = 0; atual < total; atual++) {
        const { visiveis } = paginaDaFaixa(itens, atual, 4);
        expect(visiveis, `total ${total}, atual ${atual}`).toContain(atual);
      }
    }
  });

  it("a página nunca passa de quatro células, cheias ou vazias", () => {
    for (let total = 1; total <= 20; total++) {
      const itens = Array.from({ length: total }, (_, i) => i);
      for (let atual = 0; atual < total; atual++) {
        const { visiveis, vazias } = paginaDaFaixa(itens, atual, 4);
        expect(visiveis.length + vazias).toBe(4);
      }
    }
  });

  it("curadoria menor que uma página não quebra", () => {
    const { visiveis, vazias } = paginaDaFaixa(["a", "b"], 0, 4);
    expect(visiveis).toEqual(["a", "b"]);
    expect(vazias).toBe(2);
  });
});
