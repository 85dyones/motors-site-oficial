import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "../../../../lib/supabase-server";
import { tokenConfere } from "../../../../lib/comparacaoConstante";
import {
  interpretarEventoDoChatwoot,
  variantesDoTelefone,
  type EventoDoChatwoot,
} from "../../../../lib/chatwootEventos";

export const dynamic = "force-dynamic";

/**
 * A porta de entrada do Chatwoot — o atendimento conta ao painel o que houve.
 *
 * Inverte o sentido do `WEBHOOKS_N8N.md`, como `/api/funil/alertas` e
 * `/api/ciclo/motor/*` já fazem: aqui o site é o CHAMADO. Quem bate é o
 * Chatwoot, direto, sem passar pelo n8n — um intermediário a menos entre o
 * cliente escrever e o lead aparecer na tela.
 *
 * ---------------------------------------------------------------------------
 * Os dois defeitos que esta rota fecha (medidos em produção, 2026-09-15)
 * ---------------------------------------------------------------------------
 * **A conversa que nascia no WhatsApp não virava lead.** 41 das 46 linhas de
 * `atendimentos` tinham `lead_id` nulo. Quem escrevia direto no WhatsApp — que
 * é a maioria — nunca aparecia no kanban, porque só `/api/leads`, o formulário
 * do site, gravava em `leads`. O sintoma na mesa do dono é o pior tipo: nada
 * quebra, nada dá erro, o lead simplesmente não está lá.
 *
 * **Responder no Chatwoot não parava o relógio da estagnação.** `leads_eventos`
 * tinha 4 `contato` (todos de clique no painel) contra 15 `transferencia`
 * automáticas. `ultimo_contato_em` só era escrito pela própria tela, então o
 * consultor que atendia pelo Chatwoot — o lugar para onde o card MANDA ele ir —
 * seguia sendo cobrado e perdia o lead para o próximo da fila.
 *
 * ---------------------------------------------------------------------------
 * Por que ela nunca devolve erro para o Chatwoot
 * ---------------------------------------------------------------------------
 * Fora de falha de autenticação, responde 200 com o que fez. O Chatwoot
 * desativa webhook que responde erro com frequência, e um webhook desativado
 * reabre exatamente o buraco que esta rota veio tapar — sem avisar ninguém. O
 * que deu errado sai no corpo e no log, onde dá para auditar, e não no status.
 */

/** O que a rota fez, para sair na resposta e no log. */
interface Desfecho {
  ok: true;
  acao: string;
  conversa?: number | null;
  lead?: string | null;
  detalhe?: string;
}

/**
 * O que a entrega fez, em uma linha do log.
 *
 * O desfecho já sai no corpo da resposta — mas o corpo vai para o Chatwoot, e
 * ninguém daqui o lê. Sem esta linha, uma entrega que chega e não produz lead
 * aparece no painel da Vercel como um 200 igual a qualquer outro, e a única
 * forma de saber o que houve é conferir o banco depois e deduzir.
 *
 * Só identificador e decisão. Nome e telefone do cliente ficam de fora: log de
 * PII é PII em lugar que ninguém trata como banco de dados.
 */
function registrar(desfecho: Desfecho, tipo: string): void {
  console.info(
    "[Chatwoot]",
    JSON.stringify({
      evento: tipo,
      acao: desfecho.acao,
      conversa: desfecho.conversa ?? null,
      // Boolean, e não o uuid: o que se quer saber do log é "vinculou ou não".
      com_lead: Boolean(desfecho.lead),
      detalhe: desfecho.detalhe ?? null,
    }),
  );
}

