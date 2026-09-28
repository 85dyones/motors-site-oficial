import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings, Veiculo } from "../src/types";
import type { Repasse } from "../src/lib/repasse";
import { SITE_URL } from "../src/lib/site";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * `/repasse` renderizada — o `<script>` e o HTML de verdade, no molde de
 * `ficha-publica-o-grafo`: contar o que a rota SERVE, e não o que a função
 * devolve (grafoDoRepasse já tem teste próprio).
 */
const estado = vi.hoisted(() => ({ repasses: [] as unknown[], estoque: [] as unknown[] }));

const EMPRESA = {
  name: "Motors Store",
  phone: "41 99737-2165",
  whatsapp: "(41) 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "",
  instagram: "",
  facebook: "",
  cnpj: "",
} as CompanySettings;

vi.mock("../src/lib/leituraDosRepasses", () => ({ lerRepassesPublicos: async () => estado.repasses }));
vi.mock("../src/lib/supabase", () => ({
  getEstoque: async () => estado.estoque,
  getVeiculoPdpUrl: (v: { id: string }) => `/carros/marca/modelo/versao-${v.id}`,
}));
vi.mock("../src/lib/settings", () => ({ getCachedSettings: async () => ({ companySettings: EMPRESA }) }));
vi.mock("../src/app/ThemeContext", () => ({ useTheme: () => ({ companySettings: EMPRESA }) }));
vi.mock("../src/components/Turnstile", () => ({ default: () => null }));
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

const pagina = await import("../src/app/repasse/page");

