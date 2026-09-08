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
    /*
     * `dangerouslyAllowSVG` saiu em 2026-09-08, e o "dangerously" no nome é
     * literal: SVG é XML que pode conter `<script>`, e servido pelo
     * `/_next/image` ele sai do NOSSO domínio — script com a origem da página,
     * ou seja, XSS de mesma origem. O `remotePatterns` acima inclui
     * `*.supabase.co`, que é o bucket de upload de fotos: conteúdo que o painel
     * grava, não conteúdo que este repositório revisa.
     *
     * Medido antes de remover: zero `.svg` em `public/` e em `src/`, e zero
     * entre as 3.186 URLs de foto do estoque (2.136 jpeg, 525 jpg, 525 webp).
     * A flag não estava habilitando nada — só o risco.
     *
     * Para voltar (um ícone que precise passar pelo otimizador), ela vem
     * acompanhada, nunca sozinha:
     *
     *     dangerouslyAllowSVG: true,
     *     contentDispositionType: "attachment",
     *     contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
     *
     * `tests/otimizador-de-imagem.test.ts` cobra exatamente isso: ele não
     * proíbe a flag, proíbe a flag desacompanhada.
     */
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