function autorizar(request: Request, url: URL): NextResponse | null {
  const segredo = (process.env.CHATWOOT_WEBHOOK_TOKEN || "").trim();

  // 503 e não 401, pela razão que `autorizarFunil` já registrou: o problema é
  // de configuração nossa, e 401 mandaria o outro lado tentar outro token para
  // sempre.
  if (!segredo) {
    console.error(
      "[Chatwoot] CHATWOOT_WEBHOOK_TOKEN não configurado. Porta de entrada indisponível.",
    );
    return NextResponse.json(
      { error: "Entrada do Chatwoot indisponível: token não configurado." },
      { status: 503 },
    );
  }

  // Duas formas de provar quem é, porque os dois caminhos existem de verdade:
  //
  //   - `Authorization: Bearer`, quando quem chama é o n8n (ou qualquer coisa
  //     que saiba montar cabeçalho). É a forma preferida.
  //   - `?token=`, porque o webhook NATIVO do Chatwoot (Configurações →
  //     Integrações → Webhooks) não tem campo de cabeçalho: só URL. Sem esta
  //     metade, ligar o Chatwoot direto seria impossível e voltaríamos a
  //     depender do n8n para o lead existir.
  //
  // ⚠️ Token em URL aparece em log de proxy e no histórico do Chatwoot. É um
  // segredo de MENOR valor de propósito: o que ele abre é esta rota, que só
  // escreve atendimento e lead. Não é o `SUPABASE_SERVICE_ROLE_KEY` e não deve
  // ser reaproveitado de nenhuma outra porta — a régua do "segredo mede
  // acesso" de 2026-08-18 vale aqui igual.
  const cabecalho = request.headers.get("Authorization");
  if (cabecalho && tokenConfere(cabecalho, `Bearer ${segredo}`)) return null;
  if (tokenConfere(url.searchParams.get("token"), segredo)) return null;

  // Quem tentou e com o quê — nunca o QUÊ.
  //
  // Sem esta linha, um 401 no log é mudo: não dá para saber se foi o Chatwoot
  // com a URL errada ou um teste de linha de comando. Em 2026-09-16 isso custou
  // meia hora de investigação — a única forma de separar os dois foi reparar
  // que os 401 estavam espaçados de 15 em 15 segundos, a cadência de um `curl`
  // em laço. Inferir a origem pela CADÊNCIA é o tipo de coisa que funciona uma
  // vez e falha na seguinte.
  //
  // O que entra: de onde veio e QUAL FORMA de credencial apareceu. O que nunca
  // entra: o valor recebido, nem parte dele. Log de token é token vazado — e
  // este viaja em URL, que já é o elo mais fraco por natureza.
  console.warn(
    "[Chatwoot] 401 —",
    JSON.stringify({
      agente: request.headers.get("User-Agent")?.slice(0, 120) ?? "(sem user-agent)",
      veio_cabecalho: Boolean(cabecalho),
      veio_query: url.searchParams.has("token"),
    }),
  );

  return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const negado = autorizar(request, url);
  if (negado) return negado;

  let supabase;
  try {
    supabase = createAdminSupabaseClient();
  } catch {
    console.error("[Chatwoot] SUPABASE_SERVICE_ROLE_KEY ausente — entrada indisponível.");
    return NextResponse.json(
      { error: "Entrada do Chatwoot indisponível: credencial de serviço não configurada." },
      { status: 503 },
    );
  }

  const corpo = await request.json().catch(() => null);
  const evento = interpretarEventoDoChatwoot(corpo);

  if (evento.tipo === "ignorado" || !evento.conversaId) {
    // Sai no corpo em vez de morrer calado: é assim que se descobre, olhando a
    // execução, que um evento que deveria contar está sendo descartado.
    const desfecho: Desfecho = {
      ok: true,
      acao: "ignorado",
      detalhe: evento.motivo ?? "sem id de conversa",
    };
    registrar(desfecho, evento.tipo);
    return NextResponse.json(desfecho);
  }

  try {
    const desfecho = await aplicar(supabase, evento);
    registrar(desfecho, evento.tipo);
    return NextResponse.json(desfecho);
  } catch (erro: unknown) {
    // Erro nosso não vira erro do Chatwoot — ver o cabeçalho.
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.error("[Chatwoot] Falha ao aplicar evento:", motivo);
    return NextResponse.json({
      ok: true,
      acao: "falhou",
      conversa: evento.conversaId,
      detalhe: motivo,
    } satisfies Desfecho);
  }
}

