import { NextRequest, NextResponse } from "next/server";
import { registrarFalha } from "../../../../../../lib/observabilidade";
import { autorizarCampanhasDeSms, enviarLote } from "../../../../../../lib/smsCampanhas-servidor";

export const dynamic = "force-dynamic";
// Um lote são vinte SMS, cinco por vez, com até 12 s cada, e o lote para de
// começar SMS novo aos 40 s.
export const maxDuration = 60;

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/marketing/sms/[id]/enviar` — manda UM lote da campanha.
 *
 * A tela chama de novo enquanto `restam > 0`. Cada chamada confere a porta de
 * novo: quem perdeu o papel no meio do envio para no lote seguinte.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const porta = await autorizarCampanhasDeSms();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });

  const { id } = await params;
  const r = await enviarLote(porta.admin, id);
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: r.status, headers: SEM_CACHE });
  if (r.aviso) {
    // Envio parado no meio é coisa que alguém precisa saber sem abrir a tela.
    await registrarFalha("parada", "campanha-de-sms-parou", r.aviso, { rota: "/api/marketing/sms/[id]/enviar", extra: { campanha: id, restam: r.restam } });
  }
  return NextResponse.json({ situacao: r.situacao, resumo: r.resumo, restam: r.restam, aviso: r.aviso }, { headers: SEM_CACHE });
}
