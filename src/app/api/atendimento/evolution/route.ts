import { after, NextResponse } from "next/server";
import { registrarEntrada } from "../../../../lib/atendimento-servidor";
import { autorizarMotorDoAtendimento } from "../../../../lib/autorizacaoDoAtendimento";
import { interpretarEventoDaEvolution } from "../../../../lib/evolutionEventos";
import { createAdminSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";
// O arquivo que o cliente manda (vídeo, documento) desce da Evolution depois
// da resposta, dentro desta mesma função: folga para isso.
export const maxDuration = 60;

/**
 * A mensagem do WhatsApp entra no painel (2026-10-20).
 *
 * Quem chama é o workflow "Motors Atendimento — Entrada" do n8n, com o corpo
 * do webhook da Evolution (`messages.upsert`) repassado sem mexer. A rota
 * grava a conversa, cria o lead quando a pessoa ainda não tem um aberto, e
 * diz ao n8n se deve pedir a resposta do assistente (`responder`) e quanto
 * esperar antes (`aguardar_ms`, a rajada).
 *
 * **Nunca devolve erro fora de autenticação**, pela mesma razão da entrada do
 * Chatwoot: uma integração que recebe erro com frequência acaba desligada,
 * e desligada reabre o buraco que ela veio tapar. O que deu errado vai no
 * corpo e no log — sem nome nem telefone do cliente.
 */
export async function POST(request: Request) {
  const auth = await autorizarMotorDoAtendimento(request);
  if (auth.erro) return auth.erro;

  let supabase;
  try {
    supabase = createAdminSupabaseClient();
  } catch {
    console.error("[Atendimento] SUPABASE_SERVICE_ROLE_KEY ausente — entrada indisponível.");
    return NextResponse.json({ error: "Atendimento indisponível: credencial de serviço não configurada." }, { status: 503 });
  }

  const corpo = await request.json().catch(() => null);
  const evento = interpretarEventoDaEvolution(corpo);
  if (evento.tipo === "ignorado") {
    console.info("[Atendimento]", JSON.stringify({ acao: "ignorado", detalhe: evento.motivo }));
    return NextResponse.json({ ok: true, acao: "ignorado", detalhe: evento.motivo, responder: false });
  }

  try {
    // O arquivo da mensagem (foto, vídeo, áudio, documento) é guardado depois
    // da resposta: o n8n não espera um vídeo descer para seguir a rajada.
    const desfecho = await registrarEntrada(supabase, evento, { depois: (tarefa) => after(tarefa) });
    console.info(
      "[Atendimento]",
      JSON.stringify({ acao: desfecho.acao, com_lead: Boolean(desfecho.lead), responder: desfecho.responder ?? false }),
    );
    return NextResponse.json({ ok: true, responder: false, ...desfecho });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.error("[Atendimento] Falha na entrada:", motivo);
    return NextResponse.json({ ok: true, acao: "falhou", detalhe: motivo, responder: false });
  }
}
