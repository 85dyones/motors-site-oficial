import { NextResponse } from "next/server";
import { tokenConfere } from "../comparacaoConstante";

/**
 * A porta de entrada do motor de gatilhos.
 *
 * As rotas de `/api/ciclo/motor/*` invertem o sentido do `WEBHOOKS_N8N.md`:
 * ali o site é o emissor, aqui ele é o chamado. Quem bate é o n8n, sem cookie
 * de sessão — papel `anon` —, e do outro lado da porta há a fila com nome,
 * telefone e placa de cliente. O token é obrigatório, não "validado quando
 * existe" — com `if (token) { valide }`, um token vazio dos dois lados abriria
 * a base de clientes do Ciclo para qualquer um (lição de 2026-08-12).
 *
 * O token é PRÓPRIO: `CICLO_MOTOR_TOKEN`, e nada de fallback.
 *
 * Até 2026-08-18 esta porta aceitava o mesmo segredo da consulta de margens
 * (o token do sentido site→n8n) — quem tivesse a credencial de margens puxava
 * nome, telefone e placa da base do Ciclo (achado #9 da revisão). Segredo
 * mede acesso: dado de cliente e ficha de margem são acessos diferentes,
 * então são segredos diferentes. Um fallback para o token antigo manteria a
 * brecha em silêncio — por isso ele não existe (e o teste do motor nega os
 * nomes antigos neste arquivo): sem `CICLO_MOTOR_TOKEN` na Vercel, o motor
 * fica indisponível até alguém configurar, que é o estado honesto.
 *
 * (Pela mesma razão o motor não lê mais a linha `webhooks` de settings: o
 * campo de token de lá pertence ao outro sentido — e é menos uma leitura com
 * chave de serviço por request.)
 */
export async function autorizarMotor(
  request: Request,
): Promise<{ erro: NextResponse } | { erro: null }> {
  const secretToken = (process.env.CICLO_MOTOR_TOKEN || "").trim();

  if (!secretToken) {
    console.error(
      "[Ciclo/Motor] CICLO_MOTOR_TOKEN não configurado. Rota indisponível até configurar.",
    );
    // 503 e não 401: o problema é de configuração nossa, e 401 mandaria o n8n
    // tentar outro token para sempre.
    return {
      erro: NextResponse.json(
        { error: "Motor de gatilhos indisponível: token de integração não configurado." },
        { status: 503 },
      ),
    };
  }

  // Comparação em tempo constante — `!==` desiste no primeiro caractere
  // diferente e vira oráculo de timing. Ver `lib/comparacaoConstante.ts`.
  if (!tokenConfere(request.headers.get("Authorization"), `Bearer ${secretToken}`)) {
    return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  }

  return { erro: null };
}
