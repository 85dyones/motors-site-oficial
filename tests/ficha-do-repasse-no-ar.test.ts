import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings, Veiculo } from "../src/types";
import { ID_DA_LOJA } from "../src/lib/schemaLoja";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * A ficha do repasse renderizada (spec §7.2; molde `ficha-publica-o-grafo`):
 * os nós servidos, os quatro estados, a carência decidida pela página
 * (decisão 14) e o redirect pelo sufixo do slug (decisão 13).
 */
const estado = vi.hoisted(() => ({
  porSlug: {} as Record<string, unknown>,
  porSufixo: [] as unknown[],
  estoque: [] as unknown[],
}));

const EMPRESA = {
  name: "Motors Store",
  phone: "",
  whatsapp: "(41) 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "",
  instagram: "",
  facebook: "",
  cnpj: "",
} as CompanySettings;

vi.mock("../src/lib/leituraDosRepasses", () => ({
  lerRepassePorSlug: async (slug: string) => estado.porSlug[slug] ?? null,
  lerRepassePorSufixo: async () => estado.porSufixo,
  lerRepassesPublicos: async () => [],
}));
vi.mock("../src/lib/supabase", () => ({
  getEstoque: async () => estado.estoque,
  getVeiculoPdpUrl: (v: { id: string }) => `/carros/marca/modelo/versao-${v.id}`,
}));
vi.mock("../src/lib/settings", () => ({ getCachedSettings: async () => ({ companySettings: EMPRESA }) }));
vi.mock("../src/app/ThemeContext", () => ({ useTheme: () => ({ companySettings: EMPRESA }) }));
vi.mock("../src/components/Turnstile", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, sizes: _sizes, priority: _priority, unoptimized: _uo, fetchPriority: _fp, loading: _l, ...resto } = props;
    return createElement("img", resto as never);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

const ficha = await import("../src/app/repasse/[carro]/page");

const SLUG = "renault-kwid-zen-1-0-2021-3f9a1c";
const ABERTO = repasseDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z", aberto_ao_publico_em: "2026-09-24T12:00:00Z" });
const LOJISTAS = repasseDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-23T12:00:00Z" });
const VENDIDO = repasseDeTeste({ situacao: "vendido", lojistas_desde: "2026-09-10T12:00:00Z", aberto_ao_publico_em: "2026-09-10T12:00:00Z", vendido_em: "2026-09-20T12:00:00Z" });
const VENDIDO_HA_MUITO = repasseDeTeste({ situacao: "vendido", lojistas_desde: "2026-05-01T12:00:00Z", aberto_ao_publico_em: "2026-05-01T12:00:00Z", vendido_em: "2026-05-10T12:00:00Z" });
const ESTOQUE = [
  { id: "1", preco: 45900 },
  { id: "2", preco: 49900 },
  { id: "3", preco: 54900 },
].map(
  (v) =>
    ({
      id: v.id,
      marca: "Fiat",
      modelo: `Modelo ${v.id}`,
      versao: "1.0",
      ano: 2021,
      tipo: "Hatch",
      preco_original: v.preco,
      preco_promocional: 0,
      quilometragem: 30000,
      cambio: "Manual",
      vendido: false,
      web_full_images: [],
      whatsapp_images: [],
    }) as unknown as Veiculo,
);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-24T15:00:00Z")); // qui 24/09, 12h em Curitiba
  estado.porSlug = {};
  estado.porSufixo = [];
  estado.estoque = ESTOQUE;
});
afterEach(() => vi.useRealTimers());

async function servida(carro = SLUG): Promise<string> {
  return renderToStaticMarkup(await ficha.default({ params: Promise.resolve({ carro }) })).replace(/\s+/g, " ");
}

function nos(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    const json = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&"));
    return Array.isArray(json) ? json : [json];
  });
}

