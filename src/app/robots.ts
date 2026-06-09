import { MetadataRoute } from "next";

const SITE_URL = "https://motors-site-oficial.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/configuracoes", "/api/", "/test"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
