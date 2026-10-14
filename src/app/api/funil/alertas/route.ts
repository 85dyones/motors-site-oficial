import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "../../../../lib/supabase-server";
import { autorizarFunil } from "../../../../lib/autorizacaoDoFunil";
import { getCachedSettings } from "../../../../lib/settings";
import {
  avisoComCopiaAoGestor,
  destinatarioDoAviso,
  mensagemDeAlerta,
  mensagemDeLeadNovo,
  mensagemParaGestor,
  numeroDiscavel,
  type LinhaDaFilaDoFunil,
} from "../../../../lib/funil";
import { maisRecentePrimeiro } from "../../../../lib/etiquetasDoLead";
import { urlDoLead } from "../../../../lib/filaDoFunil";
import { urlDoSite } from "../../../../lib/site";
import { configDoChatwoot } from "../../../../lib/etiquetasDoChatwoot";
import {
  atribuirConversasDaFila,
  conversasAbertasPorLead,
  depoisDaResposta,
} from "../../../../lib/donoDaConversa";

export const dynamic = "force-dynamic";
// A atribuição das conversas no Chatwoot corre depois da resposta e pode
// levar dezenas de segundos (ver `lib/donoDaConversa`).
export const maxDuration = 60;

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
/**
 * Os perfis ativos que têm TODOS estes papéis, com WhatsApp, um por número.
 * Falhar a leitura não segura a fila: devolve ninguém e deixa o log.
 */
