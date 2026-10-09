import { NextResponse, type NextRequest } from "next/server";
import { decidirInteracao, type CorpoDaInteracao } from "../../../../../lib/gestaoDoLead";
import {
  lerLeadNoEscopo,
  relerDepoisDeRegistrar,
  respostaDoErroDaFuncao,
  sessaoDeLeads,
} from "../../../../../lib/gestaoDoLead-servidor";

export const dynamic = "force-dynamic";

/**
 * Registrar uma interação no lead: nota, ligação, WhatsApp ou visita, com o
 * próximo passo (03/10/2026). Contrato em `docs/GESTAO_DO_LEAD.md`.
 *
 * Três degraus, nesta ordem, e a ordem é a regra:
 *
 *  1. a GUARDA: o lead é lido com a sessão e conferido contra o escopo de quem
 *     pede. `registrar_interacao_do_lead` é SECURITY DEFINER e alcança
 *     qualquer lead pelo id; sem a guarda, o vendedor registraria (e mudaria o
 *     próximo passo) no lead do colega;
 *  2. a VALIDAÇÃO, em `decidirInteracao`: a mesma função que a tela usa para
 *     habilitar o botão. O próximo passo é opcional (2026-10-09); se vier,
 *     vem com texto e data, senão é 400 com `codigo: "proximo_passo_incompleto"`;
 *  3. a FUNÇÃO, que grava o registro e o próximo passo numa transação só e
 *     reinicia o relógio da estagnação.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, visao, recusa } = await sessaoDeLeads();
    if (recusa) return recusa;

    const guarda = await lerLeadNoEscopo(supabase, visao, id, "id, responsavel");
    if (guarda.recusa) return guarda.recusa;

    const corpo = (await request.json().catch(() => null)) as CorpoDaInteracao | null;
    const decisao = decidirInteracao(corpo);
    if (!decisao.ok) {
      return NextResponse.json({ error: decisao.erro, codigo: decisao.codigo }, { status: decisao.status });
    }

    const { data: interacaoId, error } = await supabase.rpc("registrar_interacao_do_lead", {
      p_lead: id,
      ...decisao.args,
    });
    if (error) return respostaDoErroDaFuncao(error);

    const relido = await relerDepoisDeRegistrar(supabase, id, String(interacaoId));
    return NextResponse.json({
      ok: true,
      interacao_id: interacaoId,
      lead: relido.lead,
      item: relido.item,
      ...(relido.aviso ? { aviso: relido.aviso } : {}),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
