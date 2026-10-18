import type { ClienteDaSessao } from "./gestaoDoLead-servidor";
import { sendCapiEvent, type CapiEvent } from "./meta-capi";
import { registrarFalha } from "./observabilidade";
import { getCachedSettings } from "./settings";
import {
  AVISO_DE_GANHO_SEM_VALOR,
  COLUNAS_PARA_O_META,
  EVENTO_DE_COMPRA,
  ETAPAS_QUALIFICADAS,
  PERMANENCIA_MINIMA_MS,
  SEM_VALOR,
  colunasDaCapi,
  eventosDevidos,
  lerRegistros,
  quandoQualificou,
  registroDaEntrega,
  registroPulado,
  type EventoDevido,
  type LeadParaOMeta,
  type MovimentoDoLead,
  type PassagemDeEtapa,
  type RegistroDaCapi,
  type RegistrosDaCapi,
} from "./qualificacaoParaMeta";

/**
 * A metade de servidor da qualificação para o Meta (16/10/2026): lê a linha
 * do lead, manda o que é devido e grava o resultado nela. As regras são de
 * `lib/qualificacaoParaMeta` (puro); aqui fica o transporte.
 *
 * Nunca lança e nunca muda a resposta de quem chamou: o movimento no funil já
 * valeu, e o Meta fora do ar não o desfaz. O que não foi fica registrado na
 * linha (`capi_meta_status`, `capi_meta_response`, `capi_meta_sent_at`) e é
 * tentado de novo: o Purchase no próximo movimento que o justifique, o
 * LeadQualificado na próxima rodada de hora em hora (no fim do arquivo).
 *
 * O cliente é o de quem chama — a sessão do painel nas rotas de gestão, a
 * chave de serviço na captura. A RLS de `leads` decide o que cada um alcança,
 * como no resto da gestão do lead.
 */

/** Qualquer cliente que leia e grave `leads`. */
export type ClienteDeLeads = Pick<ClienteDaSessao, "from">;

/**
 * De onde vem o pixel. Parâmetro, e não import fixo, para o módulo rodar em
 * teste com um dublê — e porque a captura já resolve o pixel do jeito dela.
 */
export interface FontesDaQualificacao {
  lerPixelId: () => Promise<string | null>;
}

/**
 * O pixel como `/api/leads` o resolve: `companySettings.metaPixelId` de
 * `site_settings`. Sem ele, a CAPI inteira está desligada — e aí nada é
 * mandado nem registrado, como na captura.
 */
export async function pixelIdDasSettings(): Promise<string | null> {
  const { companySettings } = await getCachedSettings();
  const pixel = (companySettings as { metaPixelId?: unknown } | null)?.metaPixelId;
  return typeof pixel === "string" && pixel.trim() ? pixel.trim() : null;
}

/** O que a rota recebe de volta: só o que a tela pode mostrar. */
export interface ResultadoDaQualificacao {
  /** Os eventos que o Meta aceitou, pelo nome. */
  enviados: string[];
  /** Um aviso para a tela, quando o ganho ficou sem Purchase por falta de valor. */
  aviso: string | null;
}

const NADA: ResultadoDaQualificacao = { enviados: [], aviso: null };

/**
 * Junta os registros novos aos da linha e grava as três colunas. Falha
 * registrada na triagem, nunca lançada: o evento já foi (ou já ficou
 * registrado como não ido), e a linha sem o registro é o mal menor.
 */
async function gravarRegistros(
  supabase: ClienteDeLeads,
  leadId: string,
  atuais: RegistrosDaCapi,
  novos: RegistrosDaCapi,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("leads")
      .update(colunasDaCapi({ ...atuais, ...novos }))
      .eq("id", leadId);
    if (error) {
      console.error("[Meta CAPI] O resultado não ficou na linha do lead", leadId, error.message);
      await registrarFalha("quebra", "meta-capi-registro", error.message, { extra: { lead_id: leadId } });
      return false;
    }
    return true;
  } catch (erro) {
    console.error("[Meta CAPI] O resultado não ficou na linha do lead", leadId, erro);
    await registrarFalha("quebra", "meta-capi-registro", erro, { extra: { lead_id: leadId } });
    return false;
  }
}

