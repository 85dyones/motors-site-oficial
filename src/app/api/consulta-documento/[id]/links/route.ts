import { NextResponse } from "next/server";
import { autorizarConsultaDeDocumento, criarLinkDoRelatorio, lerParametrosDaConsulta } from "../../../../../lib/consultaDeDocumento-servidor";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/consulta-documento/[id]/links` — cria o link para o consultor
 * enviar. O token só existe nesta resposta (o banco guarda o hash): quem
 * perder o link cria outro. Validade e limite de links ativos vêm de
 * `parametros_consulta_documento`.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const porta = await autorizarConsultaDeDocumento();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });
  const { id } = await params;
  const leitura = await lerParametrosDaConsulta(porta.supabase);
  if (!leitura.ok) return NextResponse.json({ error: leitura.motivo }, { status: 503, headers: SEM_CACHE });
  const r = await criarLinkDoRelatorio(porta.supabase, id, leitura.parametros);
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: r.status, headers: SEM_CACHE });
  return NextResponse.json({ id: r.id, url: r.url, expiraEm: r.expiraEm }, { headers: SEM_CACHE });
}
