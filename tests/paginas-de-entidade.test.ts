import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings, Veiculo } from "../src/types";

/**
 * `/sobre` e `/contato` renderizadas — as duas páginas de entidade do site.
 *
 * Mesmo buraco da ficha, e a revisão da F2 provou nas duas: removi
 * `schemaDoSite(...)` de `/sobre`, `/contato`, `/` e `/estoque` ao mesmo tempo
 * e a suíte ficou verde. Nada guardava o RESULTADO — só a função pura.
 *
 * Estas duas ganham teste porque são as que respondem "quem é a Motors Store" e
 * "onde fica": é o par que um assistente lê para descrever a empresa, e o que o
 * relatório de visibilidade em IA apontou como o lugar onde a marca se descreve
 * sem que ninguém possa citá-la.
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

const VEICULO = {
  id: "1",
  marca: "Fiat",
  modelo: "Argo",
  preco_original: 70000,
  preco_promocional: 0,
  vendido: false,
} as unknown as Veiculo;

vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: EMPRESA }),
}));
vi.mock("../src/lib/supabase", () => ({
  getEstoque: async () => [VEICULO],
}));
vi.mock("../src/components/SobreClientWrapper", () => ({ default: () => null }));
vi.mock("../src/lib/telemetry", () => ({ trackContactClick: () => {} }));
vi.mock("../src/app/ThemeContext", () => ({ useTheme: () => ({ companySettings: EMPRESA }) }));

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

describe("/sobre publica a entidade, não só a trilha", () => {
  async function sobre() {
    const { default: SobrePage } = await import("../src/app/sobre/page");
    return nos(renderToStaticMarkup(await SobrePage()));
  }

  it("emite BreadcrumbList, AutoDealer e WebSite", async () => {
    const tipos = (await sobre()).map((n) => n["@type"]);

    expect(tipos).toContain("BreadcrumbList");
    expect(tipos).toContain("AutoDealer");
    expect(tipos).toContain("WebSite");
  });

  it("são três — remover um tem que quebrar aqui", async () => {
    expect(await sobre()).toHaveLength(3);
  });

  it("a loja e o site se ligam pelo mesmo @id", async () => {
    const publicados = await sobre();
    const loja = publicados.find((n) => n["@type"] === "AutoDealer");
    const site = publicados.find((n) => n["@type"] === "WebSite");

    expect(site!.publisher).toEqual({ "@id": loja!["@id"] });
  });
});

describe("/contato publica onde a loja fica", () => {
  async function contato() {
    const { default: ContatoPage } = await import("../src/app/contato/page");
    return nos(renderToStaticMarkup(await ContatoPage()));
  }

  it("emite BreadcrumbList, AutoDealer e WebSite", async () => {
    const tipos = (await contato()).map((n) => n["@type"]);

    expect(tipos).toContain("BreadcrumbList");
    expect(tipos).toContain("AutoDealer");
    expect(tipos).toContain("WebSite");
  });

  it("o AutoDealer carrega endereço — é o assunto da página", async () => {
    const loja = (await contato()).find((n) => n["@type"] === "AutoDealer");

    expect(loja!.address).toBeDefined();
    expect(loja!.telephone).toBeTruthy();
  });

  it("sem priceRange: a faixa de preço não diz nada numa página de contato", async () => {
    const loja = (await contato()).find((n) => n["@type"] === "AutoDealer");

    expect(loja).not.toHaveProperty("priceRange");
  });
});