/**
 * Depois de um movimento GRAVADO: manda ao Meta o Purchase do ganho, e grava
 * o resultado na linha.
 *
 * Só o Purchase (18/10/2026, decisão do dono: *"envie de hora em hora"*): o
 * LeadQualificado não vai mais no movimento, porque o cartão arrastado pela
 * coluna o mandaria sem volta. Vai pela rodada de hora em hora
 * (`repescarQualificacoes`), que só conta quem ficou na etapa. Fechar como
 * ganho é uma decisão, não um arrasto — e o valor está nas mãos de quem fechou.
 *
 * Chamar só depois do `update`, e só quando ele alcançou o lead: evento que
 * não houve é o pior dado possível para uma campanha.
 */
export async function qualificarNoMeta(
  supabase: ClienteDeLeads,
  leadId: string,
  movimento: MovimentoDoLead,
  fontes: FontesDaQualificacao,
): Promise<ResultadoDaQualificacao> {
  // Sem ganho não há Purchase, e não custa nem a leitura da linha: mover entre
  // colunas continua gravando direto, sem ler lead nenhum (é o que
  // `leads-gerenciar-desfecho` trava para o PATCH).
  if (movimento.desfecho !== "ganho") return NADA;
  try {
    const { data, error } = await supabase
      .from("leads")
      .select(COLUNAS_PARA_O_META)
      .eq("id", leadId)
      .maybeSingle();
    if (error || !data) {
      console.warn("[Meta CAPI] Lead ilegível para a qualificação", leadId, error?.message ?? "sem linha");
      return NADA;
    }
    const lead = data as unknown as LeadParaOMeta;
    // O LeadQualificado do ganho vai pela rodada de hora em hora.
    const devidos = eventosDevidos(lead, movimento).filter((d) => d.chave === "purchase");
    if (devidos.length === 0) return NADA;

    // O pixel só é lido quando há o que mandar — e sem ele a CAPI inteira
    // está desligada: nada vai, nada fica registrado, como na captura.
    let pixelId: string | null = null;
    try {
      pixelId = await fontes.lerPixelId();
    } catch (erro) {
      // Só a primeira linha: o `unstable_cache` do Next, fora de uma
      // requisição, lança uma mensagem que traz o código da função inteira.
      const texto = String(erro instanceof Error ? erro.message : erro).split("\n")[0].slice(0, 200);
      console.warn("[Meta CAPI] Sem pixel para a qualificação:", texto);
    }
    if (!pixelId) return NADA;

    const novos: RegistrosDaCapi = {};
    const enviados: string[] = [];
    let aviso: string | null = null;
    for (const devido of devidos) {
      if (!devido.evento) {
        novos[devido.chave] = registroPulado(EVENTO_DE_COMPRA, null, devido.motivo);
        if (devido.motivo === SEM_VALOR) aviso = AVISO_DE_GANHO_SEM_VALOR;
        continue;
      }
      const entrega = await sendCapiEvent({ ...devido.evento, pixelId });
      const registro = registroDaEntrega(devido.evento.eventName, devido.evento.eventId, entrega, devido.extra);
      novos[devido.chave] = registro;
      if (registro.resultado === "enviado") enviados.push(devido.evento.eventName);
    }

    await gravarRegistros(supabase, leadId, lerRegistros(lead.capi_meta_response), novos);
    return { enviados, aviso };
  } catch (erro) {
    console.error("[Meta CAPI] A qualificação falhou fora da entrega", leadId, erro);
    await registrarFalha("quebra", "meta-capi-qualificacao", erro, { extra: { lead_id: leadId } });
    return NADA;
  }
}

/**
 * O registro do `Lead` da captura (`/api/leads`), na linha recém-gravada.
 *
 * A linha acabou de nascer, então não há registro anterior a juntar. Quem
 * monta o registro é a rota (`registroDaEntrega` com o que `sendCapiEvent`
 * devolveu, ou `registroPulado` quando o formulário veio sem `event_id`).
 */
export async function registrarLeadNaLinha(
  supabase: ClienteDeLeads,
  leadId: string,
  registro: RegistroDaCapi,
): Promise<void> {
  await gravarRegistros(supabase, leadId, {}, { lead: registro });
}

// ---------------------------------------------------------------------------
// O rastro do funil
// ---------------------------------------------------------------------------

