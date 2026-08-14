import { MetadataRoute } from "next";

import { SITE_URL } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: ["GPTBot", "ClaudeBot", "Google-Extended"],
        allow: ["/llms.txt", "/api/llms-full.txt"],
        disallow: ["/configuracoes", "/admin/", "/login"],
      },
      {
        userAgent: "*",
        allow: "/",
        // `/admin/` e `/login` entraram em 2026-08-06: o painel financeiro
        // (contas a pagar, margens, compras) estava crawleável e indexável.
        // O acesso já exige sessão (src/app/admin/layout.tsx redireciona), mas
        // sem isto a estrutura de URLs do painel aparecia em busca.
        disallow: ["/configuracoes", "/admin/", "/login", "/api/", "/test"],
      }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
