/**
 * Sincronização de mídia paga — a parte pura (spec 2026-09-24,
 * `docs/superpowers/specs/2026-09-24-midia-paga-sincronizada-design.md`).
 *
 * Meta (Graph `/insights`, puxado pelo site) e Google (script dentro da conta
 * do Google Ads, empurrado para o site) chegam em formatos diferentes e saem
 * daqui num formato só, o `LoteNormalizado`. Quem grava é a função
 * `public.midia_gravar_lote` do banco, numa transação: a janela do lote é
 * APAGADA e regravada por campanha, o que torna repetir a rodada inofensivo e
 * absorve a correção que as plataformas fazem nos últimos dias.
 */

export type Plataforma = "meta" | "google";
export type Situacao = "no_ar" | "pausada" | "planejada" | "encerrada";

export interface Janela {
  /** YYYY-MM-DD, inclusivo, calendário de Curitiba. */
  de: string;
  ate: string;
}

export interface DiaNormalizado {
  /** `null` = linha da campanha inteira (Google grava assim). */
  anuncioIdExterno: string | null;
  dia: string;
  investido: number;
  impressoes: number;
  cliques: number;
  /** Leads que a PLATAFORMA reporta. Google manda fracionário. */
  conversoes: number;
}

export interface CampanhaNormalizada {
  idExterno: string;
  nome: string;
  objetivo: string | null;
  situacao: Situacao;
  orcamentoDiario: number | null;
  noArDesde: string | null;
  /** Alcance da vida inteira — não soma entre dias nem anúncios. Só Meta. */
  alcanceTotal: number | null;
  anuncios: Array<{ idExterno: string; nome: string }>;
  dias: DiaNormalizado[];
}

