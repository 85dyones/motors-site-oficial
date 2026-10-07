import { NextRequest, NextResponse } from "next/server";
import { lerPedidoDeCampanha } from "../../../../../lib/smsCampanhas";
import { autorizarCampanhasDeSms, previaDaCampanha } from "../../../../../lib/smsCampanhas-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/marketing/sms/previa` — quantos recebem, quem fica de fora e
 * quanto custa. Não grava nada e não devolve pessoa nenhuma: só contagem.
 */
export async function POST(request: NextRequest) {
  const porta = await autorizarCampanhasDeSms();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });

  const lido = lerPedidoDeCampanha(await request.json().catch(() => null));
  if (!lido.ok) return NextResponse.json({ error: lido.motivo }, { status: 400, headers: SEM_CACHE });

  const r = await previaDaCampanha(porta.admin, lido.pedido);
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: r.status, headers: SEM_CACHE });
  return NextResponse.json({ previa: r.previa }, { headers: SEM_CACHE });
}
