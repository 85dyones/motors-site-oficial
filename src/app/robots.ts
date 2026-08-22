import { MetadataRoute } from "next";

import { SITE_URL } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: ["GPTBot", "ClaudeBot", "Google-Extended"],
        allow: ["/llms.txt", "/api/llms-full.txt"],
        disallow: ["/configuracoes", "/admin/", "/login", "/garagem", "/definir-senha", "/recuperar-senha"],
      },
      {
        userAgent: "*",
        allow: "/",
        // `/admin/` e `/login` entraram em 2026-08-06: o painel financeiro
        // (contas a pagar, margens, compras) estava crawleável e indexável.
        // O acesso já exige sessão (src/app/admin/layout.tsx redireciona), mas
        // sem isto a estrutura de URLs do painel aparecia em busca.
        // `/garagem` (2026-08-15) pela mesma razão: área logada de cliente.
        // `/definir-senha` (2026-08-21): tela de primeiro acesso, atrás de
        // convite de uso único — não há nada ali para indexar.
        disallow: ["/configuracoes", "/admin/", "/login", "/garagem", "/definir-senha", "/recuperar-senha", "/api/", "/test"],
      }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
