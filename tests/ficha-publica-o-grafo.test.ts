import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings, Veiculo } from "../src/types";

/**
 * A ficha renderizada — o `<script>` de verdade, não a função que o alimenta.
 *
 * `grafo-de-schema` cobre `grafoDaFicha` com 16 casos, e nenhum deles nota se a
 * ROTA parar de publicar o que a função devolve. A revisão da F2 provou o
 * buraco com uma linha:
 *
 *     __html: blocoJsonLd(grafo.slice(0, 1))
 *
 * A ficha volta a publicar só o `Car`, o `#dealer` volta a ser órfão — e a
 * suíte inteira ficou verde. É o mesmo defeito que a extração para
 * `lib/grafoDaFicha.ts` diz existir para fechar, vivo um nível acima; e é a
 * terceira vez que este repositório o encontra no mesmo lugar: a lógica com
 * bateria completa, a chamada sem ninguém.
 *
 * Renderizar a rota exige mock de seis dependências de I/O. Vale o preço: é a
 * única forma de contar o que a página realmente serve.
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
  id: "8171616",
  marca: "Fiat",
  modelo: "Titano",
  versao: "Volcano 2.2",
  ano: 2025,
  preco_original: 189900,
  preco_promocional: 0,
  quilometragem: 12000,
  tipo: "Picape",
  cor: "Prata",
  vendido: false,
  web_full_images: ["https://x/1.webp", "https://x/2.webp"],
  whatsapp_images: ["https://x/1-zap.jpg", "https://x/2-zap.jpg"],
  laudo_pericia: "PERÍCIA APROVADA",
} as unknown as Veiculo;

vi.mock("../src/lib/supabase", () => ({
  getVeiculoById: async () => VEICULO,
  getEstoque: async () => [VEICULO],
  getSinaisDeEstoque: async () => ({ foraDoFeed: false, ultimaPresenca: null }),
  getVeiculoPdpUrl: () => "/carros/fiat/titano/volcano-2-2-8171616",
  truncateString: (s: string) => s,
}));

vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: EMPRESA, procedencia: null }),
}));

vi.mock("../src/lib/hubsDeEstoque", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  recortesDoEstoque: async () => ({ historico: [VEICULO], disponiveis: [VEICULO] }),
}));

vi.mock("../src/lib/publicacao", () => ({
  getDatasDeVenda: async () => ({}),
  decidirPublicacao: () => ({ indisponivel: false, rotulo: "", noindex: false }),
}));

// O corpo da página não é o assunto: o que está sob teste é o `<script>`.
vi.mock("../src/components/PDPClientWrapper", () => ({ default: () => null }));
vi.mock("../src/components/modernist/FaixaProcedencia", () => ({ default: () => null }));

async function fichaRenderizada(): Promise<string> {
  const { default: CarDetailsPage } = await import(
    "../src/app/[categoria]/[marca]/[modelo]/[ficha]/page"
  );
  return renderToStaticMarkup(
    await CarDetailsPage({
      params: Promise.resolve({
        categoria: "carros",
        marca: "fiat",
        modelo: "titano",
        ficha: "volcano-2-2-8171616",
      }),
    }),
  );
}

/** Os nós de JSON-LD que a página REALMENTE serve. */
function nosPublicados(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(
    (m) => {
      const cru = m[1]
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, "&");
      const json = JSON.parse(cru);
      return Array.isArray(json) ? json : [json];
    },
  );
}

describe("a ficha serve os quatro nós", () => {
  it("publica Car, BreadcrumbList, AutoDealer e WebSite", async () => {
    const tipos = nosPublicados(await fichaRenderizada()).map((n) => n["@type"]);

    expect(tipos).toContain("Car");
    expect(tipos).toContain("BreadcrumbList");
    expect(tipos).toContain("AutoDealer");
    expect(tipos).toContain("WebSite");
  });

  it("são QUATRO — cortar o array publicado tem que quebrar aqui", async () => {
    // `grafo.slice(0, 1)` na rota passava por toda a suíte antes deste caso.
    expect(nosPublicados(await fichaRenderizada())).toHaveLength(4);
  });

  it("o #dealer que a oferta referencia está no HTML servido", async () => {
    const nos = nosPublicados(await fichaRenderizada());
    const carro = nos.find((n) => n["@type"] === "Car") as Record<string, Record<string, string>>;
    const loja = nos.find((n) => n["@type"] === "AutoDealer");

    // A prova do que a F2 conserta, medida na saída da página.
    expect(loja).toBeDefined();
    expect(carro.offers.seller).toEqual({ "@id": loja!["@id"] });
  });

  it("o Car publica a galeria, não uma foto", async () => {
    const carro = nosPublicados(await fichaRenderizada()).find((n) => n["@type"] === "Car");

    expect(Array.isArray(carro!.image)).toBe(true);
    expect(carro!.image).toEqual(["https://x/1.webp", "https://x/2.webp"]);
  });
});
