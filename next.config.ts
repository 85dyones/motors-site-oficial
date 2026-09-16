import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.15.11"],
  /**
   * Otimização de imagem: LIGADA, restrita pelos `remotePatterns` com
   * `pathname` fixo logo abaixo. Contexto completo em
   * `docs/DIAGNOSTICO_IMAGENS.md`.
   *
   * Histórico — por que esteve DESLIGADA (`unoptimized: true` global) de
   * 2026-08-26 a 2026-09-16: medido em produção em 26/08, TODA transformação
   * nova do otimizador respondia `402
   * OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED` — inclusive para `/logo.png`,
   * arquivo local do próprio deploy. A cota de Image Optimization do plano
   * Hobby (5.000 transformações/mês) estourou em ~13/08 (todos os HITs de
   * cache tinham `age` apontando para uma janela de 16 minutos daquele dia).
   * O catálogo gera ~740 fotos × 10 larguras ≈ 7.400+ transformações: esse
   * número não mudou nesta reativação e estoura de novo todo mês, em
   * qualquer reset.
   *
   * O que mudou, e sustenta religar em 2026-09-16 (decisão do dono): os
   * `remotePatterns` abaixo ganharam `pathname` fixo. Antes, `hostname`
   * sozinho bastava — e `s3.carro57.com.br` hospeda TODAS as revendas
   * RevendaMais, `*.supabase.co` seria o Storage de QUALQUER projeto Supabase
   * do mundo. Sem `pathname`, qualquer um podia apontar o NOSSO otimizador
   * para uma URL fora do nosso recorte e queimar a cota por fora do nosso
   * próprio tráfego — esse vetor fecha aqui.
   *
   * O que isto NÃO resolve: o volume do NOSSO catálogo. O card manda
   * `unoptimized` só para a foto que já é nossa (`ehFotoPropria`, storage
   * próprio) — as fotos do carro57, hoje 100% do estoque, voltam a passar
   * pelo otimizador de verdade agora que o flag global caiu (com o flag
   * ligado, `config.unoptimized` sobrepunha qualquer prop por imagem — ver
   * `next/dist/shared/lib/get-img-props.js`). Se o volume voltar a estourar a
   * cota, a saída definitiva (plano Pro ou loader custom usando as variantes
   * `_P_/_S_/_M_/_G_/_W_` que o próprio RevendaMais já serve) continua
   * descrita no diagnóstico e é decisão de negócio.
   */
  images: {
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
        // Só o Storage PÚBLICO do NOSSO projeto — hoje o bucket `branding` e,
        // desde 31/08, as fotos do estoque em `veiculos`. `*.supabase.co`
        // deixava o otimizador aberto para o Storage de qualquer projeto
        // Supabase do mundo.
        protocol: "https",
        hostname: "zwbqmzgnagfeqinqkolp.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],

    /*
     * O TTL da imagem otimizada — e por que 31 dias.
     *
     * A Vercel cobra transformação em todo cache MISS **e em todo STALE**
     * (`vercel.com/docs/image-optimization/limits-and-pricing`). Medido na
     * produção em 2026-09-09, numa foto da galeria de uma PDP:
     *
     *     Cache-Control: public, max-age=14400, must-revalidate
     *     X-Vercel-Cache: STALE     Age: 471857   (5,5 dias)
     *
     * Os 14400s (4 h) eram o padrão do Next 16 — `image-config.js` traz
     * `minimumCacheTTL: 14400`, e este campo não estava declarado. O TTL
     * efetivo é `Math.max(minimumCacheTTL, max-age da origem)`
     * (`next/dist/server/image-optimizer.js`), e a origem manda 3600s: quem
     * decidia era o padrão. A MESMA foto voltava a ser cobrada a cada 4 h.
     *
     * Quem ganha com isto é toda foto de veículo que passa pelo otimizador:
     * a galeria da PDP sempre, e o card também — para a foto do carro57, já
     * que o `unoptimized` do card só protege a foto que já é nossa
     * (`ehFotoPropria`; ver comentário de `remotePatterns` acima). E vale
     * para as fotos que JÁ estão no bucket, porque o `Math.max` passa por
     * cima do `max-age=3600` delas.
     *
     * 31 dias se apoia num caminho que não se reescreve: cada envio gera
     * nome próprio — `novoLote()` no painel, `loteDaOrigem()` (sha1 da URL
     * de origem) no script de migração — e os uploads usam `upsert: false`.
     * Trocar uma foto gera outra URL.
     *
     * O que essa premissa NÃO cobre, e é bom estar escrito: a policy
     * `veiculos_staff_atualiza`
     * (`20260829180000_f0p_storage_das_fotos_do_veiculo.sql`) permite que a
     * equipe substitua o arquivo no MESMO caminho pelo painel do Supabase.
     * O código nunca faz isso, mas quem fizer passa a servir bytes velhos
     * por até 31 dias aqui — contra 1 h antes desta linha. A saída é
     * pontual e oficial: `vercel cache invalidate --srcimg <url>`.
     *
     * Ressalva de futuro, que nasce desta linha: `localPatterns` não está
     * definido, então um `<Image src="/hero.jpg">` apontando para `public/`
     * passaria por aqui com URL estável — e trocar esse arquivo num deploy o
     * congelaria por 31 dias, já que o cache de imagem da Vercel sobrevive a
     * redeploy. Imagem trazida por `import` não tem o problema: o Next
     * carimba hash de conteúdo no nome.
     */
    minimumCacheTTL: 2678400,
    /*
     * `dangerouslyAllowSVG` saiu em 2026-09-08, e o "dangerously" no nome é
     * literal: SVG é XML que pode conter `<script>`, e servido pelo
     * `/_next/image` ele sai do NOSSO domínio — script com a origem da página,
     * ou seja, XSS de mesma origem. O `remotePatterns` acima inclui o Storage
     * público do Supabase, que é o bucket de upload de fotos: conteúdo que o
     * painel grava, não conteúdo que este repositório revisa.
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
