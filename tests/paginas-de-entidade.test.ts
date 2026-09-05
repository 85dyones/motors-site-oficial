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

// Completo o bastante para a vitrine montar hub, carroceria e contagem: um
// veiculo com campos faltando quebra a rota por motivo que nao e o assunto.
const VEICULO = {
  id: "1",
  marca: "Fiat",
  modelo: "Argo",
  versao: "Drive 1.0",
  ano: 2022,
  preco_original: 70000,
  preco_promocional: 0,
  quilometragem: 30000,
  tipo: "Hatch",
  cor: "Prata",
  cambio: "Manual",
  combustivel: "Flex",
  motor: "1.0",
  vendido: false,
  estado_cadastro: "publicado",
  web_full_images: ["https://x/1.webp"],
  whatsapp_images: ["https://x/1-zap.jpg"],
} as unknown as Veiculo;

// `await original()` preserva o que a rota usa alem do que este arquivo mocka
// -- `recortePublicoDeSettings`, `getVeiculoPdpUrl`. Mock que apaga export
// vizinho quebra a rota por motivo que nao e o assunto do teste.
vi.mock("../src/lib/settings", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  getCachedSettings: async () => ({ companySettings: EMPRESA }),
}));
vi.mock("../src/lib/supabase", async (original) => ({
  ...(await original<Record<string, unknown>>()),
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

describe("/estoque publica o grafo", () => {
  /**
   * A vitrine, que é a página de maior tráfego depois da home.
   *
   * A revisão da F2 provou o buraco: removi `schemaDoSite` de `/` e `/estoque`
   * ao mesmo tempo e a suíte inteira ficou verde — 122 arquivos, 2137 testes.
   * O `WebSite` é nó NOVO deste PR nas duas rotas, e sumia pelo mesmo caminho
   * silencioso pelo qual o `#dealer` sumiu por 11 dias.
   *
   * ⚠️ A HOME CONTINUA DESCOBERTA, e isso é deliberado, não esquecimento. Ela
   * puxa `getReputacaoGoogle` e a curadoria do Instagram além do estoque e das
   * settings; o teste precisaria de mais mocks do que tem asserção, e mock
   * demais transforma prova em ficção. `/estoque` cobre o mesmo padrão de
   * montagem com dois mocks. Quem mexer no grafo da home não tem rede — saiba
   * disso antes de mexer.
   */
  async function estoque() {
    const { default: EstoquePage } = await import("../src/app/estoque/page");
    return nos(renderToStaticMarkup(await EstoquePage()));
  }

  it("emite BreadcrumbList, ItemList, FAQPage, AutoDealer e WebSite", async () => {
    const tipos = (await estoque()).map((n) => n["@type"]);

    expect(tipos).toContain("BreadcrumbList");
    expect(tipos).toContain("ItemList");
    expect(tipos).toContain("FAQPage");
    expect(tipos).toContain("AutoDealer");
    expect(tipos).toContain("WebSite");
  });

  it("remover um nó do array tem que quebrar aqui", async () => {
    expect(await estoque()).toHaveLength(5);
  });

  it("a loja e o site se ligam pelo mesmo @id", async () => {
    const publicados = await estoque();
    const loja = publicados.find((n) => n["@type"] === "AutoDealer");
    const site = publicados.find((n) => n["@type"] === "WebSite");

    expect(site!.publisher).toEqual({ "@id": loja!["@id"] });
  });
});
