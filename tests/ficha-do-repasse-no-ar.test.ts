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
  // O card desenha `SinalDeAbertura`, que lê o estado do link.
  useLinkStatus: () => ({ pending: false }),
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

  it("a conta, o WhatsApp pelo pré-cadastro, o exame com os dias de Curitiba e a barra do celular", async () => {
    estado.porSlug[SLUG] = ABERTO;
    const html = await servida();
    expect(html).toContain("R$ 36.900");
    // Desde 28/09 o WhatsApp do repasse passa pelo modal da ficha do estoque:
    // o HTML servido traz o BOTÃO, e o link com a referência só é montado no
    // envio (`whatsapp-do-repasse-fiacao`).
    expect(html).not.toContain("wa.me");
    expect(html).toMatch(/<button type="button"[^>]*>.*?QUERO ESTE REPASSE<\/button>/);
    expect(html).toContain('id="exame"');
    expect(html).toContain("Marque um horário para ver o Kwid");
    expect(html).toContain("Sex 25");
    expect(html).toContain("Sáb 26");
    expect(html).toContain("Seg 28");
    // Nó de texto exato da barra fixa do celular (`F.queroEste`, "QUERO ESTE"):
    // "QUERO ESTE" sozinho também casaria com "QUERO ESTE REPASSE" (`F.quero`,
    // o botão principal do topo), que já sai neste mesmo HTML — a asserção
    // frouxa continuaria verde mesmo sem a barra.
    expect(html).toContain(">QUERO ESTE<");
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
    expect(html).toContain("O carro funciona, e o preço já leva em conta o que não vem.");
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
    // A barra fixa é só do estado aberto — um carro vendido não pode mostrar
    // preço e "QUERO ESTE" fixos no rodapé do celular.
    expect(html).not.toContain(">QUERO ESTE<");
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

  it("sufixo acha um carro só, mas vendido fora da carência: não redireciona, não encontrado", async () => {
    // M1: a leitura por sufixo não filtra situação nem carência. Sem conferir
    // `aparecePublicamente`, o único candidato redirecionaria para um slug que
    // também devolveria 404 — dois saltos em vez de um, e o 308 fica em cache.
    estado.porSufixo = [{ ...VENDIDO_HA_MUITO, slug: "outro-3f9a1c" }];
    await expect(servida("renault-kwid-2021-3f9a1c")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("sufixo que acha dois carros: não adivinha", async () => {
    estado.porSufixo = [ABERTO, { ...ABERTO, slug: "outro-3f9a1c" }];
    await expect(servida("renault-kwid-2021-3f9a1c")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("nada com aquele nome nem com aquele sufixo: não encontrado", async () => {
    await expect(servida("carro-que-nunca-existiu")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

// Pedido do dono em 29/09: o cadastro em maiúsculas não chega ao nome da
// ficha. O `<h1>`, o `<title>`, o card de compartilhamento e o `Car.name` do
// JSON-LD saem na grafia da casa (`grafiaDoCarro`).
describe("o nome da ficha na grafia de sempre, não em maiúsculas", () => {
  const PALIO = repasseDeTeste({
    marca: "FIAT",
    modelo: "PALIO",
    versao: "1.0 ECONOMY FIRE FLEX 8V 4P",
    ano_modelo: 2010,
    ano_fabricacao: 2010,
    situacao: "publicado",
    lojistas_desde: "2026-09-22T12:00:00Z",
    aberto_ao_publico_em: "2026-09-24T12:00:00Z",
  });
  const HB20 = repasseDeTeste({
    marca: "HYUNDAI",
    modelo: "HB20",
    versao: "1.0 COMFORT PLUS",
    ano_modelo: 2019,
    ano_fabricacao: 2019,
    situacao: "publicado",
    lojistas_desde: "2026-09-22T12:00:00Z",
    aberto_ao_publico_em: "2026-09-24T12:00:00Z",
  });

  it("o h1 e a página inteira: nada em maiúsculas do cadastro", async () => {
    estado.porSlug[SLUG] = PALIO;
    const html = await servida();
    expect(html).toMatch(/<h1[^>]*>Palio 1\.0 Economy Fire Flex 8V 4P<\/h1>/);
    // A trilha escreve em caixa alta por desenho, para todo carro ("INÍCIO /
    // REPASSE / RENAULT KWID ZEN 1.0 2021"). Fora dela, nada do cadastro cru.
    const foraDaTrilha = html.replace(/<nav aria-label="Trilha"[\s\S]*?<\/nav>/, "");
    expect(foraDaTrilha).not.toContain("PALIO");
    expect(foraDaTrilha).not.toContain("ECONOMY");
  });

  it("o Car.name do JSON-LD", async () => {
    estado.porSlug[SLUG] = PALIO;
    const carro = nos(await servida())[0];
    expect(carro.name).toBe("Fiat Palio 1.0 Economy Fire Flex 8V 4P 2010");
  });

  it("o título e o card de compartilhamento", async () => {
    estado.porSlug[SLUG] = PALIO;
    const meta = await ficha.generateMetadata({ params: Promise.resolve({ carro: SLUG }) });
    expect(meta.title).toBe("Fiat Palio 1.0 Economy Fire Flex 8V 4P 2010 no repasse | Motors Store");
    expect(String(meta.openGraph?.title)).toContain("Fiat Palio 1.0 Economy Fire Flex 8V 4P 2010");
    expect(JSON.stringify(meta)).not.toContain("PALIO");
  });

  it("modelo que é sigla fica inteiro: HB20", async () => {
    estado.porSlug[SLUG] = HB20;
    const html = await servida();
    expect(html).toMatch(/<h1[^>]*>HB20 1\.0 Comfort Plus<\/h1>/);
    expect(nos(html)[0].name).toBe("Hyundai HB20 1.0 Comfort Plus 2019");
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
