import { NextResponse } from "next/server";
import { abrirConsultaDeDocumento, autorizarConsultaDeDocumento } from "../../../../lib/consultaDeDocumento-servidor";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };

/** `GET /api/consulta-documento/[id]` — reabre uma consulta guardada (sem custo) com os links dela. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const porta = await autorizarConsultaDeDocumento();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });
  const { id } = await params;
  const aberta = await abrirConsultaDeDocumento(porta.supabase, id);
  if (!aberta) return NextResponse.json({ error: "Consulta não encontrada." }, { status: 404, headers: SEM_CACHE });
  return NextResponse.json(aberta, { headers: SEM_CACHE });
}
