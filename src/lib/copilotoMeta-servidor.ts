import type { SupabaseClient } from "@supabase/supabase-js";
import { diagnosticoDevido } from "./copilotoDeMidia";
import { lerRegras, meiaNoite } from "./copilotoDeMidia-servidor";
import {
  DIAS_DA_JANELA_META,
  DIAS_DA_QUALIDADE,
  FUSO_DO_META,
  diagnosticarMeta,
  diagnosticoMetaParaBanco,
  leadQualificado,
  somarDias,
  type AnuncioDoMeta,
  type CampanhaDoMeta,
  type DiaDoMeta,
  type LeadDoMeta,
  type RetratoDoMeta,
} from "./copilotoMeta";
import { janelaDeDias, type Situacao } from "./midiaSync";

/**
 * O Copiloto do Meta no servidor (17/10/2026): monta o retrato com a chave de
 * serviço e grava pela MESMA `midia_copiloto_gravar_diagnostico` do Google,
 * com `plataforma: 'meta'`. Quem chama é a rodada agendada da sincronização do
 * Meta (`/api/marketing/sincronizar/meta`, pg_cron de hora em hora), depois de
 * sincronizar: o diagnóstico sai uma vez por dia, a partir da hora das regras.
 *
 * A chave de serviço ignora a RLS. Tudo aqui filtra pela plataforma; as
 * tabelas de mídia ainda não têm loja (até a S1 a conta do Meta é uma só), e o
 * diagnóstico é gravado e procurado na loja da `org_padrao()`.
 */

const situacoes = new Set<Situacao>(["no_ar", "pausada", "planejada", "encerrada"]);
const situacaoOuNula = (v: unknown): Situacao | null => (typeof v === "string" && situacoes.has(v as Situacao) ? (v as Situacao) : null);

/** O dia (YYYY-MM-DD) de um instante no fuso da conta. */
const diaNoFuso = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: FUSO_DO_META });

/** O retrato de hoje: 14 dias completos para o gasto, 30 para a qualidade. */
export async function montarRetratoMeta(admin: SupabaseClient, conta: string, agora: Date = new Date()): Promise<RetratoDoMeta> {
  const janela = janelaDeDias(DIAS_DA_JANELA_META, agora, false);
  const janelaQualidade = { de: somarDias(janela.ate, -(DIAS_DA_QUALIDADE - 1)), ate: janela.ate };

  const camp = await admin
    .from("midia_campanhas")
    .select("id, id_externo, nome, situacao, orcamento_diario")
    .eq("plataforma", "meta")
    .not("id_externo", "is", null);
  if (camp.error) throw Object.assign(new Error(camp.error.message), { code: camp.error.code });
  const linhasCamp = (camp.data ?? []) as Array<Record<string, unknown>>;
  const externoDe = new Map(linhasCamp.map((c) => [String(c.id), String(c.id_externo)]));
  const campanhas: CampanhaDoMeta[] = linhasCamp.map((c) => ({
    id: String(c.id_externo),
    nome: String(c.nome),
    situacao: situacaoOuNula(c.situacao) ?? "encerrada",
    verba: c.orcamento_diario === null || c.orcamento_diario === undefined ? null : Number(c.orcamento_diario),
  }));
  const uuids = [...externoDe.keys()];
  if (uuids.length === 0) return { conta, janela, janelaQualidade, campanhas: [], anuncios: [], dias: [], leads: [] };

  const [an, diario] = await Promise.all([
    admin
      .from("midia_anuncios")
      .select("id, campanha_id, id_externo, nome, conjunto_id_externo, conjunto_nome, situacao, conjunto_situacao")
      .in("campanha_id", uuids),
    admin
      .from("midia_diario")
      .select("campanha_id, anuncio_id, dia, investido, impressoes, cliques, conversoes")
      .in("campanha_id", uuids)
      .gte("dia", janela.de)
      .lte("dia", janela.ate)
      .limit(20000),
  ]);
  if (an.error) throw Object.assign(new Error(an.error.message), { code: an.error.code });
  if (diario.error) throw Object.assign(new Error(diario.error.message), { code: diario.error.code });

  const linhasAn = (an.data ?? []) as Array<Record<string, unknown>>;
  const anuncioExternoDe = new Map(linhasAn.map((a) => [String(a.id), String(a.id_externo)]));
  const anuncios: AnuncioDoMeta[] = linhasAn
    .filter((a) => externoDe.has(String(a.campanha_id)))
    .map((a) => ({
      id: String(a.id_externo),
      nome: String(a.nome),
      campanhaId: externoDe.get(String(a.campanha_id)) as string,
      conjuntoId: (a.conjunto_id_externo as string | null) ?? null,
      conjuntoNome: (a.conjunto_nome as string | null) ?? null,
      situacao: situacaoOuNula(a.situacao),
      conjuntoSituacao: situacaoOuNula(a.conjunto_situacao),
    }));
  const dias: DiaDoMeta[] = ((diario.data ?? []) as Array<Record<string, unknown>>).map((d) => ({
    campanhaId: externoDe.get(String(d.campanha_id)) as string,
    anuncioId: d.anuncio_id ? (anuncioExternoDe.get(String(d.anuncio_id)) ?? null) : null,
    dia: String(d.dia),
    gasto: Number(d.investido ?? 0),
    impressoes: Number(d.impressoes ?? 0),
    cliques: Number(d.cliques ?? 0),
    leads: Number(d.conversoes ?? 0),
  }));

  // Os leads dos 30 dias que vieram de uma campanha do Meta. Só origem, data e
  // etapa saem do banco: nenhum dado de pessoa.
  const ids = campanhas.map((c) => c.id);
  const ld = await admin
    .from("leads")
    .select("utm_campaign, utm_content, created_at, situacao, desfecho")
    .in("utm_campaign", ids)
    .gte("created_at", meiaNoite(janelaQualidade.de, FUSO_DO_META).toISOString())
    .lt("created_at", meiaNoite(somarDias(janelaQualidade.ate, 1), FUSO_DO_META).toISOString())
    .limit(5000);
  if (ld.error) throw Object.assign(new Error(ld.error.message), { code: ld.error.code });
  const leads: LeadDoMeta[] = ((ld.data ?? []) as Array<Record<string, unknown>>).map((l) => {
    const qualificado = leadQualificado(l.situacao as string | null, l.desfecho as string | null);
    return {
      campanhaId: (l.utm_campaign as string | null) ?? null,
      anuncioId: (l.utm_content as string | null) ?? null,
      dia: diaNoFuso(String(l.created_at)),
      qualificado,
      aberto: !qualificado && (l.desfecho === null || l.desfecho === undefined),
    };
  });

  return { conta, janela, janelaQualidade, campanhas, anuncios, dias, leads };
}

