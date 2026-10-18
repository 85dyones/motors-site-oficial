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
 * Tudo que é gravado ou lido do banco usa o cliente de SESSÃO: a RLS de
 * `consultas_de_documento` e `relatorios_compartilhados` é a porta (os quatro
 * papéis da ação). A página pública do link usa só a função
 * `abrir_relatorio_compartilhado`, que devolve o relatório e nada mais.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ehStaff, perfisDe, podeFazer } from "./permissoes";
import { createServerSupabaseClient } from "./supabase-server";
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
  type RespostaDoProduto,
} from "./consultaDeDocumento";
import type { RelatorioDeDocumento, TipoDeDocumento } from "./relatorioDeDocumento";
import { DIAS_DO_LINK, CAMINHO_DO_LINK, gerarTokenDoLink, hashDoToken } from "./linkDoRelatorio";
import { urlDoSite } from "./site";

export const ACAO_CONSULTAR_DOCUMENTO = "Consultar CPF e CNPJ (consulta paga)";
export const MIGRACAO_DAS_CONSULTAS_DE_DOCUMENTO = "20261018120000_consultas_de_documento";

const GATEWAY = "https://gateway.apibrasil.io/api/v2";
/** Os produtos de crédito juntam vários bureaus; a espera é longa de propósito (a rota tem 60 s). */
export const ESPERA_DO_DOCUMENTO_MS = 40000;

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

// ─────────────────────────────────────────────────────────────────────────────
// A rede: um produto, uma chamada
// ─────────────────────────────────────────────────────────────────────────────

export type BuscarNoGateway = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ status: number; json: () => Promise<unknown> }>;

