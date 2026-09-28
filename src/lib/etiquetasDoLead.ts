import type { SupabaseClient } from "@supabase/supabase-js";
import { ehTabelaOuColunaAusente } from "./erroDeSchema";
import {
  ETIQUETAS_DA_PASSAGEM,
  ehEtiquetaDaPassagem,
  lerMudanca,
  normalizarEtiquetas,
} from "./etiquetas";
import {
  garantirEtiquetas,
  motivoSemChatwoot,
  mudarEtiquetas,
  type ConfigDoChatwoot,
  type Resultado,
} from "./etiquetasDoChatwoot";

/**
 * As etiquetas do LEAD: a ponte entre o card do kanban e a conversa do
 * Chatwoot (2026-09-25).
 *
 * `etiquetasDoChatwoot.ts` sabe falar com o Chatwoot; este arquivo sabe QUAL
 * conversa é a do lead e o que fica no rastro. As rotas (`/api/leads/gerenciar`
 * e `/api/leads/etiquetas`) só checam sessão e chamam daqui.
 *
 * A conversa do lead é a do atendimento MAIS RECENTE — a mesma régua de
 * `montar_fila_do_funil` e do link "Abrir no Chatwoot" do card. Duas réguas
 * seriam o card mostrando as etiquetas de uma conversa e gravando em outra.
 */

type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

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
 * O que o card oferece para pôr: as etiquetas que já apareceram nas conversas
 * lidas (ou as criadas na conta), no formato que o site pode gravar. Em ordem
 * alfabética, para a lista não mudar de lugar a cada leitura.
 *
 * Sem "resgate" e "reaquecido": elas são da passagem, e só da passagem. Postas
 * à mão, marcariam como resgate um lead que o SDR não passou — e quem medir
 * pelo filtro de etiqueta do Chatwoot contaria trabalho que não houve.
 */
