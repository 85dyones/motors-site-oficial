import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings } from "../src/types";
import type { Guia } from "../src/lib/guias";
import { dataPorExtenso, mesmoDiaEmCuritiba } from "../src/lib/assinaturaDoGuia";

/**
 * A assinatura do guia aparece na TELA, não só no JSON-LD (2026-09-21).
 *
 * O `Article` sempre declarou `datePublished`, `dateModified` e `author`; a
 * página não mostrava nenhum. A auditoria leu isso como "nenhum guia tem
 * autor nem data", o time corrigiu a leitura — o dado estruturado existe — e o
 * que faltava de fato era o leitor ver. Este arquivo prende duas coisas: que a
 * linha está na página, e que ela diz o MESMO que o schema.
 *
 * No mesmo dia o dono decidiu quem assina: "Dyones Oliveira, Motors Store".
 * O autor deixou de ser a loja e passou a ser a pessoa que trabalha nela.
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

function guia(slug: string, publicadoEm: string, atualizadoEm: string): Guia {
  return {
    slug,
    titulo: `Guia ${slug}`,
    tituloSeo: `Guia ${slug} | Motors Store`,
    descricao: "Descrição curta.",
    publicadoEm,
    atualizadoEm,
    sobre: ["Laudo cautelar"],
    corpo: [{ titulo: "Seção", paragrafos: ["Um parágrafo."] }],
    faq: [{ pergunta: "Pergunta?", resposta: "Resposta." }],
    saida: { rotulo: "Ver o estoque", href: "/estoque", apoio: "O que tem hoje." },
  };
}

const ATUALIZADO = guia("atualizado", "2026-09-05T09:00:00-03:00", "2026-09-18T15:00:00-03:00");
// 23h30 em Curitiba já é dia 6 em UTC. Para quem lê, é o mesmo dia da publicação.
const MESMO_DIA = guia("mesmo-dia", "2026-09-05T09:00:00-03:00", "2026-09-05T23:30:00-03:00");

vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: EMPRESA }),
}));

vi.mock("../src/lib/guiasDoBanco", () => ({
  listarGuiasPublicados: async () => [ATUALIZADO, MESMO_DIA],
  buscarGuiaPublicado: async (slug: string) =>
    [ATUALIZADO, MESMO_DIA].find((g) => g.slug === slug) ?? null,
  GuiasIndisponiveisError: class extends Error {},
}));

async function pagina(slug: string): Promise<string> {
  const { default: GuiaPage } = await import("../src/app/guias/[slug]/page");
  return renderToStaticMarkup(await GuiaPage({ params: Promise.resolve({ slug }) }));
}

function visivel(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function grafo(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    const json = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&"));
    return Array.isArray(json) ? json : [json];
  });
}

describe("a assinatura do guia na tela", () => {
  // Bloco de autor desde 30/09 (tarefa 4.11): nome, apresentação e UMA data
  // à vista — a da atualização quando houve, a da publicação quando não.
  it("mostra o autor como pessoa, a apresentação e a data da atualização", async () => {
    const texto = visivel(await pagina("atualizado"));
    expect(texto).toContain("Por Dyones Oliveira");
    expect(texto).toContain("Profissional com mais de dez anos de mercado · Motors Store");
    expect(texto).toContain("Atualizado em 18 de setembro de 2026");
    // Com atualização, a data de publicação sai da tela (fica no schema).
    expect(texto).not.toContain("Publicado em");
  });

  it("o nome leva a quem ele é: o mesmo `url` do nó Person", async () => {
    const html = await pagina("atualizado");
    expect(html).toMatch(/<a[^>]*href="\/sobre#autor"[^>]*>Dyones Oliveira<\/a>/);
  });

  it("monograma decorativo, fora da leitura", async () => {
    const html = await pagina("atualizado");
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>DO<\/span>/);
  });

  it("a data à vista vai em <time> com o valor do schema, e o schema guarda as duas", async () => {
    const html = await pagina("atualizado");
    expect(html).toContain(`<time dateTime="${ATUALIZADO.atualizadoEm}">`);
    const artigo = grafo(html).find((n) => n["@type"] === "Article") as {
      datePublished: string;
      dateModified: string;
    };
    expect(artigo.datePublished).toBeTruthy();
    expect(artigo.dateModified).toBeTruthy();
  });

  it("o autor visível é a pessoa que o Article declara, e a loja é a do #dealer", async () => {
    const html = await pagina("atualizado");
    const nos = grafo(html);
    type Pessoa = { "@type": string; name: string; worksFor: { "@id": string } };
    const artigo = nos.find((n) => n["@type"] === "Article") as {
      author: Pessoa;
      publisher: { "@id": string };
    };
    const loja = nos.find((n) => n["@id"] === artigo.author.worksFor["@id"]) as { name: string };

    expect(artigo.author["@type"]).toBe("Person");
    expect(artigo.author.name).toBe("Dyones Oliveira");
    expect(loja?.name).toBe("Motors Store");
    // A loja continua sendo quem publica.
    expect(artigo.publisher["@id"]).toBe(artigo.author.worksFor["@id"]);
    const texto = visivel(html);
    expect(texto).toContain(`Por ${artigo.author.name}`);
    expect(texto).toContain(`· ${loja.name}`);
  });

  it("sem atualização (ou no mesmo dia de Curitiba), mostra a publicação", async () => {
    const html = await pagina("mesmo-dia");
    const texto = visivel(html);
    expect(texto).toContain("Publicado em 5 de setembro de 2026");
    expect(texto).not.toContain("Atualizado em");
    expect(html).toContain(`<time dateTime="${MESMO_DIA.publicadoEm}">`);
  });

  it("nada de caixa alta espaçada: a linha de rodapé jurídico não volta", async () => {
    const html = await pagina("atualizado");
    const bloco = html.slice(html.indexOf("Por "), html.indexOf("</time>"));
    expect(bloco).not.toMatch(/uppercase/);
  });
});

describe("as datas no fuso da loja", () => {
  it("formata por extenso em pt-BR", () => {
    expect(dataPorExtenso("2026-09-05T09:00:00-03:00")).toBe("5 de setembro de 2026");
  });

  it("não vira o dia pelo UTC", () => {
    // 22h de 30/09 em Curitiba é 01h de 01/10 em UTC.
    expect(dataPorExtenso("2026-09-30T22:00:00-03:00")).toBe("30 de setembro de 2026");
    expect(mesmoDiaEmCuritiba("2026-09-30T08:00:00-03:00", "2026-09-30T22:00:00-03:00")).toBe(true);
    expect(mesmoDiaEmCuritiba("2026-09-30T22:00:00-03:00", "2026-10-01T08:00:00-03:00")).toBe(false);
  });

  it("data inválida não quebra a página", () => {
    expect(dataPorExtenso("não é data")).toBe("");
  });
});
