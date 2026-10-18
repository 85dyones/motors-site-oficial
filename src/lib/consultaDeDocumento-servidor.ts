/**
 * Consulta de CPF e CNPJ — a rede, o banco e a porta. Só servidor. O catálogo
 * e os leitores estão em `consultaDeDocumento.ts`; o relatório, em
 * `relatorioDeDocumento.ts`.
 *
 * Contrato do fornecedor (doc.apibrasil.io, lido em 18/10/2026):
 *   POST https://gateway.apibrasil.io/api/v2/consulta/{cpf|cnpj}/credits
 *   (a API CNPJ usa /api/v2/dados/cnpj/credits)
 *   Authorization: Bearer <APIBRASIL_TOKEN>
 *   { "tipo": "<produto>", "cpf"|"cnpj": "<documento>", "homolog": true? }
 *
 * As regras da consulta de placa valem aqui: erro chega com HTTP 200 e quem
 * decide é `error` do corpo; NÃO há nova tentativa (a doc avisa que repetir
 * cobra de novo); 402 é falta de saldo. `homolog: true` só vai quando o
 * ambiente está em homologação, e aí nada é cobrado.
 *
 * Quem lê usa o cliente de SESSÃO (a RLS repete os quatro papéis). Quem
 * GRAVA a consulta é o servidor, pela service_role, com a função
 * `registrar_consulta_de_documento` — e só depois de chamar o fornecedor: a
 * sessão não insere, para ninguém forjar um relatório com a marca da loja e
 * mandá-lo pelo link (revisão de 18/10/2026). Toda tentativa fica registrada,
 * inclusive a que falhou: o titular tem direito de saber quem consultou e por
 * quê, e a loja pode ter sido cobrada.
 *
 * Os números de negócio (validade do link, janela das consultas recentes,
 * trava contra repetição, limite de links, tabela de preços) vêm de
 * `parametros_consulta_documento`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ehStaff, perfisDe, podeFazer } from "./permissoes";
import { createAdminSupabaseClient, createServerSupabaseClient } from "./supabase-server";
import { ehTabelaAusente } from "./consultaDePlaca-servidor";
import { mascararCpf } from "./cpf";
import { formatarCnpj } from "./cnpj";
import {
  FINALIDADES,
  PRODUTOS,
  documentoFormatado,
  montarRelatorio,
  nivelDe,
  numeroDoFornecedor,
  pegar,
  type Finalidade,
  type IdDoProduto,
  type Nivel,
  type PedidoDeDocumento,
  type PrecosDeReferencia,
  type RespostaDoProduto,
} from "./consultaDeDocumento";
import type { RelatorioDeDocumento, TipoDeDocumento } from "./relatorioDeDocumento";
import { CAMINHO_DO_LINK, gerarTokenDoLink, hashDoToken } from "./linkDoRelatorio";
import { urlDoSite } from "./site";

export const ACAO_CONSULTAR_DOCUMENTO = "Consultar CPF e CNPJ (consulta paga)";
export const MIGRACAO_DAS_CONSULTAS_DE_DOCUMENTO = "20261018120000_consultas_de_documento";

const GATEWAY = "https://gateway.apibrasil.io/api/v2";
/** Os produtos de crédito juntam vários bureaus; a espera é longa de propósito (a rota tem 60 s). */
export const ESPERA_DO_DOCUMENTO_MS = 40000;
const DIA_MS = 86400000;

// ─────────────────────────────────────────────────────────────────────────────
// A porta
// ─────────────────────────────────────────────────────────────────────────────

export type PortaDaConsultaDeDocumento =
  | { ok: true; supabase: SupabaseClient; usuarioId: string; nome: string | null }
  | { ok: false; status: 401 | 403; motivo: string };

