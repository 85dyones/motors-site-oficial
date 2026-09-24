import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "./supabase-server";
import { ehStaff, perfisDe, podeFazer } from "./permissoes";
import { loteParaBanco, type LoteNormalizado, type Plataforma } from "./midiaSync";

/**
 * O lado de servidor comum às duas rotas de sincronização. Tudo aqui usa a
 * service role: `midia_diario` e `midia_sincronizacoes` não têm policy de
 * escrita para `authenticated`, e as duas funções do banco são só dela.
 */

export type NomeDoSegredo = "midia_cron_segredo" | "midia_google_segredo";

/** O valor recebido confere com o segredo do Vault? O banco responde; o site nunca lê o segredo. */
export async function segredoConfere(
  admin: SupabaseClient,
  nome: NomeDoSegredo,
  valor: string | null | undefined,
): Promise<boolean> {
  if (!valor) return false;
  const { data, error } = await admin.rpc("midia_confere_segredo", { p_nome: nome, p_valor: valor });
  if (error) {
    console.error(`[Mídia sync] conferência de segredo falhou: ${error.message}`);
    return false;
  }
  return data === true;
}

/** Sessão de staff com "Gerenciar campanhas de mídia paga" — o botão do painel. */
export async function staffPodeSincronizar(): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis")
    .eq("id", user.id)
    .single();
  if (!ehStaff(profile)) return false;
  return podeFazer(perfisDe(profile), "Gerenciar campanhas de mídia paga") === "faz";
}

export async function gravarLote(
  admin: SupabaseClient,
  lote: LoteNormalizado,
): Promise<{ campanhas: number; dias: number }> {
  const { data, error } = await admin.rpc("midia_gravar_lote", { p: loteParaBanco(lote) });
  if (error) throw new Error(`gravação no banco falhou: ${error.message}`);
  return data as { campanhas: number; dias: number };
}

export async function registrarRodada(
  admin: SupabaseClient,
  r: {
    plataforma: Plataforma;
    gatilho: string;
    iniciadaEm: Date;
    ok: boolean;
    campanhas?: number;
    dias?: number;
    erro?: string;
  },
): Promise<void> {
  const { error } = await admin.from("midia_sincronizacoes").insert({
    plataforma: r.plataforma,
    gatilho: r.gatilho,
    iniciada_em: r.iniciadaEm.toISOString(),
    terminada_em: new Date().toISOString(),
    ok: r.ok,
    campanhas: r.campanhas ?? null,
    dias: r.dias ?? null,
    erro: r.erro ? r.erro.slice(0, 500) : null,
  });
  if (error) console.error(`[Mídia sync] registro da rodada falhou: ${error.message}`);
}
