import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  apoioDaBusca,
  filtrarGuias,
  normalizarParaBusca,
  palavrasBatem,
  radical,
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
    expect(slugs("leilões")).toEqual(["leilao"]);
  });

  it("a dúvida em frase acha o guia: as palavras de ligação não contam", () => {
    expect(termosDaConsulta("Como saber se o carro passou por leilão?")).toEqual(["saber", "passou", "leilao"]);
    expect(slugs("como saber se o carro passou por leilão?")).toEqual(["leilao"]);
    expect(slugs("posso vender meu carro financiado")![0]).toBe("financiado");
  });

  it("com duas palavras, uma basta; quem tem as duas vem primeiro", () => {
    expect(slugs("leilão automático")).toEqual(["leilao"]);
    expect(slugs("troca financiado")![0]).toBe("financiado");
  });

  it("casa por palavra, não por pedaço: 'moto' não acha 'motor', 'lei' não acha 'leilão'", () => {
    expect(palavrasBatem("moto", "motor")).toBe(false);
    expect(palavrasBatem("lei", "leilao")).toBe(false);
    expect(palavrasBatem("ar", "carro")).toBe(false);
    expect(slugs("lei")).toEqual([]);
  });

  it("palavras parentes entram: financiamento acha financiado, consignar acha consignação", () => {
    expect(palavrasBatem("financiamento", "financiado")).toBe(true);
    expect(palavrasBatem("consignar", "consignacao")).toBe(true);
    expect(palavrasBatem("troca", "trocar")).toBe(true);
    expect(radical("leiloes")).toBe("leilao");
    expect(slugs("financiamento")).toEqual(["financiado"]);
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

  it("só palavra de ligação ainda não é dúvida: o índice segue inteiro", () => {
    for (const consulta of ["como", "a", "carro", "meu carro"]) {
      expect(termosDaConsulta(consulta)).toEqual([]);
      expect(filtrarGuias(GRUPOS, { consulta, tema: null }).resultados, consulta).toBeNull();
    }
  });

  it("com os títulos que estão no ar (02/10), cada assunto acha o guia dele primeiro", () => {
    const TITULOS: Array<[string, string]> = [
      ["garantia-carro-usado-loja", "Garantia de carro usado em loja: o que está coberto"],
      ["garantia-estendida-vale-a-pena", "Garantia estendida de carro usado vale a pena?"],
      ["carro-na-troca", "Carro na troca: como funciona e o que muda no preço"],
      ["vender-carro-financiado", "Carro financiado: dá para vender ou trocar?"],
      ["quanto-vale-meu-carro-usado", "Quanto vale meu carro usado: como a loja chega no número"],
      ["documentos-para-vender-carro", "Documentos para vender carro no Paraná, passo a passo"],
      ["consultar-carro-leilao-sinistro", "Como saber se um carro passou por leilão"],
      ["motores-turbo-usados-o-que-checar", "Motor turbo de baixa cilindrada usado: o que checar"],
      ["tabela-fipe-nao-e-preco-de-venda", "Tabela FIPE não é preço de venda: o que ela diz"],
      ["consignacao-de-carro", "Consignação de carro: como funciona"],
      ["cambio-dupla-embreagem-usado", "Câmbio de dupla embreagem em carro usado: o que checar"],
      ["laudo-cautelar-carro-usado", "Laudo cautelar: o que verifica e o que não verifica"],
    ];
    const reais: GrupoNaBusca[] = [{ titulo: "Guias", guias: TITULOS.map(([slug, titulo]) => guia(slug, titulo)) }];
    const primeiro = (consulta: string) => filtrarGuias(reais, { consulta, tema: null }).resultados?.[0]?.slug;
    expect(primeiro("troca")).toBe("carro-na-troca");
    expect(primeiro("financiado")).toBe("vender-carro-financiado");
    expect(primeiro("quanto vale meu carro")).toBe("quanto-vale-meu-carro-usado");
    expect(primeiro("documentos")).toBe("documentos-para-vender-carro");
    expect(primeiro("leilões")).toBe("consultar-carro-leilao-sinistro");
    expect(primeiro("turbo")).toBe("motores-turbo-usados-o-que-checar");
    expect(primeiro("fipe")).toBe("tabela-fipe-nao-e-preco-de-venda");
    expect(primeiro("consignar")).toBe("consignacao-de-carro");
    expect(primeiro("câmbio automático")).toBe("cambio-dupla-embreagem-usado");
    expect(filtrarGuias(reais, { consulta: "garantia", tema: null }).resultados!.map((g) => g.slug)).toEqual([
      "garantia-carro-usado-loja",
      "garantia-estendida-vale-a-pena",
    ]);
    // "moto" não despeja os guias de motor.
    expect(filtrarGuias(reais, { consulta: "moto", tema: null }).resultados).toEqual([]);
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
    // 44 px de alvo de toque, e a instrução escrita fora do placeholder.
    expect(html).toMatch(/<input[^>]*class="[^"]*min-h-1[14]/);
    expect(html).toContain("Digite a sua dúvida ou escolha um tema.");
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