export interface LoteNormalizado {
  plataforma: Plataforma;
  janela: Janela;
  campanhas: CampanhaNormalizada[];
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

// ────────────────────────────────────────────────────────────────────────────
// Meta
// ────────────────────────────────────────────────────────────────────────────

export interface MetaAcao {
  action_type: string;
  value: string;
}

/**
 * Leads que o Meta atribui à campanha. `lead` é o AGREGADO (pixel + formulário
 * do Meta); quando ele vem, as partes vêm junto e somá-las contaria duas vezes.
 * Conversa iniciada no WhatsApp entra por cima: para a loja, é lead igual.
 */
export function contarLeadsMeta(acoes: MetaAcao[] | undefined): number {
  if (!acoes) return 0;
  const valor = (tipo: string) =>
    num(acoes.find((a) => a.action_type === tipo)?.value);
  const temAgregado = acoes.some((a) => a.action_type === "lead");
  const leads = temAgregado
    ? valor("lead")
    : valor("offsite_conversion.fb_pixel_lead") + valor("onsite_conversion.lead_grouped");
  return leads + valor("onsite_conversion.messaging_conversation_started_7d");
}

export function situacaoMeta(status: string | undefined): Situacao {
  switch (status) {
    case "ACTIVE":
    case "IN_PROCESS":
    case "WITH_ISSUES":
    case "PENDING_REVIEW":
      return "no_ar";
    case "DELETED":
    case "ARCHIVED":
    case "COMPLETED":
      return "encerrada";
    default:
      // PAUSED, CAMPAIGN_PAUSED, ADSET_PAUSED, DISAPPROVED, PENDING_BILLING_INFO…
      // Tudo que não está entregando e não acabou.
      return "pausada";
  }
}

export interface MetaCampanha {
  id: string;
  name: string;
  objective?: string;
  effective_status?: string;
  /** Em centavos, como string. Ausente quando o orçamento é do conjunto. */
  daily_budget?: string;
  start_time?: string;
}

export interface MetaInsightAnuncio {
  campaign_id: string;
  campaign_name: string;
  ad_id: string;
  ad_name: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  /** Cliques no link — o clique que leva ao site, que é o que a loja paga. */
  inline_link_clicks?: string;
  actions?: MetaAcao[];
}

export interface MetaAlcance {
  campaign_id: string;
  reach?: string;
}

/** O Meta escreve o fuso como `-0300`; `Date` só aceita `-03:00` em todo motor. */
function isoDoMeta(t: string | undefined): string | null {
  if (!t) return null;
  const d = new Date(t.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function normalizarMeta(entrada: {
  janela: Janela;
  campanhas: MetaCampanha[];
  insights: MetaInsightAnuncio[];
  alcances: MetaAlcance[];
}): LoteNormalizado {
  const porId = new Map<string, CampanhaNormalizada>();
  const alcance = new Map(entrada.alcances.map((a) => [a.campaign_id, num(a.reach)]));

  for (const c of entrada.campanhas) {
    porId.set(c.id, {
      idExterno: c.id,
      nome: c.name,
      objetivo: c.objective ?? null,
      situacao: situacaoMeta(c.effective_status),
      orcamentoDiario: c.daily_budget ? num(c.daily_budget) / 100 : null,
      noArDesde: isoDoMeta(c.start_time),
      alcanceTotal: alcance.get(c.id) ?? null,
      anuncios: [],
      dias: [],
    });
  }

  for (const i of entrada.insights) {
    let c = porId.get(i.campaign_id);
    if (!c) {
      // Gastou na janela mas não está na lista (arquivada/apagada): o
      // dinheiro saiu, então a campanha aparece.
      c = {
        idExterno: i.campaign_id,
        nome: i.campaign_name,
        objetivo: null,
        situacao: "encerrada",
        orcamentoDiario: null,
        noArDesde: null,
        alcanceTotal: alcance.get(i.campaign_id) ?? null,
        anuncios: [],
        dias: [],
      };
      porId.set(i.campaign_id, c);
    }
    if (!c.anuncios.some((a) => a.idExterno === i.ad_id)) {
      c.anuncios.push({ idExterno: i.ad_id, nome: i.ad_name });
    }
    c.dias.push({
      anuncioIdExterno: i.ad_id,
      dia: i.date_start,
      investido: num(i.spend),
      impressoes: Math.round(num(i.impressions)),
      cliques: Math.round(num(i.inline_link_clicks)),
      conversoes: contarLeadsMeta(i.actions),
    });
  }

  return { plataforma: "meta", janela: entrada.janela, campanhas: [...porId.values()] };
}

// ────────────────────────────────────────────────────────────────────────────
// Google (payload do `scripts/google-ads-script.js`)
// ────────────────────────────────────────────────────────────────────────────

export function situacaoGoogle(status: string | undefined): Situacao {
  if (status === "ENABLED") return "no_ar";
  if (status === "REMOVED") return "encerrada";
  return "pausada";
}

const FORMA_DO_DIA = /^\d{4}-\d{2}-\d{2}$/;
const ehDia = (v: unknown): v is string =>
  typeof v === "string" && FORMA_DO_DIA.test(v) && !Number.isNaN(Date.parse(v));
const ehNaoNegativo = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

/** Teto de sanidade: a conta tem dezenas de campanhas, não milhares. */
const MAX_CAMPANHAS = 500;

export type ResultadoValidacao =
  | { ok: true; lote: LoteNormalizado }
  | { ok: false; erro: string };

/**
 * Valida o JSON que o script do Google manda. Qualquer defeito recusa o lote
 * INTEIRO: como a gravação apaga e regrava a janela, meio lote aceito seria
 * dado apagado.
 */
export function validarPayloadGoogle(corpo: unknown): ResultadoValidacao {
  const falha = (erro: string): ResultadoValidacao => ({ ok: false, erro });
  if (!corpo || typeof corpo !== "object") return falha("corpo não é um objeto JSON");
  const c = corpo as Record<string, unknown>;

  if (!ehDia(c.de) || !ehDia(c.ate)) return falha("`de` e `ate` precisam ser YYYY-MM-DD");
  if (c.de > c.ate) return falha("`de` é depois de `ate`");
  if (!Array.isArray(c.campanhas)) return falha("`campanhas` precisa ser uma lista");
  if (c.campanhas.length > MAX_CAMPANHAS) return falha(`mais de ${MAX_CAMPANHAS} campanhas`);

  const janela: Janela = { de: c.de, ate: c.ate };
  const campanhas: CampanhaNormalizada[] = [];

  for (const [i, bruto] of c.campanhas.entries()) {
    const k = bruto as Record<string, unknown>;
    const onde = `campanhas[${i}]`;
    if (typeof k.id !== "string" || !/^\d+$/.test(k.id)) return falha(`${onde}.id precisa ser o ID numérico`);
    if (typeof k.nome !== "string" || !k.nome.trim()) return falha(`${onde}.nome vazio`);
    if (k.orcamentoDiario != null && !ehNaoNegativo(k.orcamentoDiario)) {
      return falha(`${onde}.orcamentoDiario inválido`);
    }
    if (!Array.isArray(k.dias)) return falha(`${onde}.dias precisa ser uma lista`);

    const dias: DiaNormalizado[] = [];
    for (const [j, d] of (k.dias as Record<string, unknown>[]).entries()) {
      const ondeDia = `${onde}.dias[${j}]`;
      if (!ehDia(d.dia)) return falha(`${ondeDia}.dia precisa ser YYYY-MM-DD`);
      if (d.dia < janela.de || d.dia > janela.ate) return falha(`${ondeDia}.dia fora da janela`);
      for (const campo of ["investido", "impressoes", "cliques", "conversoes"] as const) {
        if (!ehNaoNegativo(d[campo])) return falha(`${ondeDia}.${campo} precisa ser número ≥ 0`);
      }
      dias.push({
        anuncioIdExterno: null,
        dia: d.dia,
        investido: d.investido as number,
        impressoes: Math.round(d.impressoes as number),
        cliques: Math.round(d.cliques as number),
        conversoes: d.conversoes as number,
      });
    }

    campanhas.push({
      idExterno: k.id,
      nome: k.nome.trim(),
      objetivo: typeof k.tipo === "string" ? k.tipo : null,
      situacao: situacaoGoogle(typeof k.status === "string" ? k.status : undefined),
      orcamentoDiario: (k.orcamentoDiario as number | null | undefined) ?? null,
      noArDesde: null,
      alcanceTotal: null,
      anuncios: [],
      dias,
    });
  }

  return { ok: true, lote: { plataforma: "google", janela, campanhas } };
}

// ────────────────────────────────────────────────────────────────────────────
// Comum
// ────────────────────────────────────────────────────────────────────────────

/** O JSON que `public.midia_gravar_lote(jsonb)` lê. */
export function loteParaBanco(lote: LoteNormalizado) {
  return {
    plataforma: lote.plataforma,
    de: lote.janela.de,
    ate: lote.janela.ate,
    campanhas: lote.campanhas.map((c) => ({
      id_externo: c.idExterno,
      nome: c.nome,
      objetivo: c.objetivo,
      situacao: c.situacao,
      orcamento_diario: c.orcamentoDiario,
      no_ar_desde: c.noArDesde,
      alcance_total: c.alcanceTotal,
      anuncios: c.anuncios.map((a) => ({ id_externo: a.idExterno, nome: a.nome })),
      dias: c.dias.map((d) => ({
        anuncio_id_externo: d.anuncioIdExterno,
        dia: d.dia,
        investido: d.investido,
        impressoes: d.impressoes,
        cliques: d.cliques,
        conversoes: d.conversoes,
      })),
    })),
  };
}

/** Data de hoje no calendário de Curitiba, YYYY-MM-DD. */
function diaEmCuritiba(d: Date): string {
  // `en-CA` formata como YYYY-MM-DD.
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * Os últimos `n` dias no calendário de Curitiba, HOJE incluído: o gasto de
 * hoje é parcial, mas é o que o dono quer ver ao abrir o painel às 15h.
 */
export function janelaDeDias(n: number, agora: Date = new Date(), incluirHoje = true): Janela {
  const hoje = new Date(`${diaEmCuritiba(agora)}T12:00:00Z`);
  const ate = new Date(hoje);
  if (!incluirHoje) ate.setUTCDate(ate.getUTCDate() - 1);
  const de = new Date(ate);
  de.setUTCDate(de.getUTCDate() - (n - 1));
  return { de: de.toISOString().slice(0, 10), ate: ate.toISOString().slice(0, 10) };
}

export interface LinhaDiario {
  campanha_id: string;
  anuncio_id: string | null;
  dia: string;
  investido: number | string;
  impressoes: number;
  cliques: number;
  conversoes: number | string;
}

export interface TotaisDiario {
  investido: number;
  impressoes: number;
  alcance: number;
  cliques: number;
  /** Leads da plataforma — o nome é o de `LeituraTotais` em `midiaPaga.ts`. */
  conversas: number;
}

/**
 * Soma as linhas de `midia_diario` por (campanha, anúncio). A chave é
 * `campanha:anuncio` ou `campanha:campanha` para a linha da campanha — o
 * mesmo par que as telas já usavam para `midia_leituras`. Alcance sai zero:
 * não soma entre dias, e quem precisa dele lê `alcance_total` da campanha.
 * O `numeric` do Postgres chega como string pelo PostgREST; daí o `Number`.
 */
export function somarDiario(linhas: LinhaDiario[]): Map<string, TotaisDiario> {
  const m = new Map<string, TotaisDiario>();
  for (const l of linhas) {
    const chave = `${l.campanha_id}:${l.anuncio_id ?? "campanha"}`;
    const t = m.get(chave) ?? { investido: 0, impressoes: 0, alcance: 0, cliques: 0, conversas: 0 };
    t.investido = Math.round((t.investido + Number(l.investido || 0)) * 100) / 100;
    t.impressoes += Number(l.impressoes || 0);
    t.cliques += Number(l.cliques || 0);
    t.conversas = Math.round((t.conversas + Number(l.conversoes || 0)) * 100) / 100;
    m.set(chave, t);
  }
  return m;
}

export interface Rodada {
  plataforma: Plataforma;
  iniciada_em: string;
  ok: boolean;
  erro: string | null;
}

export interface EstadoSincronizacao {
  ultimaOk: string | null;
  /** A falha mais recente, só se for MAIS NOVA que o último sucesso. */
  falha: { em: string; erro: string } | null;
  /** Nunca sincronizou, ou o último sucesso passou de `HORAS_PARADA`. */
  parada: boolean;
}

/** O Meta roda de hora em hora e o script do Google também: 6 h são 6 rodadas perdidas. */
export const HORAS_PARADA = 6;

export function estadoDaSincronizacao(
  rodadas: Rodada[],
  plataforma: Plataforma,
  agora: Date = new Date(),
): EstadoSincronizacao {
  const minhas = rodadas
    .filter((r) => r.plataforma === plataforma)
    .sort((a, b) => b.iniciada_em.localeCompare(a.iniciada_em));
  const ok = minhas.find((r) => r.ok);
  const ruim = minhas.find((r) => !r.ok);
  const falha =
    ruim && (!ok || ruim.iniciada_em > ok.iniciada_em)
      ? { em: ruim.iniciada_em, erro: ruim.erro ?? "erro sem mensagem" }
      : null;
  const parada =
    !ok || agora.getTime() - new Date(ok.iniciada_em).getTime() > HORAS_PARADA * 36e5;
  return { ultimaOk: ok?.iniciada_em ?? null, falha, parada };
}

const normalizarTexto = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * A qual campanha um lead do banco pertence, pela `utm_campaign`. O padrão
 * pedido nos anúncios é o ID (`{{campaign.id}}` no Meta, `{campaignid}` no
 * Google); o nome casa também, para anúncio antigo que já usava o nome.
 */
export function campanhaDoLead(
  utmCampaign: string | null | undefined,
  campanhas: Array<{ id: string; idExterno: string | null; nome: string }>,
): string | null {
  if (!utmCampaign || !utmCampaign.trim()) return null;
  const alvo = normalizarTexto(utmCampaign);
  const porId = campanhas.find((c) => c.idExterno && c.idExterno === alvo);
  if (porId) return porId.id;
  const porNome = campanhas.find((c) => normalizarTexto(c.nome) === alvo);
  return porNome?.id ?? null;
}
