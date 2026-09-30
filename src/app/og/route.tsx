import { ImageResponse } from "next/og";
import { getCachedSettings } from "../../lib/settings";
import DEFAULT_COMPANY_SETTINGS from "../../lib/companySettings.json";
import { ALTURA_CARD, LARGURA_CARD } from "../../lib/compartilhamento";
import { APOIO, ACENTO, PAPEL, TINTA, carregarArchivo, carregarLogo } from "./recursos";

/**
 * Card de compartilhamento gerado, 1200×630.
 *
 * É o fallback de quem não subiu arte no painel — e, principalmente, a
 * garantia de que nenhuma página volte a compartilhar o logo esticado. O
 * `/logo.png` tem 1024×513: dentro de um card 1200×630 ele cabe inteiro, com
 * respiro, em vez de ser deformado para preencher.
 *
 * Sem tema: quem vê a prévia está no WhatsApp, não no site. A paleta é a
 * Modernist fixa, que é a única que se lê igual no modo claro e no escuro do
 * app.
 *
 * Serve em `/og` e NÃO em `/api/og` de propósito: o `robots.ts` declara
 * `disallow: ["/api/"]`, e o crawler do Facebook — que é o mesmo que gera a
 * prévia do WhatsApp — respeita robots.txt ao buscar o `og:image`. Debaixo de
 * `/api` o card responderia 200 no navegador e sairia sem imagem no celular
 * do cliente, que é o tipo de defeito que ninguém encontra testando na tela.
 */
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const titulo = (searchParams.get("titulo") || "").trim().slice(0, 120);
  const rotulo = (searchParams.get("rotulo") || "").trim().slice(0, 40);

  let empresa: { name?: string; logoUrl?: string } = DEFAULT_COMPANY_SETTINGS;
  try {
    const { companySettings } = await getCachedSettings();
    if (companySettings) empresa = companySettings;
  } catch {
    // Fallback local — o card não depende do banco estar de pé.
  }

  const nomeLoja = empresa?.name?.trim() || "Motors Store";
  const [logo, fontes] = await Promise.all([
    carregarLogo(empresa?.logoUrl),
    carregarArchivo(),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: TINTA,
          padding: "72px 80px",
          fontFamily: "Archivo",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          {logo ? (
            // `objectFit: contain` com altura fixa: a largura acompanha a
            // proporção real do arquivo. É o oposto do que a home fazia.
            <img
              src={logo}
              height={84}
              style={{ height: 84, objectFit: "contain" }}
              alt=""
            />
          ) : (
            <div
              style={{
                display: "flex",
                fontSize: 44,
                fontWeight: 700,
                color: PAPEL,
                letterSpacing: "-0.02em",
              }}
            >
              {nomeLoja}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {rotulo ? (
            <div
              style={{
                display: "flex",
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: "0.22em",
                color: ACENTO,
                marginBottom: 20,
              }}
            >
              {rotulo.toUpperCase()}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              fontSize: titulo.length > 62 ? 60 : 76,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              color: PAPEL,
            }}
          >
            {titulo || nomeLoja}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", width: 64, height: 8, backgroundColor: ACENTO }} />
          <div
            style={{
              display: "flex",
              marginLeft: 24,
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: "0.14em",
              color: APOIO,
            }}
          >
            CURITIBA · PARANÁ
          </div>
        </div>
      </div>
    ),
    {
      width: LARGURA_CARD,
      height: ALTURA_CARD,
      ...(fontes ? { fonts: fontes } : {}),
      headers: {
        // O card só muda quando a loja troca logo ou nome. Um dia de cache na
        // borda evita rasterizar de novo a cada scraper que passa.
        "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
      },
    }
  );
}
