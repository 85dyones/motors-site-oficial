import { NextResponse, type NextRequest } from "next/server";
import { MIGRACAO_DO_PEDIDO_DE_VERBA, validarPedidoDeVerba } from "../../../../../lib/copilotoDeMidia";
import { autorizarCopiloto, statusDoErro } from "../../../../../lib/copilotoDeMidia-servidor";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/marketing/copiloto/verba` — pedir a mudança de verba de uma
 * campanha do Google (16/10/2026, pedido do dono: "aumentos pelo copiloto").
 *
 * Corpo: `{ campanhaId, verbaNova, motivo? }`. O diagnóstico só corta verba;
 * o aumento é decisão de quem paga, e é por aqui que uma pessoa o pede. O
 * pedido nasce PROPOSTA e passa pela mesma aprovação (`/decisao`): nada vai
 * para a conta sem alguém aprovar.
 *
 * A verba de agora e o nome da campanha NÃO vêm do corpo: a função do banco
 * lê da sincronização, confere o papel de novo, carimba quem pediu com
 * `auth.uid()` e grava a trilha na mesma transação. Proposta do diagnóstico
 * aberta para a mesma campanha é substituída; aprovada esperando o script
 * recusa o pedido (400), com o motivo.
 */
export async function POST(request: NextRequest) {
  const porta = await autorizarCopiloto();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });

  const pedido = validarPedidoDeVerba(await request.json().catch(() => null));
  if (!pedido.ok) return NextResponse.json({ error: pedido.erro }, { status: 400, headers: SEM_CACHE });

  const { data, error } = await porta.supabase.rpc("midia_copiloto_pedir_verba", {
    p_campanha: pedido.valor.campanhaId,
    p_verba_nova: pedido.valor.verbaNova,
    p_motivo: pedido.valor.motivo,
  });
  if (error) {
    // Site publicado antes da migração: a função ainda não existe no banco.
    if (error.code === "PGRST202" || error.code === "42883") {
      return NextResponse.json(
        { error: `O banco ainda não tem o pedido de verba: aplique a migração ${MIGRACAO_DO_PEDIDO_DE_VERBA}.` },
        { status: 503, headers: SEM_CACHE },
      );
    }
    return NextResponse.json({ error: error.message }, { status: statusDoErro(error), headers: SEM_CACHE });
  }
  return NextResponse.json({ id: data }, { headers: SEM_CACHE });
}