export type ChamadaDoProduto =
  | { ok: true; dados: unknown; custo: number | null }
  | {
      ok: false;
      motivo: string;
      /** Problema da conta (saldo, token): os outros produtos da mesma consulta também vão falhar. */
      daConta: boolean;
      /** A resposta não chegou: a consulta PODE ter sido cobrada. */
      podeTerCobrado: boolean;
    };

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Lê a resposta de um produto. Puro: os testes passam corpos de mentira. */
export function lerChamadaDoProduto(status: number, corpo: unknown): ChamadaDoProduto {
  if (status === 402) return { ok: false, motivo: "a conta da APIBrasil está sem saldo", daConta: true, podeTerCobrado: false };
  if (status === 401 || status === 403) return { ok: false, motivo: "a APIBrasil recusou o token da loja (APIBRASIL_TOKEN)", daConta: true, podeTerCobrado: false };
  if (status >= 500) return { ok: false, motivo: `a APIBrasil está fora do ar (HTTP ${status})`, daConta: false, podeTerCobrado: true };
  const c = objeto(corpo);
  if (!c) return { ok: false, motivo: "a APIBrasil respondeu algo ilegível", daConta: false, podeTerCobrado: true };
  const mensagem = typeof c.message === "string" && c.message.trim() ? c.message.trim().slice(0, 200) : null;
  const interno = objeto(c.response);
  if (status >= 400 || c.error === true || interno?.error === true) {
    const texto = mensagem ?? (typeof interno?.message === "string" ? interno.message.slice(0, 200) : null);
    if (texto && /saldo|cr[ée]dito insuficiente/i.test(texto)) return { ok: false, motivo: "a conta da APIBrasil está sem saldo", daConta: true, podeTerCobrado: false };
    return { ok: false, motivo: texto ? `a APIBrasil recusou: ${texto}` : `a APIBrasil recusou a consulta (HTTP ${status})`, daConta: false, podeTerCobrado: false };
  }
  // O miolo: `data` na maioria; `response.data` no Acerta Essencial Plus.
  const dados = c.data ?? pegar(c, "response.data") ?? null;
  if (dados === null || dados === undefined) return { ok: false, motivo: "a APIBrasil respondeu sem os dados", daConta: false, podeTerCobrado: true };
  return { ok: true, dados, custo: numeroDoFornecedor(c.valor_consulta) ?? numeroDoFornecedor(c.tax) };
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
    return lerChamadaDoProduto(r.status, await r.json().catch(() => null));
  } catch (erro) {
    const estourou = (erro as Error)?.name === "AbortError";
    return {
      ok: false,
      motivo: estourou ? "a APIBrasil não respondeu a tempo; a consulta PODE ter sido cobrada" : "não deu para falar com a APIBrasil; a consulta PODE ter sido cobrada",
      daConta: false,
      podeTerCobrado: true,
    };
  } finally {
    clearTimeout(relogio);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A consulta inteira
// ─────────────────────────────────────────────────────────────────────────────

export type ResultadoDaConsulta =
  | { ok: true; id: string | null; relatorio: RelatorioDeDocumento; custo: number | null; avisos: string[] }
  | { ok: false; status: 400 | 402 | 502 | 503; motivo: string };

/**
 * Chama os produtos do nível (todos de uma vez: são dois ou três), monta o
 * relatório e grava. Se nenhum produto respondeu, nada é gravado. Se alguns
 * responderam, grava com o que faltou escrito no relatório.
 */
export async function executarConsulta(
  supabase: SupabaseClient,
  pedido: PedidoDeDocumento,
  deps: { token: string | null; homologacao: boolean; buscar?: BuscarNoGateway; agora?: () => Date },
): Promise<ResultadoDaConsulta> {
  if (!deps.token) return { ok: false, status: 503, motivo: "Falta APIBRASIL_TOKEN neste ambiente: sem ele nenhuma consulta sai." };
  const nivel = nivelDe(pedido.tipo, pedido.nivel);
  if (!nivel) return { ok: false, status: 400, motivo: "Nível de consulta inválido para este documento." };

  const chamadas = await Promise.all(
    nivel.produtos.map(async (produto) => ({ produto, chamada: await consultarProduto(produto, pedido.tipo, pedido.documento, { token: deps.token!, homologacao: deps.homologacao, buscar: deps.buscar }) })),
  );
  const respostas: RespostaDoProduto[] = chamadas.map(({ produto, chamada }) => (chamada.ok ? { produto, ok: true, dados: chamada.dados } : { produto, ok: false, motivo: chamada.motivo }));
  const certos = chamadas.filter((c) => c.chamada.ok);
  const avisos = chamadas.flatMap(({ produto, chamada }) => (!chamada.ok && chamada.podeTerCobrado ? [`${PRODUTOS[produto].nome}: ${chamada.motivo}. Confira o saldo no painel da APIBrasil antes de consultar de novo.`] : []));

  if (certos.length === 0) {
    const daConta = chamadas.find((c) => !c.chamada.ok && c.chamada.daConta);
    const motivo = chamadas.map(({ produto, chamada }) => (!chamada.ok ? `${PRODUTOS[produto].nome}: ${chamada.motivo}` : "")).filter(Boolean).join(" · ");
    console.warn("[Consulta de documento] nenhum produto respondeu", { tipo: pedido.tipo, nivel: pedido.nivel, motivo });
    return daConta && !daConta.chamada.ok && /saldo/.test(daConta.chamada.motivo)
      ? { ok: false, status: 402, motivo: "A conta da APIBrasil está sem saldo. Ponha crédito no painel deles e consulte de novo." }
      : { ok: false, status: 502, motivo: `A consulta não voltou. ${motivo}.` };
  }

  const geradoEm = (deps.agora?.() ?? new Date()).toISOString();
  const relatorio = montarRelatorio(pedido, respostas, { geradoEm, homologacao: deps.homologacao });
  const custos = certos.map((c) => (c.chamada.ok ? c.chamada.custo : null));
  // Em homologação nada é cobrado. Fora dela, sem o custo de algum produto, a soma não é confiável.
  const custo = deps.homologacao ? 0 : custos.some((c) => c === null) ? null : Math.round(custos.reduce<number>((s, c) => s + (c ?? 0), 0) * 100) / 100;

  const { data, error } = await supabase
    .from("consultas_de_documento")
    .insert({
      tipo_documento: pedido.tipo,
      documento: pedido.documento,
      nivel: pedido.nivel,
      produtos: nivel.produtos,
      nome: relatorio.titular?.slice(0, 200) ?? null,
      relatorio,
      respostas: Object.fromEntries(chamadas.flatMap(({ produto, chamada }) => (chamada.ok ? [[produto, chamada.dados]] : []))),
      custo,
      homologacao: deps.homologacao,
      finalidade: pedido.finalidade,
      titular_ciente: true,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[Consulta de documento] a consulta paga não foi gravada:", error.code, error.message);
    avisos.push(
      ehTabelaAusente(error)
        ? `A consulta foi feita, mas não ficou guardada: falta a migração ${MIGRACAO_DAS_CONSULTAS_DE_DOCUMENTO}. Imprima agora; sem ela não há histórico nem link.`
        : "A consulta foi feita, mas não ficou guardada no histórico. Imprima agora; sem o registro não há link.",
    );
  }
  console.info("[Consulta de documento]", { tipo: pedido.tipo, nivel: pedido.nivel, produtos: nivel.produtos, custo, homologacao: deps.homologacao, falharam: respostas.filter((r) => !r.ok).length });
  return { ok: true, id: (data as { id?: string } | null)?.id ?? null, relatorio, custo, avisos };
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
  finalidade: string;
  custo: number | null;
  homologacao: boolean;
  quem: string | null;
  quando: string;
}

export type LeituraDoHistoricoDeDocumentos = { ok: true; itens: ConsultaDeDocumentoNaLista[] } | { ok: false; faltaMigracao: boolean; motivo: string };

const COLUNAS_DA_LISTA = "id, tipo_documento, documento, nome, nivel, finalidade, custo, homologacao, criado_por_nome, criado_em";

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

/** As consultas já feitas deste documento (para reabrir sem pagar), dos últimos 90 dias. */
export async function consultasRecentesDoDocumento(supabase: SupabaseClient, tipo: TipoDeDocumento, documento: string, agora = new Date()): Promise<ConsultaDeDocumentoNaLista[]> {
  const desde = new Date(agora.getTime() - 90 * 86400000).toISOString();
  const { data, error } = await supabase
    .from("consultas_de_documento")
    .select(COLUNAS_DA_LISTA)
    .eq("tipo_documento", tipo)
    .eq("documento", documento)
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

export async function abrirConsultaDeDocumento(supabase: SupabaseClient, id: string): Promise<ConsultaAberta | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabase.from("consultas_de_documento").select(`${COLUNAS_DA_LISTA}, relatorio`).eq("id", id).maybeSingle();
  if (error || !data) return null;
  const item = itemDaLista(data as Record<string, unknown>);
  if (!item) return null;
  const { data: links } = await supabase
    .from("relatorios_compartilhados")
    .select("id, expira_em, revogado_em, acessos, ultimo_acesso_em, criado_por_nome, criado_em")
    .eq("consulta_id", id)
    .order("criado_em", { ascending: false });
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
  agora = new Date(),
): Promise<{ ok: true; url: string; expiraEm: string } | { ok: false; status: 404 | 502; motivo: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(consultaId)) return { ok: false, status: 404, motivo: "Consulta não encontrada." };
  const token = gerarTokenDoLink();
  const expiraEm = new Date(agora.getTime() + DIAS_DO_LINK * 86400000).toISOString();
  const { error } = await supabase.from("relatorios_compartilhados").insert({ consulta_id: consultaId, token_hash: hashDoToken(token), expira_em: expiraEm });
  if (error) {
    console.error("[Consulta de documento] link não criado:", error.code, error.message);
    return { ok: false, status: error.code === "23503" ? 404 : 502, motivo: error.code === "23503" ? "Consulta não encontrada." : "Não deu para criar o link." };
  }
  return { ok: true, url: urlDoSite(`${CAMINHO_DO_LINK}/${token}`), expiraEm };
}

export async function revogarLinkDoRelatorio(supabase: SupabaseClient, linkId: string, usuarioId: string): Promise<{ ok: boolean; motivo?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(linkId)) return { ok: false, motivo: "Link não encontrado." };
  const { data, error } = await supabase
    .from("relatorios_compartilhados")
    .update({ revogado_em: new Date().toISOString(), revogado_por: usuarioId })
    .eq("id", linkId)
    .is("revogado_em", null)
    .select("id");
  if (error) return { ok: false, motivo: "Não deu para revogar o link." };
  return (data ?? []).length > 0 ? { ok: true } : { ok: false, motivo: "O link já estava revogado, ou não existe." };
}

/** A página pública: só a função do banco, que confere validade e conta o acesso. */
export async function abrirLinkPublico(
  cliente: SupabaseClient,
  token: string,
): Promise<{ relatorio: RelatorioDeDocumento; expiraEm: string } | null> {
  const { data, error } = await cliente.rpc("abrir_relatorio_compartilhado", { p_token_hash: hashDoToken(token) });
  if (error) {
    console.error("[Relatório compartilhado] a função do link falhou:", error.code, error.message);
    return null;
  }
  const linha = (Array.isArray(data) ? data[0] : data) as { relatorio?: RelatorioDeDocumento; expira_em?: string } | null | undefined;
  return linha?.relatorio && linha.expira_em ? { relatorio: linha.relatorio, expiraEm: linha.expira_em } : null;
}

export { documentoFormatado };
