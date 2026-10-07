import { NextRequest, NextResponse } from "next/server";
import { importarLote } from "../../../../../../../lib/baseDeMarketing-servidor";
import { autorizarCampanhasDeSms } from "../../../../../../../lib/smsCampanhas-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/marketing/base/importacoes/[id]/lote` — um lote de pessoas.
 *
 * O corpo traz só o que `ContatoImportado` tem: nome, celular, e-mail, se é
 * cliente, e os carros. CPF, RG e endereço da planilha nem saem do navegador,
 * e o que vier a mais aqui é ignorado por `lerContatoImportado`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const porta = await autorizarCampanhasDeSms();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });

  const { id } = await params;
  const r = await importarLote(porta.admin, id, await request.json().catch(() => null));
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: r.status, headers: SEM_CACHE });
  return NextResponse.json(
    { contatosNovos: r.contatosNovos, contatosAtualizados: r.contatosAtualizados, registrosNovos: r.registrosNovos, recusados: r.recusados },
    { headers: SEM_CACHE },
  );
}
