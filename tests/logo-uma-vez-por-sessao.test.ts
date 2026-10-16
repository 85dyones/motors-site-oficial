// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { ATRIBUTO_LOGO_VISTO, CHAVE_LOGO_VISTO, scriptAntiFlicker } from "../src/lib/temas";
import { ler, lerCodigo } from "./fonte";

/**
 * A abertura do logo toca uma vez por sessão — 16/10/2026.
 *
 * A sequência de 8,2 s (filtros SVG, brilho, varredura) tocava em toda carga
 * de página. Medido no celular lento: 129 animações ativas na carga da home
 * e ~0,6 s a mais de thread bloqueada do que com movimento reduzido. A
 * primeira página da sessão continua tendo a abertura; as seguintes nascem
 * com o logo pronto, antes da primeira pintura.
 */

const rodar = () => new Function(scriptAntiFlicker())();

describe("o script da paleta marca quem já viu a abertura", () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.documentElement.removeAttribute(ATRIBUTO_LOGO_VISTO);
  });

  it("na primeira página da sessão não marca nada — a abertura toca", () => {
    rodar();
    expect(document.documentElement.hasAttribute(ATRIBUTO_LOGO_VISTO)).toBe(false);
    expect(sessionStorage.getItem(CHAVE_LOGO_VISTO)).toBe("1");
  });

  it("na segunda página o <html> nasce com o atributo", () => {
    rodar();
    rodar();
    expect(document.documentElement.hasAttribute(ATRIBUTO_LOGO_VISTO)).toBe(true);
  });

  it("é `sessionStorage`, não `localStorage`: fechar a aba zera", () => {
    expect(scriptAntiFlicker()).toContain(`sessionStorage.getItem('${CHAVE_LOGO_VISTO}')`);
    expect(scriptAntiFlicker()).not.toContain(`localStorage.getItem('${CHAVE_LOGO_VISTO}')`);
  });

  it("a paleta é aplicada mesmo com o armazenamento quebrado", () => {
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage")!;
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("bloqueado");
      },
    });
    try {
      expect(() => rodar()).not.toThrow();
      expect(document.documentElement.getAttribute("data-theme")).toBeTruthy();
    } finally {
      Object.defineProperty(window, "sessionStorage", original);
    }
  });
});

describe("o CSS e o componente respeitam a marca", () => {
  it("o CSS tira a abertura de `html[data-logo-visto]`, e só enquanto o logo não é parado", () => {
    const css = ler("src/app/modernist.css");
    expect(css).toMatch(/html\[data-logo-visto\] \.mt-logo:not\(\[data-logo="parado"\]\) \* \{\s*animation: none;\s*\}/);
  });

  it("o componente lê a marca pelo useSyncExternalStore e fica no parado — sem setState em efeito", () => {
    const fonte = lerCodigo("src/components/modernist/LogoAnimado.tsx");
    expect(fonte).toContain('hasAttribute("data-logo-visto")');
    expect(fonte).toContain("useSyncExternalStore(semInscricao, lerVisto, naoVisto)");
    expect(fonte).toMatch(/const estado: Estado = visto \? "parado" : estadoDaAbertura;/);
  });

  it("o atributo e a chave têm uma fonte só", () => {
    expect(ATRIBUTO_LOGO_VISTO).toBe("data-logo-visto");
    expect(ler("src/app/modernist.css")).toContain(`[${ATRIBUTO_LOGO_VISTO}]`);
  });
});
