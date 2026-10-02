import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { minutosDeLeitura } from "../src/lib/blocosDoGuia";
import { GUIA_DE_ENTRADA, GUIAS_CONHECIDOS, proximosNoTema, temaDoGuia } from "../src/lib/guiasNoSite";

/**
 * O redesenho dos guias (aprovado pelo dono em 02/10/2026): índice com abertura
 * escura, guia de entrada e temas numerados; guia com tema, tempo de leitura,
 * seções numeradas e "Continue neste tema".
 */

const ler = (...c: string[]) => readFileSync(join(__dirname, "..", ...c), "utf8");

describe("o tema e a continuação da leitura", () => {
  it("o guia de entrada existe entre os conhecidos", () => {
    expect(GUIAS_CONHECIDOS[GUIA_DE_ENTRADA]).toBeDefined();
  });

  it("o tema traz o número da ordem do índice", () => {
    expect(temaDoGuia("laudo-cautelar-carro-usado")).toEqual({ numero: 1, titulo: "Procedência e perícia cautelar" });
    expect(temaDoGuia("carro-na-troca")?.numero).toBe(4);
    expect(temaDoGuia("guia-que-nao-existe")).toBeNull();
  });

  it("continua no MESMO tema, na ordem, dando a volta, e nunca no próprio guia", () => {
    for (const slug of Object.keys(GUIAS_CONHECIDOS)) {
      const seguintes = proximosNoTema(slug);
      expect(seguintes, slug).not.toContain(slug);
      expect(seguintes.length, slug).toBe(3);
      for (const s of seguintes) expect(GUIAS_CONHECIDOS[s].grupo, slug).toBe(GUIAS_CONHECIDOS[slug].grupo);
    }
    expect(proximosNoTema("laudo-cautelar-carro-usado")[0]).toBe("o-que-reprova-pericia-cautelar");
    // O último do tema volta para o primeiro.
    expect(proximosNoTema("carro-reprovado-cautelar-como-vender")[0]).toBe("laudo-cautelar-carro-usado");
    expect(proximosNoTema("guia-que-nao-existe")).toEqual([]);
  });
});

describe("o tempo de leitura", () => {
  it("200 palavras por minuto, arredondado para cima, nunca zero", () => {
    const palavras = (n: number) => Array.from({ length: n }, () => "carro").join(" ");
    expect(minutosDeLeitura({ corpo: [{ titulo: "", paragrafos: [palavras(200)] }], faq: [] })).toBe(1);
    expect(minutosDeLeitura({ corpo: [{ titulo: "", paragrafos: [palavras(201)] }], faq: [] })).toBe(2);
    expect(minutosDeLeitura({ corpo: [], faq: [] })).toBe(1);
  });
});

describe("o índice", () => {
  const GRUPOS = [
    { titulo: "Tema A", resumo: "Resumo A", guias: [{ slug: "a1", titulo: "Guia A1", descricao: "Desc A1", apoio: "" }] },
    { titulo: "Tema B", guias: [{ slug: "b1", titulo: "Guia B1", descricao: "Desc B1", apoio: "" }] },
  ];

  it("guia de entrada, contagem real e temas numerados", async () => {
    const { default: GuiasComBusca } = await import("../src/components/guias/GuiasComBusca");
    const html = renderToStaticMarkup(
      createElement(GuiasComBusca, { grupos: GRUPOS, entrada: GRUPOS[1].guias[0], abertura: createElement("h1", null, "Guias") }),
    );
    expect(html).toContain("Comece por aqui");
    expect(html).toMatch(/<strong[^>]*>2<\/strong> guias publicados em/);
    expect(html).toContain("<h1>Guias</h1>");
    // O número do tema é enfeite: fora da leitura de tela.
    expect(html).toMatch(/<p aria-hidden="true"[^>]*>01<\/p>/);
    expect(html).toMatch(/<p aria-hidden="true"[^>]*>02<\/p>/);
  });

  it("sem guia de entrada, a abertura fica só com a busca", async () => {
    const { default: GuiasComBusca } = await import("../src/components/guias/GuiasComBusca");
    const html = renderToStaticMarkup(createElement(GuiasComBusca, { grupos: GRUPOS }));
    expect(html).not.toContain("Comece por aqui");
  });
});

describe("a página do guia", () => {
  const pagina = ler("src", "app", "guias", "[slug]", "page.tsx");

  it("o número da seção fica fora do <h2>", () => {
    expect(pagina).toMatch(/<span aria-hidden="true"[^>]*>\s*\{doisDigitos\(s \+ 1\)\}\s*<\/span>\s*<h2/);
  });

  it("'Continue neste tema' só com guia publicado, e a falha de leitura não derruba o guia", () => {
    expect(pagina).toContain("publicados.filter((g) => g.slug === s && g.slug !== guia.slug)");
    expect(pagina).toMatch(/catch \{\s*continuar = \[\];/);
  });

  it("a barra de progresso é só CSS e some onde o navegador não a suporta", () => {
    const css = ler("src", "app", "modernist.css");
    expect(css).toMatch(/\.mt-progresso-de-leitura \{\s*display: none;/);
    expect(css).toContain("@supports (animation-timeline: scroll())");
  });
});
