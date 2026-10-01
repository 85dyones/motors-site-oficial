import { NextResponse } from "next/server";
import sitemap from "../../sitemap";
import { SITE_URL } from "../../../lib/site";
import { ENDPOINT_INDEXNOW, montarAviso, urlsParaAvisar } from "../../../lib/indexNow";

/**
 * O aviso diário do IndexNow, chamado pelo cron da Vercel (`vercel.json`).
 *
 * Quem pode chamar: só quem manda o `Authorization: Bearer <CRON_SECRET>`, que
 * a Vercel anexa sozinha ao cron quando a variável existe. Sem a variável, a
 * rota recusa tudo: user-agent se falsifica com um `curl -A`, e cada chamada
 * lê o banco inteiro e gasta a tolerância do protocolo em nome da loja
 * (revisão do qa-guardian, 01/10/2026).
 *
 * Fora de produção não avisa nada: um preview que anunciasse as próprias URLs
 * ao Bing seria indexação de site duplicado. Vale o `VERCEL_ENV` E o host,
 * porque `NEXT_PUBLIC_SITE_URL` pode ser o mesmo no preview.
 */
export const dynamic = "force-dynamic";

const HOST_DE_PRODUCAO = "motorsstore.com.br";

function autorizado(request: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  return request.headers.get("authorization") === `Bearer ${segredo}`;
}

export async function GET(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  if (process.env.VERCEL_ENV !== "production" || new URL(SITE_URL).host !== HOST_DE_PRODUCAO) {
    return NextResponse.json({ avisadas: 0, motivo: "fora de produção" });
  }

  const urls = urlsParaAvisar(await sitemap(), new Date(), SITE_URL);
  if (urls.length === 0) return NextResponse.json({ avisadas: 0 });

  const resposta = await fetch(ENDPOINT_INDEXNOW, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(montarAviso(SITE_URL, urls)),
    signal: AbortSignal.timeout(10_000),
  });

  // 200 e 202 são aceite; 422 é URL fora do host ou chave que não confere.
  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    console.error("[IndexNow] aviso recusado:", resposta.status, corpo.slice(0, 300));
    return NextResponse.json({ avisadas: 0, status: resposta.status }, { status: 502 });
  }
  return NextResponse.json({ avisadas: urls.length, status: resposta.status });
}
