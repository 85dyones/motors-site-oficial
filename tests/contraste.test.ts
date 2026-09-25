import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

/**
 * Os tokens de texto pequeno do Modernist, contra TODAS as paletas do painel.
 *
 * Em 25/09 a auditoria da Vercel apontou ~490 nós com contraste abaixo de
 * 4,5:1: o neutral-600 (58% da tinta) ficava em 4,2:1 sobre o fundo, e a
 * numeração "01 02 03" em acento puro ficava em 3,3:1 sobre o fundo escuro.
 * Os dois tokens são derivados (`color-mix`) da paleta ativa, e a paleta é
 * trocada no painel — por isso a conta roda para cada preset, com o número
 * lido do próprio CSS: mudar a porcentagem sem refazer a conta fica vermelho.
 */
describe("texto pequeno do Modernist em toda paleta", () => {
  const css = readFileSync(join(__dirname, "..", "src/app/modernist.css"), "utf8");

  /** `color-mix(in srgb, A p%, B)` de cores opacas: interpolação canal a canal. */
  function misturar(a: string, b: string, p: number): string {
    const [ca, cb] = [lerHex(a)!, lerHex(b)!];
    return "#" + ca.map((v, i) => Math.round(v * p + cb[i] * (1 - p)).toString(16).padStart(2, "0")).join("");
  }

  function porcentagem(token: string): number {
    const m = new RegExp(`${token}:\\s*color-mix\\(in srgb, var\\(--mt-(?:ink|accent)\\) (\\d+)%`).exec(css);
    expect(m, `${token} não é mais um color-mix lido por este teste`).not.toBeNull();
    return Number(m![1]) / 100;
  }

  it("o neutral-600 derivado passa de 4,5:1 sobre o fundo e o cartão", () => {
    const p = porcentagem("--mt-neutral-600");
    for (const [nome, t] of Object.entries(THEME_PRESETS)) {
      const cor = misturar(t["--brand-foreground"], t["--brand-background"], p);
      for (const fundo of ["--brand-background", "--brand-card"] as const) {
        const razao = razaoDeContraste(cor, t[fundo])!;
        expect(razao, `paleta ${nome}, ${cor} sobre ${fundo} ${t[fundo]}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("o neutral-600 fixo do preset Modernist também passa", () => {
    const m = /\[data-theme="motors-modernist"\][\s\S]*?--mt-neutral-600:\s*(#[0-9a-f]{6})/i.exec(css);
    expect(m, "preset sem --mt-neutral-600 fixo").not.toBeNull();
    const modernist = THEME_PRESETS["motors-modernist"];
    for (const fundo of ["--brand-background", "--brand-card"] as const) {
      expect(razaoDeContraste(m![1], modernist[fundo])!).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("o acento sobre o fundo escuro passa de 4,5:1 com qualquer acento", () => {
    const p = porcentagem("--mt-accent-inverso");
    const fundoEscuro = /--mt-inverso-fundo:\s*(#[0-9a-f]{6})/i.exec(css)![1];
    for (const [nome, t] of Object.entries(THEME_PRESETS)) {
      const cor = misturar(t["--brand-primary"], "#ffffff", p);
      expect(razaoDeContraste(cor, fundoEscuro)!, `paleta ${nome}, ${cor} sobre ${fundoEscuro}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
