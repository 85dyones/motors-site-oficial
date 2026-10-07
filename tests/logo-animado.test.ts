import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import LogoAnimado from "../src/components/marca/LogoAnimado";
import { CSS_DO_LOGO_ANIMADO } from "../src/components/marca/logoAnimadoCss";
import { ROTAS_COM_FECHO } from "../src/lib/fechoComLogo";

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
    // JavaScript da página. O rodapé e o cabeçalho são os candidatos óbvios.
    const culpados = arquivosDe("src")
      .filter((a) => /^["']use client["']/m.test(ler(a)))
      .filter((a) => /from\s+["'][^"']*marca\/(LogoAnimado|FechoComLogo)["']/.test(ler(a)));
    expect(culpados).toEqual([]);
  });

  it("o layout raiz não importa o logo: ele não vai no HTML de toda página", () => {
    expect(ler("src/app/layout.tsx")).not.toMatch(/marca\/(LogoAnimado|FechoComLogo)/);
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

describe("o fecho com o logo e o rodapé andam juntos", () => {
  const PAGINA_DA_ROTA: Record<string, string> = {
    "/": "src/app/page.tsx",
    "/sobre": "src/app/sobre/page.tsx",
  };

  it("toda rota da lista desenha o fecho, e só elas", () => {
    expect([...ROTAS_COM_FECHO].sort()).toEqual(Object.keys(PAGINA_DA_ROTA).sort());
    const comFecho = arquivosDe("src/app").filter((a) => /<FechoComLogo \/>/.test(ler(a)));
    expect(comFecho.sort()).toEqual(Object.values(PAGINA_DA_ROTA).sort());
  });

  it("o rodapé lê a mesma lista para tirar o logo pequeno", () => {
    const rodape = ler("src/components/Footer.tsx");
    expect(rodape).toMatch(/ROTAS_COM_FECHO\.includes\(usePathname\(\)/);
    expect(rodape).toMatch(/\{!comFecho && \(/);
  });
});
