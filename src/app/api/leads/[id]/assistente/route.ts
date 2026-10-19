import { NextResponse, type NextRequest } from "next/server";
import { ACOES_DO_ASSISTENTE, mudarAssistente, type AcaoDoAssistente } from "../../../../../lib/atendimento-servidor";
import { lerLeadNoEscopo, sessaoDeLeads } from "../../../../../lib/gestaoDoLead-servidor";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * O assistente neste lead, pelo painel (2026-10-20).
 *
 *   - `pausar` .... o assistente sai da conversa; o SLA do vendedor corre.
 *   - `retomar` ... volta a qualificar (o SLA pausa de novo).
 *   - `entregar` .. passa ao vendedor agora, com o resumo, sem esperar esquentar.
 *   - `devolver` .. o vendedor devolve o lead que esfriou: o assistente fica
 *                   com ele e a cadência de engajamento começa.
 *
 * Mesma porta da gestão do lead: quem não vê o lead recebe 404.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, visao, recusa } = await sessaoDeLeads();
    if (recusa) return recusa;
    const guarda = await lerLeadNoEscopo(supabase, visao, id, "id, responsavel, desfecho");
    if (guarda.recusa) return guarda.recusa;

    const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const acao = corpo?.acao as AcaoDoAssistente;
    if (!ACOES_DO_ASSISTENTE.includes(acao)) {
      return NextResponse.json({ error: `Ação inválida. Use: ${ACOES_DO_ASSISTENTE.join(", ")}.` }, { status: 400 });
    }

    const r = await mudarAssistente(createAdminSupabaseClient(), {
      leadId: id,
      acao,
      autor: visao.meuNome?.trim() || "Equipe",
    });
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
    return NextResponse.json({ ok: true, ...(r.aviso ? { aviso: r.aviso } : {}) });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Erro inesperado" }, { status: 500 });
  }
}
