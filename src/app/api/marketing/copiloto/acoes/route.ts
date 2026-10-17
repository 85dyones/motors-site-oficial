import { NextResponse, type NextRequest } from "next/server";
import { diagnosticoDevido, fusoValido } from "../../../../../lib/copilotoDeMidia";
import {
  acoesAprovadas,
  autorizarScript,
  lerRegras,
  motivoDaLeitura,
  motivoDoErro,
  reservarAcoes,
  ultimoDiagnostico,
} from "../../../../../lib/copilotoDeMidia-servidor";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/marketing/copiloto/acoes` — o script da conta pergunta, a cada
 * hora, o que fazer.
 *
 * Corpo: `{ previa: boolean, fuso: "America/…" }` (o fuso da conta).
 * Resposta: `{ diagnosticoDevido, acoes }`. Fora da prévia, as ações saem
 * RESERVADAS (`midia_copiloto_reservar_acoes`): a mesma não é entregue a duas
 * rodadas. Na prévia ("Visualizar"), o Google não deixa o script mudar a
 * conta; a lista vem só para o registro dizer o que espera, e nada é reservado.
 */
export async function POST(request: NextRequest) {
  const porta = await autorizarScript(request.headers);
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });

  const corpo = (await request.json().catch(() => null)) as { previa?: unknown; fuso?: unknown } | null;
  if (!corpo || !fusoValido(corpo.fuso)) {
    return NextResponse.json({ error: "`fuso` precisa ser o fuso IANA da conta" }, { status: 400, headers: SEM_CACHE });
  }
  const previa = corpo.previa === true;

  try {
    const regras = await lerRegras(porta.admin, porta.org);
    if (!regras.ok) {
      const { status, motivo } = motivoDaLeitura(regras);
      return NextResponse.json({ error: motivo }, { status, headers: SEM_CACHE });
    }
    // Primeiro a leitura, depois a reserva: se a leitura falhar (site novo
    // antes da migração), nada fica reservado sem chegar ao script — a ação
    // reservada e não entregue viraria falha depois de três rodadas.
    const ultimo = await ultimoDiagnostico(porta.admin, porta.org);
    const acoes = previa ? await acoesAprovadas(porta.admin, porta.org) : await reservarAcoes(porta.admin);
    return NextResponse.json(
      { diagnosticoDevido: diagnosticoDevido(ultimo, new Date(), corpo.fuso, regras.valor.parametros.horaDoDiagnostico), acoes },
      { headers: SEM_CACHE },
    );
  } catch (erro) {
    const { status, motivo } = motivoDoErro(erro);
    console.error(`[Copiloto] /acoes: ${motivo}`);
    return NextResponse.json({ error: motivo }, { status, headers: SEM_CACHE });
  }
}
