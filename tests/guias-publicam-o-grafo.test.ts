import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GUIAS } from "../src/lib/guias";
import type { CompanySettings } from "../src/types";

/**
 * Os guias renderizados — o `<script>` de verdade, e o texto que ele marca.
 *
 * Nasce coberto, e isso é deliberado: a F2 levou quatro revisões justamente
 * porque a montagem do grafo vivia no JSX sem teste que a visse. `grafoDoGuia`
 * organiza; quem guarda o resultado é este arquivo.
 *
 * As duas asserções que carregam o peso:
 *
 *  · a CONTAGEM de nós — cortar o array publicado tem que quebrar aqui;
 *  · a igualdade entre o texto do `FAQPage` e o texto visível, que é a
 *    exigência do Google e o risco que a F1 passou três revisões evitando.
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

vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: EMPRESA }),
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

async function guiaRenderizado(slug: string): Promise<string> {
  const { default: GuiaPage } = await import("../src/app/guias/[slug]/page");
  return renderToStaticMarkup(await GuiaPage({ params: Promise.resolve({ slug }) }));
}

describe("cada guia publica o grafo inteiro", () => {
  for (const guia of GUIAS) {
    it(`${guia.slug}: Article, BreadcrumbList, FAQPage, AutoDealer e WebSite`, async () => {
      const tipos = nos(await guiaRenderizado(guia.slug)).map((n) => n["@type"]);

      expect(tipos).toContain("Article");
      expect(tipos).toContain("BreadcrumbList");
      expect(tipos).toContain("FAQPage");
      expect(tipos).toContain("AutoDealer");
      expect(tipos).toContain("WebSite");
    });

    it(`${guia.slug}: são cinco nós — cortar o array quebra aqui`, async () => {
      expect(nos(await guiaRenderizado(guia.slug))).toHaveLength(5);
    });

    it(`${guia.slug}: o Article declara data e aponta para a loja`, async () => {
      const publicados = nos(await guiaRenderizado(guia.slug));
      const artigo = publicados.find((n) => n["@type"] === "Article")!;
      const loja = publicados.find((n) => n["@type"] === "AutoDealer")!;

      // `Article` sem data vale menos, e data inventada vale menos ainda.
      expect(artigo.datePublished).toBe(guia.publicadoEm);
      expect(artigo.dateModified).toBe(guia.atualizadoEm);
      expect(artigo.author).toEqual({ "@id": loja["@id"] });
      expect(artigo.publisher).toEqual({ "@id": loja["@id"] });
    });

    it(`${guia.slug}: o texto do FAQPage é idêntico ao visível`, async () => {
      const html = await guiaRenderizado(guia.slug);
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

    it(`${guia.slug}: o corpo inteiro chega à página`, async () => {
      const visivel = limpar(await guiaRenderizado(guia.slug));

      for (const secao of guia.corpo) {
        expect(visivel, `seção sumida: ${secao.titulo}`).toContain(secao.titulo);
        for (const paragrafo of secao.paragrafos) {
          expect(visivel, `parágrafo alterado: ${paragrafo.slice(0, 40)}`).toContain(paragrafo);
        }
      }
    });

    it(`${guia.slug}: tem saída comercial, e ela é um link`, async () => {
      const hrefs = [...(await guiaRenderizado(guia.slug)).matchAll(/<a[^>]*href="([^"]+)"/g)].map(
        (m) => m[1],
      );

      // Guia sem destino é conteúdo que não devolve nada.
      expect(hrefs).toContain(guia.saida.href);
      expect(hrefs).toContain("/estoque");
      expect(hrefs.filter((h) => h === "#" || h === "")).toHaveLength(0);
    });
  }
});

describe("o índice do cluster", () => {
  async function indice(): Promise<string> {
    const { default: GuiasPage } = await import("../src/app/guias/page");
    return renderToStaticMarkup(await GuiasPage());
  }

  it("lista todos os guias publicados", async () => {
    const hrefs = [...(await indice()).matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);

    for (const guia of GUIAS) {
      expect(hrefs, `guia fora do índice: ${guia.slug}`).toContain(`/guias/${guia.slug}`);
    }
  });

  it("publica CollectionPage, trilha, loja e site", async () => {
    const tipos = nos(await indice()).map((n) => n["@type"]);

    expect(tipos).toEqual(["CollectionPage", "BreadcrumbList", "AutoDealer", "WebSite"]);
  });

  it("o ItemList tem uma entrada por guia", async () => {
    const pagina = nos(await indice()).find((n) => n["@type"] === "CollectionPage") as {
      mainEntity: { numberOfItems: number; itemListElement: unknown[] };
    };

    expect(pagina.mainEntity.numberOfItems).toBe(GUIAS.length);
    expect(pagina.mainEntity.itemListElement).toHaveLength(GUIAS.length);
  });

  it("leva de volta ao estoque e às páginas de conversão", async () => {
    const hrefs = [...(await indice()).matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);

    for (const destino of ["/estoque", "/garantia", "/avaliacao"]) {
      expect(hrefs).toContain(destino);
    }
  });
});
