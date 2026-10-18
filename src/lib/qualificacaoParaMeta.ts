import type { CapiEvent, CapiUserData, EntregaDaCapi } from "./meta-capi";
import type { TipoDeDesfecho } from "./funil";
import { META_CONTENT_TYPE } from "./telemetry";

/**
 * A qualificação de volta para o Meta (16/10/2026) — as regras puras.
 *
 * Decisão do dono: *"as etapas de VISITA AGENDADA e NEGOCIANDO são a métrica
 * de lead qualificado; sim, envie o Purchase com o valor real"*.
 *
 * O que o Meta recebia do site era o topo do funil: `Lead`, na hora do
 * formulário. A campanha otimiza para isso, e "lead" inclui quem some depois
 * do primeiro contato. O que ensina o algoritmo a comprar o lead CERTO é o
 * que acontece depois, no painel: a visita agendada, a negociação, a venda.
 * É isso que este módulo devolve ao Meta, pela CAPI, em dois eventos:
 *
 *   - `LeadQualificado` (evento personalizado): quando o lead FICA numa
 *     etapa qualificada — `visita`, `negociacao` — ou fecha como ganho sem
 *     ter passado por elas. Um ganho é, por definição, um lead qualificado.
 *     Vai pela rodada de hora em hora (`repescarQualificacoes`, decisão do
 *     dono em 18/10/2026: *"envie de hora em hora"*), que só conta quem ficou
 *     10 minutos na etapa: o cartão arrastado pela coluna não vai ao Meta.
 *   - `Purchase`: quando o negócio fecha como ganho, com `value` = o valor
 *     gravado no desfecho e `currency` BRL. Sem valor, não há Purchase: um
 *     Purchase de R$ 0 ensinaria o algoritmo a otimizar para vendas de zero.
 *     Este vai na hora, do movimento (`qualificarNoMeta`): fechar é uma
 *     decisão, não um arrasto.
 *
 * UMA vez por lead, cada um. O `event_id` é determinístico
 * (`<id do lead>:qualificado`, `<id do lead>:purchase`) e o resultado fica
 * gravado na própria linha (`capi_meta_response`): o lead que vai de visita
 * para negociação, ou que é reaberto e fechado de novo, não conta duas vezes.
 * O que NÃO foi entregue fica registrado como tal e é tentado de novo: o
 * Purchase no próximo movimento que o justifique — é assim que o valor
 * preenchido depois de fechar vira Purchase —, o LeadQualificado na próxima
 * rodada, enquanto couber nos 7 dias que o Meta aceita.
 *
 * `action_source` é `system_generated`: o evento nasce no painel, de uma ação
 * da equipe, e não de uma página do site. Por isso não leva IP nem
 * User-Agent — seriam os do vendedor, não os do cliente. A correspondência
 * vem do que a linha do lead guarda: e-mail, telefone, `fbp`, `fbc` e a
 * referência (`ag_uid`, o mesmo `external_id` que o `Lead` já mandou).
 *
 * As chaves das etapas (`visita`, `negociacao`) são as PROTEGIDAS de
 * `funil_etapas`: o dono pode renomear o rótulo ("Visita agendada",
 * "Negociando") e mudar prazos, e a régua daqui não se move.
 *
 * Puro, pela regra de `lib/funil`: não conhece o banco nem a rede. Quem lê a
 * linha, envia e grava o resultado é `qualificacaoParaMeta-servidor`.
 */

// ---------------------------------------------------------------------------
// O vocabulário
// ---------------------------------------------------------------------------

/** As etapas que contam como lead qualificado. Chaves, e não rótulos. */
export const ETAPAS_QUALIFICADAS: readonly string[] = ["visita", "negociacao"];

export const EVENTO_DE_QUALIFICACAO = "LeadQualificado";
export const EVENTO_DE_COMPRA = "Purchase";
export const MOEDA_DO_PURCHASE = "BRL";

