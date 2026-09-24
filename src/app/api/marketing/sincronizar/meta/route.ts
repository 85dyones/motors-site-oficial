import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-server";
import { janelaDeDias } from "../../../../../lib/midiaSync";
import { buscarMeta, configMeta } from "../../../../../lib/midiaMeta";
import {
  gravarLote,
  registrarRodada,
  segredoConfere,
  staffPodeSincronizar,
} from "../../../../../lib/midiaSyncServidor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Puxa o Meta Ads e grava (spec 2026-09-24).
 *
 * Duas portas:
 *   - o pg_cron, de hora em hora, com `Authorization: Bearer <midia_cron_segredo>`
 *     (janela de 7 dias);
 *   - o botão "Sincronizar agora" do painel, com sessão de quem pode gerenciar
 *     campanhas (janela de 30 dias — a primeira carga precisa de histórico).
 *
 * Toda rodada autenticada vira uma linha em `midia_sincronizacoes`, deu certo
 * ou não: é o que o painel mostra como "última sincronização".
 */
export async function POST(request: NextRequest) {
  const iniciadaEm = new Date();
  const admin = createAdminSupabaseClient();

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  let gatilho: "agendado" | "painel";
  if (bearer && (await segredoConfere(admin, "midia_cron_segredo", bearer))) {
    gatilho = "agendado";
  } else if (await staffPodeSincronizar()) {
    gatilho = "painel";
  } else {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const cfg = configMeta();
  if ("erro" in cfg) {
    await registrarRodada(admin, { plataforma: "meta", gatilho, iniciadaEm, ok: false, erro: cfg.erro });
    return NextResponse.json({ error: cfg.erro }, { status: 500 });
  }

  const janela = janelaDeDias(gatilho === "painel" ? 30 : 7);
  try {
    const lote = await buscarMeta(janela, cfg);
    const r = await gravarLote(admin, lote);
    await registrarRodada(admin, { plataforma: "meta", gatilho, iniciadaEm, ok: true, ...r });
    return NextResponse.json({ ok: true, janela, ...r });
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err);
    await registrarRodada(admin, { plataforma: "meta", gatilho, iniciadaEm, ok: false, erro });
    return NextResponse.json({ error: erro }, { status: 502 });
  }
}
