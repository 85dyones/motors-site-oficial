import { NextResponse, type NextRequest } from "next/server";
import { validarDecisao } from "../../../../../lib/copilotoDeMidia";
import { autorizarCopiloto, statusDoErro } from "../../../../../lib/copilotoDeMidia-servidor";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/marketing/copiloto/decisao` — aprovar ou recusar propostas.
 *
 * Corpo: `{ ids: uuid[], decisao: "aprovar" | "recusar", nota?: string }`.
 * A matriz é conferida aqui (403 limpo) e de novo no banco: a função roda com
 * a SESSÃO de quem clicou, carimba a autoria com `auth.uid()` e grava uma
 * linha por ação em `auditoria_admin`, na mesma transação. Recusar também
 * desiste de aprovada que o script ainda não pegou.
 *
 * Devolve quantas mudaram: a que já tinha mudado (outra pessoa decidiu, o
 * retrato do dia a substituiu) fica de fora sem erro, e a tela avisa.
 */
export async function POST(request: NextRequest) {
  const porta = await autorizarCopiloto();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });

  const pedido = validarDecisao(await request.json().catch(() => null));
  if (!pedido.ok) return NextResponse.json({ error: pedido.erro }, { status: 400, headers: SEM_CACHE });

  const { data, error } = await porta.supabase.rpc("midia_copiloto_decidir", {
    p_acoes: pedido.valor.ids,
    p_decisao: pedido.valor.decisao,
    p_nota: pedido.valor.nota,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: statusDoErro(error), headers: SEM_CACHE });
  return NextResponse.json({ pedidas: pedido.valor.ids.length, mudaram: Number(data ?? 0) }, { headers: SEM_CACHE });
}