/**
 * As três entradas de `capi_meta_response`, uma por evento que a linha do
 * lead pode ter mandado. `lead` é o da captura (`/api/leads`); os outros dois
 * são os do painel.
 */
export type ChaveDoRegistro = "lead" | "qualificado" | "purchase";
export const CHAVES_DO_REGISTRO: readonly ChaveDoRegistro[] = ["lead", "qualificado", "purchase"];

/**
 * Como uma entrega terminou. `enviado` é o Graph aceitando; `recusado` é
 * resposta fora de 2xx; `sem_rede` é configuração ausente, rede ou tempo
 * limite (nem chegou ao Graph); `pulado` é decisão daqui, com o motivo.
 */
export type ResultadoDaCapi = "enviado" | "recusado" | "sem_rede" | "pulado";
export const RESULTADOS_DA_CAPI: readonly ResultadoDaCapi[] = ["enviado", "recusado", "sem_rede", "pulado"];

export interface RegistroDaCapi {
  /** O nome do evento como foi ao Meta: `Lead`, `LeadQualificado`, `Purchase`. */
  evento: string;
  resultado: ResultadoDaCapi;
  /** Quando, em ISO. É por ele que se escolhe o mais recente. */
  em: string;
  event_id?: string;
  /** O status HTTP do Graph; ausente quando nem chegou à rede. */
  http?: number;
  /** Por que foi pulado. */
  motivo?: string;
  /** A etapa que qualificou. */
  etapa?: string;
  /** O valor que foi no Purchase. */
  valor?: number;
  /** O que o Graph respondeu, resumido (`events_received`, `fbtrace_id`, o erro). */
  resposta?: unknown;
  /** Mandado pela rodada de hora em hora (`repescarQualificacoes`), e não no movimento do painel. */
  repescado?: boolean;
}

export type RegistrosDaCapi = Partial<Record<ChaveDoRegistro, RegistroDaCapi>>;

export const SEM_CORRESPONDENCIA =
  "lead sem e-mail, telefone, fbp, fbc nem referência — o Meta não teria como reconhecê-lo";
export const SEM_VALOR = "negócio ganho sem valor de venda";
/** O `Lead` da captura que não tem par no navegador para desduplicar. */
export const SEM_EVENT_ID = "formulário sem event_id do navegador — sem par para desduplicar, o Lead não vai pelo servidor";

/** O aviso que a tela mostra quando o ganho ficou sem Purchase. */
export const AVISO_DE_GANHO_SEM_VALOR =
  "Negócio ganho sem valor: a venda não foi ao Meta como Purchase. Informe o valor da venda para ela contar na campanha.";

// ---------------------------------------------------------------------------
// O registro na linha do lead
// ---------------------------------------------------------------------------

/**
 * O `capi_meta_response` como está no banco, validado. Coluna `jsonb` sem
 * CHECK: o que não tem a forma esperada é ignorado, entrada por entrada, em
 * vez de derrubar a leitura inteira. Era o lugar onde a CAPI antiga guardaria
 * a resposta crua do Graph; nunca foi escrita.
 */
export function lerRegistros(bruto: unknown): RegistrosDaCapi {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  const saida: RegistrosDaCapi = {};
  for (const chave of CHAVES_DO_REGISTRO) {
    const r = (bruto as Record<string, unknown>)[chave];
    if (!r || typeof r !== "object" || Array.isArray(r)) continue;
    const { evento, resultado, em } = r as Record<string, unknown>;
    if (typeof evento !== "string" || typeof em !== "string") continue;
    if (typeof resultado !== "string" || !(RESULTADOS_DA_CAPI as readonly string[]).includes(resultado)) continue;
    saida[chave] = r as RegistroDaCapi;
  }
  return saida;
}

/** Até onde o texto de uma resposta ou de um erro vai para a linha. */
const TETO_DO_TEXTO = 300;