/** O PostgREST corta cada resposta em 1000 linhas, em silêncio. */
const PAGINA = 1000;
/** Mais que isto não é a loja: melhor parar do que julgar pelo rastro pela metade. */
const MAX_LINHAS = 50000;
/** Ids por consulta: o filtro `in` vai na URL. */
const IDS_POR_CONSULTA = 100;

type Pagina = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/**
 * Lê TODAS as linhas, uma página por vez, na ordem do `id`. Um `limit` só
 * cortaria em 1000 sem avisar — e rastro cortado é o pior caso: a saída da
 * Visita some e o cartão arrastado parece "ainda em Visita".
 */
async function todasAsPaginas<T>(ler: (de: number, ate: number) => Pagina): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await ler(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    const pagina = (data ?? []) as T[];
    linhas.push(...pagina);
    if (pagina.length < PAGINA) return linhas;
    if (linhas.length >= MAX_LINHAS) throw new Error(`mais de ${MAX_LINHAS} linhas no rastro do funil: não julgo pela metade`);
  }
}

const emLotes = <T>(xs: readonly T[]) =>
  Array.from({ length: Math.ceil(xs.length / IDS_POR_CONSULTA) }, (_, i) => xs.slice(i * IDS_POR_CONSULTA, (i + 1) * IDS_POR_CONSULTA));

/**
 * As mudanças de etapa (`leads_eventos`, tipo `etapa`) de cada lead, inteiras:
 * em lotes de ids e paginadas. Só chave da etapa e horário — nada de pessoa.
 * Quem lê: a repescagem, aqui, e o retrato do Copiloto do Meta.
 */
export async function lerRastroDeEtapas(cliente: ClienteDeLeads, leadIds: readonly string[]): Promise<Map<string, PassagemDeEtapa[]>> {
  const rastro = new Map<string, PassagemDeEtapa[]>();
  for (const lote of emLotes([...new Set(leadIds)])) {
    const linhas = await todasAsPaginas<{ lead_id: string; para: string | null; criado_em: string }>((de, ate) =>
      cliente
        .from("leads_eventos")
        .select("lead_id, para, criado_em")
        .eq("tipo", "etapa")
        .in("lead_id", lote)
        .order("id", { ascending: true })
        .range(de, ate),
    );
    for (const e of linhas) {
      if (typeof e.para !== "string") continue;
      const id = String(e.lead_id);
      const lista = rastro.get(id) ?? [];
      lista.push({ para: e.para, em: String(e.criado_em) });
      rastro.set(id, lista);
    }
  }
  return rastro;
}

// ---------------------------------------------------------------------------
// A repescagem (17/10/2026)
// ---------------------------------------------------------------------------

/** O Meta recusa evento com mais de 7 dias; uma hora de folga para a rodada. */
export const JANELA_DA_REPESCAGEM_MS = 7 * 24 * 3600 * 1000 - 3600 * 1000;
/** Envios por rodada: cada um pode levar até 5 s, e a rota agendada tem 60 s. */
export const REPESCAGEM_POR_RODADA = 5;
/**
 * Recusa do Meta por erro NO EVENTO (code 100, parâmetro inválido): tentar de
 * hora em hora só repetiria a recusa (e o alerta). Volta uma vez por dia.
 * Token, permissão e limite de chamadas também chegam como 4xx, mas passam:
 * esses voltam na hora seguinte, e esperar um dia tiraria o lead dos 7 dias.
 */
export const ESPERA_DEPOIS_DE_RECUSA_MS = 24 * 3600 * 1000;
const CODIGO_DE_EVENTO_INVALIDO = 100;

export interface RodadaDaRepescagem {
  /** Leads que qualificaram na janela e ainda não têm o LeadQualificado aceito. */
  pendentes: number;
  enviados: number;
  /** Tentados e não aceitos (recusa ou rede): ficam registrados e voltam numa próxima rodada. */
  naoAceitos: number;
}

type LinhaDaRepescagem = LeadParaOMeta & { situacao?: string | null; desfecho?: string | null; desfecho_em?: string | null };

/** Já foi tentado e o Meta disse, há menos de um dia, que o evento está errado: fica para depois. */
function emEspera(anterior: RegistroDaCapi | undefined, agora: number): boolean {
  if (anterior?.resultado !== "recusado") return false;
  const codigo = (anterior.resposta as { error?: { code?: unknown } } | undefined)?.error?.code;
  if (codigo !== CODIGO_DE_EVENTO_INVALIDO) return false;
  const em = Date.parse(anterior.em);
  return Number.isFinite(em) && agora - em < ESPERA_DEPOIS_DE_RECUSA_MS;
}

