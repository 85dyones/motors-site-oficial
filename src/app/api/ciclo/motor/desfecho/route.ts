import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-server";
import { autorizarMotor } from "../../../../../lib/ciclo/autorizacaoDoMotor";

export const dynamic = "force-dynamic";

/** O vocabulário do §2.1, mais `falha_envio`. Não existe desfecho "enviado". */
const DESFECHOS = ["convertido", "recusado", "sem_resposta", "agendado", "falha_envio"] as const;

/**
 * O que aconteceu depois da mensagem.
 *
 * Quem chama é o n8n. O caso obrigatório é `falha_envio`: reserva que não
 * virou mensagem tem que devolver a vez ao cliente, senão um erro da Evolution
 * gasta a janela de 21 dias de alguém que nunca recebeu nada.
 *
 * Os outros desfechos são o dado que o §9 vai querer (taxa de conversão por
 * gatilho) e o que alimenta a quarentena do §4.3 — três `sem_resposta`
 * consecutivos param o cliente por 90 dias.
 */
export async function POST(request: Request) {
  const auth = await autorizarMotor(request);
  if (auth.erro) return auth.erro;

  let supabase;
  try {
    supabase = createAdminSupabaseClient();
  } catch {
    console.error("[Ciclo/Motor] SUPABASE_SERVICE_ROLE_KEY ausente — desfecho indisponível.");
    return NextResponse.json(
      { error: "Motor de gatilhos indisponível: credencial de serviço não configurada." },
      { status: 503 },
    );
  }

  const corpo = await request.json().catch(() => ({} as any));
  const evento = String(corpo?.evento_id ?? "").trim();
  const desfecho = String(corpo?.desfecho ?? "").trim();

  if (!evento) {
    return NextResponse.json({ error: "evento_id é obrigatório." }, { status: 422 });
  }
  if (!DESFECHOS.includes(desfecho as (typeof DESFECHOS)[number])) {
    return NextResponse.json(
      { error: `Desfecho inválido: "${desfecho}".`, desfechos_validos: DESFECHOS },
      { status: 422 },
    );
  }

  const valor =
    corpo?.valor_gerado === undefined || corpo?.valor_gerado === null
      ? null
      : Number(corpo.valor_gerado);
  if (valor !== null && !Number.isFinite(valor)) {
    return NextResponse.json({ error: "valor_gerado precisa ser numérico." }, { status: 422 });
  }

  const { data, error } = await supabase.rpc("registrar_desfecho_ciclo", {
    p_evento: evento,
    p_desfecho: desfecho,
    p_valor: valor,
  });

  if (error) {
    // A função levanta `no_data_found` para id que não existe — 404 é a
    // resposta honesta, e o n8n não fica retentando um evento fantasma.
    if (error.message?.includes("EVENTO_NAO_ENCONTRADO")) {
      return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
    }
    console.error("[Ciclo/Motor] Falha ao registrar desfecho:", error.message);
    return NextResponse.json({ error: "Não foi possível registrar o desfecho." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, ...(data as object) });
}
