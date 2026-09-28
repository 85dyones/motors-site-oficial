import { describe, it, expect, vi, beforeEach } from "vitest";
import { SITE_URL } from "../src/lib/site";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * O sitemap, montado de verdade, na parte do repasse (spec §7.2): `/repasse`
 * sempre, as fichas publicadas e reservadas, numa leitura paralela com o
 * próprio `.catch()` — uma pane no repasse não tira o resto do site do
 * sitemap. Mocks no molde de `sitemap-anuncia-os-guias`.
 */
vi.mock("next/cache", () => ({
  unstable_cache: <T,>(fn: T) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}));
vi.mock("../src/lib/supabase", () => ({
  getCarimbosDeConteudo: async () => ({}),
  getEstoque: async () => [],
  getUltimasPresencas: async () => ({}),
  getVeiculoPdpUrl: () => "/carros/x/y/z-1",
}));
vi.mock("../src/lib/publicacao", () => ({
  getDatasDeVenda: async () => ({}),
  decidirPublicacao: () => ({ indisponivel: false, noindex: false, rotulo: "" }),
}));
vi.mock("../src/lib/guiasDoBanco", () => ({
  listarGuiasPublicados: async () => [],
  buscarGuiaPublicado: async () => null,
  GuiasIndisponiveisError: class extends Error {},
}));
vi.mock("../src/lib/settings", () => ({ getCachedSettings: async () => ({ companySettings: { name: "Motors Store" } }) }));

const estado = vi.hoisted(() => ({ repasses: [] as unknown[], falha: false }));
vi.mock("../src/lib/leituraDosRepasses", () => ({
  lerRepassesPublicos: async () => {
    if (estado.falha) throw new Error("banco fora");
    return estado.repasses;
  },
}));

const ABERTO = repasseDeTeste({ slug: "aberto-aaaaaa", situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z", aberto_ao_publico_em: "2026-09-24T12:00:00Z" });
const LOJISTAS = repasseDeTeste({ slug: "lojistas-bbbbbb", situacao: "publicado", lojistas_desde: "2026-09-23T12:00:00Z" });
const RESERVADO = repasseDeTeste({ slug: "reservado-cccccc", situacao: "reservado", lojistas_desde: "2026-09-20T12:00:00Z", aberto_ao_publico_em: "2026-09-20T12:00:00Z", reservado_em: "2026-09-23T12:00:00Z" });
const VENDIDO = repasseDeTeste({ slug: "vendido-dddddd", situacao: "vendido", lojistas_desde: "2026-09-10T12:00:00Z", aberto_ao_publico_em: "2026-09-10T12:00:00Z", vendido_em: "2026-09-20T12:00:00Z" });

async function sitemapMontado() {
  const { default: sitemap } = await import("../src/app/sitemap");
  return sitemap();
}

beforeEach(() => {
  estado.repasses = [ABERTO, LOJISTAS, RESERVADO, VENDIDO];
  estado.falha = false;
});

describe("o sitemap anuncia o repasse", () => {
  it("a página e as fichas publicadas e reservadas; o vendido fica fora", async () => {
    const urls = (await sitemapMontado()).map((r) => r.url);
    expect(urls).toContain(`${SITE_URL}/repasse`);
    for (const r of [ABERTO, LOJISTAS, RESERVADO]) expect(urls).toContain(`${SITE_URL}/repasse/${r.slug}`);
    expect(urls).not.toContain(`${SITE_URL}/repasse/${VENDIDO.slug}`);
  });

  it("o lastmod da ficha é a publicação, e o da página é a mais recente", async () => {
    const rotas = await sitemapMontado();
    const ficha = rotas.find((r) => r.url.endsWith(`/repasse/${ABERTO.slug}`));
    expect(ficha?.lastModified).toEqual(new Date("2026-09-24T12:00:00Z"));
    const pagina = rotas.find((r) => r.url === `${SITE_URL}/repasse`);
    expect(pagina?.lastModified).toEqual(new Date("2026-09-24T12:00:00Z"));
  });

  it("pane na leitura do repasse: a página continua, as fichas somem, o resto do site fica", async () => {
    estado.falha = true;
    const urls = (await sitemapMontado()).map((r) => r.url);
    expect(urls).toContain(`${SITE_URL}/repasse`);
    expect(urls.some((u) => u.includes("/repasse/"))).toBe(false);
    expect(urls).toContain(`${SITE_URL}/estoque`);
    expect(urls).toContain(`${SITE_URL}/guias`);
  });
});
