import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-server";
import { autorizarMotor } from "../../../../../lib/ciclo/autorizacaoDoMotor";
import {
  GATILHOS_ATIVOS,
  mensagemDoGatilho,
  type Gatilho,
  type LinhaDaFila,
} from "../../../../../lib/ciclo/motor";

export const dynamic = "force-dynamic";

/**
 * A fila do dia — o que o orquestrador do n8n consome (manual §4.1).
 *
 * O n8n faz três coisas: acorda na hora, pede a fila, entrega. Quem decide
 * quem recebe, por qual gatilho e se pode receber hoje é a função
 * `montar_fila_de_gatilhos` — no banco, porque o Pacote 3 exige que a regra
 * de frequência do §4.3 não dependa de workflow.
 *
 * `reservar: true` grava a linha em `eventos_ciclo` dentro do mesmo comando
 * que monta a fila. É o que impede duas execuções sobrepostas de mandarem a
 * mesma mensagem duas vezes.
 *
 * A resposta traz também o que foi suprimido e por quê. Fila que descarta em
 * silêncio é fila que ninguém audita.
 */
export async function POST(request: Request) {
  const auth = await autorizarMotor(request);
  if (auth.erro) return auth.erro;

  let supabase;
  try {
    supabase = createAdminSupabaseClient();
  } catch {
    console.error("[Ciclo/Motor] SUPABASE_SERVICE_ROLE_KEY ausente — fila indisponível.");
    return NextResponse.json(
      { error: "Motor de gatilhos indisponível: credencial de serviço não configurada." },
      { status: 503 },
    );
  }

  const corpo = await request.json().catch(() => ({} as any));
  const reservar = corpo?.reservar === true;

  // Filtro opcional por gatilho: é o que permite ligar e desligar um fluxo do
  // n8n sem mexer nos outros. Nome desconhecido é erro, não silêncio — senão
  // um typo no workflow vira "hoje não tinha ninguém na fila".
  let gatilhos: Gatilho[] | null = null;
  if (corpo?.gatilhos !== undefined && corpo?.gatilhos !== null) {
    const pedidos: string[] = Array.isArray(corpo.gatilhos) ? corpo.gatilhos : [corpo.gatilhos];
    const invalidos = pedidos.filter((g) => !GATILHOS_ATIVOS.includes(g as Gatilho));
    if (invalidos.length > 0) {
      return NextResponse.json(
        {
          error: `Gatilho desconhecido: ${invalidos.join(", ")}.`,
          gatilhos_validos: GATILHOS_ATIVOS,
        },
        { status: 422 },
      );
    }
    gatilhos = pedidos as Gatilho[];
  }

  const { data, error } = await supabase.rpc("montar_fila_de_gatilhos", {
    p_reservar: reservar,
    p_gatilhos: gatilhos,
  });

  if (error) {
    console.error("[Ciclo/Motor] Falha ao montar a fila:", error.message);
    return NextResponse.json({ error: "Não foi possível montar a fila." }, { status: 502 });
  }

  const linhas = (data ?? []) as LinhaDaFila[];
  const fila: Record<string, unknown>[] = [];
  const suprimidos = linhas
    .filter((l) => l.suprimido_por)
    .map((l) => ({
      veiculo_vendido_id: l.veiculo_vendido_id,
      cliente_id: l.cliente_id,
      nome: l.nome,
      placa: l.placa,
      gatilho: l.gatilho,
      passo: l.passo,
      suprimido_por: l.suprimido_por,
    }));

  for (const linha of linhas.filter((l) => !l.suprimido_por)) {
    let mensagem: string;
    try {
      mensagem = mensagemDoGatilho(linha);
    } catch (e: any) {
      // Reserva feita e mensagem impossível de montar: devolve a vez ao
      // cliente em vez de queimar a janela de 21 dias dele por um bug nosso.
      console.error("[Ciclo/Motor] Sem texto para o gatilho:", linha.gatilho, e?.message);
      if (linha.evento_id) {
        await supabase.rpc("registrar_desfecho_ciclo", {
          p_evento: linha.evento_id,
          p_desfecho: "falha_envio",
        });
      }
      continue;
    }

    fila.push({
      evento_id: linha.evento_id,
      veiculo_vendido_id: linha.veiculo_vendido_id,
      cliente_id: linha.cliente_id,
      nome: linha.nome,
      placa: linha.placa,
      gatilho: linha.gatilho,
      passo: linha.passo,
      canal: linha.canal,
      // Já no formato que a Evolution espera: só dígitos, sem "+".
      numero_whatsapp: (linha.telefone_e164 ?? "").replace(/\D/g, "") || null,
      email: linha.email,
      mensagem,
    });
  }

  return NextResponse.json({
    ok: true,
    reservado: reservar,
    total: fila.length,
    fila,
    suprimidos,
  });
}
