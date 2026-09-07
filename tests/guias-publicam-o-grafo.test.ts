import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings } from "../src/types";
import type { Guia } from "../src/lib/guias";

/**
 * Os guias renderizados — o `<script>` de verdade, e o texto que ele marca.
 *
 * Nasce coberto, e isso é deliberado: a F2 levou quatro revisões justamente
 * porque a montagem do grafo vivia no JSX sem teste que a visse. `grafoDoGuia`
 * organiza; quem guarda o resultado é este arquivo.
 *
 * O conteúdo vem do BANCO desde 06/09 — o dono cria e edita os guias pelo
 * painel. Por isso a fixture aqui é sintética: o que está sob teste é a ROTA,
 * não o texto que a loja publicou. Amarrar a suíte ao texto real a quebraria
 * toda vez que alguém editasse um parágrafo pelo painel.
 */

const EMPRESA: CompanySettings = {
  name: "Motors Store",
  phone: "41 99737-2165",
  whatsapp: "41 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "Seg a sex 8h30-18h30",
  instagram: "https://instagram.com/motorsstore.oficial",
  facebook: "https://facebook.com/motorsstore.oficial",
  cnpj: "",
};

/**
 * Um guia de teste com as armadilhas embutidas de propósito: "perícia
 * cautelar" aparece em TRÊS parágrafos e mais uma vez no FAQ, que é o que pega
 * a regressão do linkador por bloco (seis âncoras para `/garantia`).
 */
const GUIA: Guia = {
  slug: "guia-de-teste",
  titulo: "Um guia de teste",
  tituloSeo: "Um guia de teste | Motors Store",
  descricao: "Descrição do guia de teste, com perícia cautelar no meio.",
  publicadoEm: "2026-09-05T09:00:00-03:00",
  atualizadoEm: "2026-09-06T09:00:00-03:00",
  sobre: ["Perícia cautelar veicular", "Laudo cautelar"],
  corpo: [
    {
      titulo: "Primeira seção",
      paragrafos: [
        "O primeiro parágrafo fala de perícia cautelar e do que ela verifica.",
        "O segundo parágrafo fala de perícia cautelar de novo, para testar o linkador.",
      ],
    },
    {
      titulo: "Segunda seção",
      paragrafos: ["A terceira menção de perícia cautelar mora aqui."],
    },
  ],
  faq: [
    {
      pergunta: "Uma pergunta de teste?",
      resposta: "Uma resposta de teste que menciona perícia cautelar e termina aqui.",
    },
    {
      pergunta: "Outra pergunta?",
      resposta: "Outra resposta, sem termo linkável nenhum, só para ter duas.",
    },
  ],
  saida: {
    rotulo: "Ver a garantia",
    href: "/garantia",
    apoio: "O que responde por motor e câmbio.",
  },
};

vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: EMPRESA }),
}));

vi.mock("../src/lib/guiasDoBanco", () => ({
  listarGuiasPublicados: async () => [GUIA],
  buscarGuiaPublicado: async (slug: string) => (slug === GUIA.slug ? GUIA : null),
  GuiasIndisponiveisError: class extends Error {},
}));

