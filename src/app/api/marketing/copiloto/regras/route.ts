import { NextResponse, type NextRequest } from "next/server";
import { validarRegras } from "../../../../../lib/copilotoDeMidia";
import { abrirVigencia, autorizarCopiloto, statusDoErro } from "../../../../../lib/copilotoDeMidia-servidor";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/marketing/copiloto/regras` — as regras da loja numa vigência
 * nova: mínimos de gasto, ritmo, corte de verba, índice de qualidade, hora do
 * diagnóstico e as três listas (concorrentes, cidades fora da área, palavras
 * informativas).
 *
 * A vigente não sofre UPDATE: `midia_copiloto_nova_vigencia` a encerra e abre
 * a nova numa transação, com a autoria da sessão e a trilha em
 * `auditoria_admin`. Vale a partir do próximo diagnóstico.
 */
export async function POST(request: NextRequest) {
  const porta = await autorizarCopiloto();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });

  const regras = validarRegras(await request.json().catch(() => null));
  if (!regras.ok) return NextResponse.json({ error: regras.erro }, { status: 400, headers: SEM_CACHE });

  const { error } = await abrirVigencia(porta.supabase, regras.valor);
  if (error) return NextResponse.json({ error: error.message }, { status: statusDoErro(error), headers: SEM_CACHE });
  return NextResponse.json({ ok: true }, { headers: SEM_CACHE });
}
