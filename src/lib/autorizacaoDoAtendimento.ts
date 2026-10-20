import { NextResponse } from "next/server";
import { tokenConfere } from "./comparacaoConstante";
import { registrarFalha } from "./observabilidade";

/**
 * A porta das rotas que o n8n chama no atendimento por IA
 * (`/api/atendimento/evolution`, `/responder` e `/rodada`).
 *
 * **Token próprio, sem herança e sem fallback**: `ATENDIMENTO_MOTOR_TOKEN`
 * não é o `FUNIL_MOTOR_TOKEN` nem o `CHATWOOT_WEBHOOK_TOKEN`, pela régua de
 * 2026-08-18 — segredo mede acesso. Esta porta escreve conversa e lead e
 * manda WhatsApp a cliente; quem tem a credencial do funil não deveria
 * conseguir isso.
 *
 * Uma forma só: `Authorization: Bearer`. Token na URL fica no log de acesso
 * da Vercel e de qualquer proxy no caminho, e quem chama é sempre o n8n, que
 * manda cabeçalho (a Evolution fala com o n8n, nunca direto com o site). Sem a
 * variável, 503 — problema de configuração nossa.
 *
 * A recusa de quem TROUXE credencial vai ao WhatsApp como parada: foi o
 * defeito de 23/09 no Chatwoot, quinze dias de 401 só no log. Recusa sem
 * credencial é varredura e fica no log.
 */
export async function autorizarMotorDoAtendimento(
  request: Request,
): Promise<{ erro: NextResponse } | { erro: null }> {
  const segredo = (process.env.ATENDIMENTO_MOTOR_TOKEN || "").trim();
  const rota = new URL(request.url).pathname;

  if (!segredo) {
    console.error("[Atendimento] ATENDIMENTO_MOTOR_TOKEN não configurado. Porta indisponível.");
    await registrarFalha(
      "parada",
      "atendimento-sem-token",
      "Atendimento por IA fechado (503): falta ATENDIMENTO_MOTOR_TOKEN na Vercel. Conversa nova do WhatsApp não entra no painel.",
      { rota, metodo: "POST", origem: "servidor" },
    );
    return {
      erro: NextResponse.json({ error: "Atendimento indisponível: token de integração não configurado." }, { status: 503 }),
    };
  }

  const cabecalho = request.headers.get("Authorization");
  if (cabecalho && tokenConfere(cabecalho, `Bearer ${segredo}`)) return { erro: null };

  const trouxe = /^Bearer\s+\S/i.test(cabecalho ?? "");
  console.warn("[Atendimento] 401 —", JSON.stringify({ rota, veio_cabecalho: Boolean(cabecalho) }));
  if (trouxe) {
    await registrarFalha(
      "parada",
      "atendimento-entrada-recusada",
      `Atendimento por IA recusado (401) em ${rota}: o token não confere com ATENDIMENTO_MOTOR_TOKEN da Vercel. Conserto: pôr o token atual na credencial do n8n. Se foi teste seu, ignore.`,
      { rota, metodo: "POST", origem: "servidor" },
    );
  }
  return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
}
