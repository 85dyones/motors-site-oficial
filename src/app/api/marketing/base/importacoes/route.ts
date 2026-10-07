import { NextRequest, NextResponse } from "next/server";
import { abrirImportacao } from "../../../../../lib/baseDeMarketing-servidor";
import { autorizarCampanhasDeSms } from "../../../../../lib/smsCampanhas-servidor";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/marketing/base/importacoes` — abre uma importação de planilha.
 *
 * Só registra o arquivo (origem, nome, quantas linhas) e devolve o id; as
 * pessoas chegam depois, em lotes, em `…/[id]/lote`. É esse registro que
 * permite desfazer a carga inteira.
 */
export async function POST(request: NextRequest) {
  const porta = await autorizarCampanhasDeSms();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });

  const r = await abrirImportacao(porta.admin, await request.json().catch(() => null), { id: porta.usuarioId, nome: porta.nome });
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: r.status, headers: SEM_CACHE });
  return NextResponse.json({ id: r.id }, { status: 201, headers: SEM_CACHE });
}
