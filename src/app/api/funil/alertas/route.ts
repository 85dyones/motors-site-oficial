import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "../../../../lib/supabase-server";
import { autorizarFunil } from "../../../../lib/autorizacaoDoFunil";
import { getCachedSettings } from "../../../../lib/settings";
import {
  destinatarioDoAviso,
  mensagemDeAlerta,
  numeroDiscavel,
  type LinhaDaFilaDoFunil,
} from "../../../../lib/funil";
import { maisRecentePrimeiro } from "../../../../lib/etiquetasDoLead";
import { urlDoLead } from "../../../../lib/filaDoFunil";
import { urlDoSite } from "../../../../lib/site";

export const dynamic = "force-dynamic";

/**
 * A fila de alertas do funil — o que o n8n consome para cutucar o vendedor.
 *
 * 2026-08-28, pedido do dono: *"alertas inteligentes de estagnação do lead no
 * whatsapp do vendedor e após um prazo razoável, transferir o lead para outro
 * vendedor, salvo os que já estão em negociação ou com visita agendada"*.
 *
 * ---------------------------------------------------------------------------
 * A divisão de trabalho (a mesma do motor do Ciclo, pelo mesmo motivo)
 * ---------------------------------------------------------------------------
 * O n8n faz três coisas: acorda de hora em hora, pede a fila, entrega no
 * WhatsApp. Quem decide QUEM está parado, QUEM avisar, SE pode avisar agora e
 * PARA QUEM vai o lead transferido é `montar_fila_do_funil`, no banco — porque
 * um workflow pode ser reconfigurado por engano e a régua não pode. Um n8n
 * desligado atrasa mensagem; um n8n mal configurado não consegue redistribuir
 * a carteira inteira de um vendedor.
 *
 * ---------------------------------------------------------------------------
 * `reservar: true` é o modo de produção — e é ele que TRANSFERE
 * ---------------------------------------------------------------------------
 * A transferência acontece dentro do mesmo comando que monta a fila, e só no
 * modo reservado. Duas consequências, as duas desejadas:
 *
 *  1. duas execuções sobrepostas do workflow não mandam a mesma mensagem duas
 *     vezes, porque a marca do aviso é gravada junto;
 *  2. **não existe transferência silenciosa.** Se ninguém vai ser avisado, o
 *     lead não troca de dono. Um lead que muda de mão sem que o novo dono
 *     saiba é um lead perdido duas vezes.
 *
 * Sem `reservar`, a rota é uma prévia: mostra o que aconteceria, não grava
 * nada, não transfere ninguém. É o que se chama para conferir a régua antes de
 * ligar o workflow.
 *
 * ---------------------------------------------------------------------------
 * O que sai na resposta
 * ---------------------------------------------------------------------------
 * A fila pronta para entregar (com o texto já montado e o número já no formato
 * da Evolution) **e** o que foi suprimido, com o motivo. Fila que descarta em
 * silêncio é fila que ninguém audita — a lição do 404 engolido, registrada na
 * AUDITORIA.
 */
