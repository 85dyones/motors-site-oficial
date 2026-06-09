import { MetadataRoute } from "next";
import { getEstoque, getVeiculoPdpUrl } from "../lib/supabase";

const SITE_URL = "https://motors-site-oficial.vercel.app";

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
