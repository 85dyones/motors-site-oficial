import { NextResponse } from "next/server";
import { tokenConfere } from "./comparacaoConstante";

/**
 * A porta de entrada do motor do funil.
 *
 * Inverte o sentido do `WEBHOOKS_N8N.md`, como as rotas de `/api/ciclo/motor/*`
 * já fazem: ali o site é o emissor, aqui ele é o chamado. Quem bate é o n8n,
 * sem cookie de sessão — papel `anon` —, e do outro lado da porta está a fila
 * com nome, telefone e interesse de lead, mais o WhatsApp da equipe.
 *
 * **Token próprio, sem herança e sem fallback.** `FUNIL_MOTOR_TOKEN` não é o
 * `CICLO_MOTOR_TOKEN` pela razão que aquela porta já registrou em 2026-08-18:
 * *segredo mede acesso*. A base de leads e a base de clientes do Ciclo são
 * dois conjuntos de dados e dois workflows; quem tem a credencial de um não
 * deveria puxar o outro. Um `||` para o token do Ciclo economizaria uma
 * variável de ambiente e criaria uma escada de privilégio silenciosa.
 *
 * Sem a variável configurada a rota responde 503 e não 401: o problema é de
 * configuração nossa, e 401 mandaria o n8n tentar outro token para sempre.
 */
export async function autorizarFunil(
  request: Request,
): Promise<{ erro: NextResponse } | { erro: null }> {
  const segredo = (process.env.FUNIL_MOTOR_TOKEN || "").trim();

  if (!segredo) {
    console.error(
      "[Funil] FUNIL_MOTOR_TOKEN não configurado. Rota de alertas indisponível até configurar.",
    );
    return {
      erro: NextResponse.json(
        { error: "Motor do funil indisponível: token de integração não configurado." },
        { status: 503 },
      ),
    };
  }

  // Comparação em tempo constante — `!==` desiste no primeiro caractere
  // diferente e vira oráculo de timing. Ver `lib/comparacaoConstante.ts`.
  if (!tokenConfere(request.headers.get("Authorization"), `Bearer ${segredo}`)) {
    return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  }

  return { erro: null };
}