export async function POST(request: Request) {
  const auth = await autorizarFunil(request);
  if (auth.erro) return auth.erro;

  let supabase;
  try {
    supabase = createAdminSupabaseClient();
  } catch {
    console.error("[Funil] SUPABASE_SERVICE_ROLE_KEY ausente — fila indisponível.");
    return NextResponse.json(
      { error: "Motor do funil indisponível: credencial de serviço não configurada." },
      { status: 503 },
    );
  }

  const corpo = await request.json().catch(() => ({} as any));
  const reservar = corpo?.reservar === true;

  const { data, error } = await supabase.rpc("montar_fila_do_funil", {
    p_reservar: reservar,
  });

  if (error) {
    console.error("[Funil] Falha ao montar a fila:", error.message);
    return NextResponse.json({ error: "Não foi possível montar a fila." }, { status: 502 });
  }

  const linhas = (data ?? []) as LinhaDaFilaDoFunil[];

  // O nome da loja abre a mensagem. Falha na leitura não derruba o alerta: um
  // aviso sem o prefixo da loja continua sendo um aviso útil.
  let loja: string | null = null;
  try {
    const { companySettings } = await getCachedSettings();
    loja = companySettings?.name?.trim() || null;
  } catch {
    loja = null;
  }

  const suprimidos = linhas
    .filter((l) => l.suprimido_por)
    .map((l) => ({
      lead_id: l.lead_id,
      nome: l.nome,
      etapa: l.etapa,
      aviso: l.aviso,
      minutos_parado: l.minutos_parado,
      responsavel: l.responsavel,
      suprimido_por: l.suprimido_por,
    }));

  // A conversa do Chatwoot de cada lead da fila, para o link do aviso
  // (2026-10-09: o link é o do Chatwoot, não o `wa.me`). Uma leitura para a
  // fila inteira, e a conversa mais recente de cada lead pela régua de
  // `maisRecentePrimeiro` — a mesma do card do kanban.
  //
  // Falhar aqui não pode segurar o aviso: no modo reservado o lead JÁ foi
  // transferido, e o novo dono precisa saber. Sem a conversa, o link cai no
  // painel.
  const conversaPorLead = new Map<string, number>();
  const aEntregar = linhas.filter((l) => !l.suprimido_por).map((l) => l.lead_id);
  if (aEntregar.length > 0) {
    const { data: atendimentos, error: erroAtendimentos } = await supabase
      .from("atendimentos")
      .select("lead_id, chatwoot_conversation_id, iniciado_em, created_at")
      .in("lead_id", aEntregar);
    if (erroAtendimentos) {
      console.warn("[Funil] Sem a conversa do Chatwoot nos avisos:", erroAtendimentos.message);
    } else {
      for (const a of maisRecentePrimeiro(atendimentos ?? [])) {
        const conversa = Number(a.chatwoot_conversation_id);
        if (a.lead_id && !conversaPorLead.has(a.lead_id) && conversa > 0) {
          conversaPorLead.set(a.lead_id, conversa);
        }
      }
    }
  }

  const fila: Record<string, unknown>[] = [];
  // Aviso montado e sem para quem entregar. Só acontece se alguém apagar o
  // telefone do vendedor entre a montagem da fila e aqui — mas se acontecer,
  // no modo reservado o lead JÁ foi marcado como avisado. Sair na resposta é
  // o que permite ver isso na execução do n8n em vez de nunca.
  const semDestinatario: { lead_id: string; nome: string; aviso: string }[] = [];

  for (const linha of linhas.filter((l) => !l.suprimido_por)) {
    const numero = destinatarioDoAviso(linha);
    if (!numero) {
      console.error("[Funil] Aviso sem destinatário — lead", linha.lead_id, linha.aviso);
      semDestinatario.push({ lead_id: linha.lead_id, nome: linha.nome, aviso: linha.aviso });
      continue;
    }

    fila.push({
      lead_id: linha.lead_id,
      aviso: linha.aviso,
      lead: {
        nome: linha.nome,
        // Só dígitos, sem "+": é o que a Evolution espera.
        whatsapp: numeroDiscavel(linha.telefone) || null,
        interesse: linha.interesse,
        canal: linha.canal,
        etapa: linha.etapa,
        minutos_parado: linha.minutos_parado,
      },
      destinatario: {
        nome: linha.aviso === "estagnacao" ? linha.responsavel : linha.novo_responsavel,
        whatsapp: numero,
      },
      // Em transferência e atribuição, quem estava antes — o texto cita.
      responsavel_anterior: linha.aviso === "estagnacao" ? null : linha.responsavel,
      mensagem: mensagemDeAlerta(linha, {
        loja,
        conversaChatwoot: conversaPorLead.get(linha.lead_id) ?? null,
        linkDoLead: urlDoSite(urlDoLead(linha.lead_id)),
      }),
    });
  }

  return NextResponse.json({
    ok: true,
    reservado: reservar,
    total: fila.length,
    fila,
    suprimidos,
    ...(semDestinatario.length > 0 ? { sem_destinatario: semDestinatario } : {}),
  });
}
