import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "../../../../lib/supabase-server";
import { tokenConfere } from "../../../../lib/comparacaoConstante";
import { diagnosticarToken } from "../../../../lib/diagnosticoDoToken";
import {
  interpretarEventoDoChatwoot,
  variantesDoTelefone,
  type EventoDoChatwoot,
  type SinalDeAtribuicao,
} from "../../../../lib/chatwootEventos";
import {
  decidirResponsavel,
  motivoDeNotaVelha,
  notaConfere,
  type NotaDatada,
  type PerfilDaAtribuicao,
} from "../../../../lib/atribuicaoDoChatwoot";
import {
  lerAgentesDoChatwoot,
  lerNotaDaConversa,
  ORCAMENTO_DO_CHATWOOT_MS,
} from "../../../../lib/atribuicaoDoChatwoot-servidor";
import { configDoChatwoot, type Resultado } from "../../../../lib/etiquetasDoChatwoot";
import { registrarFalha } from "../../../../lib/observabilidade";

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
 *
 * ---------------------------------------------------------------------------
 * E por que a recusa de credencial procura o dono (2026-10-08)
 * ---------------------------------------------------------------------------
 * Em 2026-09-23, às 12:13 UTC, `CHATWOOT_WEBHOOK_TOKEN` foi trocado na Vercel
 * e o site foi republicado oito segundos depois, no mesmo commit. A URL do
 * webhook no Chatwoot continuou com o token antigo em `?token=`. Dali em
 * diante TODA entrega levou 401: a última aceita foi às 00:59 UTC de 23/09, a
 * primeira recusada às 12:40.
 *
 * Por quinze dias o Chatwoot bateu, a rota recusou, e o único rastro era um
 * `console.warn` que ninguém lia. Nesse tempo nenhuma resposta de consultor
 * reiniciou o relógio (zero `contato` pelo Chatwoot desde 22/09, que sozinho
 * teve 24), nenhuma conversa nova do WhatsApp virou lead, e o motor fez 1.583
 * transferências automáticas em 40 leads. É o defeito que `alertaDeFalha.ts`
 * registrou com a CAPI em 02/09: o log existia o tempo todo, e log só avisa
 * quem está olhando.
 *
 * Por isso a recusa de quem TROUXE credencial é parada de negócio e vai ao
 * WhatsApp pela costura da observabilidade. Ver `autorizar`.
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

/** Chaves ESTÁVEIS da carência do alerta — não carregam status nem forma. */
const ALERTA_SEM_TOKEN = "chatwoot-entrada-sem-token";
const ALERTA_RECUSADA = "chatwoot-entrada-recusada";

/**
 * O que deixa de acontecer enquanto a entrada está fechada.
 *
 * Os textos do alerta cabem em 300 caracteres de propósito: é onde o
 * `alertaDeFalha` corta, e o pedaço que cairia é justamente o conserto.
 */
const O_QUE_PAROU =
  "Resposta no Chatwoot não reinicia o relógio do funil e conversa nova do WhatsApp não vira lead.";

