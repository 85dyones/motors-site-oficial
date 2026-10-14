import { NextResponse, type NextRequest } from "next/server";
import { validarResultados } from "../../../../../../lib/copilotoDeMidia";
import { autorizarScript, motivoDoErro, registrarResultados } from "../../../../../../lib/copilotoDeMidia-servidor";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/marketing/copiloto/acoes/resultado` — o script devolve o que fez
 * com cada ação reservada: `aplicada` (e o que leu de volta da conta),
 * `sem_efeito` (a conta já estava assim) ou `falhou` (com o motivo).
 *
 * O banco só fecha o que está em aplicação; resultado de ação já fechada é
 * contado como ignorado, sem erro — o script não tem o que fazer com isso.
 */
export async function POST(request: NextRequest) {
  const porta = await autorizarScript(request.headers);
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });

  const validacao = validarResultados(await request.json().catch(() => null));
  if (!validacao.ok) return NextResponse.json({ error: validacao.erro }, { status: 400, headers: SEM_CACHE });

  try {
    const conta = await registrarResultados(porta.admin, validacao.valor);
    return NextResponse.json({ ok: true, ...conta }, { headers: SEM_CACHE });
  } catch (erro) {
    const { status, motivo } = motivoDoErro(erro);
    console.error(`[Copiloto] /acoes/resultado: ${motivo}`);
    return NextResponse.json({ error: motivo }, { status, headers: SEM_CACHE });
  }
}
