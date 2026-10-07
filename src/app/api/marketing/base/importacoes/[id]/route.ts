import { NextRequest, NextResponse } from "next/server";
import { desfazerImportacao } from "../../../../../../lib/baseDeMarketing-servidor";
import { autorizarCampanhasDeSms } from "../../../../../../lib/smsCampanhas-servidor";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `DELETE /api/marketing/base/importacoes/[id]` — desfaz uma importação.
 *
 * Vão embora as pessoas que ELA criou, com os registros e os envios de SMS
 * delas. Quem já estava na base fica (e fica como a importação deixou: a
 * fusão não é desfeita). Quem pediu para sair continua fora: o descadastro
 * não depende da base.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const porta = await autorizarCampanhasDeSms();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });

  const { id } = await params;
  const r = await desfazerImportacao(porta.admin, id);
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: r.status, headers: SEM_CACHE });
  return NextResponse.json({ contatosRemovidos: r.contatosRemovidos, registrosRemovidos: r.registrosRemovidos }, { headers: SEM_CACHE });
}