/**
 * Os registros da linha AGORA — relidos para não gravar por cima do que outro
 * envio gravou. Nulo quando a linha sumiu ou não deu para ler (aí registrado).
 */
async function registrosDaLinha(cliente: ClienteDeLeads, leadId: string): Promise<RegistrosDaCapi | null> {
  const { data, error } = await cliente.from("leads").select("capi_meta_response").eq("id", leadId).maybeSingle();
  if (error) {
    await registrarFalha("quebra", "meta-capi-repescagem", error.message, { extra: { lead_id: leadId } });
    return null;
  }
  if (!data) return null;
  return lerRegistros((data as { capi_meta_response?: unknown }).capi_meta_response);
}

/**
 * O envio do LeadQualificado: o lead qualificou (pelo rastro,
 * `quandoQualificou`) nos últimos 7 dias e o Meta ainda não aceitou o evento.
 * Nasceu (17/10/2026) para repescar o que ficou para trás; desde 18/10 é o
 * ÚNICO envio do LeadQualificado — o movimento no painel não manda mais.
 *
 *   - Só quem FICOU: a permanência em Visita/Negociação que ainda está
 *     correndo só conta depois de `PERMANENCIA_MINIMA_MS` (10 min). O cartão
 *     arrastado para a Visita um minuto antes da rodada espera a próxima — e,
 *     se sair dela antes, não vai.
 *   - `event_time` = quando qualificou; se a primeira vez já passou dos 7
 *     dias, a mais recente (a volta à Visita, o ganho) — o horário que o envio
 *     em tempo real teria usado.
 *   - O mesmo `event_id` (`<lead>:qualificado`) do envio em tempo real. O
 *     Meta só junta repetidos dentro de 48 h, então quem evita o envio em
 *     dobro é o registro da linha: relido logo antes de mandar e logo antes de
 *     gravar, para não pisar no que o painel gravou no meio (o Purchase).
 *   - Na fila, primeiro quem nunca foi tentado, depois quem está mais perto de
 *     sair dos 7 dias. Evento recusado por inválido espera um dia.
 *   - Só o LeadQualificado: o Purchase depende do valor, que chega pelo
 *     painel. Lead sem correspondência não é tentado nem registrado.
 *
 * Quem chama é a rodada agendada da sincronização do Meta (de hora em hora),
 * com a chave de serviço — que não filtra loja: `leads` e `leads_eventos`
 * ainda não têm `org_id` e o pixel é o único de `site_settings`. Na S1 (mais
 * de uma loja), a repescagem passa a ir por loja, com o pixel de cada uma,
 * como o retrato do copiloto (`copilotoMeta-servidor`).
 *
 * `prazo` (epoch ms): a rota tem 60 s; passado ele, a rodada para e o resto
 * fica para a próxima hora. Nunca lança.
 */
