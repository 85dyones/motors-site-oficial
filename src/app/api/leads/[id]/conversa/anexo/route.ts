import { NextResponse, type NextRequest } from "next/server";
import { prepararAnexoDoPainel } from "../../../../../../lib/atendimento-servidor";
import { lerLeadNoEscopo, sessaoDeLeads } from "../../../../../../lib/gestaoDoLead-servidor";
import { createAdminSupabaseClient } from "../../../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * O primeiro passo do anexo do painel (2026-10-20): `{ nome, tipo, bytes }` →
 * `{ caminho, token }`, a URL assinada de upload para a pasta do lead.
 *
 * A porta é a da conversa (`sessaoDeLeads` + `lerLeadNoEscopo`): quem não vê
 * o lead leva 404. A assinatura é da chave de serviço — o bucket é privado e
 * sem policy —, e o arquivo só vai ao cliente no segundo passo
 * (`POST /api/leads/[id]/conversa` com `anexo.caminho`), que confere de novo
 * o tipo e o tamanho pelo que o bucket recebeu.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, visao, recusa } = await sessaoDeLeads();
    if (recusa) return recusa;
    const guarda = await lerLeadNoEscopo(supabase, visao, id, "id, responsavel");
    if (guarda.recusa) return guarda.recusa;

    const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const r = await prepararAnexoDoPainel(createAdminSupabaseClient(), {
      leadId: id,
      nome: corpo?.nome,
      tipo: corpo?.tipo,
      bytes: corpo?.bytes,
    });
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
    return NextResponse.json({ ok: true, caminho: r.caminho, token: r.token });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Erro inesperado" }, { status: 500 });
  }
}