/**
 * Grava o que o evento significa. A ordem importa e é esta:
 *
 *   1. o atendimento existe (é a linha única por conversa);
 *   2. o lead existe e está vinculado (é o que aparece no kanban);
 *   3. se foi o consultor que falou, o relógio da estagnação reinicia.
 *
 * O passo 3 depende do 2 — sem lead não há relógio para parar —, e é por isso
 * que a resposta do consultor também cria lead quando ainda não há um. O caso
 * acontece: a conversa pode ter começado antes desta rota existir.
 */
async function aplicar(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  evento: EventoDoChatwoot,
): Promise<Desfecho> {
  const conversaId = evento.conversaId!;

  // 1. O atendimento -----------------------------------------------------
  const { data: existente } = await supabase
    .from("atendimentos")
    .select("id, lead_id")
    .eq("chatwoot_conversation_id", conversaId)
    .maybeSingle();

  // Vínculo que aponta para negócio ENCERRADO não vale como vínculo.
  //
  // O caminho gêmeo do `desfecho is null` de `acharLead`, e ele acontece sem
  // ninguém errar nada: a conversa é vinculada enquanto o lead está aberto, o
  // consultor encerra o negócio dias depois, e então o cliente volta a
  // escrever NA MESMA conversa. Sem esta releitura o atendimento seguiria
  // preso ao lead fechado, e a volta do cliente não apareceria no kanban —
  // o mesmo sintoma, por outra porta.
  let leadId: string | null = existente?.lead_id ?? null;
  if (leadId && (await leadEncerrado(supabase, leadId))) leadId = null;

  // 2. O lead ------------------------------------------------------------
  if (!leadId && evento.telefone) {
    leadId = await acharLead(supabase, evento.telefone);

    // Só o cliente escrevendo, ou o consultor respondendo, justificam criar. Um
    // `conversation_updated` de uma conversa que já existia não deve inventar
    // lead — senão mudar a etiqueta de uma conversa antiga encheria o kanban.
    if (!leadId && evento.tipo !== "conversa") {
      leadId = await criarLead(supabase, evento);
    }
  }

  const linha = {
    lead_id: leadId,
    chatwoot_conversation_id: conversaId,
    chatwoot_contact_id: evento.contatoId,
    inbox_id: evento.inboxId,
    status_conversa: evento.statusConversa,
    encerrado_em: evento.encerrada ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  if (existente) {
    // `lead_id` só é escrito quando temos um: um evento sem telefone (comum em
    // `conversation_updated`) não pode APAGAR o vínculo que outro evento achou.
    const patch: Record<string, unknown> = { ...linha };
    if (!leadId) delete patch.lead_id;
    if (!evento.encerrada) delete patch.encerrado_em;
    const { error } = await supabase.from("atendimentos").update(patch).eq("id", existente.id);
    if (error) throw new Error(`atendimento não atualizado: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("atendimentos")
      .insert({ ...linha, iniciado_em: new Date().toISOString() });
    // 23505 = a conversa nasceu em duas entregas simultâneas. O UNIQUE fez o
    // seu trabalho; não é erro para quem chamou.
    if (error && error.code !== "23505") {
      throw new Error(`atendimento não gravado: ${error.message}`);
    }
  }

  // 3. O relógio ---------------------------------------------------------
  if (evento.tipo === "mensagem_do_consultor" && leadId) {
    const { error } = await supabase.rpc("registrar_contato_do_lead", {
      p_lead: leadId,
      p_canal: "chatwoot",
      p_autor: evento.autor,
    });
    if (error) {
      // Não derruba o resto: o atendimento e o lead já estão gravados, e
      // perder o reinício do relógio é um alerta a mais, não um lead a menos.
      console.error("[Chatwoot] Contato não registrado:", error.message);
      return {
        ok: true,
        acao: "contato_nao_registrado",
        conversa: conversaId,
        lead: leadId,
        detalhe: error.message,
      };
    }
    return { ok: true, acao: "contato_registrado", conversa: conversaId, lead: leadId };
  }

  return {
    ok: true,
    acao: leadId ? "atendimento_vinculado" : "atendimento_sem_lead",
    conversa: conversaId,
    lead: leadId,
    detalhe: leadId ? undefined : "conversa sem telefone reconhecível",
  };
}

/**
 * Este lead já teve desfecho?
 *
 * Erra para o lado de "não encerrado" quando a leitura falha: um falso
 * "encerrado" criaria lead duplicado a cada mensagem, que é bem pior que
 * manter o vínculo que já existe.
 */
async function leadEncerrado(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  leadId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("leads")
    .select("desfecho")
    .eq("id", leadId)
    .maybeSingle();

  if (error) {
    console.warn("[Chatwoot] Não deu para ler o desfecho do lead:", error.message);
    return false;
  }
  return Boolean(data?.desfecho);
}

/**
 * O lead ABERTO desta pessoa, se já existe.
 *
 * Casa pelas duas formas do celular brasileiro (com e sem o nono dígito) —
 * ver `variantesDoTelefone`. O mais recente entre os abertos ganha: é nele
 * que a conversa em andamento entra.
 *
 * ---------------------------------------------------------------------------
 * `desfecho is null` — e isto custou uma volta para aparecer
 * ---------------------------------------------------------------------------
 * A primeira versão pegava o lead mais recente, ponto. No primeiro teste com
 * tráfego real (2026-09-16) ela grudou a conversa nova num lead **encerrado
 * como `descartado`** três dias antes — e `descartado` é o desfecho que existe
 * para dizer "isto nunca foi um negócio".
 *
 * O efeito é o pior possível: o atendimento fica vinculado, a rota responde
 * 200, nada dá erro — e a pessoa continua **invisível no painel**, porque o
 * kanban só mostra `!desfecho` e o motor do funil só enxerga
 * `desfecho is null`. Ou seja, a rota parecia funcionar e o sintoma que ela
 * veio corrigir continuava de pé.
 *
 * Quem volta depois de um negócio encerrado — ganho, perdido ou descartado —
 * é uma oportunidade NOVA, e ganha lead novo. Isso também protege o número da
 * loja: pendurar um contato novo num `ganho` antigo inflaria a conversão, e
 * num `perdido` a rebaixaria, sem ninguém ter decidido nada.
 */
async function acharLead(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  telefone: string,
): Promise<string | null> {
  const formas = variantesDoTelefone(telefone);
  if (formas.length === 0) return null;

  const { data, error } = await supabase
    .from("leads")
    .select("id")
    .in("telefone", formas)
    // O mesmo predicado que o kanban (`!l.desfecho`) e `montar_fila_do_funil`
    // (`where l.desfecho is null`) usam para dizer "negócio em aberto". Se as
    // três réguas divergirem, o lead existe para uma e não para as outras.
    .is("desfecho", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.warn("[Chatwoot] Busca de lead falhou:", error.message);
    return null;
  }
  return data?.[0]?.id ?? null;
}

/** O lead que nasce de uma conversa de WhatsApp. */
async function criarLead(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  evento: EventoDoChatwoot,
): Promise<string | null> {
  const agora = new Date().toISOString();
  const { data, error } = await supabase
    .from("leads")
    .insert({
      // O Chatwoot manda o nome do contato do WhatsApp; quando não manda, o
      // telefone é o que identifica. `nome` é o que o card mostra, e um card
      // sem rótulo nenhum não é clicável na prática.
      nome: evento.nome ?? `WhatsApp ${evento.telefone?.slice(-4) ?? ""}`.trim(),
      telefone: evento.telefone,
      canal: "WhatsApp",
      situacao: "novo",
      // ⚠️ Sem isto o lead nasce INVISÍVEL para o motor do funil.
      // `montar_fila_do_funil` calcula o tempo parado com
      // `greatest(ultimo_movimento_em, ultimo_contato_em)`; com os dois nulos o
      // `greatest` é nulo, os minutos são nulos, toda comparação vira nula e o
      // lead nunca entra em nenhuma fila — nem na de atribuição, que é
      // justamente a que arruma dono para ele. Um lead que ninguém tocou é
      // exatamente o que mais precisa da fila.
      ultimo_movimento_em: agora,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[Chatwoot] Lead não criado:", error.message);
    return null;
  }
  return data?.id ?? null;
}
