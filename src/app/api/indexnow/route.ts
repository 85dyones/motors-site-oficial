import { NextResponse } from "next/server";
import sitemap from "../../sitemap";
import { SITE_URL } from "../../../lib/site";
import { ENDPOINT_INDEXNOW, montarAviso, urlsParaAvisar } from "../../../lib/indexNow";

/**
 * O aviso diário do IndexNow, chamado pelo cron da Vercel (`vercel.json`).
 *
 * Quem pode chamar: com `CRON_SECRET` definido, só quem manda o
 * `Authorization: Bearer <segredo>` que a Vercel anexa ao cron. Sem ele, só o
 * agendador da Vercel (user-agent `vercel-cron`). Mesmo aberta, a rota só
 * avisaria o Bing de páginas nossas que mudaram; a trava existe para ninguém
 * gastar a tolerância do protocolo em nome da loja.
 *
 * Fora de produção não avisa nada: um preview que anunciasse as próprias URLs
 * ao Bing seria indexação de site duplicado.
 */
export const dynamic = "force-dynamic";

const HOST_DE_PRODUCAO = "motorsstore.com.br";

function autorizado(request: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (segredo) return request.headers.get("authorization") === `Bearer ${segredo}`;
  return /vercel-cron/i.test(request.headers.get("user-agent") ?? "");
}

export async function GET(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  if (new URL(SITE_URL).host !== HOST_DE_PRODUCAO) {
    return NextResponse.json({ avisadas: 0, motivo: `host ${new URL(SITE_URL).host} não é produção` });
  }

  const urls = urlsParaAvisar(await sitemap(), new Date());
  if (urls.length === 0) return NextResponse.json({ avisadas: 0 });

  const resposta = await fetch(ENDPOINT_INDEXNOW, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(montarAviso(SITE_URL, urls)),
  });

  // 200 e 202 são aceite; 422 é URL fora do host ou chave que não confere.
  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    console.error("[IndexNow] aviso recusado:", resposta.status, corpo.slice(0, 300));
    return NextResponse.json({ avisadas: 0, status: resposta.status }, { status: 502 });
  }
  return NextResponse.json({ avisadas: urls.length, status: resposta.status });
}