export async function repescarQualificacoes(
  cliente: ClienteDeLeads,
  fontes: FontesDaQualificacao = { lerPixelId: pixelIdDasSettings },
  agora: Date = new Date(),
  prazo: number = Number.POSITIVE_INFINITY,
): Promise<RodadaDaRepescagem> {
  const rodada: RodadaDaRepescagem = { pendentes: 0, enviados: 0, naoAceitos: 0 };
  const agoraMs = agora.getTime();
  const desde = new Date(agoraMs - JANELA_DA_REPESCAGEM_MS).toISOString();
  const naJanela = (iso: string | null) => iso !== null && Date.parse(iso) >= Date.parse(desde);
  try {
    // Quem pode ter qualificado na janela: entrou em Visita/Negociação, ou fechou ganho.
    const [entradas, ganhos] = await Promise.all([
      todasAsPaginas<{ lead_id: string }>((de, ate) =>
        cliente
          .from("leads_eventos")
          .select("lead_id")
          .eq("tipo", "etapa")
          .in("para", [...ETAPAS_QUALIFICADAS])
          .gte("criado_em", desde)
          .order("id", { ascending: true })
          .range(de, ate),
      ),
      todasAsPaginas<{ id: string }>((de, ate) =>
        cliente.from("leads").select("id").eq("desfecho", "ganho").gte("desfecho_em", desde).order("id", { ascending: true }).range(de, ate),
      ),
    ]);
    const ids = [...new Set([...entradas.map((e) => String(e.lead_id)), ...ganhos.map((g) => String(g.id))])];
    if (ids.length === 0) return rodada;

    const linhas: LinhaDaRepescagem[] = [];
    for (const lote of emLotes(ids)) {
      const { data, error } = await cliente.from("leads").select(`${COLUNAS_PARA_O_META}, situacao, desfecho, desfecho_em`).in("id", lote);
      if (error) throw new Error(error.message);
      for (const l of (data ?? []) as unknown as LinhaDaRepescagem[]) {
        if (lerRegistros(l.capi_meta_response).qualificado?.resultado !== "enviado") linhas.push(l);
      }
    }
    if (linhas.length === 0) return rodada;

    const rastro = await lerRastroDeEtapas(cliente, linhas.map((l) => l.id));

    const fila: Array<{ lead: LinhaDaRepescagem; quando: string; devido: Extract<EventoDevido, { evento: CapiEvent }>; anterior?: RegistroDaCapi }> = [];
    for (const lead of linhas) {
      const passagens = rastro.get(lead.id) ?? [];
      const q = quandoQualificou(passagens, { situacao: lead.situacao, desfecho: lead.desfecho, desfechoEm: lead.desfecho_em });
      if (!q.qualificou) continue;
      const quando = [q.desde, q.ultima].find(naJanela);
      if (!quando) continue;
      // Ainda não ficou 10 min: a próxima rodada decide.
      if (Date.parse(quando) > agoraMs - PERMANENCIA_MINIMA_MS) continue;
      // A etapa em que qualificou; no ganho, a etapa do ganho.
      const etapa = passagens.find((p) => p.em === quando)?.para ?? lead.situacao ?? null;
      const ganho = lead.desfecho === "ganho";
      const devido = eventosDevidos(lead, { etapa: etapa ? { chave: etapa } : null, desfecho: ganho ? "ganho" : null }).find(
        (d) => d.chave === "qualificado",
      );
      if (!devido?.evento) continue;
      rodada.pendentes++;
      const anterior = lerRegistros(lead.capi_meta_response).qualificado;
      if (emEspera(anterior, agoraMs)) continue;
      fila.push({ lead, quando, devido, anterior });
    }
    // Quem nunca foi tentado primeiro; depois, quem sai dos 7 dias antes.
    fila.sort((a, b) => Number(a.anterior !== undefined) - Number(b.anterior !== undefined) || Date.parse(a.quando) - Date.parse(b.quando));

    let pixelId: string | null | undefined;
    let tentados = 0;
    for (const { lead, quando, devido } of fila) {
      if (tentados >= REPESCAGEM_POR_RODADA || Date.now() >= prazo) break;
      if (pixelId === undefined) pixelId = await fontes.lerPixelId().catch(() => null);
      if (!pixelId) return rodada;

      // O painel pode ter mandado desde a primeira leitura: aí não está mais pendente.
      const antes = await registrosDaLinha(cliente, lead.id);
      if (!antes) continue;
      if (antes.qualificado?.resultado === "enviado") {
        rodada.pendentes--;
        continue;
      }
      tentados++;

      const evento = { ...devido.evento, pixelId, eventTime: Math.floor(Date.parse(quando) / 1000) };
      const entrega = await sendCapiEvent(evento);
      const registro: RegistroDaCapi = {
        ...registroDaEntrega(evento.eventName, evento.eventId, entrega, devido.extra, agoraMs),
        repescado: true,
      };
      if (registro.resultado === "enviado") rodada.enviados++;
      else rodada.naoAceitos++;

      // E pode ter gravado durante o envio (o Purchase de um ganho): junta ao de agora.
      const depois = (await registrosDaLinha(cliente, lead.id)) ?? antes;
      if (registro.resultado !== "enviado" && depois.qualificado?.resultado === "enviado") continue;
      await gravarRegistros(cliente, lead.id, depois, { qualificado: registro });
    }
    return rodada;
  } catch (erro) {
    console.error("[Meta CAPI] A repescagem da qualificação falhou", erro);
    await registrarFalha("quebra", "meta-capi-repescagem", erro);
    return rodada;
  }
}
