import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-server";
import { validarPayloadGoogle } from "../../../../../lib/midiaSync";
import { gravarLote, registrarRodada, segredoConfere } from "../../../../../lib/midiaSyncServidor";

export const dynamic = "force-dynamic";

/**
 * Recebe o que o script do Google Ads manda (`scripts/google-ads-script.js`).
 *
 * O segredo vem em `X-Motors-Segredo` e é conferido pelo banco. Tentativa sem
 * segredo válido NÃO vira linha em `midia_sincronizacoes`: qualquer um na
 * internet pode bater aqui, e a tabela do painel não é lugar para isso.
 * Com segredo válido, tudo é registrado — inclusive o payload recusado, que é
 * o sinal de que o script colado na conta está desatualizado.
 */
export async function POST(request: NextRequest) {
  const iniciadaEm = new Date();
  const admin = createAdminSupabaseClient();

  const segredo = request.headers.get("x-motors-segredo")?.trim();
  if (!(await segredoConfere(admin, "midia_google_segredo", segredo))) {
    console.warn("[Mídia sync] POST /sincronizar/google sem segredo válido");
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const corpo = await request.json().catch(() => null);
  const validacao = validarPayloadGoogle(corpo);
  if (!validacao.ok) {
    await registrarRodada(admin, {
      plataforma: "google",
      gatilho: "script",
      iniciadaEm,
      ok: false,
      erro: `payload recusado: ${validacao.erro}`,
    });
    return NextResponse.json({ error: validacao.erro }, { status: 400 });
  }

  try {
    const r = await gravarLote(admin, validacao.lote);
    await registrarRodada(admin, { plataforma: "google", gatilho: "script", iniciadaEm, ok: true, ...r });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err);
    await registrarRodada(admin, { plataforma: "google", gatilho: "script", iniciadaEm, ok: false, erro });
    return NextResponse.json({ error: erro }, { status: 500 });
  }
}