async function quemTemOsPapeis(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  papeis: string[],
  rotulo: string,
  semQuem: string,
): Promise<{ nome: string; whatsapp: string }[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, telefone_e164")
    .eq("is_active", true)
    .contains("papeis", papeis);
  if (error) {
    console.warn(`[Funil] ${semQuem}:`, error.message);
    return [];
  }
  const pessoas: { nome: string; whatsapp: string }[] = [];
  for (const p of (data ?? []) as { full_name?: string | null; telefone_e164?: string | null }[]) {
    const whatsapp = numeroDiscavel(p.telefone_e164);
    if (whatsapp && !pessoas.some((g) => g.whatsapp === whatsapp)) {
      pessoas.push({ nome: p.full_name?.trim() || rotulo, whatsapp });
    }
  }
  return pessoas;
}

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
  // As abertas de cada lead, para o Chatwoot acompanhar a troca de dono (ver
  // o fim da rota). Saem da mesma leitura.
  let abertasPorLead = new Map<string, number[]>();
  const aEntregar = linhas.filter((l) => !l.suprimido_por).map((l) => l.lead_id);
  if (aEntregar.length > 0) {
    const { data: atendimentos, error: erroAtendimentos } = await supabase
      .from("atendimentos")
      .select("lead_id, chatwoot_conversation_id, status_conversa, iniciado_em, created_at")
      .in("lead_id", aEntregar);
    if (erroAtendimentos) {
      console.warn("[Funil] Sem a conversa do Chatwoot nos avisos:", erroAtendimentos.message);
    } else {
      abertasPorLead = conversasAbertasPorLead(atendimentos ?? []);
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

  // Quem recebe a cópia de cada lead que muda de dono (2026-10-10, pedido do
  // dono: "configure o gestor para receber cada lead que entrar ou for
  // transferido"). Quem é gestor vem do cadastro — papel `gestor`, ativo, com
  // WhatsApp —, e não de um número escrito no n8n: trocar o gestor é trocar o
  // papel no painel. Só se lê quando há o que copiar, e a falha da leitura não
  // segura o aviso do vendedor: sem gestor, sai só o aviso dele.
  const temLeadNovo = linhas.some((l) => !l.suprimido_por && l.aviso === "lead_novo");
  const gestores: { nome: string; whatsapp: string }[] = [];
  if (temLeadNovo || linhas.some((l) => !l.suprimido_por && avisoComCopiaAoGestor(l))) {
    gestores.push(...(await quemTemOsPapeis(supabase, ["gestor"], "Gestor", "Sem o gestor para a cópia dos avisos")));
  }

  // Quem recebe o lead novo (2026-10-10, decisão do dono: *"avise o
  // administrador quando entrar lead novo, Dyones. ele vai determinar o dono e
  // depois começa a dança"*). É o administrador que também é do comercial —
  // quem distribui a carteira —, e não todo admin: o admin só do marketing não
  // escolhe vendedor. Vem do cadastro, como o gestor: trocar quem distribui é
  // trocar o papel no painel.
  const distribuidores = temLeadNovo
    ? await quemTemOsPapeis(
        supabase,
        ["admin", "comercial"],
        "Administrador",
        "Sem o administrador para o aviso de lead novo",
      )
    : [];

  for (const linha of linhas.filter((l) => !l.suprimido_por)) {
    const numero = destinatarioDoAviso(linha);
    const opcoes = {
      loja,
      conversaChatwoot: conversaPorLead.get(linha.lead_id) ?? null,
      linkDoLead: urlDoSite(urlDoLead(linha.lead_id)),
    };
    const lead = {
      nome: linha.nome,
      // Só dígitos, sem "+": é o que a Evolution espera.
      whatsapp: numeroDiscavel(linha.telefone) || null,
      interesse: linha.interesse,
      canal: linha.canal,
      etapa: linha.etapa,
      minutos_parado: linha.minutos_parado,
    };

    // O lead novo não tem dono, e por isso não tem "vendedor": vai a quem
    // distribui e ao gestor. Quem é as duas coisas recebe uma vez, como
    // administrador. Sem ninguém para receber, sai em `sem_destinatario` —
    // no modo reservado ele já foi marcado como avisado.
    if (linha.aviso === "lead_novo") {
      const recebem = [
        ...distribuidores.map((d) => ({ ...d, para: "administrador" as const })),
        ...gestores
          .filter((g) => !distribuidores.some((d) => d.whatsapp === g.whatsapp))
          .map((g) => ({ ...g, para: "gestor" as const })),
      ];
      if (recebem.length === 0) {
        console.error("[Funil] Lead novo sem administrador nem gestor para avisar — lead", linha.lead_id);
        semDestinatario.push({ lead_id: linha.lead_id, nome: linha.nome, aviso: linha.aviso });
      }
      for (const r of recebem) {
        fila.push({
          lead_id: linha.lead_id,
          aviso: linha.aviso,
          para: r.para,
          lead,
          destinatario: { nome: r.nome, whatsapp: r.whatsapp },
          responsavel_anterior: null,
          mensagem: mensagemDeLeadNovo(linha, opcoes, r.para),
        });
      }
      continue;
    }

    if (numero) {
      fila.push({
        lead_id: linha.lead_id,
        aviso: linha.aviso,
        para: "vendedor",
        lead,
        destinatario: {
          nome: linha.aviso === "estagnacao" ? linha.responsavel : linha.novo_responsavel,
          whatsapp: numero,
        },
        // Em transferência e atribuição, quem estava antes — o texto cita.
        responsavel_anterior: linha.aviso === "estagnacao" ? null : linha.responsavel,
        mensagem: mensagemDeAlerta(linha, opcoes),
      });
    } else {
      console.error("[Funil] Aviso sem destinatário — lead", linha.lead_id, linha.aviso);
      semDestinatario.push({ lead_id: linha.lead_id, nome: linha.nome, aviso: linha.aviso });
    }

    // A cópia sai mesmo quando o vendedor ficou sem número: no modo reservado
    // o lead já mudou de dono, e o gestor é quem pode avisar à mão. Quem já é
    // o destinatário do aviso (o gestor que também vende) não recebe duas.
    if (avisoComCopiaAoGestor(linha)) {
      for (const g of gestores) {
        if (g.whatsapp === numero) continue;
        fila.push({
          lead_id: linha.lead_id,
          aviso: linha.aviso,
          para: "gestor",
          lead,
          destinatario: { nome: g.nome, whatsapp: g.whatsapp },
          responsavel_anterior: linha.responsavel,
          mensagem: mensagemParaGestor(linha, opcoes),
        });
      }
    }
  }

  // O dono novo também no Chatwoot (2026-10-10, pedido do dono: *"as conversas
  // sobre responsabilidade do Rodrigo não aparecem pra ele"* — *"o painel
  // precisa atribuir"*). O rodízio trocava o dono do lead e a conversa ficava
  // atribuída a quem estava; o vendedor recebia o aviso e não achava o
  // cliente em "Minhas" (`lib/donoDaConversa`).
  //
  // Só no modo reservado, o único que troca o dono, e só para o que foi
  // entregue: lead suprimido não mudou de mão. DEPOIS da resposta: o Chatwoot
  // leva uns 15 s para responder a uma atribuição (medido em 10/10), e a fila
  // do n8n não espera por isso. A resposta diz quantas conversas ficaram
  // agendadas; o resultado de cada uma fica no log.
  const trocas = reservar
    ? linhas
        .filter((l) => !l.suprimido_por && avisoComCopiaAoGestor(l))
        .map((l) => ({ leadId: l.lead_id, responsavel: l.novo_responsavel }))
    : [];
  const agendadas = trocas.reduce((n, t) => n + (abertasPorLead.get(t.leadId)?.length ?? 0), 0);
  if (agendadas > 0) {
    const cfg = configDoChatwoot();
    depoisDaResposta(async () => {
      const r = await atribuirConversasDaFila(trocas, abertasPorLead, cfg);
      if (r.falhas.length > 0) {
        console.warn("[Funil] Conversa do Chatwoot sem o dono novo:", r.falhas.join(" | "));
      }
      console.info(`[Funil] Conversas do Chatwoot com o dono novo: ${r.atribuidas} de ${agendadas}.`);
    });
  }

  return NextResponse.json({
    ok: true,
    reservado: reservar,
    total: fila.length,
    fila,
    suprimidos,
    ...(semDestinatario.length > 0 ? { sem_destinatario: semDestinatario } : {}),
    ...(agendadas > 0 ? { conversas_no_chatwoot: { agendadas } } : {}),
  });
}
