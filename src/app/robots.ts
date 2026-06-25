import { MetadataRoute } from "next";

const SITE_URL = "https://motors-site-oficial.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: ["GPTBot", "ClaudeBot", "Google-Extended"],
        allow: ["/llms.txt", "/api/llms-full.txt"],
        disallow: ["/configuracoes"],
      },
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/configuracoes", "/api/", "/test"],
      }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
