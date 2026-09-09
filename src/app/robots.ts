import { MetadataRoute } from "next";

import { SITE_URL } from "../lib/site";

/**
 * Tudo que nenhum rastreador deve buscar — uma lista só, para os dois grupos.
 *
 * Ela era escrita duas vezes, e as duas cópias divergiram: `/api/` e `/test`
 * entraram só na de baixo, e o grupo dos bots de IA passou a ser o caminho
 * ABERTO para exatamente o que o grupo geral fechava (medido em produção em
 * 2026-09-08). Um `Disallow` no grupo `*` não protege nada contra um bot que
 * tem grupo próprio: o protocolo manda ele obedecer a UM grupo, o mais
 * específico que casa com o seu user-agent, e ignorar o resto do arquivo.
 *
 * Com uma constante, a próxima entrada nasce valendo para os dois. Quem
 * mantém isso honesto é `tests/robots-grupos-nao-se-somam.test.ts`, que
 * compara os dois grupos em vez de conferir uma lista fixa — a trava tem de
 * sobreviver ao dia em que a lista mudar.
 *
 * Histórico das entradas:
 * - `/admin/` e `/login` (2026-08-06): o painel financeiro (contas a pagar,
 *   margens, compras) estava crawleável e indexável. O acesso já exige sessão
 *   (`src/app/admin/layout.tsx` redireciona), mas sem isto a estrutura de URLs
 *   do painel aparecia em busca.
 * - `/garagem` (2026-08-15): área logada de cliente, mesma razão.
 * - `/definir-senha` (2026-08-21): tela de primeiro acesso, atrás de convite
 *   de uso único — não há nada ali para indexar.
 * - `/api/` e `/test` (no grupo geral desde antes; no de IA a partir de
 *   2026-09-08, que é quando os dois grupos passaram a ler daqui).
 */
const FORA_DO_RASTREIO = [
  "/configuracoes",
  "/admin/",
  "/login",
  "/garagem",
  "/definir-senha",
  "/recuperar-senha",
  "/api/",
  "/test",
];

/**
 * O que os modelos de linguagem PODEM buscar, apesar do `/api/` fechado.
 *
 * Regra mais específica vence regra mais geral dentro do mesmo grupo — é o que
 * deixa `/api/llms-full.txt` passar por baixo do `Disallow: /api/`. É também
 * todo o motivo de o grupo de IA existir: sem estas duas linhas ele seria uma
 * cópia do grupo geral.
 */
const ABERTO_PARA_IA = ["/llms.txt", "/api/llms-full.txt"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: ["GPTBot", "ClaudeBot", "Google-Extended"],
        allow: ABERTO_PARA_IA,
        disallow: FORA_DO_RASTREIO,
      },
      {
        userAgent: "*",
        allow: "/",
        disallow: FORA_DO_RASTREIO,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
