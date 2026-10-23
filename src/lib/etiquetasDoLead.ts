import type { SupabaseClient } from "@supabase/supabase-js";
import { ehTabelaOuColunaAusente } from "./erroDeSchema";
import { ehEtiquetaDaPassagem, lerMudanca, limparEtiquetas, normalizarEtiquetas } from "./etiquetas";

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
 * Sem "resgate" e "reaquecido": elas medem o resgate (o do Ney, desde
 * 23/10/2026) e só entram sozinhas. Postas à mão, marcariam como resgate um
 * lead que ninguém resgatou — e o relatório contaria trabalho que não houve.
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
 * "resgate" e "reaquecido" não ENTRAM nem SAEM à mão por aqui. Medem o
 * resgate — da passagem do SDR até 23/10/2026, e desde então do Ney, que as
 * põe quando entrega ao vendedor um lead que ele reaqueceu. O dono pediu
 * *"automático"* e *"manter"*: postas à mão, marcariam trabalho que não
 * houve; tiradas por um clique do Comercial, apagariam o que houve.
 */
export async function editarEtiquetasDoLead(supabase: SupabaseClient, leadId: string, pedido: unknown): Promise<EdicaoDeEtiquetas> {
  const lido = lerMudanca(pedido);
  if (!lido.ok) return { ok: false, status: 400, erro: lido.erro };
  const { mudanca } = lido;
  if (mudanca.retirar.some(ehEtiquetaDaPassagem)) {
    return {
      ok: false,
      status: 422,
      erro: "Resgate e reaquecido medem o resgate e não saem pelo painel. Se foi engano, fale com o administrador.",
    };
  }
  if (mudanca.incluir.some(ehEtiquetaDaPassagem)) {
    return {
      ok: false,
      status: 422,
      erro: "Resgate e reaquecido entram sozinhas, quando o Ney entrega ao vendedor um lead que ele reaqueceu.",
    };
  }
  const r = await gravarNoLead(supabase, leadId, mudanca.incluir, mudanca.retirar, true);
  if (!r.ok) return r;
  return { ok: true, etiquetas: r.etiquetas };
}

