import type { SupabaseClient } from "@supabase/supabase-js";
import { ehTabelaOuColunaAusente } from "./erroDeSchema";
import { ETIQUETAS_DA_PASSAGEM, ehEtiquetaDaPassagem, lerMudanca, limparEtiquetas, normalizarEtiquetas } from "./etiquetas";

/**
 * As etiquetas do LEAD (2026-09-25; moram no lead desde 2026-10-20).
 *
 * Até 20/10 a etiqueta morava na conversa do Chatwoot, e este arquivo era a
 * ponte entre o card e a API de lá. Com o atendimento 2.0 o Chatwoot sai de
 * cena (decisão do dono: *"gostaria de manter a questão das tags no lead"*), e
 * a lista mora em `leads.etiquetas` — gravada só pela função
 * `editar_etiquetas_do_lead` (migração 20261023120000), que aplica a mudança
 * sob trava e deixa o rastro de sempre (`registrar_etiquetas_do_lead`). As
 * rotas (`/api/leads/gerenciar` e `/api/leads/etiquetas`) só checam sessão e
 * escopo e chamam daqui.
 */

interface AtendimentoComData {
  iniciado_em?: string | null;
  created_at?: string | null;
}

/** `coalesce(iniciado_em, created_at)` decrescente — a régua do banco. */
export function maisRecentePrimeiro<T extends AtendimentoComData>(lista: readonly T[]): T[] {
  return [...lista].sort((a, b) =>
    String(b.iniciado_em ?? b.created_at ?? "").localeCompare(String(a.iniciado_em ?? a.created_at ?? "")),
  );
}

/**
 * O que o card oferece para pôr: as etiquetas que já estão nos leads lidos,
 * no formato que o site pode gravar. Em ordem alfabética, para a lista não
 * mudar de lugar a cada leitura.
 *
 * Sem "resgate" e "reaquecido": elas são da passagem, e só da passagem. Postas
 * à mão, marcariam como resgate um lead que o SDR não passou — e o relatório
 * de resgates contaria trabalho que não houve.
 */
