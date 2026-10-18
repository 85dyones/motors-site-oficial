import { NextResponse } from "next/server";
import { autorizarConsultaDeDocumento, criarLinkDoRelatorio } from "../../../../../lib/consultaDeDocumento-servidor";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/consulta-documento/[id]/links` — cria o link para o consultor
 * enviar. O token só existe nesta resposta (o banco guarda o hash): quem
 * perder o link cria outro.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const porta = await autorizarConsultaDeDocumento();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });
  const { id } = await params;
  const r = await criarLinkDoRelatorio(porta.supabase, id);
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: r.status, headers: SEM_CACHE });
  return NextResponse.json({ url: r.url, expiraEm: r.expiraEm }, { headers: SEM_CACHE });
}
