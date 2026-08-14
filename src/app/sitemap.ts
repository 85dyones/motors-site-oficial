import { MetadataRoute } from "next";
import { getEstoque, getVeiculoPdpUrl } from "../lib/supabase";
import { getCachedSettings } from "../lib/settings";
import {
  DESTAQUES_PADRAO,
  normalizarQuickTags,
  normalizarStockOverrides,
  resolverDestaques,
} from "../lib/destaquesRapidos";

import { SITE_URL } from "../lib/site";

/**
 * Slugs das landings de destaque que realmente existem.
 *
 * Antes esta lista era fixa: anunciava `curadoria` e `economicos`, que não
 * estão configuradas em produção, e omitia as categorias criadas no painel.
 * Agora sai do mesmo lugar que alimenta os chips da home — e só entra quem
 * tem veículo casando com a regra, para o Google não indexar grade vazia.
 */
async function destaquesParaSitemap(): Promise<string[]> {
  try {
    const [estoque, settings] = await Promise.all([getEstoque(), getCachedSettings()]);
    const tags = normalizarQuickTags(settings.quickTags);
    return resolverDestaques(
      tags.length > 0 ? tags : DESTAQUES_PADRAO,
      estoque.filter((v) => !v.vendido),
      normalizarStockOverrides(settings.stockOverrides),
    ).map((d) => d.slug);
  } catch (error) {
    console.error("[Sitemap] Falha ao resolver destaques:", error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages of the website
  const routes = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 1.0,
    },
    {
      // Catálogo completo — a página que a home aponta como "ver todo o estoque"
      url: `${SITE_URL}/estoque`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/carro-perfeito`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/avaliacao`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/sobre`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/contato`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/privacidade`,
      lastModified: new Date(),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
    ...(await destaquesParaSitemap()).map(slug => ({
      url: `${SITE_URL}/destaques/${slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.9,
    }))
  ];

  // Dynamic vehicle detail pages (PDP) fetched from Supabase
  try {
    const estoque = await getEstoque();
    
    // Filter out sold/unavailable vehicles if desired, but indexable used car sites usually keep all active pages.
    // We will generate links for all catalog listings.
    const vehicleRoutes = estoque.map((veiculo) => ({
      url: `${SITE_URL}${getVeiculoPdpUrl(veiculo)}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.9,
    }));

    return [...routes, ...vehicleRoutes];
  } catch (error) {
    console.error("[Sitemap] Dynamic generation failed, serving fallback static routes:", error);
    return routes;
  }
}