export function etiquetasConhecidas(...listas: ReadonlyArray<unknown>[]): string[] {
  return normalizarEtiquetas(listas.flat())
    .filter((e) => !ehEtiquetaDaPassagem(e))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/**
 * Se o banco já guarda a lista no lead (migração 20261023120000): a coluna
 * vem em todo `select("*")` de `leads` e é `not null`. Sem ela, o card mostra
 * as etiquetas da conversa e não oferece editar — oferecer e falhar no clique
 * é pior. Lista vazia não diz nada, e aí vale o banco novo: não há card para
 * enganar.
 */
export function leadsGuardamEtiquetas(leads: ReadonlyArray<{ etiquetas?: unknown }>): boolean {
  return leads.every((l) => Array.isArray(l.etiquetas));
}

// ----------------------------------------------------------------------------
// A passagem do SDR
// ----------------------------------------------------------------------------

export interface EtiquetasDaPassagem {
  /** As etiquetas do lead depois da passagem, quando deu para gravar. */
  etiquetas?: string[];
  /** Por que "resgate" e "reaquecido" NÃO chegaram ao lead. */
  aviso?: string;
}

/** O que a função do banco devolveu, ou o motivo de não ter dado. */
type Gravacao = { ok: true; etiquetas: string[] } | { ok: false; status: number; erro: string };

/** Chama `editar_etiquetas_do_lead` e traduz o erro do banco para a tela. */
async function gravarNoLead(
  supabase: SupabaseClient,
  leadId: string,
  incluir: readonly string[],
  retirar: readonly string[],
  rastro: boolean,
): Promise<Gravacao> {
  const { data, error } = await supabase.rpc("editar_etiquetas_do_lead", {
    p_lead: leadId,
    p_incluir: [...incluir],
    p_retirar: [...retirar],
    p_rastro: rastro,
  });
  if (!error) return { ok: true, etiquetas: limparEtiquetas(data) };
  if (ehTabelaOuColunaAusente(error) || error.code === "PGRST202") {
    return { ok: false, status: 503, erro: "A edição de etiquetas espera a migração 20261023120000 (as etiquetas no lead)." };
  }
  if (error.code === "42501") return { ok: false, status: 403, erro: "Seu perfil não edita etiquetas." };
  if (error.code === "23514") return { ok: false, status: 400, erro: "Etiquetas fora do formato: até 20 por pedido, cada uma com até 255 caracteres." };
  if (error.code === "P0002") return { ok: false, status: 404, erro: "Lead não encontrado" };
  return { ok: false, status: 500, erro: error.message };
}

/**
 * Garante "resgate" e "reaquecido" no lead que o SDR acabou de passar para o
 * Comercial. Pedido do dono: *"isso tem que ser feito automático"*.
 *
 * Sem rastro próprio: o crédito da passagem já é o evento que o gatilho grava
 * (migração 20260925180000), com as duas etiquetas no detalhe. Nunca lança e
 * nunca desfaz a passagem, que já foi gravada: o que falhar vira `aviso`.
 */
export async function etiquetarPassagemDoSdr(supabase: SupabaseClient, leadId: string): Promise<EtiquetasDaPassagem> {
  try {
    const r = await gravarNoLead(supabase, leadId, ETIQUETAS_DA_PASSAGEM, [], false);
    if (!r.ok) return { aviso: `A passagem foi gravada, mas resgate e reaquecido não entraram no lead: ${r.erro}` };
    return { etiquetas: r.etiquetas };
  } catch (e) {
    return { aviso: `A passagem foi gravada, mas resgate e reaquecido não entraram no lead: ${e instanceof Error ? e.message : "erro inesperado"}` };
  }
}

// ----------------------------------------------------------------------------
// A edição no card
// ----------------------------------------------------------------------------

export type EdicaoDeEtiquetas =
  | { ok: true; etiquetas: string[]; aviso?: string }
  | { ok: false; status: number; erro: string };

/**
 * Aplica no lead o que o card pediu — pôr umas, tirar outras — e deixa no
 * rastro o que entrou e o que saiu (a função do banco faz as duas coisas, sob
 * trava da linha).
 *
 * O card manda a MUDANÇA, nunca a lista inteira: outra aba pode ter mudado a
 * lista no meio, e a lista do card gravada por cima apagaria o que ele não via.
 *
 * "resgate" e "reaquecido" não ENTRAM nem SAEM à mão por aqui. São da
 * passagem do SDR: o dono pediu *"automático"* e *"manter"*. Postas à mão,
 * marcariam trabalho que não houve; tiradas por um clique do Comercial,
 * apagariam o que houve.
 */
export async function editarEtiquetasDoLead(supabase: SupabaseClient, leadId: string, pedido: unknown): Promise<EdicaoDeEtiquetas> {
  const lido = lerMudanca(pedido);
  if (!lido.ok) return { ok: false, status: 400, erro: lido.erro };
  const { mudanca } = lido;
  if (mudanca.retirar.some(ehEtiquetaDaPassagem)) {
    return {
      ok: false,
      status: 422,
      erro: "Resgate e reaquecido medem o trabalho do SDR e não saem pelo painel. Se foi engano, fale com o administrador.",
    };
  }
  if (mudanca.incluir.some(ehEtiquetaDaPassagem)) {
    return {
      ok: false,
      status: 422,
      erro: "Resgate e reaquecido entram sozinhas, quando o SDR passa o lead para o Comercial.",
    };
  }
  const r = await gravarNoLead(supabase, leadId, mudanca.incluir, mudanca.retirar, true);
  if (!r.ok) return r;
  return { ok: true, etiquetas: r.etiquetas };
}

/**
 * Quantas passagens do SDR já contaram como resgate neste lead — os eventos
 * que o gatilho da migração 20260925180000 grava. `null` quando o rastro não
 * se deixa ler (migração ainda não aplicada, rede): quem chama trata como
 * "não sei", e não como zero.
 *
 * É por aqui que a rota sabe se a passagem que acabou de gravar CONTOU: a
 * régua (SDR sem Comercial, lead parado ou reaberto, Comercial ativo) mora
 * só no gatilho, e reescrevê-la em TypeScript seria a segunda régua que
 * discorda da primeira no dia em que uma delas mudar.
 */
export async function contarPassagensCreditadas(
  supabase: SupabaseClient,
  leadId: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from("leads_eventos")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .eq("tipo", "etiqueta")
    .eq("detalhe->>origem", "passagem_do_sdr");
  if (error || typeof count !== "number") return null;
  return count;
}
