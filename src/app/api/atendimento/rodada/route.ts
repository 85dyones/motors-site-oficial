import { NextResponse } from "next/server";
import { executarRodada } from "../../../../lib/atendimento-servidor";
import { autorizarMotorDoAtendimento } from "../../../../lib/autorizacaoDoAtendimento";
import { createAdminSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * O relógio do atendimento (2026-10-20): o n8n chama a cada 15 minutos.
 *
 * Duas filas, as duas decididas aqui e nunca no workflow:
 *
 *   1. **Entregas pendentes** — o resumo que esperou o horário de aviso
 *      (8h às 20h, nada aos domingos), ou o dono que o administrador
 *      escolheu depois da entrega.
 *   2. **Cadências** — o toque de follow-up, reativação ou engajamento que
 *      venceu, dentro do horário da loja.
 *
 * `{ "reservar": false }` é PRÉVIA: mostra o que sairia, sem enviar e sem
 * gravar — é o que se chama para conferir a régua antes de ligar o
 * workflow, como `/api/funil/alertas`. O padrão é prévia: mandar mensagem a
 * cliente exige pedir com todas as letras.
 *
 * `falhas` > 0 é o sinal para o nó "Conferir" do n8n terminar vermelho.
 */
export async function POST(request: Request) {
  const auth = await autorizarMotorDoAtendimento(request);
  if (auth.erro) return auth.erro;

  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const reservar = corpo?.reservar === true;

  let supabase;
  try {
    supabase = createAdminSupabaseClient();
  } catch {
    return NextResponse.json({ error: "Atendimento indisponível: credencial de serviço não configurada." }, { status: 503 });
  }

  try {
    const resultado = await executarRodada(supabase, { reservar });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.error("[Atendimento] Rodada falhou:", motivo);
    return NextResponse.json({ ok: false, error: motivo, falhas: 1 }, { status: 500 });
  }
}
