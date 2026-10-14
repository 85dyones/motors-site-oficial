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
import {
  ACAO_COPILOTO_DE_MIDIA,
  diagnosticoParaBanco,
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
  "criado_por_nome, vigencia_desde";

export interface RegrasVigentes {
  parametros: ParametrosDoCopiloto;
  vigenciaDesde: string;
  criadoPorNome: string | null;
}

export type Leitura<T> = { ok: true; valor: T } | { ok: false; faltaMigracao: boolean; motivo: string };

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

/** Quando chegou o último diagnóstico de verdade da loja (a prévia não conta). */
export async function ultimoDiagnostico(admin: SupabaseClient, org: string): Promise<string | null> {
  const { data, error } = await admin
    .from("midia_copiloto_diagnosticos")
    .select("recebido_em")
    .eq("org_id", org)
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
  return ((data ?? []) as LinhaDaAcao[]).map(paraOScript);
}

/** Na prévia: o que espera a rodada de verdade na loja, sem reservar nada. */
export async function acoesAprovadas(admin: SupabaseClient, org: string): Promise<AcaoParaOScript[]> {
  const { data, error } = await admin
    .from("midia_copiloto_acoes")
    .select("id, tipo, campanha_id_externo, grupo_id_externo, texto, correspondencia, verba_atual, verba_nova")
    .eq("org_id", org)
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
  achadoId: string | null;
  desfazAcaoId: string | null;
  tipo: TipoDeAcao;
  situacao: SituacaoDaAcao;
  campanhaNome: string;
  grupoNome: string | null;
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
  /** Já tem um desfazer a caminho ou feito: a tela não oferece de novo. */
  desfeita: boolean;
}

export interface DiagnosticoNaTela {
  id: string;
  recebidoEm: string;
  janela: Janela;
  previa: boolean;
  resumo: ResumoDoDiagnostico | null;
  erros: Partial<Record<Secao, string>>;
  termos: TermoDePesquisa[];
}

export interface LeituraDoCopiloto {
  regras: RegrasVigentes | null;
  diagnostico: DiagnosticoNaTela | null;
  achados: AchadoNaTela[];
  /** Proposta, aprovada e em aplicação. */
  abertas: AcaoNaTela[];
  /** O que já tem desfecho, dos últimos 30 dias. */
  historico: AcaoNaTela[];
  /** A última sincronização de hora em hora que deu certo — o pulso do script. */
  ultimaSincronizacao: string | null;
  /** Sem sincronizar há mais de `HORAS_PARADA`: nada aprovado está sendo aplicado. */
  scriptParado: boolean;
  /** O instante da leitura: a tela conta "há quanto" a partir dele, igual no servidor e no navegador. */
  lidoEm: string;
}

const COLUNAS_DA_ACAO =
  "id, achado_id, desfaz_acao_id, tipo, situacao, campanha_nome, grupo_nome, texto, correspondencia, " +
  "verba_atual, verba_nova, motivo, economia_7d, evidencias, proposta_em, decidida_por_nome, decidida_em, nota, " +
  "concluida_em, lido_de_volta, erro, descartada_motivo";

const numeroOuNulo = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function linhaParaAcao(l: Record<string, unknown>, desfeitas: Set<string>): AcaoNaTela {
  return {
    id: String(l.id),
    achadoId: (l.achado_id as string | null) ?? null,
    desfazAcaoId: (l.desfaz_acao_id as string | null) ?? null,
    tipo: l.tipo as TipoDeAcao,
    situacao: l.situacao as SituacaoDaAcao,
    campanhaNome: String(l.campanha_nome),
    grupoNome: (l.grupo_nome as string | null) ?? null,
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
    desfeita: desfeitas.has(String(l.id)),
  };
}

export async function lerCopiloto(supabase: SupabaseClient, agora: Date = new Date()): Promise<Leitura<LeituraDoCopiloto>> {
  const desde = new Date(agora.getTime() - 30 * 24 * 3600 * 1000).toISOString();
  const [regras, diag, abertas, historico, sinc] = await Promise.all([
    lerRegras(supabase),
    supabase
      .from("midia_copiloto_diagnosticos")
      .select("id, recebido_em, de, ate, previa, resumo, erros, dados")
      .order("recebido_em", { ascending: false })
      .limit(1),
    supabase
      .from("midia_copiloto_acoes")
      .select(COLUNAS_DA_ACAO)
      .in("situacao", ["proposta", "aprovada", "em_aplicacao"])
      .order("economia_7d", { ascending: false, nullsFirst: false })
      .limit(300),
    supabase
      .from("midia_copiloto_acoes")
      .select(COLUNAS_DA_ACAO)
      .in("situacao", ["aplicada", "sem_efeito", "falhou", "recusada"])
      .gte("proposta_em", desde)
      .order("proposta_em", { ascending: false })
      .limit(100),
    supabase
      .from("midia_sincronizacoes")
      .select("iniciada_em")
      .eq("plataforma", "google")
      .eq("ok", true)
      .order("iniciada_em", { ascending: false })
      .limit(1),
  ]);

  if (!regras.ok && regras.faltaMigracao) return regras;
  for (const r of [diag, abertas, historico]) {
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
    diagnostico = {
      id: String(linhaDiag.id),
      recebidoEm: String(linhaDiag.recebido_em),
      janela: { de: String(linhaDiag.de), ate: String(linhaDiag.ate) },
      previa: linhaDiag.previa === true,
      resumo: (linhaDiag.resumo as ResumoDoDiagnostico | null) ?? null,
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
  return {
    ok: true,
    valor: {
      regras: regras.ok ? regras.valor : null,
      diagnostico,
      achados,
      abertas: ((abertas.data ?? []) as unknown as Record<string, unknown>[]).map((l) => linhaParaAcao(l, desfeitas)),
      historico: ((historico.data ?? []) as unknown as Record<string, unknown>[]).map((l) => linhaParaAcao(l, desfeitas)),
      ultimaSincronizacao,
      scriptParado: !ultimaSincronizacao || agora.getTime() - new Date(ultimaSincronizacao).getTime() > HORAS_PARADA * 36e5,
      lidoEm: agora.toISOString(),
    },
  };
}
