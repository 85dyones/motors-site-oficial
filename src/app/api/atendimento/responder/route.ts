import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { responderAoLead } from "../../../../lib/atendimento-servidor";
import { autorizarMotorDoAtendimento } from "../../../../lib/autorizacaoDoAtendimento";
import { ETIQUETA_DAS_FOTOS } from "../../../../lib/baseDoAtendimento-servidor";
import { createAdminSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";
/**
 * O modelo leva alguns segundos, e a Evolution espera o "digitando" de cada
 * balão antes de devolver. Uma volta cabe em 60 s (três balões de 6 s, a
 * entrega com o resumo e a chamada ao modelo); a segunda volta — a mensagem
 * que chegou enquanto respondia — só começa nos primeiros 30 s, então 120 s
 * cobre as duas.
 */
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O assistente responde (2026-10-20).
 *
 * O n8n chama depois de esperar a rajada (`aguardar_ms` da entrada), com o
 * lead e a mensagem que disparou a espera. Só a execução da ÚLTIMA mensagem
 * responde: as anteriores voltam `aguardando_mais_novas`, e uma resposta
 * cobre a rajada inteira. Quem escreve, envia, atualiza o aquecimento e
 * entrega ao vendedor é `responderAoLead`.
 *
 * Como a entrada, responde 200 com o que fez — exceto corpo inválido (400),
 * que é defeito do workflow e precisa aparecer vermelho na execução.
 */
export async function POST(request: Request) {
  const auth = await autorizarMotorDoAtendimento(request);
  if (auth.erro) return auth.erro;

  const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const leadId = typeof corpo?.lead_id === "string" ? corpo.lead_id : "";
  const mensagemId = typeof corpo?.mensagem_id === "string" && UUID.test(corpo.mensagem_id) ? corpo.mensagem_id : null;
  if (!UUID.test(leadId)) {
    return NextResponse.json({ error: "Envie `lead_id` (o `lead` que a entrada devolveu)." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createAdminSupabaseClient();
  } catch {
    return NextResponse.json({ error: "Atendimento indisponível: credencial de serviço não configurada." }, { status: 503 });
  }

  try {
    // A conversa classificou as fotos do carro que o cliente pediu: o catálogo
    // do prompt passa a dizer o que ele tem já na próxima mensagem.
    const desfecho = await responderAoLead(supabase, { leadId, mensagemId }, {
      aoClassificarFotos: () => revalidateTag(ETIQUETA_DAS_FOTOS, { expire: 0 }),
    });
    console.info("[Atendimento]", JSON.stringify({ resposta: desfecho.acao, entregue: desfecho.entregue ?? false }));
    return NextResponse.json({ ok: true, ...desfecho });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.error("[Atendimento] Falha ao responder:", motivo);
    return NextResponse.json({ ok: true, acao: "falhou", detalhe: motivo });
  }
}