export function etiquetasConhecidas(...listas: ReadonlyArray<unknown>[]): string[] {
  return normalizarEtiquetas(listas.flat())
    .filter((e) => !ehEtiquetaDaPassagem(e))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/**
 * A conversa do Chatwoot do lead, ou `null` quando o lead ainda não tem
 * (a conversa nasce quando o cliente escreve).
 */
export async function conversaDoLead(
  supabase: SupabaseClient,
  leadId: string,
): Promise<Resultado<number | null>> {
  const { data, error } = await supabase
    .from("atendimentos")
    .select("chatwoot_conversation_id, iniciado_em, created_at")
    .eq("lead_id", leadId);
  if (error) return { ok: false, motivo: `atendimento ilegível: ${error.message}` };
  const recente = maisRecentePrimeiro((data ?? []) as Array<AtendimentoComData & { chatwoot_conversation_id?: unknown }>)[0];
  const id = Number(recente?.chatwoot_conversation_id);
  return { ok: true, valor: Number.isInteger(id) && id > 0 ? id : null };
}

// ----------------------------------------------------------------------------
// A passagem do SDR
// ----------------------------------------------------------------------------

export interface EtiquetasDaPassagem {
  /** As etiquetas da conversa depois da passagem, quando deu para ler. */
  etiquetas?: string[];
  /** Por que "resgate" e "reaquecido" NÃO chegaram ao Chatwoot. */
  aviso?: string;
}

/**
 * Garante "resgate" e "reaquecido" na conversa do lead que o SDR acabou de
 * passar para o Comercial. Pedido do dono: *"isso tem que ser feito
 * automático"*.
 *
 * Nunca lança e nunca desfaz a passagem, que já foi gravada. O que falhar
 * aqui vira `aviso`, para o SDR pôr as etiquetas à mão. O aviso não promete
 * nada sobre o crédito: quem o grava é o gatilho do banco, com regra própria,
 * e esta função não o confere — dizer "ficou registrado" seria afirmar o que
 * não se leu (revisão de 25/09).
 */
export async function etiquetarPassagemDoSdr(
  supabase: SupabaseClient,
  leadId: string,
  cfg: ConfigDoChatwoot | null,
  buscar?: Buscar,
): Promise<EtiquetasDaPassagem> {
  const semEtiqueta = (porque: string): EtiquetasDaPassagem => ({
    aviso: `A passagem foi gravada, mas resgate e reaquecido não foram para o Chatwoot: ${porque}. Ponha as duas à mão na conversa.`,
  });
  try {
    if (!cfg) return semEtiqueta(motivoSemChatwoot());
    const conversa = await conversaDoLead(supabase, leadId);
    if (!conversa.ok) return semEtiqueta(conversa.motivo);
    if (conversa.valor === null) return semEtiqueta("o lead ainda não tem conversa no Chatwoot");
    const r = await garantirEtiquetas(conversa.valor, ETIQUETAS_DA_PASSAGEM, cfg, buscar);
    if (!r.ok) return semEtiqueta(r.motivo);
    return { etiquetas: r.valor.depois };
  } catch (e) {
    return semEtiqueta(e instanceof Error ? e.message : "erro inesperado");
  }
}

// ----------------------------------------------------------------------------
// A edição no card
// ----------------------------------------------------------------------------

export type EdicaoDeEtiquetas =
  | { ok: true; etiquetas: string[]; aviso?: string }
  | { ok: false; status: number; erro: string };

/**
 * Aplica no Chatwoot o que o card pediu — pôr umas, tirar outras — e deixa no
 * rastro o que entrou e o que saiu.
 *
 * O card manda a MUDANÇA, nunca a lista inteira. Ele desenha as etiquetas do
 * espelho (`atendimentos.tags`), que pode estar atrás da conversa; a lista
 * dele gravada por cima apagaria o que ele não via. A mudança é aplicada sobre
 * o que a conversa tem agora, lido na hora (`mudarEtiquetas`).
 *
 * "resgate" e "reaquecido" não ENTRAM nem SAEM à mão por aqui. São da
 * passagem do SDR: o dono pediu *"automático"* e *"manter"*. Postas à mão,
 * marcariam trabalho que não houve; tiradas por um clique do Comercial,
 * apagariam o que houve. Engano se desfaz no próprio Chatwoot.
 *
 * E o lead que o SDR JÁ passou (há passagem no rastro) tem as duas garantidas
 * de novo em toda edição. Duas coisas de graça: a edição feita em outra aba
 * no meio da passagem não as apaga, e a passagem que falhou com o Chatwoot
 * fora do ar se cura na primeira edição seguinte.
 */
export async function editarEtiquetasDoLead(
  supabase: SupabaseClient,
  leadId: string,
  pedido: unknown,
  cfg: ConfigDoChatwoot | null,
  buscar?: Buscar,
): Promise<EdicaoDeEtiquetas> {
  const lido = lerMudanca(pedido);
  if (!lido.ok) return { ok: false, status: 400, erro: lido.erro };
  const { mudanca } = lido;
  if (mudanca.retirar.some(ehEtiquetaDaPassagem)) {
    return {
      ok: false,
      status: 422,
      erro: "Resgate e reaquecido medem o trabalho do SDR e não saem pelo painel. Se foi engano, tire no Chatwoot.",
    };
  }
  if (mudanca.incluir.some(ehEtiquetaDaPassagem)) {
    return {
      ok: false,
      status: 422,
      erro: "Resgate e reaquecido entram sozinhas, quando o SDR passa o lead para o Comercial.",
    };
  }
  if (!cfg) {
    return {
      ok: false,
      status: 503,
      erro: `A edição de etiquetas ainda não foi ligada: ${motivoSemChatwoot()}.`,
    };
  }

  const conversa = await conversaDoLead(supabase, leadId);
  if (!conversa.ok) return { ok: false, status: 500, erro: conversa.motivo };
  if (conversa.valor === null) {
    return {
      ok: false,
      status: 409,
      erro: "O lead ainda não tem conversa no Chatwoot — as etiquetas moram na conversa.",
    };
  }

  const aplicada = (await jaPassouPeloSdr(supabase, leadId))
    ? { ...mudanca, incluir: [...mudanca.incluir, ...ETIQUETAS_DA_PASSAGEM] }
    : mudanca;
  const r = await mudarEtiquetas(conversa.valor, aplicada, cfg, buscar);
  if (!r.ok) return { ok: false, status: 502, erro: r.motivo };
  if (!r.valor.mudou) return { ok: true, etiquetas: r.valor.depois };

  const { error } = await supabase.rpc("registrar_etiquetas_do_lead", {
    p_lead: leadId,
    p_antes: r.valor.antes,
    p_depois: r.valor.depois,
  });
  if (error) {
    // A etiqueta JÁ mudou no Chatwoot; responder erro faria a tela desfazer
    // o que está gravado lá. Antes da migração a função não existe — o rastro
    // é um ganho, não um requisito, o mesmo trato de `registrar_contato_do_lead`.
    if (!ehTabelaOuColunaAusente(error) && error.code !== "PGRST202") {
      console.warn("[Leads] Etiqueta gravada sem rastro:", error.message);
      return {
        ok: true,
        etiquetas: r.valor.depois,
        aviso: "As etiquetas foram gravadas no Chatwoot, mas o registro no histórico do lead falhou.",
      };
    }
  }
  return { ok: true, etiquetas: r.valor.depois };
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

/** O SDR já passou este lead como resgate? Rastro ilegível responde "não". */
async function jaPassouPeloSdr(supabase: SupabaseClient, leadId: string): Promise<boolean> {
  return ((await contarPassagensCreditadas(supabase, leadId)) ?? 0) > 0;
}