const ABERTO = repasseDeTeste({ id: "a1000000-0000-4000-8000-000000000001", slug: "renault-kwid-zen-1-0-2021-a10000", situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z", aberto_ao_publico_em: "2026-09-24T12:00:00Z" });
const LOJISTAS = repasseDeTeste({ id: "b2000000-0000-4000-8000-000000000002", slug: "fiat-argo-drive-2019-b20000", marca: "Fiat", modelo: "Argo", situacao: "publicado", lojistas_desde: "2026-09-23T12:00:00Z" });
const RESERVADO = repasseDeTeste({ id: "c3000000-0000-4000-8000-000000000003", slug: "vw-gol-2015-c30000", situacao: "reservado", lojistas_desde: "2026-09-20T12:00:00Z", aberto_ao_publico_em: "2026-09-20T12:00:00Z", reservado_em: "2026-09-23T12:00:00Z" });
const VENDIDO = repasseDeTeste({ id: "d4000000-0000-4000-8000-000000000004", slug: "ford-ka-2018-d40000", situacao: "vendido", lojistas_desde: "2026-09-10T12:00:00Z", aberto_ao_publico_em: "2026-09-10T12:00:00Z", vendido_em: "2026-09-20T12:00:00Z" });
const ESTOQUE = ["1", "2", "3"].map(
  (id) =>
    ({
      id,
      marca: "Fiat",
      modelo: `Modelo ${id}`,
      versao: "1.0",
      ano: 2021,
      preco_original: 50000 + Number(id),
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
  estado.estoque = ESTOQUE;
});
afterEach(() => vi.useRealTimers());

async function servida(repasses: Repasse[]): Promise<string> {
  estado.repasses = repasses;
  return renderToStaticMarkup(await pagina.default()).replace(/\s+/g, " ");
}

function nos(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    const json = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&"));
    return Array.isArray(json) ? json : [json];
  });
}

describe("/repasse com carro no lote", () => {
  it("serve Breadcrumb, ItemList só dos abertos, FAQ, AutoDealer e WebSite", async () => {
    const grafo = nos(await servida([ABERTO, LOJISTAS, RESERVADO, VENDIDO]));
    expect(grafo.map((n) => n["@type"])).toEqual(["BreadcrumbList", "ItemList", "FAQPage", "AutoDealer", "WebSite"]);
    const lista = grafo[1] as { itemListElement: Array<{ url: string }> };
    expect(lista.itemListElement.map((i) => i.url)).toEqual([`${SITE_URL}/repasse/${ABERTO.slug}`]);
  });

  it("o HTML traz a ficha de cada carro do lote e dos que já saíram", async () => {
    const html = await servida([ABERTO, LOJISTAS, RESERVADO, VENDIDO]);
    for (const r of [ABERTO, LOJISTAS, RESERVADO, VENDIDO]) expect(html).toContain(`href="/repasse/${r.slug}"`);
  });

  it("contagens e a linha do lote saem do dado", async () => {
    const html = await servida([ABERTO, LOJISTAS, RESERVADO, VENDIDO]);
    expect(html).toContain("3 carros no repasse");
    expect(html).toContain("VER OS 3 CARROS");
    expect(html).toContain("Lote atualizado hoje, 24/09 · 1 carro aberto a todos · 1 só para lojistas");
    expect(html).toContain("Quem está na lista recebe o aviso no WhatsApp.");
  });

  it("o quadro do herói é do carro de verdade, nunca o da prancha", async () => {
    const html = await servida([ABERTO, LOJISTAS]);
    expect(html).toContain("A conta do Kwid 2021");
    expect(html).not.toContain("Kwid Zen 2020");
    expect(html).not.toContain("FORD KA SE 2017");
  });

  // Título aprovado pelo dono em 28/09: modelo e ano na grafia de sempre,
  // como a prancha. Era "A conta do FIAT PALIO 1.0 ECONOMY FIRE FLEX 8V 4P 2010".
  it("o título do quadro é modelo e ano, na grafia canônica, mesmo com o cadastro em maiúsculas", async () => {
    const palio = { ...ABERTO, marca: "FIAT", modelo: "PALIO", versao: "1.0 ECONOMY FIRE FLEX 8V 4P", ano_modelo: 2010 };
    const html = await servida([palio]);
    expect(html).toContain("A conta do Palio 2010");
    expect(html).not.toContain("A conta do FIAT");
    expect(html).not.toContain("A conta do PALIO");
  });

  it("o artigo do título concorda com o modelo: A conta da Strada", async () => {
    const strada = { ...ABERTO, marca: "FIAT", modelo: "STRADA", versao: "1.4 FREEDOM CD", ano_modelo: 2020, carroceria: "picape" as const };
    const html = await servida([strada]);
    expect(html).toContain("A conta da Strada 2020");
    expect(html).not.toContain("A conta do Strada");
  });

  it("o texto do herói é o do item 2, separado da busca e do compartilhamento", async () => {
    const html = await servida([ABERTO]);
    expect(html).toContain(
      "Carros funcionando, vendidos no estado em que estão: sem os reparos feitos e sem a garantia da loja, por isso abaixo da FIPE. Cada anúncio diz se o carro tem laudo cautelar e mostra a conta, e você confere tudo no pátio antes de fechar.",
    );
  });

  it("a diferença lado a lado traz o parágrafo novo abaixo do título", async () => {
    const html = await servida([ABERTO]);
    expect(html).toContain(
      "O mesmo carro pode estar nos dois lugares. No estoque, ele sai com os reparos feitos e com a garantia da loja. No repasse, sai como está, funcionando, sem essa garantia e por um preço menor.",
    );
  });

  it("as onze perguntas estão visíveis e a lista usa a linha da §7.4", async () => {
    const html = await servida([ABERTO]);
    expect(html).toContain("O que é um carro de repasse?");
    expect(html).toContain("O mesmo carro pode estar no estoque e no repasse?");
    expect(html).toContain("Sou lojista. O que muda para mim?");
    expect(html).toContain("Ao entrar na lista, você aceita receber avisos de repasse pelo WhatsApp e pode sair quando quiser.");
    expect(html).toContain("QUERO RECEBER OS REPASSES");
    expect(html).not.toMatch(/n[ãa]o\s+gir/i);
  });

  it("nenhum wa.me direto: o card e as perguntas abrem o pré-cadastro (28/09)", async () => {
    const html = await servida([ABERTO, LOJISTAS, RESERVADO, VENDIDO]);
    expect(html).not.toContain("wa.me");
    expect(html).toMatch(/<button type="button"[^>]*>.*?QUERO ESTE REPASSE<\/button>/);
    expect(html).toMatch(/<button type="button"[^>]*>.*?PERGUNTAR NO WHATSAPP<\/button>/);
  });

  it("são CINCO nós — cortar o array publicado tem que quebrar aqui", async () => {
    expect(nos(await servida([ABERTO]))).toHaveLength(5);
  });
});

describe("/repasse sem carro aberto", () => {
  it("vira a prancha do vazio: lista, já saíram, estoque com garantia — e a data só com venda", async () => {
    const html = await servida([VENDIDO]);
    expect(html).toContain("Nenhum repasse aberto agora");
    expect(html).toContain("o último carro saiu em 20/09");
    expect(html).toContain("QUERO RECEBER O PRÓXIMO");
    expect(html).toContain("Quem estava na lista recebeu o aviso no WhatsApp.");
    expect(html).toContain("No estoque com garantia");
    expect(html).toContain('href="/carros/marca/modelo/versao-1"');
    expect(nos(html).map((n) => n["@type"])).toEqual(["BreadcrumbList", "FAQPage", "AutoDealer", "WebSite"]);
  });

  it("sem venda nenhuma, sem data inventada e sem 'já saíram'", async () => {
    const html = await servida([]);
    expect(html).toContain("O repasse gira rápido. Entre na lista");
    expect(html).not.toContain("saiu em");
    expect(html).not.toContain("JÁ SAÍRAM DO REPASSE");
  });
});

describe("o cabeçalho da página", () => {
  it("título, descrição, canônico e card de compartilhamento", async () => {
    const meta = await pagina.generateMetadata();
    expect(meta.title).toBe("Carros de repasse em Curitiba | Motors Store");
    expect(meta.alternates?.canonical).toBe("/repasse");
    // Item 1 da tabela de textos aprovados pelo dono (28/09) tem 159
    // caracteres — passou dos 155 do teto antigo desta página de propósito;
    // documentado em textos-mesmo-carro.md.
    expect(String(meta.description).length).toBeLessThanOrEqual(160);
    expect(meta.openGraph?.title).toBe("Carros de repasse em Curitiba");
  });
});
