/**
 * A porta e o banco da consulta de placa — só servidor.
 *
 * Quem consulta é a linha "Consultar placa de veículo (consulta paga)" da
 * matriz: Administrador, Gestor e Comercial, com conta ativa. Três camadas, a
 * mesma régua: o trilho só mostra o item a esses papéis, a página e a rota
 * conferem aqui, e a RLS de `consultas_de_placa` confere de novo no banco.
 *
 * Tudo com o cliente de SESSÃO: é ele que faz `auth.uid()` valer na RLS e no
 * gatilho que carimba quem consultou.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACAO_CONSULTAR_PLACA, qualificarCompra, type NivelDaQualificacao, type RetratoDaConsulta } from "./consultaDePlaca";
import { ehStaff, perfisDe, podeFazer } from "./permissoes";
import { createServerSupabaseClient } from "./supabase-server";

export const MIGRACAO_DA_CONSULTA_DE_PLACA = "20261006180000_consultas_de_placa";

export type PortaDaConsultaDePlaca =
  | { ok: true; supabase: SupabaseClient }
  | { ok: false; status: 401 | 403; motivo: string };

export async function autorizarConsultaDePlaca(): Promise<PortaDaConsultaDePlaca> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, motivo: "Não autenticado." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis, is_active")
    .eq("id", user.id)
    .single();
  if (!ehStaff(profile) || profile?.is_active !== true || podeFazer(perfisDe(profile), ACAO_CONSULTAR_PLACA) !== "faz") {
    return {
      ok: false,
      status: 403,
      motivo: "A consulta de placa é do Administrador, do Gestor e do Comercial.",
    };
  }
  return { ok: true, supabase };
}

/** Uma consulta guardada, como a tela a recebe. */
export interface ConsultaGuardada {
  id: string | null;
  placa: string;
  retrato: RetratoDaConsulta;
  custo: number | null;
  homologacao: boolean;
  criadoEm: string;
  consultadoPor: string | null;
  /** Desde a consulta por níveis (19/10/2026). Ausentes = Veículos Total. */
  nivel?: "basico" | "intermediario" | "economico" | "completo";
  produtos?: Array<"estadual" | "recall" | "fipe" | "check-list" | "historico-proprietarios" | "veiculos-total">;
  /** As leituras de cada produto, sem dado pessoal, para o aprofundar reaproveitar. */
  fragmentos?: Record<string, unknown>;
}

const COLUNAS_ANTIGAS = "id, placa, retrato, custo, homologacao, criado_em, consultado_por_nome";
const COLUNAS = `${COLUNAS_ANTIGAS}, nivel, produtos, fragmentos`;

/**
 * Coluna que não existe (42703): a migração dos níveis ainda não foi
 * aplicada. A leitura cai para as colunas antigas, e a tela continua abrindo
 * as consultas guardadas.
 */
const semColunaNova = (erro: { code?: string; message?: string } | null) => erro?.code === "42703" || /column .* does not exist/i.test(erro?.message ?? "");

export function linhaParaConsulta(linha: unknown): ConsultaGuardada | null {
  if (!linha || typeof linha !== "object") return null;
  const l = linha as Record<string, unknown>;
  if (typeof l.placa !== "string" || !l.retrato || typeof l.retrato !== "object" || typeof l.criado_em !== "string") {
    return null;
  }
  const custo = typeof l.custo === "string" ? Number(l.custo) : l.custo;
  const nivel = l.nivel === "basico" || l.nivel === "intermediario" || l.nivel === "economico" || l.nivel === "completo" ? l.nivel : undefined;
  return {
    id: typeof l.id === "string" ? l.id : null,
    placa: l.placa,
    retrato: l.retrato as RetratoDaConsulta,
    custo: typeof custo === "number" && Number.isFinite(custo) ? custo : null,
    homologacao: l.homologacao === true,
    criadoEm: l.criado_em,
    consultadoPor: typeof l.consultado_por_nome === "string" ? l.consultado_por_nome : null,
    ...(nivel ? { nivel } : {}),
    ...(Array.isArray(l.produtos) ? { produtos: l.produtos as NonNullable<ConsultaGuardada["produtos"]> } : {}),
    ...(l.fragmentos && typeof l.fragmentos === "object" && !Array.isArray(l.fragmentos) ? { fragmentos: l.fragmentos as Record<string, unknown> } : {}),
  };
}

