import { NextResponse, type NextRequest } from "next/server";
import { ehUuid } from "../../../../../lib/copilotoDeMidia";
import { autorizarCopiloto, statusDoErro } from "../../../../../lib/copilotoDeMidia-servidor";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/marketing/copiloto/desfazer` — `{ id }` de uma ação APLICADA.
 *
 * Cria o inverso (negativa → remover a negativa; pausar → reativar; verba →
 * a verba de antes), já aprovado por quem clicou, e o script o aplica na
 * próxima rodada. É o único caminho por onde uma negativa é removida, e o
 * banco confere que o inverso é exato.
 */
export async function POST(request: NextRequest) {
  const porta = await autorizarCopiloto();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });

  const corpo = (await request.json().catch(() => null)) as { id?: unknown } | null;
  if (!corpo || !ehUuid(corpo.id)) return NextResponse.json({ error: "id precisa ser o uuid da ação" }, { status: 400, headers: SEM_CACHE });

  const { data, error } = await porta.supabase.rpc("midia_copiloto_desfazer", { p_acao: corpo.id });
  if (error) return NextResponse.json({ error: error.message }, { status: statusDoErro(error), headers: SEM_CACHE });
  return NextResponse.json({ id: data }, { headers: SEM_CACHE });
}
