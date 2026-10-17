import type { ClienteDaSessao } from "./gestaoDoLead-servidor";
import { sendCapiEvent } from "./meta-capi";
import { registrarFalha } from "./observabilidade";
import { getCachedSettings } from "./settings";
import {
  AVISO_DE_GANHO_SEM_VALOR,
  COLUNAS_PARA_O_META,
  EVENTO_DE_COMPRA,
  ETAPAS_QUALIFICADAS,
  EVENTO_DE_QUALIFICACAO,
  SEM_VALOR,
  colunasDaCapi,
  ehEtapaQualificada,
  eventosDevidos,
  lerRegistros,
  quandoQualificou,
  registroDaEntrega,
  registroPulado,
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
 * tentado de novo no próximo movimento que o justifique.
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
 * Depois de um movimento GRAVADO: manda ao Meta o que a etapa (e o desfecho)
 * devem, e grava o resultado na linha.
 *
 * Chamar só depois do `update`, e só quando ele alcançou o lead: evento de
 * etapa que não houve é o pior dado possível para uma campanha.
 */
export async function qualificarNoMeta(
  supabase: ClienteDeLeads,
  leadId: string,
  movimento: MovimentoDoLead,
  fontes: FontesDaQualificacao,
): Promise<ResultadoDaQualificacao> {
  // Etapa que não qualifica não custa nem a leitura da linha: mover entre
  // colunas em andamento continua gravando direto, sem ler lead nenhum (é o
  // que `leads-gerenciar-desfecho` trava para o PATCH).
  if (!ehEtapaQualificada(movimento.etapa, movimento.desfecho)) return NADA;
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
    const devidos = eventosDevidos(lead, movimento);
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
        const nome = devido.chave === "purchase" ? EVENTO_DE_COMPRA : EVENTO_DE_QUALIFICACAO;
        novos[devido.chave] = registroPulado(nome, null, devido.motivo);
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
// A repescagem (17/10/2026)
// ---------------------------------------------------------------------------

/** O Meta recusa evento com mais de 7 dias; uma hora de folga para a rodada. */
export const JANELA_DA_REPESCAGEM_MS = 7 * 24 * 3600 * 1000 - 3600 * 1000;
/** Envios por rodada: cada um pode levar até 5 s, e a rota agendada tem 60 s. */
export const REPESCAGEM_POR_RODADA = 5;
/** Ids por consulta: o filtro `in` vai na URL. */
const IDS_POR_CONSULTA = 100;

export interface RodadaDaRepescagem {
  /** Leads que qualificaram na janela e ainda não têm o LeadQualificado aceito. */
  pendentes: number;
  enviados: number;
  /** Tentados e não aceitos (recusa ou rede): ficam registrados e voltam na próxima rodada. */
  naoAceitos: number;
}

type LinhaDaRepescagem = LeadParaOMeta & { situacao?: string | null; desfecho?: string | null };

const emLotes = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / IDS_POR_CONSULTA) }, (_, i) => xs.slice(i * IDS_POR_CONSULTA, (i + 1) * IDS_POR_CONSULTA));

/**
 * O LeadQualificado que ficou para trás: o lead qualificou (pelo rastro,
 * `quandoQualificou`) nos últimos 7 dias e o Meta ainda não aceitou o evento
 * — porque qualificou antes de 16/10, quando o envio não existia, ou porque a
 * entrega falhou e o lead não se mexeu de novo. Vai com `event_time` = quando
 * qualificou e o mesmo `event_id` (`<lead>:qualificado`): se por acaso já
 * tinha chegado, o Meta descarta o repetido.
 *
 * Quem chama é a rodada agendada da sincronização do Meta (de hora em hora),
 * com a chave de serviço. Só o LeadQualificado: o Purchase depende do valor,
 * que chega pelo painel. Lead sem correspondência não é tentado nem
 * registrado (nada mudaria a cada hora). Nunca lança.
 */
