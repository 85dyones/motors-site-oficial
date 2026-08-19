import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.15.11"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "s3.carro57.com.br",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
    dangerouslyAllowSVG: true,
  },

  /**
   * O alias da Vercel manda as PÁGINAS para o domínio — e só as páginas.
   *
   * P4 da `docs/RECOMENDACAO_SEO.md`. Até 2026-08-19 o alias
   * `motors-site-oficial.vercel.app` servia o site inteiro com 200: conteúdo
   * duplicado aos olhos do Google, mitigado pelo canonical, mas mitigado não
   * é resolvido.
   *
   * ⚠️ **`/api/*` fica de fora, e isso não é detalhe.** Quatro workflows do
   * n8n chamam o site pelo alias — confirmado em 2026-08-18 lendo o export do
   * orquestrador, cujos três nós HTTP apontam para lá. Um 301 abrangente os
   * derrubaria: alguns clientes HTTP não repetem POST depois de redirect, e o
   * cabeçalho `Authorization` costuma ser descartado ao trocar de host. O
   * resultado seria o motor em silêncio.
   *
   * O negativo `(?!api/)` é o que separa os dois casos. Quando os workflows
   * migrarem para o domínio, esta exceção pode cair — não antes.
   *
   * Feito aqui e não no proxy de propósito: o matcher do proxy não cobre
   * páginas, e ampliá-lo faria o middleware rodar em toda visita só para
   * conferir um cabeçalho.
   */
  async redirects() {
    const alias = "motors-site-oficial.vercel.app";
    const destino = "https://motorsstore.com.br";
    return [
      {
        source: "/:caminho((?!api/).*)",
        has: [{ type: "host", value: alias }],
        destination: `${destino}/:caminho`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