export type RodadaDoDiagnosticoMeta =
  | { feito: false; motivo: string }
  | { feito: true; diagnostico: string; achados: number; propostas: number; puladas: number; descartadas: number };

/**
 * O diagnóstico do dia, se for a hora e ainda não houver o de hoje. Sem regras
 * vigentes não roda (não há número de reserva no código, a mesma regra do Google).
 */
export async function rodarDiagnosticoMeta(admin: SupabaseClient, conta: string, agora: Date = new Date()): Promise<RodadaDoDiagnosticoMeta> {
  const { data: org, error: eOrg } = await admin.rpc("org_padrao");
  if (eOrg || typeof org !== "string") return { feito: false, motivo: `a loja não pôde ser lida: ${eOrg?.message ?? "org_padrao() vazia"}` };

  const regras = await lerRegras(admin, org);
  if (!regras.ok) return { feito: false, motivo: regras.motivo };

  const ultimo = await admin
    .from("midia_copiloto_diagnosticos")
    .select("recebido_em")
    .eq("org_id", org)
    .eq("plataforma", "meta")
    .eq("previa", false)
    .order("recebido_em", { ascending: false })
    .limit(1);
  if (ultimo.error) throw Object.assign(new Error(ultimo.error.message), { code: ultimo.error.code });
  const recebidoEm = (ultimo.data?.[0]?.recebido_em as string | undefined) ?? null;
  if (!diagnosticoDevido(recebidoEm, agora, FUSO_DO_META, regras.valor.parametros.horaDoDiagnostico)) {
    return { feito: false, motivo: "o diagnóstico de hoje já foi feito, ou ainda não é a hora" };
  }

  const retrato = await montarRetratoMeta(admin, conta, agora);
  const resultado = diagnosticarMeta(retrato, regras.valor.parametros);
  const { data, error } = await admin.rpc("midia_copiloto_gravar_diagnostico", { p: diagnosticoMetaParaBanco(retrato, resultado) });
  if (error) throw Object.assign(new Error(`gravação do diagnóstico do Meta falhou: ${error.message}`), { code: error.code });
  const g = data as { diagnostico: string; achados: number; propostas: number; puladas: number; descartadas: number };
  return { feito: true, ...g };
}