/** "relation does not exist" no Postgres, "tabela fora do cache de schema" no PostgREST. */
export function ehTabelaAusente(erro: { code?: string; message?: string }): boolean {
  return erro.code === "42P01" || erro.code === "PGRST205" || /does not exist|could not find the table/i.test(erro.message ?? "");
}

export type LeituraDaUltima =
  | { ok: true; consulta: ConsultaGuardada | null }
  | { ok: false; faltaMigracao: boolean; motivo: string };

/** A consulta mais recente de uma placa: é ela que evita pagar duas vezes. */
export async function lerUltimaConsulta(supabase: SupabaseClient, placa: string): Promise<LeituraDaUltima> {
  const ler = (colunas: string) => supabase.from("consultas_de_placa").select(colunas).eq("placa", placa).order("criado_em", { ascending: false }).limit(1);
  let { data, error } = await ler(COLUNAS);
  if (semColunaNova(error)) ({ data, error } = await ler(COLUNAS_ANTIGAS));
  if (error) return { ok: false, faltaMigracao: ehTabelaAusente(error), motivo: error.message };
  return { ok: true, consulta: linhaParaConsulta(data?.[0]) };
}

/** Uma linha da lista "consultas recentes": o bastante para reabrir sem pagar. */
export interface ConsultaRecente {
  placa: string;
  descricao: string | null;
  criadoEm: string;
  consultadoPor: string | null;
  /** A qualificação pelos registros, sem o km e o estado que só a tela pergunta. */
  nivel: NivelDaQualificacao;
  /** O nível da consulta (básico… completo); as antigas são o completo. */
  nivelDaConsulta: NonNullable<ConsultaGuardada["nivel"]>;
}

export type LeituraDasRecentes =
  | { ok: true; consultas: ConsultaRecente[] }
  | { ok: false; faltaMigracao: boolean; motivo: string };

/** As últimas placas consultadas, uma linha por placa (a consulta mais nova de cada). */
export async function lerConsultasRecentes(supabase: SupabaseClient, limite = 12): Promise<LeituraDasRecentes> {
  // Folga para as repetições da mesma placa não esvaziarem a lista. Sem os fragmentos: a lista não precisa deles.
  const ler = (colunas: string) => supabase.from("consultas_de_placa").select(colunas).order("criado_em", { ascending: false }).limit(limite * 3);
  let { data, error } = await ler(`${COLUNAS_ANTIGAS}, nivel`);
  if (semColunaNova(error)) ({ data, error } = await ler(COLUNAS_ANTIGAS));
  if (error) return { ok: false, faltaMigracao: ehTabelaAusente(error), motivo: error.message };

  const vistas = new Set<string>();
  const consultas: ConsultaRecente[] = [];
  for (const linha of data ?? []) {
    const c = linhaParaConsulta(linha);
    if (!c || vistas.has(c.placa)) continue;
    vistas.add(c.placa);
    consultas.push({
      placa: c.placa,
      descricao: c.retrato.veiculo?.descricao ?? null,
      criadoEm: c.criadoEm,
      consultadoPor: c.consultadoPor,
      nivel: qualificarCompra({ ...c.retrato, apontamentos: c.retrato.apontamentos ?? [], naoVeio: c.retrato.naoVeio ?? [] }).nivel,
      nivelDaConsulta: c.nivel ?? c.retrato.nivel ?? "completo",
    });
    if (consultas.length === limite) break;
  }
  return { ok: true, consultas };
}

/** Grava a consulta que acabou de ser paga. Devolve a linha gravada, ou o motivo. */
export async function gravarConsulta(
  supabase: SupabaseClient,
  dados: { placa: string; produto: string; retrato: RetratoDaConsulta; custo: number | null; homologacao: boolean },
): Promise<{ ok: true; consulta: ConsultaGuardada } | { ok: false; motivo: string }> {
  const { data, error } = await supabase
    .from("consultas_de_placa")
    .insert({
      placa: dados.placa,
      produto: dados.produto,
      retrato: dados.retrato,
      custo: dados.custo,
      homologacao: dados.homologacao,
    })
    .select(COLUNAS)
    .single();
  if (error) return { ok: false, motivo: error.message };
  const consulta = linhaParaConsulta(data);
  return consulta ? { ok: true, consulta } : { ok: false, motivo: "O banco devolveu a linha gravada num formato inesperado." };
}