async function autorizar(request: Request, url: URL): Promise<NextResponse | null> {
  const segredo = (process.env.CHATWOOT_WEBHOOK_TOKEN || "").trim();

  // 503 e não 401, pela razão que `autorizarFunil` já registrou: o problema é
  // de configuração nossa, e 401 mandaria o outro lado tentar outro token para
  // sempre.
  //
  // O alerta daqui sai para qualquer requisição, com ou sem credencial: sem a
  // variável ninguém consegue entrar, então quem quer que bata está
  // mostrando uma porta que de fato está fechada.
  if (!segredo) {
    console.error(
      "[Chatwoot] CHATWOOT_WEBHOOK_TOKEN não configurado. Porta de entrada indisponível.",
    );
    await registrarFalha(
      "parada",
      ALERTA_SEM_TOKEN,
      `Entrada do Chatwoot fechada (503): falta CHATWOOT_WEBHOOK_TOKEN na Vercel. ${O_QUE_PAROU}`,
      { rota: "/api/chatwoot/eventos", metodo: "POST", origem: "servidor" },
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
  //
  // Desde 2026-10-09 entra também a PISTA de por que não conferiu (rótulo e
  // tamanhos, ver `diagnosticoDoToken.ts`): o dono trocou o token três vezes
  // naquele dia sem saber se os valores eram outros ou o mesmo estragado.
  const veioQuery = url.searchParams.has("token");
  // Só rótulo e tamanhos saem daqui — `diagnostico-do-token.test.ts` e o teste
  // da rota conferem que nenhum dos dois valores aparece.
  const pista = diagnosticarToken(
    veioQuery ? url.searchParams.get("token") : cabecalho?.replace(/^Bearer\s+/i, "") ?? null,
    segredo,
  );
  console.warn(
    "[Chatwoot] 401 —",
    JSON.stringify({
      agente: request.headers.get("User-Agent")?.slice(0, 120) ?? "(sem user-agent)",
      veio_cabecalho: Boolean(cabecalho),
      veio_query: veioQuery,
      ...pista,
    }),
  );

  // Quem TROUXE credencial e foi recusado é, quase sempre, a integração com o
  // token velho — o caso de 23/09, que durou quinze dias só no log. Vai ao
  // WhatsApp como parada, com a carência de 30 min por assunto do
  // `alertaDeFalha`: o Chatwoot bate a cada mensagem, e o que sai é um aviso
  // por meia hora com a conta das engolidas, não um por entrega. A carência é
  // por INSTÂNCIA, em memória (ver `alertaDeFalha.ts`): com várias instâncias
  // quentes, ou logo depois de um deploy, sai mais de um.
  //
  // "Trouxe credencial" é um `?token=` NÃO VAZIO ou um `Bearer` — as duas
  // formas que esta porta aceita. Sem nenhuma delas (inclusive `?token=` vazio
  // e `Authorization: Basic`), é varredura de robô e fica só no log.
  //
  // ⚠️ Isso barra a varredura, não quem quer incomodar: um estranho que mande
  // `?token=qualquer-coisa` faz o alerta sair, no ritmo da carência. Separar
  // os dois pediria um sinal que ele não fabrica (por exemplo, quanto tempo
  // faz desde a última entrega ACEITA), e esta rota não guarda isso hoje.
  //
  // O alerta leva a FORMA da credencial e nada que o chamador escreveu: nem o
  // valor, nem o `User-Agent`. Texto de quem bate numa porta pública não vai
  // para o WhatsApp de ninguém — o agente fica no log acima.
  const tokenNaQuery = Boolean(url.searchParams.get("token")?.trim());
  const bearer = /^Bearer\s+\S/i.test(cabecalho ?? "");
  if (tokenNaQuery || bearer) {
    // A query é o webhook nativo do Chatwoot; o cabeçalho, o n8n.
    const onde = tokenNaQuery ? "da URL do webhook" : "do Bearer";
    const conserto = tokenNaQuery
      ? "pôr o token atual na URL do webhook, no Chatwoot"
      : "pôr o token atual no Bearer de quem chama";
    await registrarFalha(
      "parada",
      ALERTA_RECUSADA,
      `Chatwoot recusado (401): o token ${onde} não confere com CHATWOOT_WEBHOOK_TOKEN da Vercel. ` +
        `${O_QUE_PAROU} Conserto: ${conserto}. Se foi teste seu, ignore.`,
      { rota: "/api/chatwoot/eventos", metodo: "POST", origem: "servidor" },
    );
  }

  return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const negado = await autorizar(request, url);
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
 *   3. se foi o consultor que falou, o relógio da estagnação reinicia;
 *   4. se um admin deu a conversa a um vendedor no Chatwoot, o lead muda de
 *      dono (2026-10-03, ver `aplicarAtribuicao`).
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
  const vinculoEncerrado = leadId !== null && (await leadEncerrado(supabase, leadId));
  if (vinculoEncerrado) leadId = null;

  // A conversa que só está sendo RESOLVIDA, e cujo lead já foi encerrado, não
  // sai à procura de outro lead (2026-10-06). É o evento que volta quando o
  // painel encerra o lead e resolve a conversa (`conversaDoDesfecho`), e
  // também o do consultor que resolve à mão depois de fechar o negócio. Não é
  // o cliente voltando: pendurar esta conversa no outro lead aberto da mesma
  // pessoa trocaria o atendimento mais recente dele, que é de onde a fila lê
  // se o assistente ainda está na conversa. O vínculo fica como está.
  const soResolveOQueJaEncerrou = vinculoEncerrado && evento.tipo === "conversa" && evento.encerrada;
  // O mesmo para a troca de responsável numa conversa de lead encerrado: a
  // atribuição feita no Chatwoot é sobre ESTA conversa, e não dá dono ao
  // outro lead aberto da mesma pessoa. Sem procurar lead, o passo 4 não roda.
  const atribuiOQueJaEncerrou = vinculoEncerrado && evento.tipo === "conversa" && Boolean(evento.atribuicao);

  // 2. O lead ------------------------------------------------------------
  if (!leadId && evento.telefone && !soResolveOQueJaEncerrou && !atribuiOQueJaEncerrou) {
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

  // 4. O dono ------------------------------------------------------------
  // Nunca numa conversa cujo lead vinculado está encerrado (2026-10-06).
  if (evento.atribuicao && leadId && !vinculoEncerrado) {
    // Nada daqui derruba o que já foi gravado: o atendimento e o vínculo
    // valem mesmo que a atribuição não possa ser lida.
    let resultado: ResultadoDaAtribuicao;
    try {
      resultado = await aplicarAtribuicao(supabase, leadId, conversaId, evento.atribuicao);
    } catch (erro: unknown) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      console.error("[Chatwoot] Atribuição não aplicada:", motivo);
      resultado = { mudou: false, motivo };
    }
    return {
      ok: true,
      acao: resultado.mudou ? "responsavel_atribuido" : "atendimento_vinculado",
      conversa: conversaId,
      lead: leadId,
      detalhe: resultado.mudou ? undefined : `atribuição sem efeito: ${resultado.motivo}`,
    };
  }

  return {
    ok: true,
    acao: leadId ? "atendimento_vinculado" : "atendimento_sem_lead",
    conversa: conversaId,
    lead: leadId,
    detalhe: leadId
      ? undefined
      : soResolveOQueJaEncerrou
        ? "conversa resolvida de um lead já encerrado"
        : atribuiOQueJaEncerrou
          ? "atribuição numa conversa de lead já encerrado"
        : "conversa sem telefone reconhecível",
  };
}

/** Quanto o relógio do servidor pode estar adiantado em relação ao do banco. */
const FOLGA_DO_RASTRO_MS = 60_000;
/**
 * Depois disto, a atribuição desiste ANTES de gravar. O Chatwoot fica com no
 * máximo `ORCAMENTO_DO_CHATWOOT_MS`; o resto é para as leituras do banco. Uma
 * troca de dono que não coube no prazo fica para a próxima entrega: é melhor
 * que responder tarde a um webhook.
 */
const PRAZO_DA_ATRIBUICAO_MS = 3500;

type ResultadoDaAtribuicao = { mudou: true } | { mudou: false; motivo: string };

/**
 * A atribuição feita no Chatwoot vira o dono do lead (2026-10-03).
 *
 * Só quando um ADMIN ativo deu a conversa a um Comercial ativo. A régua é
 * `decidirResponsavel`; aqui ficam as leituras que ela pede e a gravação.
 *
 * O evento não diz quem atribuiu. Quando a nota não veio nele, é lida da
 * conversa pela API. Venha de onde vier, a nota precisa apontar para o
 * responsável que o evento traz (`notaConfere`). E o autor é conferido na
 * lista de agentes do Chatwoot, lida em paralelo: o nome da nota é nome de
 * exibição, que o agente edita. Sem `CHATWOOT_API_TOKEN`, com o Chatwoot fora
 * do ar ou sem a lista de agentes, o lead fica como está: o motivo sai no log
 * e a resposta continua 200.
 *
 * ---------------------------------------------------------------------------
 * Duas entregas ao mesmo tempo
 * ---------------------------------------------------------------------------
 * O Chatwoot manda mais de um evento pela mesma atribuição. O `update` leva o
 * responsável que foi LIDO como condição: a entrega que chega em segundo não
 * alcança linha nenhuma, e quem não alcançou linha não toca o rastro. O mesmo
 * vale se o painel trocou o dono entre a leitura e a gravação.
 *
 * ---------------------------------------------------------------------------
 * O rastro, e por que ele é corrigido depois de gravado
 * ---------------------------------------------------------------------------
 * Quem escreve o rastro da troca de dono é o gatilho de `leads`
 * (`leads_registrar_no_rastro`), e ele decide pelo `auth.uid()`: com a chave
 * de serviço, que é a desta rota, a troca sai como `transferencia` AUTOMÁTICA
 * e sem autor, como se o motor tivesse tirado o lead de alguém. Deixar assim
 * tem custo: o relatório contaria uma transferência que não houve, e o
 * gatilho do crédito do SDR lê `transferencia` automática como "lead parado".
 *
 * Então, logo depois do `update`, a linha que o gatilho escreveu é corrigida
 * para o que a troca foi: `responsavel`, com o nome do admin e
 * `detalhe.origem = "chatwoot"`. Se a linha não for achada, uma equivalente é
 * inserida. ⚠️ O conserto de verdade é uma função de banco que receba o autor
 * (como `registrar_contato_do_lead` recebe `p_autor`); esta entrega não
 * podia escrever migração.
 *
 * Pela mesma razão o `update` zera o alerta e carimba `ultimo_contato_em`: é
 * o que o gatilho `leads_antes_de_atualizar` faz quando a troca vem de gente
 * pelo painel. Sem isso, o vendedor receberia o lead com o prazo já vencido e
 * o motor o tiraria dele na rodada seguinte.
 */
async function aplicarAtribuicao(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  leadId: string,
  conversaId: number,
  sinal: SinalDeAtribuicao,
): Promise<ResultadoDaAtribuicao> {
  const inicio = Date.now();
  const limite = inicio + ORCAMENTO_DO_CHATWOOT_MS;

  const cfg = configDoChatwoot();
  if (!cfg) return { mudou: false, motivo: "chatwoot-nao-configurado" };

  const notaDoEvento: Resultado<NotaDatada> | null = sinal.nota
    ? notaConfere(sinal.nota, sinal.responsavelNoChatwoot)
      ? { ok: true, valor: { nota: sinal.nota, em: sinal.notaEm } }
      : { ok: false, motivo: "a nota não é do responsável atual da conversa" }
    : null;
  if (notaDoEvento && !notaDoEvento.ok) return { mudou: false, motivo: notaDoEvento.motivo };

  const [lida, agentes] = await Promise.all([
    notaDoEvento ?? lerNotaDaConversa(conversaId, cfg, sinal, limite),
    lerAgentesDoChatwoot(cfg, limite),
  ]);
  if (!lida.ok) {
    console.warn("[Chatwoot] Nota de atribuição não lida:", lida.motivo);
    return { mudou: false, motivo: lida.motivo };
  }
  if (!agentes.ok) {
    // Sem a lista não há como saber se o autor é admin NO CHATWOOT, e o nome
    // da nota sozinho não prova nada.
    console.warn("[Chatwoot] Agentes não lidos, atribuição recusada:", agentes.motivo);
    return { mudou: false, motivo: `agentes do Chatwoot ilegíveis: ${agentes.motivo}` };
  }
  const datada = lida.valor;

  const { data: perfis, error: erroPerfis } = await supabase
    .from("profiles")
    .select("full_name, email, papeis, is_active")
    .eq("is_active", true);
  if (erroPerfis) return { mudou: false, motivo: `perfis ilegíveis: ${erroPerfis.message}` };

  const decisao = decidirResponsavel({
    nota: datada.nota,
    perfis: (perfis ?? []) as PerfilDaAtribuicao[],
    emailDoDestino: sinal.emailDoResponsavel,
    agentes: agentes.valor,
  });
  if (decisao.responsavel === null) {
    console.info("[Chatwoot] Atribuição recusada:", decisao.motivo);
    return { mudou: false, motivo: decisao.motivo };
  }

  const { data: lead, error: erroLead } = await supabase
    .from("leads")
    .select("responsavel, responsavel_desde, created_at")
    .eq("id", leadId)
    .maybeSingle();
  if (erroLead || !lead) {
    return { mudou: false, motivo: `lead ilegível: ${erroLead?.message ?? "não encontrado"}` };
  }

  const lido = typeof lead.responsavel === "string" ? lead.responsavel : null;
  // O mesmo nome não gera escrita: o Chatwoot manda vários eventos pela mesma
  // atribuição, e cada escrita seria uma linha a mais no rastro.
  if ((lido ?? "").trim() === decisao.responsavel) return { mudou: false, motivo: "ja-e-o-responsavel" };

  const velha = motivoDeNotaVelha({
    notaEm: datada.em,
    explicito: sinal.explicito,
    leadCriadoEm: lead.created_at as string | null,
    responsavelDesde: lead.responsavel_desde as string | null,
  });
  if (velha) return { mudou: false, motivo: velha };

  if (Date.now() - inicio >= PRAZO_DA_ATRIBUICAO_MS) return { mudou: false, motivo: "sem-tempo" };

  // Só linha do rastro escrita DESTA troca pode ser corrigida. A folga cobre a
  // diferença entre o relógio daqui e o do banco.
  const desde = new Date(Date.now() - FOLGA_DO_RASTRO_MS).toISOString();
  const agora = new Date().toISOString();
  const gravacao = supabase
    .from("leads")
    .update({
      responsavel: decisao.responsavel,
      atualizado_em: agora,
      ultimo_contato_em: agora,
      alertado_em: null,
    })
    .eq("id", leadId);
  // A condição é o valor LIDO, cru: se outra entrega ou o painel trocou o
  // dono nesse meio tempo, nenhuma linha casa.
  const { data: gravadas, error: erroGravar } = await (
    lido === null ? gravacao.is("responsavel", null) : gravacao.eq("responsavel", lido)
  ).select("id");
  if (erroGravar) return { mudou: false, motivo: `lead não atualizado: ${erroGravar.message}` };
  if (!gravadas || gravadas.length === 0) {
    return { mudou: false, motivo: "responsavel-mudou-durante-a-troca" };
  }

  await corrigirRastro(supabase, {
    leadId,
    de: (lido ?? "").trim() || null,
    para: decisao.responsavel,
    autor: decisao.autor,
    desde,
    detalhe: { origem: "chatwoot", conversa: conversaId, nota: datada.nota.tipo },
  });
  return { mudou: true };
}

/**
 * Faz o rastro dizer o que houve: um admin trocou o dono, pelo Chatwoot.
 * Ver o cabeçalho de `aplicarAtribuicao`. Falha aqui não desfaz a troca.
 *
 * Só é chamada por quem de fato gravou a troca. Ainda assim confere, antes de
 * inserir, se a linha desta troca já está lá: sem chave única no rastro (que
 * pediria migração), é o que dá para fazer contra a linha em dobro.
 */
async function corrigirRastro(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  troca: {
    leadId: string;
    de: string | null;
    para: string;
    autor: string;
    /** Antes disto, a linha é de outra troca e não se toca. */
    desde: string;
    detalhe: { origem: string; conversa: number; nota: string };
  },
): Promise<void> {
  const correto = {
    tipo: "responsavel",
    autor: troca.autor,
    automatico: false,
    detalhe: troca.detalhe,
  };

  const { data: escritas, error: erroLer } = await supabase
    .from("leads_eventos")
    .select("id")
    .eq("lead_id", troca.leadId)
    .eq("tipo", "transferencia")
    .eq("automatico", true)
    .eq("para", troca.para)
    .gte("criado_em", troca.desde)
    .order("criado_em", { ascending: false })
    .limit(1);
  if (erroLer) {
    console.error("[Chatwoot] Rastro da atribuição ilegível:", erroLer.message);
    return;
  }

  const doGatilho = escritas?.[0]?.id;
  if (doGatilho) {
    const { error } = await supabase
      .from("leads_eventos")
      .update(correto)
      .eq("id", doGatilho)
      // Ainda é a linha do gatilho: outra entrega pode tê-la corrigido antes.
      .eq("tipo", "transferencia");
    if (error) console.error("[Chatwoot] Rastro da atribuição não corrigido:", error.message);
    return;
  }

  const { data: jaEscritas, error: erroConferir } = await supabase
    .from("leads_eventos")
    .select("id")
    .eq("lead_id", troca.leadId)
    .eq("tipo", "responsavel")
    .eq("para", troca.para)
    .eq("detalhe->>origem", troca.detalhe.origem)
    .eq("detalhe->>nota", troca.detalhe.nota)
    .gte("criado_em", troca.desde)
    .limit(1);
  if (erroConferir) {
    console.error("[Chatwoot] Rastro da atribuição ilegível:", erroConferir.message);
    return;
  }
  if (jaEscritas && jaEscritas.length > 0) return;

  const { error } = await supabase
    .from("leads_eventos")
    .insert({ ...correto, lead_id: troca.leadId, de: troca.de, para: troca.para });
  if (error) console.error("[Chatwoot] Rastro da atribuição não registrado:", error.message);
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
