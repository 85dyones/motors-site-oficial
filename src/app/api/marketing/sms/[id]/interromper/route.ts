import { NextRequest, NextResponse } from "next/server";
import { autorizarCampanhasDeSms, interromperCampanha } from "../../../../../../lib/smsCampanhas-servidor";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/marketing/sms/[id]/interromper` — encerra a campanha sem mandar
 * o que falta. Não tem volta: o que ficou na fila não sai mais, e para
 * alcançar aquelas pessoas cria-se outra campanha.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const porta = await autorizarCampanhasDeSms();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });

  const { id } = await params;
  const r = await interromperCampanha(porta.admin, id);
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: r.status, headers: SEM_CACHE });
  return NextResponse.json({ situacao: r.situacao }, { headers: SEM_CACHE });
}