/**
 * O que da resposta do Graph vale guardar. Só o que identifica a entrega
 * (`events_received`, `fbtrace_id`) e o erro, quando há: a resposta inteira
 * não traz mais nada, e guardar corpo arbitrário numa coluna é o caminho para
 * ela crescer sem limite.
 */
export function resumirResposta(corpo: unknown): unknown {
  if (corpo === null || corpo === undefined) return undefined;
  if (typeof corpo === "string") return corpo.slice(0, TETO_DO_TEXTO);
  if (typeof corpo !== "object") return corpo;
  const o = corpo as Record<string, unknown>;
  const resumo: Record<string, unknown> = {};
  if (o.events_received !== undefined) resumo.events_received = o.events_received;
  if (typeof o.fbtrace_id === "string") resumo.fbtrace_id = o.fbtrace_id;
  if (o.error && typeof o.error === "object") {
    const e = o.error as Record<string, unknown>;
    resumo.error = {
      ...(typeof e.message === "string" ? { message: e.message.slice(0, TETO_DO_TEXTO) } : {}),
      ...(e.code !== undefined ? { code: e.code } : {}),
      ...(e.error_subcode !== undefined ? { error_subcode: e.error_subcode } : {}),
      ...(typeof e.fbtrace_id === "string" ? { fbtrace_id: e.fbtrace_id } : {}),
    };
  }
  return Object.keys(resumo).length > 0 ? resumo : undefined;
}

/** O registro de uma entrega que foi tentada, qualquer que tenha sido o fim. */
export function registroDaEntrega(
  evento: string,
  eventId: string,
  entrega: EntregaDaCapi,
  extra: Pick<RegistroDaCapi, "etapa" | "valor"> = {},
  agora: number = Date.now(),
): RegistroDaCapi {
  const resultado: ResultadoDaCapi = entrega.ok ? "enviado" : entrega.status > 0 ? "recusado" : "sem_rede";
  const resposta = resumirResposta(entrega.corpo);
  return {
    evento,
    event_id: eventId,
    resultado,
    em: new Date(agora).toISOString(),
    ...(entrega.status > 0 ? { http: entrega.status } : {}),
    ...(resposta !== undefined ? { resposta } : {}),
    ...extra,
  };
}

/** O registro de um evento que NÃO foi, e por quê. */
export function registroPulado(
  evento: string,
  eventId: string | null,
  motivo: string,
  agora: number = Date.now(),
): RegistroDaCapi {
  return {
    evento,
    ...(eventId ? { event_id: eventId } : {}),
    resultado: "pulado",
    motivo,
    em: new Date(agora).toISOString(),
  };
}

/**
 * O registro mais recente, pelo `em`. No empate (dois gravados na mesma
 * passada, no mesmo milissegundo) vence o que vem DEPOIS no funil — a ordem
 * de `CHAVES_DO_REGISTRO` é a do funil, e `>=` deixa o último ganhar.
 */
function maisRecente(registros: RegistrosDaCapi): RegistroDaCapi | null {
  let ultimo: RegistroDaCapi | null = null;
  for (const chave of CHAVES_DO_REGISTRO) {
    const r = registros[chave];
    if (r && (!ultimo || r.em >= ultimo.em)) ultimo = r;
  }
  return ultimo;
}

/**
 * O `capi_meta_status` da linha: `<evento>:<resultado>` do registro mais
 * recente — `Purchase:enviado`, `LeadQualificado:recusado`. Um texto só, para
 * um `where` ou um olhar na tabela dizerem como o lead está com o Meta sem
 * abrir o JSON. O detalhe mora em `capi_meta_response`.
 */
export function statusDaCapi(registros: RegistrosDaCapi): string | null {
  const ultimo = maisRecente(registros);
  return ultimo ? `${ultimo.evento}:${ultimo.resultado}` : null;
}

