import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import LogoAnimado from "../src/components/marca/LogoAnimado";
import { CSS_DO_LOGO_ANIMADO } from "../src/components/marca/logoAnimadoCss";

/**
 * O logo animado (07/10/2026) entrou com uma condição do dono: não pesar no
 * carregamento. Estas travas seguram o que sustenta essa condição.
 *
 * O que este arquivo NÃO prova: que a animação está bonita, nem que os quadros
 * batem com o projeto de design. Isso foi conferido quadro a quadro no
 * navegador, e só olho confere. Também não prova o `LogoAoEntrarNaTela`: o
 * `IntersectionObserver` não existe no jsdom.
 */

const raiz = join(__dirname, "..");
const ler = (caminho: string) => readFileSync(join(raiz, caminho), "utf8");

function arquivosDe(pasta: string): string[] {
  return readdirSync(join(raiz, pasta)).flatMap((nome) => {
    const caminho = `${pasta}/${nome}`;
    if (statSync(join(raiz, caminho)).isDirectory()) return arquivosDe(caminho);
    return /\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

describe("logo animado: o peso", () => {
  it("o desenho é componente de servidor", () => {
    expect(ler("src/components/marca/LogoAnimado.tsx")).not.toMatch(/^["']use client["']/m);
  });

  it("nenhum componente de cliente importa o desenho", () => {
    // Importado por um "use client", os caminhos do SVG iriam para o
    // JavaScript da página. O rodapé e o cabeçalho são os candidatos óbvios:
    // por isso recebem o logo pronto, por prop, do layout.
    const culpados = arquivosDe("src")
      .filter((a) => /^["']use client["']/m.test(ler(a)))
      .filter((a) => /from\s+["'][^"']*marca\/(LogoAnimado|usosDoLogo)["']/.test(ler(a)));
    expect(culpados).toEqual([]);
    const layout = ler("src/app/layout.tsx");
    expect(layout).toMatch(/logo=\{<LogoDaBarra /);
    expect(layout).toMatch(/logoCompacto=\{<LogoDaBarra /);
    expect(layout).toMatch(/logo=\{<LogoDoRodape \/>\}/);
  });

  it("o logo que vai em toda página é o simples, e pesa menos da metade", () => {
    // Cabeçalho (dois, um por largura) e rodapé: três cópias no HTML de toda
    // página.
    const usos = ler("src/components/marca/usosDoLogo.tsx");
    for (const uso of ["LogoDaBarra", "LogoDoRodape"]) {
      const corpo = usos.slice(usos.indexOf(`export function ${uso}`)).split("\nexport function")[0];
      expect(corpo, uso).toMatch(/<LogoAnimado[^>]*\ssimples\s/);
    }
    const svg = (props: object) => renderToStaticMarkup(createElement(LogoAnimado, props)).replace(/<style[\s\S]*?<\/style>/, "");
    expect(svg({ simples: true }).length).toBeLessThan(4.5 * 1024);
    expect(svg({ simples: true })).not.toMatch(/<filter|<clipPath|la-brilho/);
  });

  it("não existe folha de estilo própria: o CSS vai dentro do HTML", () => {
    expect(arquivosDe("src/components/marca").some((a) => a.endsWith(".css"))).toBe(false);
    expect(readdirSync(join(raiz, "src/components/marca")).filter((a) => a.endsWith(".css"))).toEqual([]);
  });

  it("desenho e estilo, juntos, ficam abaixo de 13 KB de HTML", () => {
    // Medido em 07/10/2026: 7,4 KB de SVG e 4,8 KB de CSS, ~3 KB comprimidos.
    const html = renderToStaticMarkup(createElement(LogoAnimado, {}));
    expect(html.length).toBeLessThan(13 * 1024);
    expect(CSS_DO_LOGO_ANIMADO.length).toBeLessThan(5.5 * 1024);
  });
});

describe("logo animado: parado, é o logo pronto", () => {
  it("sem `tocar`, o HTML sai sem `data-la`", () => {
    const html = renderToStaticMarkup(createElement(LogoAnimado, { tema: "escuro" }));
    expect(html).not.toMatch(/<div[^>]*data-la=/);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Motors Store"');
  });

  it("com `tocar`, já sai tocando, sem esperar JavaScript", () => {
    const html = renderToStaticMarkup(createElement(LogoAnimado, { tocar: true }));
    expect(html).toContain('data-la="tocando"');
  });

  it("toda regra que anima ou pausa depende de `[data-la]`", () => {
    const semQuadros = CSS_DO_LOGO_ANIMADO.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
    const regras = [...semQuadros.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const animam = regras.filter(([, , corpo]) => /animation(-[a-z-]+)?:/.test(corpo) && !/^\s*@media/.test(corpo));
    expect(animam.length).toBeGreaterThan(10);
    for (const [, seletor] of animam) {
      for (const parte of seletor.split(",")) expect(parte).toContain("[data-la");
    }
  });

  it("o que nasce invisível é só a luz, nunca uma peça do logo", () => {
    const escondidas = [...CSS_DO_LOGO_ANIMADO.matchAll(/([^{}]+)\{opacity:0\}/g)].flatMap(([, s]) => s.split(","));
    // Os passos dos quadros ("0%,39.02%{opacity:0}") casam com a mesma forma.
    const pecas = escondidas.filter((s) => s.startsWith("."));
    expect(pecas.sort()).toEqual([".la-brilho", ".la-fresta", ".la-halo", ".la-luz", ".la-traco"]);
  });

  it("quem pediu menos movimento não recebe animação", () => {
    expect(CSS_DO_LOGO_ANIMADO).toMatch(
      /@media \(prefers-reduced-motion:reduce\)\{[^}]*\{animation:none !important/,
    );
  });

  it("o enxugamento do CSS não cola o que precisa de espaço", () => {
    expect(CSS_DO_LOGO_ANIMADO).not.toContain("/*");
    expect(CSS_DO_LOGO_ANIMADO).toContain("html:not(.dark) .la[data-tema=\"auto\"]");
    expect(CSS_DO_LOGO_ANIMADO).toContain("calc(var(--la-dur) * var(--la-i) * 0.00732)");
    expect(CSS_DO_LOGO_ANIMADO).toContain(".la[data-la] svg *");
  });

  it("dois logos na mesma página não dividem o id do degradê", () => {
    const html = renderToStaticMarkup(
      createElement("div", null, createElement(LogoAnimado, { tema: "escuro" }), createElement(LogoAnimado, { tema: "claro" })),
    );
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("onde o logo aparece", () => {
  it("o grande fica só na entrada de /sobre, antes do conteúdo", () => {
    const comAbertura = arquivosDe("src/app").filter((a) => /<AberturaDaMotors \/>/.test(ler(a)));
    expect(comAbertura).toEqual(["src/app/sobre/page.tsx"]);
    const sobre = ler("src/app/sobre/page.tsx");
    expect(sobre.indexOf("<AberturaDaMotors />")).toBeLessThan(sobre.indexOf("<SobreClientWrapper"));
  });

  it("cabeçalho e rodapé seguem inteiros sem o logo animado", () => {
    // Os testes de renderização dos dois não passam o logo: o SVG parado
    // continua sendo o que aparece quando a prop falta.
    expect(ler("src/components/Header.tsx")).toMatch(/\{logo \? \(\s*logo\s*\) : !usarFallbackTextual \? \(/);
    expect(ler("src/components/Footer.tsx")).toMatch(/\{logo \?\? \(/);
  });
});