export async function repescarQualificacoes(
  cliente: ClienteDeLeads,
  fontes: FontesDaQualificacao = { lerPixelId: pixelIdDasSettings },
  agora: Date = new Date(),
): Promise<RodadaDaRepescagem> {
  const rodada: RodadaDaRepescagem = { pendentes: 0, enviados: 0, naoAceitos: 0 };
  const desde = new Date(agora.getTime() - JANELA_DA_REPESCAGEM_MS).toISOString();
  try {
    // Quem pode ter qualificado na janela: entrou em Visita/Negociação, ou fechou ganho.
    const [entradas, ganhos] = await Promise.all([
      cliente.from("leads_eventos").select("lead_id").eq("tipo", "etapa").in("para", [...ETAPAS_QUALIFICADAS]).gte("criado_em", desde).limit(2000),
      cliente.from("leads").select("id").eq("desfecho", "ganho").gte("desfecho_em", desde).limit(500),
    ]);
    if (entradas.error) throw new Error(entradas.error.message);
    if (ganhos.error) throw new Error(ganhos.error.message);
    const ids = [
      ...new Set([
        ...((entradas.data ?? []) as Array<{ lead_id: string }>).map((e) => e.lead_id),
        ...((ganhos.data ?? []) as Array<{ id: string }>).map((g) => g.id),
      ]),
    ];
    if (ids.length === 0) return rodada;

    const pendentes: LinhaDaRepescagem[] = [];
    for (const lote of emLotes(ids)) {
      const { data, error } = await cliente.from("leads").select(`${COLUNAS_PARA_O_META}, situacao, desfecho`).in("id", lote);
      if (error) throw new Error(error.message);
      for (const l of (data ?? []) as unknown as LinhaDaRepescagem[]) {
        if (lerRegistros(l.capi_meta_response).qualificado?.resultado !== "enviado") pendentes.push(l);
      }
    }
    if (pendentes.length === 0) return rodada;

    const passagens = new Map<string, PassagemDeEtapa[]>();
    for (const lote of emLotes(pendentes.map((l) => l.id))) {
      const { data, error } = await cliente
        .from("leads_eventos")
        .select("lead_id, para, criado_em")
        .eq("tipo", "etapa")
        .in("lead_id", lote)
        .order("criado_em", { ascending: true })
        .limit(5000);
      if (error) throw new Error(error.message);
      for (const e of (data ?? []) as Array<{ lead_id: string; para: string | null; criado_em: string }>) {
        if (!e.para) continue;
        const lista = passagens.get(e.lead_id) ?? [];
        lista.push({ para: e.para, em: e.criado_em });
        passagens.set(e.lead_id, lista);
      }
    }

    let pixelId: string | null | undefined;
    for (const lead of pendentes) {
      const rastro = passagens.get(lead.id) ?? [];
      const q = quandoQualificou(rastro, { situacao: lead.situacao, desfecho: lead.desfecho });
      if (!q.qualificou || !q.desde || Date.parse(q.desde) < Date.parse(desde)) continue;
      // A etapa em que qualificou; no ganho direto, a etapa do ganho.
      const etapa = rastro.find((p) => p.em === q.desde)?.para ?? lead.situacao ?? null;
      const ganho = lead.desfecho === "ganho";
      const devido = eventosDevidos(lead, { etapa: etapa ? { chave: etapa } : null, desfecho: ganho ? "ganho" : null }).find(
        (d) => d.chave === "qualificado",
      );
      if (!devido?.evento) continue;
      rodada.pendentes++;
      if (rodada.enviados + rodada.naoAceitos >= REPESCAGEM_POR_RODADA) continue;

      if (pixelId === undefined) pixelId = await fontes.lerPixelId().catch(() => null);
      if (!pixelId) return rodada;

      const evento = { ...devido.evento, pixelId, eventTime: Math.floor(Date.parse(q.desde) / 1000) };
      const entrega = await sendCapiEvent(evento);
      const registro: RegistroDaCapi = { ...registroDaEntrega(evento.eventName, evento.eventId, entrega, devido.extra), repescado: true };
      if (registro.resultado === "enviado") rodada.enviados++;
      else rodada.naoAceitos++;
      await gravarRegistros(cliente, lead.id, lerRegistros(lead.capi_meta_response), { qualificado: registro });
    }
    return rodada;
  } catch (erro) {
    console.error("[Meta CAPI] A repescagem da qualificação falhou", erro);
    await registrarFalha("quebra", "meta-capi-repescagem", erro);
    return rodada;
  }
}
