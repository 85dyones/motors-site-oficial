import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-server";
import { janelaDeDias } from "../../../../../lib/midiaSync";
import { aplicarAprovadasNoMeta } from "../../../../../lib/copilotoMeta-aplicar";
import { rodarDiagnosticoMeta } from "../../../../../lib/copilotoMeta-servidor";
import { repescarQualificacoes } from "../../../../../lib/qualificacaoParaMeta-servidor";
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
 *
 * A rodada AGENDADA é também a do Copiloto do Meta (17/10/2026), no papel que
 * o script da conta faz no Google:
 *   1. aplica o que foi aprovado (`aplicarAprovadasNoMeta`) — ANTES de
 *      sincronizar, para a sincronização logo depois já ler a conta mudada;
 *   2. sincroniza;
 *   3. faz o diagnóstico do dia, uma vez, a partir da hora das regras
 *      (`rodarDiagnosticoMeta`);
 *   4. manda ao Meta o LeadQualificado que ficou para trás
 *      (`repescarQualificacoes`, 17/10/2026).
 * O copiloto nunca derruba a sincronização: o erro dele vai no log e na
 * resposta, e a rodada segue. O botão do painel só sincroniza.
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

  const copiloto: Record<string, unknown> = {};
  if (gatilho === "agendado") {
    try {
      // A conta e a versão da sincronização: o executor muda a conta de onde vieram os IDs.
      copiloto.aplicacao = await aplicarAprovadasNoMeta(admin, cfg);
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      console.error(`[Copiloto do Meta] aplicação: ${motivo}`);
      copiloto.aplicacao = { feito: false, motivo };
    }
  }

  const janela = janelaDeDias(gatilho === "painel" ? 30 : 7);
  try {
    const lote = await buscarMeta(janela, cfg);
    const r = await gravarLote(admin, lote);
    await registrarRodada(admin, { plataforma: "meta", gatilho, iniciadaEm, ok: true, ...r });
    if (gatilho === "agendado") {
      try {
        copiloto.diagnostico = await rodarDiagnosticoMeta(admin, `act_${cfg.conta}`);
      } catch (err) {
        const motivo = err instanceof Error ? err.message : String(err);
        console.error(`[Copiloto do Meta] diagnóstico: ${motivo}`);
        copiloto.diagnostico = { feito: false, motivo };
      }
      // O LeadQualificado que ficou para trás (qualificou antes do envio
      // existir, ou a entrega falhou): até 5 por rodada, dentro dos 7 dias.
      try {
        copiloto.repescagem = await repescarQualificacoes(admin);
      } catch (err) {
        const motivo = err instanceof Error ? err.message : String(err);
        console.error(`[Meta CAPI] repescagem: ${motivo}`);
        copiloto.repescagem = { feito: false, motivo };
      }
    }
    return NextResponse.json({ ok: true, janela, ...r, ...(gatilho === "agendado" ? { copiloto } : {}) });
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err);
    await registrarRodada(admin, { plataforma: "meta", gatilho, iniciadaEm, ok: false, erro });
    return NextResponse.json({ error: erro }, { status: 502 });
  }
}
