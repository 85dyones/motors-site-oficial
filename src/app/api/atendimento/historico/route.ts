import { NextResponse } from "next/server";
import { autorizarMotorDoAtendimento } from "../../../../lib/autorizacaoDoAtendimento";
import { trazerHistoricoDoWhatsApp, type ResultadoDoHistorico } from "../../../../lib/historicoDoWhatsApp-servidor";
import { createAdminSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * O histórico do WhatsApp dos leads ativos, em lotes (2026-10-21) — ver
 * `lib/historicoDoWhatsApp.ts`. Chamado à mão, com o token do motor, até
 * `proximo` voltar nulo:
 *
 *   POST { "limite": 8 }                       → os primeiros 8 leads abertos
 *   POST { "depois_de": "<id>", "limite": 8 }  → os seguintes
 *
 * Lead aberto é o sem desfecho, com telefone, na ordem do id. Trazer de novo
 * não duplica (o id do WhatsApp é único): um lote interrompido é só chamar
 * outra vez com o mesmo `depois_de`. Para no meio se o tempo da função
 * apertar, e `proximo` diz de onde seguir.
 */
const TEMPO_DO_LOTE_MS = 45_000;

export async function POST(request: Request) {
  const auth = await autorizarMotorDoAtendimento(request);
  if (auth.erro) return auth.erro;

  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const limite = Math.max(1, Math.min(Number(corpo?.limite) || 8, 20));
  const quantas = Math.max(1, Math.min(Number(corpo?.quantas) || 50, 100));
  const depoisDe = typeof corpo?.depois_de === "string" && /^[0-9a-f-]{36}$/i.test(corpo.depois_de) ? corpo.depois_de : null;

  let supabase;
  try {
    supabase = createAdminSupabaseClient();
  } catch {
    return NextResponse.json({ error: "Atendimento indisponível: credencial de serviço não configurada." }, { status: 503 });
  }

  let consulta = supabase
    .from("leads")
    .select("id, telefone")
    .is("desfecho", null)
    .not("telefone", "is", null)
    .order("id", { ascending: true })
    .limit(limite);
  if (depoisDe) consulta = consulta.gt("id", depoisDe);
  const { data: leads, error } = await consulta;
  if (error) return NextResponse.json({ ok: false, error: `Leads ilegíveis: ${error.message}` }, { status: 500 });

  const inicio = Date.now();
  const resultados: ResultadoDoHistorico[] = [];
  let ultimo: string | null = depoisDe;
  for (const lead of (leads ?? []) as { id: string; telefone: string | null }[]) {
    if (Date.now() - inicio > TEMPO_DO_LOTE_MS) break;
    resultados.push(await trazerHistoricoDoWhatsApp(supabase, lead, {}, { quantas }));
    ultimo = lead.id;
  }
  const terminou = resultados.length === (leads ?? []).length && (leads ?? []).length < limite;
  const falhas = resultados.filter((r) => !r.ok).length;
  console.info("[Histórico]", JSON.stringify({ leads: resultados.length, falhas }));
  return NextResponse.json({
    ok: true,
    leads: resultados.length,
    trazidas: resultados.reduce((soma, r) => soma + (r.ok ? r.trazidas : 0), 0),
    falhas,
    resultados,
    proximo: terminou ? null : ultimo,
  });
}