export async function autorizarConsultaDeDocumento(): Promise<PortaDaConsultaDeDocumento> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, motivo: "Não autenticado." };
  const { data: profile } = await supabase.from("profiles").select("role, papeis, is_active, full_name").eq("id", user.id).single();
  if (!ehStaff(profile) || profile?.is_active !== true || podeFazer(perfisDe(profile), ACAO_CONSULTAR_DOCUMENTO) !== "faz") {
    return { ok: false, status: 403, motivo: "A consulta de CPF e CNPJ é do Administrador, do Gestor, do Comercial e do Financeiro." };
  }
  return { ok: true, supabase, usuarioId: user.id, nome: typeof profile?.full_name === "string" ? profile.full_name : null };
}

/** O cliente que grava a consulta. `null` quando falta a chave de serviço neste ambiente. */
export function clienteDeGravacao(): SupabaseClient | null {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Os parâmetros
// ─────────────────────────────────────────────────────────────────────────────

export interface ParametrosDaConsultaDeDocumento {
  diasDoLink: number;
  diasDeConsultaRecente: number;
  minutosContraRepeticao: number;
  linksAtivosPorConsulta: number;
  precos: PrecosDeReferencia;
  /** "2026-10-18". */
  tabelaDePrecosEm: string;
  fonte: string;
}

export type LeituraDosParametros = { ok: true; parametros: ParametrosDaConsultaDeDocumento } | { ok: false; faltaMigracao: boolean; motivo: string };

/** A vigência atual de `parametros_consulta_documento` (a RLS recorta a org). */
export async function lerParametrosDaConsulta(supabase: SupabaseClient): Promise<LeituraDosParametros> {
  const { data, error } = await supabase
    .from("parametros_consulta_documento")
    .select("dias_do_link, dias_de_consulta_recente, minutos_contra_repeticao, links_ativos_por_consulta, precos_de_referencia, tabela_de_precos_em, fonte")
    .is("vigencia_ate", null)
    .maybeSingle();
  if (error) return { ok: false, faltaMigracao: ehTabelaAusente(error), motivo: "Não deu para ler os parâmetros da consulta." };
  if (!data) return { ok: false, faltaMigracao: false, motivo: "Não há parâmetros vigentes da consulta de CPF e CNPJ (parametros_consulta_documento)." };
  const l = data as Record<string, unknown>;
  const precos: PrecosDeReferencia = {};
  const brutos = l.precos_de_referencia && typeof l.precos_de_referencia === "object" ? (l.precos_de_referencia as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(brutos)) {
    const n = numeroDoFornecedor(v);
    if (n !== null && Object.prototype.hasOwnProperty.call(PRODUTOS, k)) precos[k as IdDoProduto] = n;
  }
  return {
    ok: true,
    parametros: {
      diasDoLink: Number(l.dias_do_link),
      diasDeConsultaRecente: Number(l.dias_de_consulta_recente),
      minutosContraRepeticao: Number(l.minutos_contra_repeticao),
      linksAtivosPorConsulta: Number(l.links_ativos_por_consulta),
      precos,
      tabelaDePrecosEm: String(l.tabela_de_precos_em),
      fonte: typeof l.fonte === "string" ? l.fonte : "",
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A rede: um produto, uma chamada
// ─────────────────────────────────────────────────────────────────────────────

export type BuscarNoGateway = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ status: number; json: () => Promise<unknown> }>;

export type ChamadaDoProduto =
  | { ok: true; status: number; dados: unknown; custo: number | null }
  | {
      ok: false;
      status: number | null;
      /** Para o painel: pode citar a mensagem do fornecedor. Nunca vai para o relatório que sai da loja. */
      motivo: string;
      /** Para o relatório: curto e sem nada técnico. */
      motivoPublico: string;
      /** Problema da conta (saldo, token): os outros produtos da mesma consulta também vão falhar. */
      daConta: boolean;
      /** A consulta PODE ter sido cobrada: a resposta não chegou, ou o produto cobra mesmo no erro. */
      podeTerCobrado: boolean;
      /** Quando o fornecedor diz quanto cobrou mesmo no erro ("Você foi tarifado em R$ 4,50"). */
      custo: number | null;
    };

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

const NAO_RESPONDEU = "não respondeu nesta consulta.";

/**
 * O custo de uma resposta: `valor_consulta` (número). Na falta dele, o valor
 * escrito na mensagem ("Você foi tarifado em R$ 1,78"). `tax` NÃO serve: no
 * exemplo do Acerta Essencial Plus ele vale "0.340" contra R$ 4,49 da tabela.
 */
export function custoDaResposta(c: Record<string, unknown> | null): number | null {
  if (!c) return null;
  if (typeof c.valor_consulta === "number" && Number.isFinite(c.valor_consulta)) return c.valor_consulta;
  const mensagens = [c.message, pegar(c, "response.message")].filter((m): m is string => typeof m === "string");
  for (const m of mensagens) {
    const achou = m.match(/tarifad[oa][^0-9]*R?\$?\s*([0-9]+(?:[.,][0-9]+)?)/i);
    if (achou) return numeroDoFornecedor(achou[1]);
  }
  return null;
}

/** Lê a resposta de um produto. Puro: os testes passam corpos de mentira. */
export function lerChamadaDoProduto(status: number, corpo: unknown, produto: IdDoProduto): ChamadaDoProduto {
  const cobraEmErro = PRODUTOS[produto].cobraEmErro;
  const falha = (motivo: string, extra: { daConta?: boolean; podeTerCobrado: boolean; custo?: number | null; publico?: string }): ChamadaDoProduto => ({
    ok: false,
    status,
    motivo,
    motivoPublico: extra.publico ?? NAO_RESPONDEU,
    daConta: extra.daConta ?? false,
    podeTerCobrado: extra.podeTerCobrado || (extra.custo ?? 0) > 0,
    custo: extra.custo ?? null,
  });
  if (status === 402) return falha("a conta da APIBrasil está sem saldo", { daConta: true, podeTerCobrado: false });
  if (status === 401 || status === 403) return falha("a APIBrasil recusou o token da loja (APIBRASIL_TOKEN)", { daConta: true, podeTerCobrado: false });
  if (status >= 500) return falha(`a APIBrasil está fora do ar (HTTP ${status})`, { podeTerCobrado: cobraEmErro });
  const c = objeto(corpo);
  if (!c) return falha("a APIBrasil respondeu algo ilegível", { podeTerCobrado: true });
  const custo = custoDaResposta(c);
  const interno = objeto(c.response);
  if (status >= 400 || c.error === true || interno?.error === true) {
    const mensagem = typeof c.message === "string" && c.message.trim() ? c.message.trim() : typeof interno?.message === "string" ? interno.message.trim() : "";
    const texto = mensagem.slice(0, 200) || null;
    if (texto && /saldo|cr[ée]dito insuficiente/i.test(texto)) return falha("a conta da APIBrasil está sem saldo", { daConta: true, podeTerCobrado: false });
    const naoEncontrado = texto !== null && /n[aã]o encontrad|sem informa/i.test(texto);
    return falha(texto ? `a APIBrasil recusou: ${texto}` : `a APIBrasil recusou a consulta (HTTP ${status})`, {
      // A doc: "parâmetro errado repetido continua cobrando" — só três produtos dizem que não.
      podeTerCobrado: cobraEmErro,
      custo,
      publico: naoEncontrado ? "não encontrou registro deste documento." : NAO_RESPONDEU,
    });
  }
  // O miolo: `data` na maioria; `response.data` no Acerta Essencial Plus.
  const dados = c.data ?? pegar(c, "response.data") ?? null;
  if (dados === null || dados === undefined) return falha("a APIBrasil respondeu sem os dados", { podeTerCobrado: true, custo });
  return { ok: true, status, dados, custo };
}

export async function consultarProduto(
  produto: IdDoProduto,
  tipo: TipoDeDocumento,
  documento: string,
  opcoes: { token: string; homologacao: boolean; buscar?: BuscarNoGateway },
): Promise<ChamadaDoProduto> {
  const p = PRODUTOS[produto];
  const buscar: BuscarNoGateway = opcoes.buscar ?? ((url, init) => fetch(url, { ...init, cache: "no-store" }));
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), ESPERA_DO_DOCUMENTO_MS);
  try {
    const r = await buscar(`${GATEWAY}/${p.rota}/${tipo}/credits`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opcoes.token}` },
      // A doc pede para tirar `homolog` em produção: ele só vai quando é teste.
      body: JSON.stringify({ tipo: p.id, [tipo]: documento, ...(opcoes.homologacao ? { homolog: true } : {}) }),
      signal: controle.signal,
    });
    return lerChamadaDoProduto(r.status, await r.json().catch(() => null), produto);
  } catch (erro) {
    const estourou = (erro as Error)?.name === "AbortError";
    return {
      ok: false,
      status: null,
      motivo: estourou ? "a APIBrasil não respondeu a tempo; a consulta PODE ter sido cobrada" : "não deu para falar com a APIBrasil; a consulta PODE ter sido cobrada",
      motivoPublico: NAO_RESPONDEU,
      daConta: false,
      podeTerCobrado: true,
      custo: null,
    };
  } finally {
    clearTimeout(relogio);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A consulta inteira
// ─────────────────────────────────────────────────────────────────────────────

export type SituacaoDaConsulta = "completa" | "parcial" | "falhou";

export interface TentativaDoProduto {
  produto: IdDoProduto;
  ok: boolean;
  status: number | null;
  motivo: string | null;
  pode_ter_cobrado: boolean;
  custo: number | null;
}

export type ResultadoDaConsulta =
  | { ok: true; id: string | null; situacao: SituacaoDaConsulta; relatorio: RelatorioDeDocumento; custo: number | null; avisos: string[] }
  | { ok: false; status: 400 | 402 | 502 | 503; motivo: string; id: string | null; podeTerCobrado: boolean }
  | { ok: false; status: 409; motivo: string; repeticao: ConsultaDeDocumentoNaLista };

/** O jsonb do Postgres recusa `\u0000`: uma resposta paga com ele ficaria sem registro. */
export function semCaractereNulo<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? null).replace(/\\u0000/g, "")) as T;
}

/** O custo da consulta. Em homologação é zero; fora dela, qualquer valor desconhecido de quem pode ter cobrado deixa a soma desconhecida. */
export function custoDaConsulta(tentativas: TentativaDoProduto[], homologacao: boolean): number | null {
  if (homologacao) return 0;
  let soma = 0;
  for (const t of tentativas) {
    if (t.custo !== null) soma += t.custo;
    else if (t.ok || t.pode_ter_cobrado) return null;
  }
  return Math.round(soma * 100) / 100;
}

/**
 * Chama os produtos do nível (todos de uma vez: são dois a quatro), monta o
 * relatório e grava — sempre, com a situação: completa, parcial ou falhou.
 * Antes de chamar, recusa (409) a mesma consulta feita há pouco, a menos que
 * venha `repetir`: mais um clique não pode cobrar de novo sem querer.
 */
export async function executarConsulta(
  supabase: SupabaseClient,
  pedido: PedidoDeDocumento & { repetir?: boolean },
  deps: {
    token: string | null;
    homologacao: boolean;
    usuarioId: string;
    parametros: ParametrosDaConsultaDeDocumento;
    /** O cliente da service_role. `null` = a consulta não fica guardada (falta a chave). */
    gravacao: SupabaseClient | null;
    buscar?: BuscarNoGateway;
    agora?: () => Date;
  },
): Promise<ResultadoDaConsulta> {
  if (!deps.token) return { ok: false, status: 503, motivo: "Falta APIBRASIL_TOKEN neste ambiente: sem ele nenhuma consulta sai.", id: null, podeTerCobrado: false };
  if (!deps.gravacao) return { ok: false, status: 503, motivo: "Falta SUPABASE_SERVICE_ROLE_KEY neste ambiente: a consulta não ficaria registrada, então não sai.", id: null, podeTerCobrado: false };
  const nivel = nivelDe(pedido.tipo, pedido.nivel);
  if (!nivel) return { ok: false, status: 400, motivo: "Nível de consulta inválido para este documento.", id: null, podeTerCobrado: false };
  const agora = deps.agora?.() ?? new Date();

  if (!pedido.repetir && deps.parametros.minutosContraRepeticao > 0) {
    const desde = new Date(agora.getTime() - deps.parametros.minutosContraRepeticao * 60000).toISOString();
    const { data } = await supabase
      .from("consultas_de_documento")
      .select(COLUNAS_DA_LISTA)
      .eq("tipo_documento", pedido.tipo)
      .eq("documento", pedido.documento)
      .eq("nivel", pedido.nivel)
      .eq("homologacao", deps.homologacao)
      .neq("situacao", "falhou")
      .gte("criado_em", desde)
      .order("criado_em", { ascending: false })
      .limit(1);
    const anterior = (data ?? []).flatMap((l) => itemDaLista(l as Record<string, unknown>) ?? [])[0];
    if (anterior) {
      return { ok: false, status: 409, motivo: `Este documento foi consultado neste nível há menos de ${deps.parametros.minutosContraRepeticao} minutos. Abra a consulta guardada, ou confirme para pagar de novo.`, repeticao: anterior };
    }
  }

  const chamadas = await Promise.all(
    nivel.produtos.map(async (produto) => ({ produto, chamada: await consultarProduto(produto, pedido.tipo, pedido.documento, { token: deps.token!, homologacao: deps.homologacao, buscar: deps.buscar }) })),
  );
  const respostas: RespostaDoProduto[] = chamadas.map(({ produto, chamada }) => (chamada.ok ? { produto, ok: true, dados: chamada.dados } : { produto, ok: false, motivo: chamada.motivoPublico }));
  const tentativas: TentativaDoProduto[] = chamadas.map(({ produto, chamada }) => ({
    produto,
    ok: chamada.ok,
    status: chamada.status,
    motivo: chamada.ok ? null : chamada.motivo,
    pode_ter_cobrado: chamada.ok ? true : chamada.podeTerCobrado,
    custo: chamada.custo,
  }));
  const certos = chamadas.filter((c) => c.chamada.ok).length;
  const situacao: SituacaoDaConsulta = certos === chamadas.length ? "completa" : certos === 0 ? "falhou" : "parcial";
  const avisos = chamadas.flatMap(({ produto, chamada }) =>
    !chamada.ok ? [`${PRODUTOS[produto].nome}: ${chamada.motivo}.${chamada.podeTerCobrado && !deps.homologacao ? " Pode ter sido cobrado: confira o saldo no painel da APIBrasil antes de consultar de novo." : ""}`] : [],
  );

  const relatorio = montarRelatorio(pedido, respostas, { geradoEm: agora.toISOString(), homologacao: deps.homologacao });
  const custo = custoDaConsulta(tentativas, deps.homologacao);

  const { data: id, error } = await deps.gravacao.rpc("registrar_consulta_de_documento", {
    p_criado_por: deps.usuarioId,
    p_tipo_documento: pedido.tipo,
    p_documento: pedido.documento,
    p_nivel: pedido.nivel,
    p_produtos: nivel.produtos,
    p_nome: relatorio.titular?.slice(0, 200) ?? null,
    p_relatorio: semCaractereNulo(relatorio),
    p_respostas: semCaractereNulo(Object.fromEntries(chamadas.flatMap(({ produto, chamada }) => (chamada.ok ? [[produto, chamada.dados]] : [])))),
    p_tentativas: semCaractereNulo(tentativas),
    p_situacao: situacao,
    p_custo: custo,
    p_homologacao: deps.homologacao,
    p_finalidade: pedido.finalidade,
    p_titular_ciente: true,
  });
  const guardada = !error && typeof id === "string" ? id : null;
  if (error) {
    console.error("[Consulta de documento] a consulta não foi gravada:", error.code, error.message);
    avisos.push(
      ehTabelaAusente(error)
        ? `A consulta foi feita, mas não ficou guardada: falta a migração ${MIGRACAO_DAS_CONSULTAS_DE_DOCUMENTO}. Imprima agora; sem ela não há histórico nem link.`
        : "A consulta foi feita, mas não ficou guardada no histórico. Imprima agora; sem o registro não há link.",
    );
  }
  console.info("[Consulta de documento]", { tipo: pedido.tipo, nivel: pedido.nivel, produtos: nivel.produtos, situacao, custo, homologacao: deps.homologacao });

  if (situacao === "falhou") {
    const podeTerCobrado = !deps.homologacao && tentativas.some((t) => t.pode_ter_cobrado);
    const semSaldo = chamadas.some(({ chamada }) => !chamada.ok && chamada.daConta && /saldo/.test(chamada.motivo));
    const registro = guardada ? " A tentativa ficou registrada no histórico." : "";
    if (semSaldo) return { ok: false, status: 402, motivo: `A conta da APIBrasil está sem saldo. Ponha crédito no painel deles e consulte de novo.${registro}`, id: guardada, podeTerCobrado };
    return {
      ok: false,
      status: 502,
      motivo: `A consulta não voltou. ${avisos.join(" ")}${registro}`,
      id: guardada,
      podeTerCobrado,
    };
  }
  return { ok: true, id: guardada, situacao, relatorio, custo, avisos };
}

// ─────────────────────────────────────────────────────────────────────────────
// O histórico
// ─────────────────────────────────────────────────────────────────────────────

export interface ConsultaDeDocumentoNaLista {
  id: string;
  tipo: TipoDeDocumento;
  /** CPF mascarado; CNPJ inteiro (é dado público da empresa). */
  documento: string;
  nome: string | null;
  nivel: Nivel;
  nivelRotulo: string;
  situacao: SituacaoDaConsulta;
  finalidade: string;
  custo: number | null;
  homologacao: boolean;
  quem: string | null;
  quando: string;
}

export type LeituraDoHistoricoDeDocumentos = { ok: true; itens: ConsultaDeDocumentoNaLista[] } | { ok: false; faltaMigracao: boolean; motivo: string };

const COLUNAS_DA_LISTA = "id, tipo_documento, documento, nome, nivel, situacao, finalidade, custo, homologacao, criado_por_nome, criado_em";

function itemDaLista(l: Record<string, unknown>): ConsultaDeDocumentoNaLista | null {
  const tipo = l.tipo_documento === "cpf" || l.tipo_documento === "cnpj" ? l.tipo_documento : null;
  if (!tipo || typeof l.id !== "string" || typeof l.documento !== "string" || typeof l.criado_em !== "string") return null;
  const nivel = String(l.nivel) as Nivel;
  return {
    id: l.id,
    tipo,
    documento: tipo === "cpf" ? mascararCpf(l.documento) : formatarCnpj(l.documento),
    nome: typeof l.nome === "string" ? l.nome : null,
    nivel,
    nivelRotulo: nivelDe(tipo, nivel)?.rotulo ?? nivel,
    situacao: l.situacao === "parcial" || l.situacao === "falhou" ? l.situacao : "completa",
    finalidade: FINALIDADES[l.finalidade as Finalidade] ?? String(l.finalidade),
    custo: numeroDoFornecedor(l.custo),
    homologacao: l.homologacao === true,
    quem: typeof l.criado_por_nome === "string" ? l.criado_por_nome : null,
    quando: l.criado_em,
  };
}

/**
 * O histórico, com pesquisa. Termo com dígitos procura o documento (o começo
 * dele); termo com letras procura o nome. Os mais novos primeiro.
 */
export async function lerHistoricoDeDocumentos(
  supabase: SupabaseClient,
  pedido: { termo: string | null; tipo: TipoDeDocumento | null; limite?: number },
): Promise<LeituraDoHistoricoDeDocumentos> {
  let q = supabase.from("consultas_de_documento").select(COLUNAS_DA_LISTA).order("criado_em", { ascending: false }).limit(pedido.limite ?? 50);
  if (pedido.tipo) q = q.eq("tipo_documento", pedido.tipo);
  const termo = pedido.termo?.trim() ?? "";
  if (termo) {
    const soDocumento = termo.toUpperCase().replace(/[^0-9A-Z]/g, "");
    q = /\d{3,}/.test(termo) && soDocumento.length >= 3 ? q.like("documento", `${soDocumento}%`) : q.ilike("nome", `%${termo.replace(/[%_\\,()*:"']/g, " ").trim()}%`);
  }
  const { data, error } = await q;
  if (error) return { ok: false, faltaMigracao: ehTabelaAusente(error), motivo: error.message };
  return { ok: true, itens: (data ?? []).flatMap((l) => itemDaLista(l as Record<string, unknown>) ?? []) };
}

/**
 * As consultas deste documento que reabrem sem pagar: da janela dos
 * parâmetros, com dados (a que falhou não tem o que reabrir) e do MESMO modo
 * do fornecedor — uma consulta de teste, com dados de exemplo, não é
 * oferecida depois que a loja sai da homologação.
 */
export async function consultasRecentesDoDocumento(
  supabase: SupabaseClient,
  tipo: TipoDeDocumento,
  documento: string,
  opcoes: { dias: number; homologacao: boolean; agora?: Date },
): Promise<ConsultaDeDocumentoNaLista[]> {
  const desde = new Date((opcoes.agora ?? new Date()).getTime() - opcoes.dias * DIA_MS).toISOString();
  const { data, error } = await supabase
    .from("consultas_de_documento")
    .select(COLUNAS_DA_LISTA)
    .eq("tipo_documento", tipo)
    .eq("documento", documento)
    .eq("homologacao", opcoes.homologacao)
    .neq("situacao", "falhou")
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(10);
  if (error) return [];
  return (data ?? []).flatMap((l) => itemDaLista(l as Record<string, unknown>) ?? []);
}

export interface LinkDoRelatorio {
  id: string;
  expiraEm: string;
  revogadoEm: string | null;
  acessos: number;
  ultimoAcessoEm: string | null;
  quem: string | null;
  criadoEm: string;
}

export interface ConsultaAberta {
  id: string;
  item: ConsultaDeDocumentoNaLista;
  relatorio: RelatorioDeDocumento;
  links: LinkDoRelatorio[];
}

/** As colunas de um link que a sessão pode ler — nunca `token_hash` (o banco recusa). */
const COLUNAS_DO_LINK = "id, expira_em, revogado_em, acessos, ultimo_acesso_em, criado_por_nome, criado_em";

export async function abrirConsultaDeDocumento(supabase: SupabaseClient, id: string): Promise<ConsultaAberta | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabase.from("consultas_de_documento").select(`${COLUNAS_DA_LISTA}, relatorio`).eq("id", id).maybeSingle();
  if (error || !data) return null;
  const item = itemDaLista(data as Record<string, unknown>);
  if (!item) return null;
  const { data: links } = await supabase.from("relatorios_compartilhados").select(COLUNAS_DO_LINK).eq("consulta_id", id).order("criado_em", { ascending: false });
  return {
    id,
    item,
    relatorio: (data as { relatorio: RelatorioDeDocumento }).relatorio,
    links: ((links ?? []) as Array<Record<string, unknown>>).map((l) => ({
      id: String(l.id),
      expiraEm: String(l.expira_em),
      revogadoEm: typeof l.revogado_em === "string" ? l.revogado_em : null,
      acessos: numeroDoFornecedor(l.acessos) ?? 0,
      ultimoAcessoEm: typeof l.ultimo_acesso_em === "string" ? l.ultimo_acesso_em : null,
      quem: typeof l.criado_por_nome === "string" ? l.criado_por_nome : null,
      criadoEm: String(l.criado_em),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// O link para enviar
// ─────────────────────────────────────────────────────────────────────────────

/** Cria o link. O token só existe na resposta: o banco guarda o hash. */
export async function criarLinkDoRelatorio(
  supabase: SupabaseClient,
  consultaId: string,
  parametros: Pick<ParametrosDaConsultaDeDocumento, "diasDoLink" | "linksAtivosPorConsulta">,
  agora = new Date(),
): Promise<{ ok: true; url: string; expiraEm: string } | { ok: false; status: 404 | 409 | 502; motivo: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(consultaId)) return { ok: false, status: 404, motivo: "Consulta não encontrada." };
  const { data: consulta } = await supabase.from("consultas_de_documento").select("id, situacao").eq("id", consultaId).maybeSingle();
  if (!consulta) return { ok: false, status: 404, motivo: "Consulta não encontrada." };
  if ((consulta as { situacao?: string }).situacao === "falhou") return { ok: false, status: 409, motivo: "Esta consulta não trouxe dados: não há relatório para enviar." };
  const { count } = await supabase
    .from("relatorios_compartilhados")
    .select("id", { count: "exact", head: true })
    .eq("consulta_id", consultaId)
    .is("revogado_em", null)
    .gt("expira_em", agora.toISOString());
  if ((count ?? 0) >= parametros.linksAtivosPorConsulta) {
    return { ok: false, status: 409, motivo: `Esta consulta já tem ${count} links ativos (o limite é ${parametros.linksAtivosPorConsulta}). Revogue um antes de criar outro.` };
  }
  const token = gerarTokenDoLink();
  const expiraEm = new Date(agora.getTime() + parametros.diasDoLink * DIA_MS).toISOString();
  const { error } = await supabase.from("relatorios_compartilhados").insert({ consulta_id: consultaId, token_hash: hashDoToken(token), expira_em: expiraEm });
  if (error) {
    console.error("[Consulta de documento] link não criado:", error.code, error.message);
    return { ok: false, status: error.code === "23503" ? 404 : 502, motivo: error.code === "23503" ? "Consulta não encontrada." : "Não deu para criar o link." };
  }
  return { ok: true, url: urlDoSite(`${CAMINHO_DO_LINK}/${token}`), expiraEm };
}

export async function revogarLinkDoRelatorio(supabase: SupabaseClient, linkId: string, usuarioId: string): Promise<{ ok: true } | { ok: false; status: 404 | 409 | 502; motivo: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(linkId)) return { ok: false, status: 404, motivo: "Link não encontrado." };
  const { data, error } = await supabase
    .from("relatorios_compartilhados")
    .update({ revogado_em: new Date().toISOString(), revogado_por: usuarioId })
    .eq("id", linkId)
    .is("revogado_em", null)
    .select("id");
  if (error) {
    console.error("[Consulta de documento] link não revogado:", error.code, error.message);
    return { ok: false, status: 502, motivo: "Não deu para revogar o link." };
  }
  return (data ?? []).length > 0 ? { ok: true } : { ok: false, status: 409, motivo: "O link já estava revogado, ou não existe." };
}

/** A página pública: só a função do banco, que recebe o TOKEN, confere validade e revogação e conta o acesso. */
export async function abrirLinkPublico(cliente: SupabaseClient, token: string): Promise<{ relatorio: RelatorioDeDocumento; expiraEm: string } | null> {
  const { data, error } = await cliente.rpc("abrir_relatorio_compartilhado", { p_token: token });
  if (error) {
    console.error("[Relatório compartilhado] a função do link falhou:", error.code, error.message);
    return null;
  }
  const linha = (Array.isArray(data) ? data[0] : data) as { relatorio?: RelatorioDeDocumento; expira_em?: string } | null | undefined;
  return linha?.relatorio && linha.expira_em ? { relatorio: linha.relatorio, expiraEm: linha.expira_em } : null;
}

export { documentoFormatado };
