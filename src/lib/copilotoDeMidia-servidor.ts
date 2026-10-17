/**
 * Copiloto de Mídia — a porta, o banco e a conta dos leads. Só servidor.
 *
 * Dois lados, duas portas:
 *   * o SCRIPT da conta do Google Ads entra pelo segredo `midia_google_segredo`
 *     (o mesmo da sincronização) e fala com o banco pela chave de serviço, só
 *     pelas três funções dele (gravar diagnóstico, reservar, registrar);
 *   * o PAINEL entra pela sessão, com a linha "Aprovar mudanças do Copiloto de
 *     Mídia" da matriz (Administrador e Marketing), e fala com o banco pela
 *     PRÓPRIA sessão: a RLS recorta a leitura e as funções do painel carimbam a
 *     autoria com `auth.uid()` e conferem o papel de novo.
 *
 * O cruzamento com os leads é o único ponto que lê `leads`, e só conta: quatro
 * `count` sem trazer linha nenhuma. `leads` ainda não tem `org_id` neste
 * banco (é da S1, na plataforma); quando tiver, o filtro da loja entra aqui.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ehTabelaAusente } from "./consultaDePlaca-servidor";
import { HORAS_PARADA } from "./midiaSync";
import { segredoConfere } from "./midiaSyncServidor";
import { ehStaff, perfisDe, podeFazer } from "./permissoes";
import { createAdminSupabaseClient, createServerSupabaseClient } from "./supabase-server";
import type { ResumoDoMeta } from "./copilotoMeta";
import {
  ACAO_COPILOTO_DE_MIDIA,
  MIGRACAO_DO_COPILOTO_META,
  diagnosticoParaBanco,
  type PlataformaDoCopiloto,
  type AcaoParaOScript,
  type Correspondencia,
  type DiagnosticoDaConta,
  type Gravidade,
  type GrupoDeTermo,
  type Janela,
  type LeadsDaJanela,
  type ParametrosDoCopiloto,
  type Regra,
  type ResultadoDaAcao,
  type ResultadoDoDiagnostico,
  type ResumoDoDiagnostico,
  type Secao,
  type SituacaoDaAcao,
  type TermoDePesquisa,
  type TipoDeAcao,
} from "./copilotoDeMidia";

/**
 * O canal que o webhook do Chatwoot grava no lead que nasce de conversa
 * (`src/app/api/chatwoot/eventos/route.ts`). Conversa que começou no WhatsApp
 * não passou pelo site e não tem como carregar gclid: fica fora de "do site".
 */
export const CANAL_DO_CHATWOOT = "WhatsApp";

// ─────────────────────────────────────────────────────────────────────────────
// A porta do painel
// ─────────────────────────────────────────────────────────────────────────────

export type PortaDoCopiloto =
  | { ok: true; supabase: SupabaseClient; usuarioId: string }
  | { ok: false; status: 401 | 403; motivo: string };

export async function autorizarCopiloto(): Promise<PortaDoCopiloto> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, motivo: "Não autenticado." };
  const { data: profile } = await supabase.from("profiles").select("role, papeis, is_active").eq("id", user.id).single();
  if (!ehStaff(profile) || profile?.is_active !== true || podeFazer(perfisDe(profile), ACAO_COPILOTO_DE_MIDIA) !== "faz") {
    return { ok: false, status: 403, motivo: "O Copiloto de Mídia é do Administrador e do Marketing." };
  }
  return { ok: true, supabase, usuarioId: user.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// A porta do script
// ─────────────────────────────────────────────────────────────────────────────

export type PortaDoScript = { ok: true; admin: SupabaseClient; org: string } | { ok: false; status: 401 | 503; motivo: string };

/**
 * O segredo do script, conferido pelo banco (o site nunca o lê). Tentativa sem
 * segredo válido não deixa rastro: qualquer um na internet pode bater aqui.
 *
 * A loja do script é `org_padrao()`, a mesma que as três funções do script
 * usam lá dentro: até a S1 o segredo é um só. Toda leitura que a rota faz com
 * a chave de serviço filtra por ela — a chave ignora a RLS. Na plataforma, o
 * segredo passa a ser da loja (`org_integracoes`) e a loja vem dele.
 */
export async function autorizarScript(cabecalhos: Headers): Promise<PortaDoScript> {
  let admin: SupabaseClient;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    return { ok: false, status: 503, motivo: "Falta SUPABASE_SERVICE_ROLE_KEY no servidor." };
  }
  const segredo = cabecalhos.get("x-motors-segredo")?.trim();
  if (!(await segredoConfere(admin, "midia_google_segredo", segredo))) {
    return { ok: false, status: 401, motivo: "Não autorizado" };
  }
  const { data: org, error } = await admin.rpc("org_padrao");
  if (error || typeof org !== "string") {
    return { ok: false, status: 503, motivo: `A loja do script não pôde ser lida: ${error?.message ?? "org_padrao() vazia"}` };
  }
  return { ok: true, admin, org };
}

