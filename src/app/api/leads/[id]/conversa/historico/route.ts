import { NextResponse, type NextRequest } from "next/server";
import { lerLeadNoEscopo, sessaoDeLeads } from "../../../../../../lib/gestaoDoLead-servidor";
import { trazerHistoricoDoWhatsApp } from "../../../../../../lib/historicoDoWhatsApp-servidor";
import { createAdminSupabaseClient } from "../../../../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * "Trazer histórico do WhatsApp", no bloco de atendimento do lead
 * (2026-10-21): as mensagens mais recentes que a Evolution guardou entram na
 * conversa do painel — ver `lib/historicoDoWhatsApp.ts`.
 *
 * A porta é a da conversa (`sessaoDeLeads` + `lerLeadNoEscopo`): quem não vê
 * o lead leva 404. Grava com a chave de serviço, porque a conversa só é
 * escrita pelo servidor; o rastro do lead leva o nome de quem pediu.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, visao, recusa } = await sessaoDeLeads();
    if (recusa) return recusa;
    const guarda = await lerLeadNoEscopo(supabase, visao, id, "id, telefone, responsavel");
    if (guarda.recusa) return guarda.recusa;

    const lead = guarda.lead as { id: string; telefone: string | null };
    const r = await trazerHistoricoDoWhatsApp(createAdminSupabaseClient(), { id, telefone: lead.telefone }, {}, { autor: visao.meuNome || undefined });
    if (!r.ok) return NextResponse.json({ error: `Não deu para trazer o histórico: ${r.motivo}.` }, { status: 502 });
    return NextResponse.json({ ok: true, trazidas: r.trazidas, ja_estavam: r.ja_estavam });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Erro inesperado" }, { status: 500 });
  }
}
