import { describe, it, expect } from "vitest";
import {
  lerHex,
  razaoDeContraste,
  nivelDeContraste,
  formatarRazao,
} from "../src/lib/contraste";
import { THEME_PRESETS } from "../src/app/ThemeContext";

/**
 * Testes da verificação de contraste da tela A2 (aparência e cores).
 *
 * O número que essa conta produz aparece ao lado de cada papel de cor no
 * painel e é o que autoriza — ou desautoriza — publicar uma paleta. Se ele
 * estiver errado, o admin aprova com confiança um par que o cliente não
 * consegue ler.
 *
 * Os valores de referência saem da fórmula da WCAG 2.1, não de arredondamento
 * nosso: preto contra branco é exatamente 21:1, e cor contra ela mesma é 1:1.
 */

describe("lerHex", () => {
  it("aceita as duas formas de hexadecimal", () => {
    expect(lerHex("#ffffff")).toEqual([255, 255, 255]);
    expect(lerHex("#fff")).toEqual([255, 255, 255]);
    expect(lerHex("ec3013")).toEqual([236, 48, 19]);
    expect(lerHex("  #EC3013  ")).toEqual([236, 48, 19]);
  });

  it("devolve null no que não é cor, em vez de improvisar um valor", () => {
    expect(lerHex("")).toBeNull();
    expect(lerHex("vermelho")).toBeNull();
    expect(lerHex("#12345")).toBeNull();
    expect(lerHex("rgb(0,0,0)")).toBeNull();
  });
});

describe("razaoDeContraste", () => {
  it("os dois extremos da escala WCAG", () => {
    expect(razaoDeContraste("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(razaoDeContraste("#7d7979", "#7d7979")).toBeCloseTo(1, 5);
  });

  it("não depende da ordem dos argumentos", () => {
    const ida = razaoDeContraste("#201e1d", "#f3f2f2");
    const volta = razaoDeContraste("#f3f2f2", "#201e1d");
    expect(ida).toBeCloseTo(volta!, 10);
  });

  it("devolve null quando uma das cores não é legível", () => {
    expect(razaoDeContraste("#ffffff", "não-é-cor")).toBeNull();
    expect(razaoDeContraste("", "#000000")).toBeNull();
  });
});

describe("nivelDeContraste", () => {
  it("classifica nos degraus da norma", () => {
    expect(nivelDeContraste(21)).toBe("AAA");
    expect(nivelDeContraste(7)).toBe("AAA");
    expect(nivelDeContraste(6.9)).toBe("AA");
    expect(nivelDeContraste(4.5)).toBe("AA");
    expect(nivelDeContraste(4.4)).toBe("AA GRANDE");
    expect(nivelDeContraste(3)).toBe("AA GRANDE");
    expect(nivelDeContraste(2.9)).toBe("INSUFICIENTE");
  });
});

describe("formatarRazao", () => {
  it("usa vírgula decimal", () => {
    expect(formatarRazao(4.68)).toBe("4,7:1");
    expect(formatarRazao(21)).toBe("21,0:1");
  });
});

describe("as paletas reais do painel", () => {
  it("tinta sobre fundo é legível para texto corrido em toda paleta", () => {
    for (const [nome, tokens] of Object.entries(THEME_PRESETS)) {
      const razao = razaoDeContraste(
        tokens["--brand-foreground"],
        tokens["--brand-background"],
      );
      expect(razao, `paleta ${nome}`).not.toBeNull();
      expect(nivelDeContraste(razao!), `paleta ${nome}`).toBe("AAA");
    }
  });

  it("o acento do Modernist fica na faixa de interface, não na de texto corrido", () => {
    // O readme do design system avisa: o par acento/fundo é afinado para 3:1,
    // que serve a ícones, título grande e cromo de interface — não a parágrafo.
    // O teste trava esse fato para que a tela A2 não passe a exibir o acento
    // como aprovado para texto pequeno.
    const modernist = THEME_PRESETS["motors-modernist"];
    const razao = razaoDeContraste(
      modernist["--brand-primary"],
      modernist["--brand-background"],
    );
    expect(nivelDeContraste(razao!)).toBe("AA GRANDE");
  });
});