describe("a ficha do carro aberto a todos", () => {
  it("serve Car, BreadcrumbList, AutoDealer e WebSite — QUATRO, e a oferta aponta para o #dealer emitido", async () => {
    estado.porSlug[SLUG] = ABERTO;
    const grafo = nos(await servida());
    expect(grafo.map((n) => n["@type"])).toEqual(["Car", "BreadcrumbList", "AutoDealer", "WebSite"]);
    const carro = grafo[0] as Record<string, Record<string, unknown>>;
    expect(carro.offers.availability).toBe("https://schema.org/InStock");
    expect(carro.offers.seller).toEqual({ "@id": ID_DA_LOJA });
    expect(grafo[2]["@id"]).toBe(ID_DA_LOJA);
  });

  it("a conta, o WhatsApp com a referência, o exame com os dias de Curitiba e a barra do celular", async () => {
    estado.porSlug[SLUG] = ABERTO;
    const html = await servida();
    expect(html).toContain("R$ 36.900");
    expect(html).toContain("https://wa.me/5541997372165?text=");
    expect(html).toContain(encodeURIComponent("Ref.: repasse 3f9a1c"));
    expect(html).toContain('id="exame"');
    expect(html).toContain("Marque um horário para ver o Kwid");
    expect(html).toContain("Sex 25");
    expect(html).toContain("Sáb 26");
    expect(html).toContain("Seg 28");
    expect(html).toContain("QUERO ESTE");
    expect(html).toContain("ABERTO A TODOS DESDE 24/09");
  });

  it("a ficha de estado, o histórico e o que não vem", async () => {
    estado.porSlug[SLUG] = ABERTO;
    const html = await servida();
    expect(html).toContain('id="ficha-de-estado"');
    expect(html).toContain("Embreagem patinando nas arrancadas");
    expect(html).toContain("Estético, sem orçamento");
    expect(html).toContain("Orçamento da oficina Oficina Exemplo, feito em 22/09.");
    expect(html).toContain("Total orçado R$ 2.020");
    expect(html).toContain("Laudo cautelar aprovado, sai a pedido");
    expect(html).toContain("Feita em 22/09");
    expect(html).toContain("O preço já leva em conta o que não vem.");
  });

  it("três parecidos do estoque com garantia", async () => {
    estado.porSlug[SLUG] = ABERTO;
    const html = await servida();
    expect(html).toContain("Prefere com garantia? Parecidos com este Kwid");
    for (const id of ["1", "2", "3"]) expect(html).toContain(`href="/carros/marca/modelo/versao-${id}"`);
  });
});

describe("os outros estados", () => {
  it("só para lojistas: a faixa no lugar do WhatsApp e do exame", async () => {
    estado.porSlug[SLUG] = LOJISTAS;
    const html = await servida();
    expect(html).toContain("SÓ PARA LOJISTAS");
    expect(html).toContain('href="/repasse#lista-lojista"');
    expect(html).toContain('href="/repasse#lista"');
    expect(html).not.toContain("wa.me");
    expect(html).not.toContain('id="exame"');
    const carro = nos(html)[0] as Record<string, Record<string, unknown>>;
    expect(carro.offers.availability).toBe("https://schema.org/LimitedAvailability");
  });

  it("vendido na carência: fica no ar com VENDIDO, a lista e os parecidos, indexado", async () => {
    estado.porSlug[SLUG] = VENDIDO;
    const html = await servida();
    expect(html).toContain("VENDIDO");
    expect(html).toContain("QUERO RECEBER O PRÓXIMO");
    expect(html).not.toContain('id="exame"');
    const carro = nos(html)[0] as Record<string, Record<string, unknown>>;
    expect(carro.offers.availability).toBe("https://schema.org/SoldOut");
    const meta = await ficha.generateMetadata({ params: Promise.resolve({ carro: SLUG }) });
    expect(meta.robots).toBeUndefined();
  });

  it("vendido depois da carência: não encontrado", async () => {
    estado.porSlug[SLUG] = VENDIDO_HA_MUITO;
    await expect(servida()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("o endereço que não abre carro", () => {
  it("slug antigo: redireciona para o slug atual quando o sufixo acha um carro só", async () => {
    estado.porSufixo = [ABERTO];
    await expect(servida("renault-kwid-2021-3f9a1c")).rejects.toThrow(`NEXT_REDIRECT:/repasse/${SLUG}`);
  });

  it("sufixo que acha dois carros: não adivinha", async () => {
    estado.porSufixo = [ABERTO, { ...ABERTO, slug: "outro-3f9a1c" }];
    await expect(servida("renault-kwid-2021-3f9a1c")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("nada com aquele nome nem com aquele sufixo: não encontrado", async () => {
    await expect(servida("carro-que-nunca-existiu")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("o cabeçalho da ficha", () => {
  it("título do carro, canônico no slug e descrição do resumo", async () => {
    estado.porSlug[SLUG] = ABERTO;
    const meta = await ficha.generateMetadata({ params: Promise.resolve({ carro: SLUG }) });
    expect(meta.title).toBe("Renault Kwid Zen 1.0 2021 no repasse | Motors Store");
    expect(meta.alternates?.canonical).toBe(`/repasse/${SLUG}`);
    expect(meta.description).toBe(ABERTO.resumo);
  });

  it("o endereço que não abre carro tem título próprio", async () => {
    const meta = await ficha.generateMetadata({ params: Promise.resolve({ carro: "nada" }) });
    expect(meta.title).toBe("Repasse não encontrado | Motors Store");
  });
});