/** A tabela ainda não existe: o script foi colado antes de a migração ser aplicada. */
export function motivoDoErro(erro: unknown): { status: number; motivo: string } {
  const e = erro as { code?: string; message?: string };
  // Coluna ausente: a migração mais nova que o código lê (a do Meta) não foi aplicada.
  if (ehColunaAusente(e)) {
    return { status: 503, motivo: `O banco ainda não tem o Copiloto do Meta: aplique a migração ${MIGRACAO_DO_COPILOTO_META}.` };
  }
  if (ehTabelaAusente(e)) {
    return { status: 503, motivo: "O banco ainda não tem as tabelas do copiloto: aplique a migração 20261014150000_copiloto_de_midia." };
  }
  return { status: statusDoErro(e), motivo: e?.message ?? String(erro) };
}

/** Erro do banco → status HTTP: papel (42501), pedido torto (22023), não achou (P0002). */
export function statusDoErro(erro: { code?: string } | null | undefined): number {
  switch (erro?.code) {
    case "42501":
      return 403;
    case "22023":
    case "23514":
      return 400;
    case "P0002":
      return 404;
    default:
      return 500;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// As regras da loja
// ─────────────────────────────────────────────────────────────────────────────

const COLUNAS_DOS_PARAMETROS =
  "id, gasto_minimo_termo, gasto_minimo_grupo, gasto_minimo_campanha, ritmo_alto_pct, ritmo_baixo_pct, " +
  "reducao_verba_pct, iq_baixo, leads_gclid_minimos, cliques_minimos_gclid, perda_por_verba_pct, " +
  "perda_por_ranking_pct, concorrentes, cidades_fora, palavras_informativas, hora_do_diagnostico, " +
  "criado_por_nome, vigencia_desde, meta_gasto_minimo_conjunto, meta_gasto_minimo_campanha, meta_vezes_sem_lead, " +
  "meta_vezes_custo_caro, meta_leads_maduros_minimos, meta_dias_para_amadurecer";

export interface RegrasVigentes {
  parametros: ParametrosDoCopiloto;
  vigenciaDesde: string;
  criadoPorNome: string | null;
}

export type Leitura<T> =
  | { ok: true; valor: T }
  /** `migracao`: a que falta, quando não é a do copiloto (a coluna nova chegou depois). */
  | { ok: false; faltaMigracao: boolean; motivo: string; migracao?: string };

/** A coluna não existe: o site saiu antes da migração que a cria. */
const ehColunaAusente = (e: { code?: string; message?: string }) =>
  e.code === "42703" || /column .* does not exist/i.test(e.message ?? "");

// O `numeric` do Postgres chega como string pelo PostgREST; daí o `Number`.
function linhaParaRegras(l: Record<string, unknown>): RegrasVigentes {
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    parametros: {
      gastoMinimoTermo: Number(l.gasto_minimo_termo),
      gastoMinimoGrupo: Number(l.gasto_minimo_grupo),
      gastoMinimoCampanha: Number(l.gasto_minimo_campanha),
      ritmoAltoPct: Number(l.ritmo_alto_pct),
      ritmoBaixoPct: Number(l.ritmo_baixo_pct),
      reducaoVerbaPct: Number(l.reducao_verba_pct),
      iqBaixo: Number(l.iq_baixo),
      leadsGclidMinimos: Number(l.leads_gclid_minimos),
      cliquesMinimosGclid: Number(l.cliques_minimos_gclid),
      perdaPorVerbaPct: Number(l.perda_por_verba_pct),
      perdaPorRankingPct: Number(l.perda_por_ranking_pct),
      concorrentes: lista(l.concorrentes),
      cidadesFora: lista(l.cidades_fora),
      palavrasInformativas: lista(l.palavras_informativas),
      horaDoDiagnostico: Number(l.hora_do_diagnostico),
      metaGastoMinimoConjunto: Number(l.meta_gasto_minimo_conjunto),
      metaGastoMinimoCampanha: Number(l.meta_gasto_minimo_campanha),
      metaVezesSemLead: Number(l.meta_vezes_sem_lead),
      metaVezesCustoCaro: Number(l.meta_vezes_custo_caro),
      metaLeadsMadurosMinimos: Number(l.meta_leads_maduros_minimos),
      metaDiasParaAmadurecer: Number(l.meta_dias_para_amadurecer),
    },
    vigenciaDesde: String(l.vigencia_desde),
    criadoPorNome: typeof l.criado_por_nome === "string" ? l.criado_por_nome : null,
  };
}

/**
 * As regras vigentes. Sem elas o diagnóstico não roda: não há número de
 * reserva no código. `org` é obrigatório com a chave de serviço (que ignora a
 * RLS); com a sessão do painel, a RLS já recorta a loja.
 */
export async function lerRegras(cliente: SupabaseClient, org?: string): Promise<Leitura<RegrasVigentes>> {
  let consulta = cliente.from("midia_copiloto_parametros").select(COLUNAS_DOS_PARAMETROS).is("vigencia_ate", null);
  if (org) consulta = consulta.eq("org_id", org);
  const { data, error } = await consulta.order("vigencia_desde", { ascending: false }).limit(1);
  if (error) return { ok: false, faltaMigracao: ehTabelaAusente(error), motivo: error.message };
  const linha = (data as unknown as Record<string, unknown>[] | null)?.[0];
  if (!linha) return { ok: false, faltaMigracao: false, motivo: "Nenhuma regra vigente para o copiloto." };
  return { ok: true, valor: linhaParaRegras(linha) };
}

export async function abrirVigencia(supabase: SupabaseClient, p: ParametrosDoCopiloto) {
  return supabase.rpc("midia_copiloto_nova_vigencia", {
    p_gasto_minimo_termo: p.gastoMinimoTermo,
    p_gasto_minimo_grupo: p.gastoMinimoGrupo,
    p_gasto_minimo_campanha: p.gastoMinimoCampanha,
    p_ritmo_alto_pct: p.ritmoAltoPct,
    p_ritmo_baixo_pct: p.ritmoBaixoPct,
    p_reducao_verba_pct: p.reducaoVerbaPct,
    p_iq_baixo: p.iqBaixo,
    p_leads_gclid_minimos: p.leadsGclidMinimos,
    p_cliques_minimos_gclid: p.cliquesMinimosGclid,
    p_perda_por_verba_pct: p.perdaPorVerbaPct,
    p_perda_por_ranking_pct: p.perdaPorRankingPct,
    p_concorrentes: p.concorrentes,
    p_cidades_fora: p.cidadesFora,
    p_palavras_informativas: p.palavrasInformativas,
    p_hora_do_diagnostico: p.horaDoDiagnostico,
    p_meta_gasto_minimo_conjunto: p.metaGastoMinimoConjunto,
    p_meta_gasto_minimo_campanha: p.metaGastoMinimoCampanha,
    p_meta_vezes_sem_lead: p.metaVezesSemLead,
    p_meta_vezes_custo_caro: p.metaVezesCustoCaro,
    p_meta_leads_maduros_minimos: p.metaLeadsMadurosMinimos,
    p_meta_dias_para_amadurecer: p.metaDiasParaAmadurecer,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Os leads da janela — só contagem
// ─────────────────────────────────────────────────────────────────────────────

/** O instante UTC da meia-noite de `dia` no fuso, sem biblioteca. */
export function meiaNoite(dia: string, fuso: string): Date {
  const [a, m, d] = dia.split("-").map(Number);
  const palpite = Date.UTC(a, m - 1, d);
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(palpite));
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value);
  const comoLocal = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return new Date(palpite - (comoLocal - palpite));
}

function diaSeguinte(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Quantos leads entraram na janela, quantos do site, quantos com clique do
 * Google (gclid, ou gbraid/wbraid — o gclid do iPhone, migração
 * 20261014160000) e
 * quantos com utm de Google pago. Quatro `count` exatos com `head`: nenhuma
 * linha, nenhum dado de pessoa sai do banco.
 */
export async function contarLeadsDaJanela(admin: SupabaseClient, janela: Janela, fuso: string): Promise<LeadsDaJanela> {
  const de = meiaNoite(janela.de, fuso).toISOString();
  const ate = meiaNoite(diaSeguinte(janela.ate), fuso).toISOString();
  const base = () => admin.from("leads").select("id", { count: "exact", head: true }).gte("created_at", de).lt("created_at", ate);

  const [total, doSite, comGclid, comUtmGoogle] = await Promise.all([
    base(),
    base().or(`canal.is.null,canal.neq.${CANAL_DO_CHATWOOT}`),
    base().or("gclid.not.is.null,gbraid.not.is.null,wbraid.not.is.null"),
    base().ilike("utm_source", "google%").or("utm_medium.ilike.cpc,utm_medium.ilike.ppc,utm_medium.ilike.paid*"),
  ]);
  for (const r of [total, doSite, comGclid, comUtmGoogle]) {
    if (r.error) throw new Error(`contagem de leads falhou: ${r.error.message}`);
  }
  return {
    total: total.count ?? 0,
    doSite: doSite.count ?? 0,
    comGclid: comGclid.count ?? 0,
    comUtmGoogle: comUtmGoogle.count ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// O lado do script (chave de serviço)
// ─────────────────────────────────────────────────────────────────────────────

/** Quando chegou o último diagnóstico de verdade do Google na loja (a prévia não conta; o do Meta é outro relógio). */
export async function ultimoDiagnostico(admin: SupabaseClient, org: string): Promise<string | null> {
  const { data, error } = await admin
    .from("midia_copiloto_diagnosticos")
    .select("recebido_em")
    .eq("org_id", org)
    .eq("plataforma", "google")
    .eq("previa", false)
    .order("recebido_em", { ascending: false })
    .limit(1);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return (data?.[0]?.recebido_em as string | undefined) ?? null;
}

interface LinhaDaAcao {
  id: string;
  tipo: TipoDeAcao;
  campanha_id_externo: string;
  grupo_id_externo: string | null;
  texto: string | null;
  correspondencia: Correspondencia | null;
  verba_atual: number | string | null;
  verba_nova: number | string | null;
}

const paraOScript = (l: LinhaDaAcao): AcaoParaOScript => ({
  id: l.id,
  tipo: l.tipo,
  campanhaId: l.campanha_id_externo,
  grupoId: l.grupo_id_externo,
  texto: l.texto,
  correspondencia: l.correspondencia,
  verbaAtual: l.verba_atual === null ? null : Number(l.verba_atual),
  verbaNova: l.verba_nova === null ? null : Number(l.verba_nova),
});

/** O lote desta rodada: reservado no banco, entregue uma vez. */
export async function reservarAcoes(admin: SupabaseClient): Promise<AcaoParaOScript[]> {
  const { data, error } = await admin.rpc("midia_copiloto_reservar_acoes", { p_limite: 50 });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  const linhas = (data ?? []) as Array<LinhaDaAcao & { plataforma?: string }>;
  // A reserva do banco já filtra o Google. Se uma linha de outra plataforma
  // escapar (uma migração antiga reaplicada por cima da do Meta), ela não vai
  // ao script: fecha como falha, com o motivo, e nada muda na conta.
  const deFora = linhas.filter((l) => l.plataforma !== undefined && l.plataforma !== "google");
  if (deFora.length > 0) {
    await registrarResultados(
      admin,
      deFora.map((l) => ({
        id: l.id,
        situacao: "falhou" as const,
        lido: {},
        erro: `A reserva do script entregou uma ação do ${l.plataforma}: ela não vai ao Google. Confira a migração do copiloto no banco.`,
      })),
    );
  }
  return linhas.filter((l) => l.plataforma === undefined || l.plataforma === "google").map(paraOScript);
}

/** Na prévia: o que espera a rodada de verdade na loja, sem reservar nada. Só o do Google: o script não conhece o Meta. */
export async function acoesAprovadas(admin: SupabaseClient, org: string): Promise<AcaoParaOScript[]> {
  const { data, error } = await admin
    .from("midia_copiloto_acoes")
    .select("id, tipo, campanha_id_externo, grupo_id_externo, texto, correspondencia, verba_atual, verba_nova")
    .eq("org_id", org)
    .eq("plataforma", "google")
    .eq("situacao", "aprovada")
    .order("decidida_em", { ascending: true })
    .limit(50);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return ((data ?? []) as LinhaDaAcao[]).map(paraOScript);
}

export interface ContagemDosResultados {
  aplicadas: number;
  semEfeito: number;
  falhas: number;
  /** Já fechadas, ou que não estavam em aplicação: o banco não mudou nada. */
  ignoradas: number;
}

export async function registrarResultados(admin: SupabaseClient, resultados: ResultadoDaAcao[]): Promise<ContagemDosResultados> {
  const conta: ContagemDosResultados = { aplicadas: 0, semEfeito: 0, falhas: 0, ignoradas: 0 };
  for (const r of resultados) {
    const { data, error } = await admin.rpc("midia_copiloto_registrar_resultado", {
      p_acao: r.id,
      p_situacao: r.situacao,
      p_lido: r.lido,
      p_erro: r.erro,
    });
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    if (data === "aplicada") conta.aplicadas++;
    else if (data === "sem_efeito") conta.semEfeito++;
    else if (data === "falhou") conta.falhas++;
    else conta.ignoradas++;
  }
  return conta;
}

export async function gravarDiagnostico(admin: SupabaseClient, d: DiagnosticoDaConta, r: ResultadoDoDiagnostico) {
  const { data, error } = await admin.rpc("midia_copiloto_gravar_diagnostico", { p: diagnosticoParaBanco(d, r) });
  if (error) throw Object.assign(new Error(`gravação do diagnóstico falhou: ${error.message}`), { code: error.code });
  return data as { diagnostico: string; achados: number; propostas: number; puladas: number; descartadas: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// A leitura do painel (sessão; a RLS recorta)
// ─────────────────────────────────────────────────────────────────────────────

export interface AchadoNaTela {
  id: string;
  regra: Regra;
  grupo: GrupoDeTermo | null;
  gravidade: Gravidade;
  titulo: string;
  detalhe: string;
  evidencias: Record<string, unknown>;
}

export interface AcaoNaTela {
  id: string;
  plataforma: PlataformaDoCopiloto;
  /** O ID da campanha na plataforma (Google Ads ou Meta). */
  campanhaId: string;
  achadoId: string | null;
  desfazAcaoId: string | null;
  tipo: TipoDeAcao;
  situacao: SituacaoDaAcao;
  campanhaNome: string;
  /** No Meta, o conjunto de anúncios. */
  grupoNome: string | null;
  /** Só no Meta (pausar/reativar anúncio). */
  anuncioNome: string | null;
  texto: string | null;
  correspondencia: Correspondencia | null;
  verbaAtual: number | null;
  verbaNova: number | null;
  motivo: string;
  economia7d: number | null;
  evidencias: Record<string, unknown>;
  propostaEm: string;
  decididaPorNome: string | null;
  decididaEm: string | null;
  nota: string | null;
  concluidaEm: string | null;
  lidoDeVolta: Record<string, unknown> | null;
  erro: string | null;
  descartadaMotivo: string | null;
  /** É um pedido de verba feito no painel por uma pessoa, e não uma proposta do diagnóstico. */
  pedido: boolean;
  /** O nome de quem pediu; nulo quando o perfil não tem nome (o pedido continua sendo pedido). */
  pedidaPorNome: string | null;
  /** Já tem um desfazer a caminho ou feito: a tela não oferece de novo. */
  desfeita: boolean;
}

/**
 * Uma campanha que pode receber pedido de verba: a verba é a que a
 * sincronização de hora em hora gravou (`midia_campanhas.orcamento_diario`) —
 * a mesma que o banco usa como "verba de agora" no pedido. No Meta, só a
 * campanha com verba na campanha (orçamento de campanha) entra.
 */
export interface CampanhaParaPedido {
  /** O ID da campanha na plataforma. */
  id: string;
  nome: string;
  verba: number;
  situacao: string;
  sincronizadoEm: string | null;
}

export interface DiagnosticoNaTela {
  id: string;
  recebidoEm: string;
  janela: Janela;
  previa: boolean;
  /** O resumo do Google (nulo no retrato do Meta). */
  resumo: ResumoDoDiagnostico | null;
  /** O resumo do Meta (nulo no retrato do Google). */
  resumoMeta: ResumoDoMeta | null;
  erros: Partial<Record<Secao, string>>;
  termos: TermoDePesquisa[];
}

export interface LeituraDoCopiloto {
  /** A aba: cada plataforma tem o seu retrato, as suas propostas e o seu pulso. */
  plataforma: PlataformaDoCopiloto;
  regras: RegrasVigentes | null;
  diagnostico: DiagnosticoNaTela | null;
  achados: AchadoNaTela[];
  /** Proposta, aprovada e em aplicação. */
  abertas: AcaoNaTela[];
  /** O que já tem desfecho, dos últimos 30 dias. */
  historico: AcaoNaTela[];
  /** As campanhas da plataforma para o pedido de verba (vazia quando a leitura falha: o resto da tela segue). */
  campanhas: CampanhaParaPedido[];
  /** A última sincronização de hora em hora que deu certo — o pulso do script (Google) ou da rodada agendada (Meta). */
  ultimaSincronizacao: string | null;
  /** Sem sincronizar há mais de `HORAS_PARADA`: nada aprovado está sendo aplicado. */
  scriptParado: boolean;
  /** O instante da leitura: a tela conta "há quanto" a partir dele, igual no servidor e no navegador. */
  lidoEm: string;
}

const COLUNAS_DA_ACAO =
  "id, plataforma, achado_id, desfaz_acao_id, tipo, situacao, campanha_id_externo, campanha_nome, grupo_nome, anuncio_nome, texto, correspondencia, " +
  "verba_atual, verba_nova, motivo, economia_7d, evidencias, proposta_em, decidida_por_nome, decidida_em, nota, " +
  "concluida_em, lido_de_volta, erro, descartada_motivo, pedida_por, pedida_por_nome";

const numeroOuNulo = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function linhaParaAcao(l: Record<string, unknown>, desfeitas: Set<string>): AcaoNaTela {
  return {
    id: String(l.id),
    plataforma: l.plataforma === "meta" ? "meta" : "google",
    campanhaId: String(l.campanha_id_externo),
    achadoId: (l.achado_id as string | null) ?? null,
    desfazAcaoId: (l.desfaz_acao_id as string | null) ?? null,
    tipo: l.tipo as TipoDeAcao,
    situacao: l.situacao as SituacaoDaAcao,
    campanhaNome: String(l.campanha_nome),
    grupoNome: (l.grupo_nome as string | null) ?? null,
    anuncioNome: (l.anuncio_nome as string | null) ?? null,
    texto: (l.texto as string | null) ?? null,
    correspondencia: (l.correspondencia as Correspondencia | null) ?? null,
    verbaAtual: numeroOuNulo(l.verba_atual),
    verbaNova: numeroOuNulo(l.verba_nova),
    motivo: String(l.motivo),
    economia7d: numeroOuNulo(l.economia_7d),
    evidencias: (l.evidencias as Record<string, unknown> | null) ?? {},
    propostaEm: String(l.proposta_em),
    decididaPorNome: (l.decidida_por_nome as string | null) ?? null,
    decididaEm: (l.decidida_em as string | null) ?? null,
    nota: (l.nota as string | null) ?? null,
    concluidaEm: (l.concluida_em as string | null) ?? null,
    lidoDeVolta: (l.lido_de_volta as Record<string, unknown> | null) ?? null,
    erro: (l.erro as string | null) ?? null,
    descartadaMotivo: (l.descartada_motivo as string | null) ?? null,
    pedido: l.pedida_por !== null && l.pedida_por !== undefined,
    pedidaPorNome: (l.pedida_por_nome as string | null) ?? null,
    desfeita: desfeitas.has(String(l.id)),
  };
}

/**
 * A verba de agora de uma campanha. O script sincroniza ANTES de aplicar: por
 * até uma hora depois de uma mudança de verba aplicada, `midia_campanhas` ainda
 * mostra a antiga. Quando o script leu de volta uma verba depois da última
 * sincronização, é ela que vale — a mesma regra de `midia_copiloto_pedir_verba`
 * no banco, para a tela e o pedido mostrarem o mesmo número.
 */
export function verbaDeAgora(c: CampanhaParaPedido, historico: AcaoNaTela[]): CampanhaParaPedido {
  const sincronizada = c.sincronizadoEm ? Date.parse(c.sincronizadoEm) : -Infinity;
  let melhor: { verba: number; em: string } | null = null;
  for (const a of historico) {
    const verba = a.lidoDeVolta?.verba;
    if (a.tipo !== "mudar_verba" || a.situacao !== "aplicada" || a.campanhaId !== c.id || !a.concluidaEm) continue;
    if (typeof verba !== "number" || !(verba > 0) || Date.parse(a.concluidaEm) <= sincronizada) continue;
    if (!melhor || Date.parse(a.concluidaEm) > Date.parse(melhor.em)) melhor = { verba, em: a.concluidaEm };
  }
  return melhor ? { ...c, verba: melhor.verba, sincronizadoEm: melhor.em } : c;
}

export async function lerCopiloto(
  supabase: SupabaseClient,
  agora: Date = new Date(),
  plataforma: PlataformaDoCopiloto = "google",
): Promise<Leitura<LeituraDoCopiloto>> {
  const desde = new Date(agora.getTime() - 30 * 24 * 3600 * 1000).toISOString();
  const [regras, diag, abertas, historico, sinc, camp] = await Promise.all([
    lerRegras(supabase),
    supabase
      .from("midia_copiloto_diagnosticos")
      .select("id, recebido_em, de, ate, previa, resumo, erros, dados")
      .eq("plataforma", plataforma)
      .order("recebido_em", { ascending: false })
      .limit(1),
    supabase
      .from("midia_copiloto_acoes")
      .select(COLUNAS_DA_ACAO)
      .eq("plataforma", plataforma)
      .in("situacao", ["proposta", "aprovada", "em_aplicacao"])
      .order("economia_7d", { ascending: false, nullsFirst: false })
      .limit(300),
    supabase
      .from("midia_copiloto_acoes")
      .select(COLUNAS_DA_ACAO)
      .eq("plataforma", plataforma)
      .in("situacao", ["aplicada", "sem_efeito", "falhou", "recusada"])
      .gte("proposta_em", desde)
      .order("proposta_em", { ascending: false })
      .limit(100),
    // O pulso de quem APLICA: no Google, o script; no Meta, só a rodada
    // agendada (o botão do painel sincroniza, mas não aplica nada).
    (plataforma === "meta"
      ? supabase.from("midia_sincronizacoes").select("iniciada_em").eq("plataforma", plataforma).eq("gatilho", "agendado")
      : supabase.from("midia_sincronizacoes").select("iniciada_em").eq("plataforma", plataforma)
    )
      .eq("ok", true)
      .order("iniciada_em", { ascending: false })
      .limit(1),
    // Só as que a sincronização grava (têm ID) e que ainda existem na conta.
    supabase
      .from("midia_campanhas")
      .select("id_externo, nome, orcamento_diario, situacao, sincronizado_em")
      .eq("plataforma", plataforma)
      .in("situacao", ["no_ar", "pausada"])
      .not("id_externo", "is", null)
      .order("nome", { ascending: true })
      .limit(200),
  ]);

  if (!regras.ok && regras.faltaMigracao) return regras;
  for (const r of [diag, abertas, historico]) {
    // Coluna ausente: o site saiu antes da migração mais nova que a tela lê
    // (`plataforma`, `anuncio_nome` — a do Meta; a do pedido de verba já foi aplicada).
    if (r.error && ehColunaAusente(r.error)) {
      return { ok: false, faltaMigracao: true, migracao: MIGRACAO_DO_COPILOTO_META, motivo: r.error.message };
    }
    if (r.error) return { ok: false, faltaMigracao: ehTabelaAusente(r.error), motivo: r.error.message };
  }

  const todas = [...((abertas.data ?? []) as unknown as Record<string, unknown>[]), ...((historico.data ?? []) as unknown as Record<string, unknown>[])];
  // O desfazer de uma ação "conta" enquanto não foi recusado nem falhou.
  const desfeitas = new Set(
    todas
      .filter((l) => l.desfaz_acao_id && !["recusada", "falhou", "descartada"].includes(String(l.situacao)))
      .map((l) => String(l.desfaz_acao_id)),
  );

  const linhaDiag = (diag.data?.[0] ?? null) as Record<string, unknown> | null;
  let diagnostico: DiagnosticoNaTela | null = null;
  let achados: AchadoNaTela[] = [];
  if (linhaDiag) {
    const dados = (linhaDiag.dados ?? {}) as Partial<DiagnosticoDaConta>;
    const resumo = (linhaDiag.resumo ?? null) as (ResumoDoDiagnostico & { plataforma?: string }) | null;
    const doMeta = resumo?.plataforma === "meta";
    diagnostico = {
      id: String(linhaDiag.id),
      recebidoEm: String(linhaDiag.recebido_em),
      janela: { de: String(linhaDiag.de), ate: String(linhaDiag.ate) },
      previa: linhaDiag.previa === true,
      resumo: doMeta ? null : resumo,
      resumoMeta: doMeta ? (resumo as unknown as ResumoDoMeta) : null,
      erros: (linhaDiag.erros ?? {}) as Partial<Record<Secao, string>>,
      // Os 500 de maior gasto bastam para a tabela; o retrato inteiro fica no banco.
      termos: (Array.isArray(dados.termos) ? [...dados.termos] : []).sort((a, b) => b.custo - a.custo).slice(0, 500),
    };
    const { data, error } = await supabase
      .from("midia_copiloto_achados")
      .select("id, regra, grupo, gravidade, titulo, detalhe, evidencias")
      .eq("diagnostico_id", diagnostico.id)
      .order("ordem", { ascending: true });
    if (error) return { ok: false, faltaMigracao: ehTabelaAusente(error), motivo: error.message };
    achados = (data ?? []) as AchadoNaTela[];
  }

  const ultimaSincronizacao = (sinc.data?.[0]?.iniciada_em as string | undefined) ?? null;
  const acoesDaTela = {
    abertas: ((abertas.data ?? []) as unknown as Record<string, unknown>[]).map((l) => linhaParaAcao(l, desfeitas)),
    historico: ((historico.data ?? []) as unknown as Record<string, unknown>[]).map((l) => linhaParaAcao(l, desfeitas)),
  };
  const campanhas: CampanhaParaPedido[] = camp.error
    ? []
    : ((camp.data ?? []) as Array<Record<string, unknown>>)
        .filter((c) => Number(c.orcamento_diario) > 0)
        .map((c) =>
          verbaDeAgora(
            {
              id: String(c.id_externo),
              nome: String(c.nome),
              verba: Number(c.orcamento_diario),
              situacao: String(c.situacao),
              sincronizadoEm: (c.sincronizado_em as string | null) ?? null,
            },
            acoesDaTela.historico,
          ),
        );
  return {
    ok: true,
    valor: {
      plataforma,
      regras: regras.ok ? regras.valor : null,
      diagnostico,
      achados,
      abertas: acoesDaTela.abertas,
      historico: acoesDaTela.historico,
      campanhas,
      ultimaSincronizacao,
      scriptParado: !ultimaSincronizacao || agora.getTime() - new Date(ultimaSincronizacao).getTime() > HORAS_PARADA * 36e5,
      lidoEm: agora.toISOString(),
    },
  };
}
