import { describe, it, expect, vi } from "vitest";
import { GUIAS } from "../src/lib/guias";
import { SITE_URL } from "../src/lib/site";

/**
 * O sitemap, montado de verdade — a outra porta do cluster de guias.
 *
 * A revisão da F3 removeu os dois blocos novos de `src/app/sitemap.ts` (o
 * índice e o `...GUIAS.map`) e rodou a suíte cheia: **124 arquivos, 2159 testes,
 * verde**. O conteúdo editorial inteiro sairia do sitemap sem uma linha
 * vermelha, e eu tinha escrito duas travas para o rodapé e nenhuma para aqui.
 *
 * O padrão da casa cobre isso pela FUNÇÃO — `hubs-perenes` testa
 * `caminhosDosHubs`, não o sitemap. Isso pega o gerador quebrando e não pega a
 * linha sumindo da rota, que é o defeito que a revisão provou. Por isso este
 * arquivo importa `src/app/sitemap` e conta o que ele devolve.
 *
 * Vive separado de `guias-publicam-o-grafo` porque os mocks são outros: o
 * sitemap toca banco, e `vi.mock` é içado para o arquivo inteiro.
 */

// `unstable_cache` exige o runtime do Next e estoura fora dele
// ("Invariant: incrementalCache missing"). Passthrough: o que está sob teste é
// a montagem da lista, não a política de cache.
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

vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: { name: "Motors Store" } }),
}));

async function sitemapMontado() {
  const { default: sitemap } = await import("../src/app/sitemap");
  return sitemap();
}

describe("o sitemap anuncia o cluster de guias", () => {
  it("o índice está lá", async () => {
    const urls = (await sitemapMontado()).map((r) => r.url);

    expect(urls).toContain(`${SITE_URL}/guias`);
  });

  it("cada guia publicado está lá", async () => {
    const urls = (await sitemapMontado()).map((r) => r.url);

    expect(GUIAS.length).toBeGreaterThan(0);
    for (const guia of GUIAS) {
      expect(urls, `guia fora do sitemap: ${guia.slug}`).toContain(
        `${SITE_URL}/guias/${guia.slug}`,
      );
    }
  });

  it("o lastmod do guia é o carimbo do texto, não o do inventário", async () => {
    const rotas = await sitemapMontado();
    const guia = GUIAS[0];
    const entrada = rotas.find((r) => r.url.endsWith(`/guias/${guia.slug}`));

    // Guia não gira com o estoque. `lastModified` que mente é pior que ausente
    // — foi a lição do sitemap em 2026-08-17.
    expect(entrada?.lastModified).toBe(guia.atualizadoEm);
  });

  it("o estoque vazio não derruba o cluster do sitemap", async () => {
    // Os mocks acima devolvem estoque zerado de propósito: guia é conteúdo, e
    // não pode sumir do sitemap quando o pátio esvazia ou o sync cai.
    const urls = (await sitemapMontado()).map((r) => r.url);

    expect(urls).toContain(`${SITE_URL}/guias`);
    expect(urls).toContain(`${SITE_URL}/guias/${GUIAS[0].slug}`);
  });
});
