import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PADRAO from "../src/lib/aboutSettings.json";
import type { AboutSettings } from "../src/types";
import { lerCodigo } from "./fonte";

/**
 * O texto do /sobre sai do SERVIDOR (30/09/2026). Até ali o HTML vinha com o
 * `aboutSettings.json` de fábrica e só trocava pelo texto do painel depois de
 * `/api/settings` responder no navegador: o buscador lia o texto velho e o
 * visitante via o velho piscar antes do novo.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));
vi.mock("../src/app/ThemeContext", () => ({
  useTheme: () => ({ aboutSettings: PADRAO, companySettings: { name: "Motors Store" } }),
}));
vi.mock("../src/lib/telemetry", () => ({ trackContactClick: () => {} }));

describe("o /sobre renderiza o texto do painel no servidor", () => {
  it("com o texto vindo da página, é ele que sai no HTML, e não o de fábrica", async () => {
    const { default: SobreClientWrapper } = await import("../src/components/SobreClientWrapper");
    const doPainel = { ...PADRAO, heroTitle: "TITULO-DO-PAINEL" } as AboutSettings;
    const html = renderToStaticMarkup(createElement(SobreClientWrapper, { sobre: doPainel }));
    expect(html).toContain("TITULO-DO-PAINEL");
    expect(html).not.toContain(PADRAO.heroTitle);
  });

  it("sem o texto da página (leitura falhou), cai no do contexto", async () => {
    const { default: SobreClientWrapper } = await import("../src/components/SobreClientWrapper");
    const html = renderToStaticMarkup(createElement(SobreClientWrapper, { sobre: null }));
    expect(html).toContain(PADRAO.heroTitle);
  });

  it("a página passa o texto que leu", () => {
    const pagina = lerCodigo("src/app/sobre/page.tsx");
    expect(pagina).toMatch(/\{ companySettings, aboutSettings \}/);
    expect(pagina).toMatch(/sobre=\{aboutSettings\}/);
    expect(pagina).toMatch(/empresa=\{companySettings\}/);
  });
});
