import { NextRequest, NextResponse } from "next/server";
import { lerPedidoDeCampanha } from "../../../../lib/smsCampanhas";
import { autorizarCampanhasDeSms, criarCampanha } from "../../../../lib/smsCampanhas-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/marketing/sms` — cria a campanha como RASCUNHO.
 *
 * Criar não envia nada: congela o público (um envio por telefone, já com o
 * texto final e o código do link) e devolve o id. O envio é outro passo, no
 * monitor, com confirmação. O miolo está em `lib/smsCampanhas-servidor.ts`.
 */
export async function POST(request: NextRequest) {
  const porta = await autorizarCampanhasDeSms();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });

  const lido = lerPedidoDeCampanha(await request.json().catch(() => null));
  if (!lido.ok) return NextResponse.json({ error: lido.motivo }, { status: 400, headers: SEM_CACHE });

  const r = await criarCampanha(porta.admin, lido.pedido, { id: porta.usuarioId, nome: porta.nome });
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: r.status, headers: SEM_CACHE });
  return NextResponse.json({ id: r.id }, { status: 201, headers: SEM_CACHE });
}
