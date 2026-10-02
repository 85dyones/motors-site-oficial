import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  apoioDaBusca,
  filtrarGuias,
  normalizarParaBusca,
  termosDaConsulta,
  type GrupoNaBusca,
} from "../src/lib/buscaDeGuias";

/**
 * A busca do índice de guias (pedido do dono em 02/10/2026): filtrar por tema
 * ou digitar a dúvida.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

const guia = (slug: string, titulo: string, descricao = "", apoio = "") => ({
  slug,
  titulo,
  descricao,
  apoio: normalizarParaBusca(apoio),
});

const GRUPOS: GrupoNaBusca[] = [
  {
    titulo: "Laudo e perícia",
    guias: [
      guia("laudo", "Laudo cautelar: o que verifica e o que não verifica", "O que a perícia olha no carro.", "O laudo pega carro batido?"),
      guia("leilao", "Como saber se um carro passou por leilão", "Consulta de leilão e sinistro."),
      guia("chassi", "Chassi remarcado: quando é legal e quando é crime"),
    ],
  },
  {
    titulo: "Vender e trocar",
    guias: [
      guia("troca", "Carro na troca: como funciona e o que muda no preço"),
      guia("financiado", "Carro financiado: dá para vender ou trocar?", "Quitação e transferência."),
      guia("fipe", "Tabela FIPE não é preço de venda: o que ela diz"),
    ],
  },
];

const slugs = (consulta: string, tema: string | null = null) =>
  filtrarGuias(GRUPOS, { consulta, tema }).resultados?.map((g) => g.slug) ?? null;

describe("a dúvida digitada", () => {
  it("sem nada digitado, o índice inteiro, nos grupos de sempre", () => {
    const visto = filtrarGuias(GRUPOS, { consulta: "  ", tema: null });
    expect(visto.resultados).toBeNull();
    expect(visto.grupos.map((g) => g.titulo)).toEqual(["Laudo e perícia", "Vender e trocar"]);
    expect(visto.total).toBe(6);
  });

  it("acento, maiúscula e plural não atrapalham", () => {
    expect(slugs("LEILÃO")).toEqual(["leilao"]);
    expect(slugs("laudos")).toEqual(["laudo"]);
  });

  it("a dúvida em frase acha o guia: as palavras de ligação não contam", () => {
    expect(termosDaConsulta("Como saber se o carro passou por leilão?")).toEqual(["saber", "passou", "leilao"]);
    expect(slugs("como saber se o carro passou por leilão?")).toEqual(["leilao"]);
    expect(slugs("posso vender meu carro financiado")).toEqual(["financiado"]);
  });

  it("palavra do FAQ também acha, mas o guia que trata do assunto vem antes", () => {
    expect(slugs("batido")).toEqual(["laudo"]);
    // Dois guias com "preço" no título: ficam na ordem do índice.
    expect(slugs("preço")).toEqual(["troca", "fipe"]);
  });

  it("o que nenhum guia trata dá lista vazia, não o índice inteiro", () => {
    const visto = filtrarGuias(GRUPOS, { consulta: "blindagem", tema: null });
    expect(visto.resultados).toEqual([]);
    expect(visto.total).toBe(0);
  });

  it("'carro' sozinho não separa nada e não esvazia: cai nas palavras como vieram", () => {
    expect(termosDaConsulta("carro")).toEqual(["carro"]);
    expect(slugs("carro")!.length).toBeGreaterThan(2);
  });
});

describe("o tema", () => {
  it("escolher um tema mostra só o grupo dele", () => {
    const visto = filtrarGuias(GRUPOS, { consulta: "", tema: "Vender e trocar" });
    expect(visto.grupos.map((g) => g.titulo)).toEqual(["Vender e trocar"]);
    expect(visto.total).toBe(3);
  });

  it("tema e dúvida juntos: a dúvida procura só dentro do tema", () => {
    expect(slugs("preço", "Laudo e perícia")).toEqual([]);
    expect(slugs("preço", "Vender e trocar")).toEqual(["troca", "fipe"]);
  });
});

describe("o índice de apoio", () => {
  it("leva assuntos, títulos das seções e perguntas do FAQ, sem o corpo", () => {
    const apoio = apoioDaBusca({
      sobre: ["Laudo cautelar"],
      corpo: [{ titulo: "O que o perito mede" }],
      faq: [{ pergunta: "O laudo pega carro batido?" }],
    });
    expect(apoio).toContain("laudo cautelar");
    expect(apoio).toContain("perito mede");
    expect(apoio).toContain("batido");
  });
});

describe("a página", () => {
  it("o HTML do servidor traz o índice inteiro, com o campo e os temas", async () => {
    const { default: GuiasComBusca } = await import("../src/components/guias/GuiasComBusca");
    const html = renderToStaticMarkup(createElement(GuiasComBusca, { grupos: GRUPOS }));
    for (const g of GRUPOS.flatMap((x) => x.guias)) expect(html, g.slug).toContain(`href="/guias/${g.slug}"`);
    expect(html).toContain('role="search"');
    expect(html).toMatch(/<label[^>]*>Buscar nos guias<\/label>/);
    expect(html).toMatch(/type="search"/);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Vender e trocar");
    // Sem filtro, o aviso de contagem fica calado.
    expect(html).toMatch(/role="status"[^>]*><\/p>/);
  });

  it("a rota monta o índice no servidor e não manda o corpo do guia", () => {
    const pagina = readFileSync(join(__dirname, "..", "src", "app", "guias", "page.tsx"), "utf8");
    expect(pagina).toContain("<GuiasComBusca");
    expect(pagina).toContain("apoio: apoioDaBusca(guia)");
    expect(pagina).not.toMatch(/corpo: guia\.corpo|faq: guia\.faq/);
  });
});
