import { NextResponse } from "next/server";
import { autorizarConsultaDeDocumento, revogarLinkDoRelatorio } from "../../../../../lib/consultaDeDocumento-servidor";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };

/** `DELETE /api/consulta-documento/links/[linkId]` — revoga o link. É definitivo. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const porta = await autorizarConsultaDeDocumento();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });
  const { linkId } = await params;
  const r = await revogarLinkDoRelatorio(porta.supabase, linkId, porta.usuarioId);
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: r.status, headers: SEM_CACHE });
  return NextResponse.json({ ok: true }, { headers: SEM_CACHE });
}