/** O `capi_meta_sent_at`: a entrega mais recente que o Meta ACEITOU. */
export function ultimoEnvio(registros: RegistrosDaCapi): string | null {
  let ultimo: string | null = null;
  for (const chave of CHAVES_DO_REGISTRO) {
    const r = registros[chave];
    if (r?.resultado === "enviado" && (!ultimo || r.em > ultimo)) ultimo = r.em;
  }
  return ultimo;
}

/** Os três campos da linha, a partir dos registros já juntados. */
export function colunasDaCapi(registros: RegistrosDaCapi): {
  capi_meta_status: string | null;
  capi_meta_response: RegistrosDaCapi;
  capi_meta_sent_at: string | null;
} {
  return {
    capi_meta_status: statusDaCapi(registros),
    capi_meta_response: registros,
    capi_meta_sent_at: ultimoEnvio(registros),
  };
}

// ---------------------------------------------------------------------------
// O lead, como o Meta precisa dele
// ---------------------------------------------------------------------------

/** As colunas que o servidor lê da linha para montar os eventos. */
export const COLUNAS_PARA_O_META =
  "id, email, telefone, telefone_normalizado, fbp, fbc, ag_uid, veiculo_id, desfecho_valor, capi_meta_response";

export interface LeadParaOMeta {
  id: string;
  email?: string | null;
  telefone?: string | null;
  telefone_normalizado?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  ag_uid?: string | null;
  veiculo_id?: number | string | null;
  desfecho_valor?: number | string | null;
  capi_meta_response?: unknown;
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * O `user_data` do lead, ou nulo quando não há NADA por onde o Meta o
 * reconheça. O hash do e-mail e do telefone acontece em `sendCapiEvent`; aqui
 * vai em claro, como no `Lead` da captura. O telefone é o normalizado quando
 * existe (a coluna nasceu vazia e segue vazia em produção, 16/10/2026), senão
 * o que foi gravado — `hashPhone` fica só com os dígitos e põe o DDI.
 */
export function correspondenciaDoLead(lead: LeadParaOMeta): CapiUserData | null {
  const userData: CapiUserData = {
    email: texto(lead.email),
    phone: texto(lead.telefone_normalizado) ?? texto(lead.telefone),
    fbp: texto(lead.fbp),
    fbc: texto(lead.fbc),
    externalId: texto(lead.ag_uid),
  };
  return Object.values(userData).some(Boolean) ? userData : null;
}

/**
 * O valor do desfecho como o BANCO o devolve: `numeric` chega como número no
 * JSON, e um texto aqui tem o ponto DECIMAL (`55000.5`). Não é
 * `valorDoDesfecho` (`lib/funil`), que lê o que se DIGITA em português e
 * trata o ponto como milhar — passar `55000.5` por ela daria 550005.
 */
export function valorGravado(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// O que é devido depois de um movimento
// ---------------------------------------------------------------------------

/** O movimento que acabou de ser GRAVADO: onde o lead ficou, e o que fechou. */
export interface MovimentoDoLead {
  /** A etapa em que o lead ficou: a chave gravada em `situacao` e o tipo dela. */
  etapa: { chave: string; tipo?: string | null } | null;
  /** O desfecho que ESTE pedido gravou (ganho, perdido, descartado), ou nulo. */
  desfecho: TipoDeDesfecho | null;
}

/**
 * Se o lead, nesta etapa, conta como qualificado. Pela chave da etapa, pelo
 * tipo `ganho` dela, ou pelo desfecho ganho que acabou de ser gravado: os três
 * dizem a mesma coisa por caminhos que podem chegar separados (funil sem a
 * tabela, etapa de ganho com outra chave).
 */
export function ehEtapaQualificada(
  etapa: MovimentoDoLead["etapa"],
  desfecho: TipoDeDesfecho | null,
): boolean {
  if (desfecho === "ganho") return true;
  if (!etapa) return false;
  return ETAPAS_QUALIFICADAS.includes(etapa.chave) || etapa.tipo === "ganho";
}

// ---------------------------------------------------------------------------
// Se o lead CHEGOU a qualificar, pelo rastro (17/10/2026)
// ---------------------------------------------------------------------------

/** Uma mudança de etapa do rastro do lead (`leads_eventos`, tipo `etapa`). */
export interface PassagemDeEtapa {
  /** A chave da etapa para onde o lead foi. */
  para: string;
  /** Quando, em ISO. */
  em: string;
}

/**
 * Abaixo disto numa etapa qualificada não é qualificação: é o cartão sendo
 * arrastado coluna a coluna. O rastro de produção mostra Recontato → Visita
 * → Negociação em três segundos, e um lead que atravessou até Negociação em
 * cinco segundos e foi marcado "Não é oportunidade". Anti-ruído da tela, não
 * régua de negócio.
 */
export const PERMANENCIA_MINIMA_MS = 10 * 60 * 1000;

const emMs = (iso: string) => Date.parse(iso);

/** Se o lead chegou a qualificar, e os dois momentos que servem de `event_time`. */
export interface Qualificacao {
  qualificou: boolean;
  /** A primeira vez que qualificou. */
  desde: string | null;
  /**
   * A vez mais recente: a última permanência em Visita/Negociação, ou o ganho.
   * É o horário que o envio em tempo real teria usado no último movimento
   * qualificador — e o que a repescagem usa quando `desde` já saiu dos 7 dias.
   */
  ultima: string | null;
}

/**
 * Se o lead chegou a qualificar, e quando — pelo rastro, e não só pela etapa
 * de agora: quem visitou e depois foi perdido qualificou.
 *
 *   - Ganho qualificou sempre; `desde` é a primeira entrada em etapa
 *     qualificada, ou a entrada na etapa do ganho; `ultima` é o ganho
 *     (`desfechoEm`, ou a última passagem).
 *   - "Não é oportunidade" (descartado) nunca: a equipe disse que não havia
 *     negócio, e isso vale mais que a passagem pelo funil.
 *   - Senão, as permanências contínuas em Visita/Negociação que duraram
 *     `PERMANENCIA_MINIMA_MS`, ou que duram até agora: `desde` é o começo da
 *     primeira, `ultima` o da mais recente.
 *   - Sem rastro (lead de antes dele), vale a etapa de agora, sem horário.
 *
 * `desde` (ou `ultima`, quando `desde` passou dos 7 dias) é o `event_time` do
 * LeadQualificado que a repescagem manda.
 */
export function quandoQualificou(
  passagens: readonly PassagemDeEtapa[],
  atual: { situacao: string | null | undefined; desfecho: string | null | undefined; desfechoEm?: string | null },
): Qualificacao {
  const nao: Qualificacao = { qualificou: false, desde: null, ultima: null };
  if (atual.desfecho === "descartado") return nao;
  const ordenadas = passagens.filter((p) => Number.isFinite(emMs(p.em))).sort((a, b) => emMs(a.em) - emMs(b.em));
  const qualificada = (chave: string) => ETAPAS_QUALIFICADAS.includes(chave);

  if (atual.desfecho === "ganho") {
    const desde = (ordenadas.find((p) => qualificada(p.para)) ?? ordenadas.at(-1))?.em ?? atual.desfechoEm ?? null;
    const ganhoEm = atual.desfechoEm && Number.isFinite(emMs(atual.desfechoEm)) ? atual.desfechoEm : null;
    return { qualificou: true, desde, ultima: ganhoEm ?? ordenadas.at(-1)?.em ?? desde };
  }

  // O começo de cada permanência que conta.
  const comecos: string[] = [];
  let inicio: string | null = null;
  for (const p of ordenadas) {
    if (qualificada(p.para)) {
      inicio ??= p.em;
      continue;
    }
    if (inicio !== null && emMs(p.em) - emMs(inicio) >= PERMANENCIA_MINIMA_MS) comecos.push(inicio);
    inicio = null;
  }
  // Ainda numa etapa qualificada: conta, dure o que durar.
  if (inicio !== null) comecos.push(inicio);
  if (comecos.length > 0) return { qualificou: true, desde: comecos[0], ultima: comecos[comecos.length - 1] };
  if (ordenadas.length === 0 && typeof atual.situacao === "string" && qualificada(atual.situacao)) {
    return { qualificou: true, desde: null, ultima: null };
  }
  return nao;
}

export type EventoDevido =
  | {
      chave: Exclude<ChaveDoRegistro, "lead">;
      evento: CapiEvent;
      /** O que vai junto no registro quando a entrega for tentada. */
      extra: Pick<RegistroDaCapi, "etapa" | "valor">;
    }
  | { chave: Exclude<ChaveDoRegistro, "lead">; evento: null; motivo: string };

export const idDoEventoDeQualificacao = (leadId: string) => `${leadId}:qualificado`;
export const idDoEventoDeCompra = (leadId: string) => `${leadId}:purchase`;

/**
 * Os eventos que este movimento deve ao Meta, na ordem de envio.
 *
 * Nenhum quando a etapa não qualifica. `LeadQualificado` quando qualifica e
 * ainda não foi entregue; `Purchase` quando o desfecho é ganho e ainda não
 * foi entregue — com valor, senão pulado com o motivo (e tentado de novo
 * quando o valor chegar). "Já entregue" é `resultado: "enviado"` no registro
 * da linha: recusa e rede voltam a tentar, e o `event_id` fixo faz o Meta
 * descartar o que por acaso chegar duas vezes.
 */
export function eventosDevidos(lead: LeadParaOMeta, movimento: MovimentoDoLead): EventoDevido[] {
  const qualificou = ehEtapaQualificada(movimento.etapa, movimento.desfecho);
  const ganhou = movimento.desfecho === "ganho";
  if (!qualificou && !ganhou) return [];

  const registros = lerRegistros(lead.capi_meta_response);
  const userData = correspondenciaDoLead(lead);
  // O carro do lead, com o MESMO `content_type` do feed e do `Lead` (regra 2
  // da spec: id inventado é correspondência zero no catálogo).
  const carro = lead.veiculo_id === null || lead.veiculo_id === undefined ? null : texto(String(lead.veiculo_id));
  const conteudo = carro ? { content_ids: [carro], content_type: META_CONTENT_TYPE } : {};
  const devidos: EventoDevido[] = [];

  if (qualificou && registros.qualificado?.resultado !== "enviado") {
    const etapa = movimento.etapa?.chave ?? "fechado";
    if (!userData) {
      devidos.push({ chave: "qualificado", evento: null, motivo: SEM_CORRESPONDENCIA });
    } else {
      devidos.push({
        chave: "qualificado",
        evento: {
          eventName: "LeadQualificado",
          eventId: idDoEventoDeQualificacao(lead.id),
          actionSource: "system_generated",
          userData,
          customData: { ...conteudo, etapa },
        },
        extra: { etapa },
      });
    }
  }

  if (ganhou && registros.purchase?.resultado !== "enviado") {
    const valor = valorGravado(lead.desfecho_valor);
    if (!valor) {
      devidos.push({ chave: "purchase", evento: null, motivo: SEM_VALOR });
    } else if (!userData) {
      devidos.push({ chave: "purchase", evento: null, motivo: SEM_CORRESPONDENCIA });
    } else {
      devidos.push({
        chave: "purchase",
        evento: {
          eventName: "Purchase",
          eventId: idDoEventoDeCompra(lead.id),
          actionSource: "system_generated",
          userData,
          customData: { ...conteudo, value: valor, currency: MOEDA_DO_PURCHASE },
        },
        extra: { valor },
      });
    }
  }

  return devidos;
}
