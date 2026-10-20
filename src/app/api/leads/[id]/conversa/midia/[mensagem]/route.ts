import { NextResponse, type NextRequest } from "next/server";
import { BUCKET_DOS_ANEXOS } from "../../../../../../../lib/anexosDoAtendimento";
import { lerLeadNoEscopo, sessaoDeLeads } from "../../../../../../../lib/gestaoDoLead-servidor";
import { createAdminSupabaseClient } from "../../../../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O arquivo de uma mensagem da conversa (2026-10-20): foto, vídeo, áudio ou
 * documento, do cliente ou da loja.
 *
 * O bucket é privado e sem policy: o acesso é esta porta. A guarda é a da
 * conversa — `sessaoDeLeads` + `lerLeadNoEscopo` (quem não vê o lead leva
 * 404) — e a mensagem é lida PELA SESSÃO, cuja RLS herda o escopo de `leads`.
 * Só então a chave de serviço assina, por 5 minutos, e a resposta é um 307
 * para o Storage: o arquivo não passa por aqui. `?baixar=1` pede o download
 * com o nome do arquivo.
 *
 * Não existe, não é deste lead, ou não tem arquivo: o mesmo 404, de propósito.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; mensagem: string }> }) {
  try {
    const { id, mensagem } = await params;
    if (!UUID.test(mensagem ?? "")) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
    const { supabase, visao, recusa } = await sessaoDeLeads();
    if (recusa) return recusa;
    const guarda = await lerLeadNoEscopo(supabase, visao, id, "id, responsavel");
    if (guarda.recusa) return guarda.recusa;

    const { data, error } = await supabase
      .from("atendimento_mensagens")
      .select("id, lead_id, midia_caminho, midia_nome")
      .eq("id", mensagem)
      .eq("lead_id", id)
      .maybeSingle();
    const caminho = typeof data?.midia_caminho === "string" ? data.midia_caminho : "";
    // A pasta é o lead: um caminho de outra pasta nunca é assinado por aqui.
    if (error || !caminho || !caminho.startsWith(`${id}/`)) {
      return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
    }

    const baixar = new URL(request.url).searchParams.get("baixar") === "1";
    const nome = typeof data?.midia_nome === "string" && data.midia_nome.trim() ? data.midia_nome.trim() : true;
    const { data: assinada, error: erroDaAssinatura } = await createAdminSupabaseClient()
      .storage.from(BUCKET_DOS_ANEXOS)
      .createSignedUrl(caminho, 300, baixar ? { download: nome } : undefined);
    if (erroDaAssinatura || !assinada?.signedUrl) {
      return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
    }
    return NextResponse.redirect(assinada.signedUrl, {
      status: 307,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Erro inesperado" }, { status: 500 });
  }
}
