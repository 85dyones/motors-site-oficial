import type { ReactNode } from "react";

/**
 * A casca das landing pages de campanha.
 *
 * `(campanha)` entre parênteses é ROUTE GROUP: agrupa os arquivos sem entrar
 * na URL. `pole-position-2026/page.tsx` daqui responde em
 * `/pole-position-2026`, na raiz, que é onde campanha tem de morar — o
 * endereço vai em anúncio, em story e em card de WhatsApp.
 *
 * A casca é deliberadamente vazia. A decisão do dono em 08/09 foi "página em
 * branco, design livre": cada LP desenha o seu, e o que se compartilha é o
 * CTA e o tracking, não o layout.
 *
 * O que NÃO se perde ao largar a moldura: `IntegrationsTracker`,
 * `CamadaDeDados` e `AntigravityTracker` estão FORA do `MolduraDoSite` no
 * layout raiz, então Pixel, CAPI e GA4 seguem rodando aqui. O aviso de cookies
 * também fica — ver `AvisoLegalDoSite`.
 *
 * ⚠️ **Não use os tokens `--brand-*` numa LP.** O script anti-flicker do layout
 * raiz os sobrescreve conforme o tema salvo no navegador do visitante (são
 * quatro), e a arte da campanha apareceria em dourado para quem tem
 * `stealth-dark`. LP de campanha declara cor literal.
 */
export default function LayoutDeCampanha({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen w-full flex-col">{children}</div>;
}
