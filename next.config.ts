import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.15.11"],
  /**
   * `unoptimized: true` é ESTANCAMENTO, não estado final — contexto completo
   * em `docs/DIAGNOSTICO_IMAGENS.md`.
   *
   * Medido em produção em 2026-08-26: TODA transformação nova do otimizador
   * responde `402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED` — inclusive para
   * `/logo.png`, arquivo local do próprio deploy. A cota de Image Optimization
   * do plano Hobby (5.000 transformações/mês) estourou em ~13/08 (todos os
   * HITs de cache têm `age` apontando para uma janela de 16 minutos daquele
   * dia). O catálogo gera ~740 fotos × 10 larguras ≈ 7.400+ transformações:
   * estoura de novo todo mês, em qualquer reset.
   *
   * Servir a origem direta é seguro aqui: o S3 do RevendaMais responde atrás
   * de Cloudflare com `cache-control: max-age=31536000`, e é exatamente o que
   * o feed XML e o hero (`<img>` cru) sempre fizeram. O custo é peso de página
   * (foto `_W_` ≈ 190 KB vs ~25 KB otimizada) — a saída definitiva (plano Pro
   * ou loader custom usando as variantes `_P_/_S_/_M_/_G_/_W_` que o próprio
   * RevendaMais já serve) está descrita no diagnóstico e é decisão de negócio.
   */
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        // `pathname` fixo: sem ele, qualquer pessoa pode apontar o NOSSO
        // otimizador para qualquer objeto desse S3 compartilhado (todas as
        // revendas RevendaMais moram nele) e queimar a nossa cota.
        protocol: "https",
        hostname: "s3.carro57.com.br",
        pathname: "/FC/9037/**",
      },
      {
        // Só o bucket público de branding do NOSSO projeto — `*.supabase.co`
        // deixava o otimizador aberto para o Storage de qualquer projeto
        // Supabase do mundo.
        protocol: "https",
        hostname: "zwbqmzgnagfeqinqkolp.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // `dangerouslyAllowSVG` saiu: nenhum `<Image>` do projeto serve SVG (os
    // SVGs são todos inline em JSX), e a flag mantinha o otimizador disposto a
    // rasterizar SVG de URL colada à mão no painel.
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
