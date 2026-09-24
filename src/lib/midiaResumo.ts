import type { SupabaseClient } from "@supabase/supabase-js";
import {
  campanhaDoLead,
  estadoDaSincronizacao,
  janelaDeDias,
  type EstadoSincronizacao,
  type Plataforma,
  type Rodada,
} from "./midiaSync";

/**
 * O resumo de mídia paga da visão geral (`/admin`): últimos 7 dias por
 * plataforma, nas duas réguas de lead, mais o estado da sincronização.
 * Qualquer erro de leitura devolve `null` — a visão geral segue de pé sem o
 * cartão, como já faz com os leads antes da migração deles.
 */

export interface ResumoPlataforma {
  investido: number;
  leadsPlataforma: number;
  /** `null` = tabela de leads indisponível. */
  leadsBanco: number | null;
  noAr: number;
  sincronizacao: EstadoSincronizacao;
}

export type ResumoMidia = Record<Plataforma, ResumoPlataforma>;

export const DIAS_DO_RESUMO = 7;

export async function resumoDeMidia(supabase: SupabaseClient): Promise<ResumoMidia | null> {
  const janela = janelaDeDias(DIAS_DO_RESUMO);

  const [campRes, diarioRes, rodadasRes, leadsRes] = await Promise.all([
    supabase.from("midia_campanhas").select("id, plataforma, situacao, id_externo, nome"),
    supabase
      .from("midia_diario")
      .select("campanha_id, investido, conversoes")
      .gte("dia", janela.de)
      .lte("dia", janela.ate)
      .limit(20000),
    supabase
      .from("midia_sincronizacoes")
      .select("plataforma, iniciada_em, ok, erro")
      .order("iniciada_em", { ascending: false })
      .limit(200),
    supabase
      .from("leads")
      .select("utm_campaign")
      .not("utm_campaign", "is", null)
      .gte("created_at", `${janela.de}T00:00:00-03:00`)
      .limit(5000),
  ]);

  if (campRes.error || diarioRes.error || rodadasRes.error) return null;

  const campanhas = campRes.data ?? [];
  const plataformaDe = new Map(campanhas.map((c) => [c.id, c.plataforma as Plataforma]));
  const rodadas = (rodadasRes.data ?? []) as Rodada[];

  const vazio = (p: Plataforma): ResumoPlataforma => ({
    investido: 0,
    leadsPlataforma: 0,
    leadsBanco: leadsRes.error ? null : 0,
    noAr: campanhas.filter((c) => c.plataforma === p && c.situacao === "no_ar").length,
    sincronizacao: estadoDaSincronizacao(rodadas, p),
  });
  const resumo: ResumoMidia = { meta: vazio("meta"), google: vazio("google") };

  for (const l of diarioRes.data ?? []) {
    const p = plataformaDe.get(l.campanha_id);
    if (!p) continue;
    resumo[p].investido += Number(l.investido || 0);
    resumo[p].leadsPlataforma += Number(l.conversoes || 0);
  }

  if (!leadsRes.error) {
    const ref = campanhas.map((c) => ({ id: c.id, idExterno: c.id_externo, nome: c.nome }));
    for (const l of leadsRes.data ?? []) {
      const id = campanhaDoLead(l.utm_campaign, ref);
      const p = id ? plataformaDe.get(id) : undefined;
      if (p) resumo[p].leadsBanco = (resumo[p].leadsBanco ?? 0) + 1;
    }
  }

  for (const p of ["meta", "google"] as const) {
    resumo[p].investido = Math.round(resumo[p].investido * 100) / 100;
    resumo[p].leadsPlataforma = Math.round(resumo[p].leadsPlataforma * 100) / 100;
  }
  return resumo;
}