function nos(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(
    (m) => {
      const json = JSON.parse(
        m[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&"),
      );
      return Array.isArray(json) ? json : [json];
    },
  );
}

function limpar(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/");
}

async function guiaRenderizado(slug = GUIA.slug): Promise<string> {
  const { default: GuiaPage } = await import("../src/app/guias/[slug]/page");
  return renderToStaticMarkup(await GuiaPage({ params: Promise.resolve({ slug }) }));
}

describe("o guia publica o grafo inteiro", () => {
  it("emite Article, BreadcrumbList, FAQPage, AutoDealer e WebSite", async () => {
    const tipos = nos(await guiaRenderizado()).map((n) => n["@type"]);

    expect(tipos).toContain("Article");
    expect(tipos).toContain("BreadcrumbList");
    expect(tipos).toContain("FAQPage");
    expect(tipos).toContain("AutoDealer");
    expect(tipos).toContain("WebSite");
  });

  it("são cinco nós — cortar o array publicado quebra aqui", async () => {
    expect(nos(await guiaRenderizado())).toHaveLength(5);
  });

  it("o Article declara as datas do banco e aponta para a loja", async () => {
    const publicados = nos(await guiaRenderizado());
    const artigo = publicados.find((n) => n["@type"] === "Article")!;
    const loja = publicados.find((n) => n["@type"] === "AutoDealer")!;

    // `publicado_em` e `atualizado_em` são colunas distintas: um guia editado
    // muda o segundo e preserva o primeiro.
    expect(artigo.datePublished).toBe(GUIA.publicadoEm);
    expect(artigo.dateModified).toBe(GUIA.atualizadoEm);
    expect(artigo.author).toEqual({ "@id": loja["@id"] });
    expect(artigo.publisher).toEqual({ "@id": loja["@id"] });
  });

  it("a imagem do Article é URL absoluta", async () => {
    const artigo = nos(await guiaRenderizado()).find((n) => n["@type"] === "Article")!;

    // `urlDoCardGerado` devolve caminho relativo — serve ao `next/metadata`,
    // que absolutiza pelo `metadataBase`, e não serve ao JSON-LD.
    expect(String(artigo.image)).toMatch(/^https?:\/\//);
  });

  it("o texto do FAQPage é idêntico ao visível", async () => {
    const html = await guiaRenderizado();
    const faq = nos(html).find((n) => n["@type"] === "FAQPage") as {
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    const visivel = limpar(html);

    // Divergência entre markup e página é violação de diretriz, não bug de
    // layout — e o render põe link dentro das respostas.
    for (const pergunta of faq.mainEntity) {
      expect(visivel, `pergunta divergente: ${pergunta.name}`).toContain(pergunta.name);
      expect(visivel, `resposta divergente: ${pergunta.name}`).toContain(
        pergunta.acceptedAnswer.text,
      );
    }
  });

  it("o corpo inteiro chega à página", async () => {
    const visivel = limpar(await guiaRenderizado());

    for (const secao of GUIA.corpo) {
      expect(visivel, `seção sumida: ${secao.titulo}`).toContain(secao.titulo);
      for (const paragrafo of secao.paragrafos) {
        expect(visivel, `parágrafo alterado: ${paragrafo.slice(0, 40)}`).toContain(paragrafo);
      }
    }
  });

  it("tem saída comercial, e ela é um link", async () => {
    const hrefs = [...(await guiaRenderizado()).matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);

    expect(hrefs).toContain(GUIA.saida.href);
    expect(hrefs).toContain("/estoque");
    expect(hrefs.filter((h) => h === "#" || h === "")).toHaveLength(0);
  });

  it("um link por destino no corpo — não um por parágrafo", async () => {
    const html = await guiaRenderizado();
    const contagem: Record<string, number> = {};
    for (const m of html.matchAll(/<a[^>]*href="(\/[a-z-]*)"/g)) {
      contagem[m[1]] = (contagem[m[1]] ?? 0) + 1;
    }

    // A fixture menciona "perícia cautelar" quatro vezes de propósito. A
    // primeira versão da rota chamava `segmentarComLinks` por parágrafo e saía
    // com seis âncoras para `/garantia`; agora sobra a estrutural mais uma.
    expect(contagem["/garantia"] ?? 0).toBeLessThanOrEqual(2);
  });
});

describe("slug que não existe", () => {
  it("não devolve página renderizada", async () => {
    // `notFound()` estoura o fallback do Next. O que importa é que a rota NÃO
    // serve uma página para um guia inexistente — nem vazia, nem meia.
    await expect(guiaRenderizado("nao-existe")).rejects.toThrow();
  });
});

describe("o índice do cluster", () => {
  async function indice(): Promise<string> {
    const { default: GuiasPage } = await import("../src/app/guias/page");
    return renderToStaticMarkup(await GuiasPage());
  }

  it("lista os guias publicados", async () => {
    const hrefs = [...(await indice()).matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);

    expect(hrefs).toContain(`/guias/${GUIA.slug}`);
  });

  it("publica CollectionPage, trilha, loja e site", async () => {
    const tipos = nos(await indice()).map((n) => n["@type"]);

    expect(tipos).toEqual(["CollectionPage", "BreadcrumbList", "AutoDealer", "WebSite"]);
  });

  it("o ItemList tem uma entrada por guia publicado", async () => {
    const pagina = nos(await indice()).find((n) => n["@type"] === "CollectionPage") as {
      mainEntity: { numberOfItems: number; itemListElement: unknown[] };
    };

    expect(pagina.mainEntity.numberOfItems).toBe(1);
    expect(pagina.mainEntity.itemListElement).toHaveLength(1);
  });

  it("leva de volta ao estoque e às páginas de conversão", async () => {
    const hrefs = [...(await indice()).matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);

    for (const destino of ["/estoque", "/garantia", "/avaliacao"]) {
      expect(hrefs).toContain(destino);
    }
  });
});
