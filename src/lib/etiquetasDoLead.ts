import type { SupabaseClient } from "@supabase/supabase-js";
import { ehTabelaOuColunaAusente } from "./erroDeSchema";
import {
  ETIQUETAS_DA_PASSAGEM,
  MAXIMO_DE_ETIQUETAS,
  garantirEtiquetas,
  gravarEtiquetasDaConversa,
  lerEtiquetasDaConversa,
  normalizarEtiqueta,
  normalizarEtiquetas,
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
 * lidas, mais as duas da passagem — que precisam estar lá mesmo antes de
 * alguém usá-las pela primeira vez. Em ordem alfabética, para a lista não
 * mudar de lugar a cada leitura.
 */
export function etiquetasConhecidas(...listas: ReadonlyArray<unknown>[]): string[] {
  const todas = normalizarEtiquetas([...listas.flat(), ...ETIQUETAS_DA_PASSAGEM]);
  return todas.sort((a, b) => a.localeCompare(b, "pt-BR"));
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

/** Frase fixa do aviso: o crédito já está no banco, falte o que faltar. */
const CREDITO_GUARDADO = "O crédito do SDR ficou registrado no lead.";

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
 * Nunca lança e nunca desfaz a passagem: ela já foi gravada, e o crédito já
 * está no rastro pelo gatilho da migração 20260925180000. O que falhar aqui
 * vira `aviso`, para o SDR saber que precisa pôr as etiquetas à mão.
 */
export async function etiquetarPassagemDoSdr(
  supabase: SupabaseClient,
  leadId: string,
  cfg: ConfigDoChatwoot | null,
  buscar?: Buscar,
): Promise<EtiquetasDaPassagem> {
  const semEtiqueta = (porque: string): EtiquetasDaPassagem => ({
    aviso: `Resgate e reaquecido não foram para o Chatwoot: ${porque}. ${CREDITO_GUARDADO}`,
  });
  try {
    if (!cfg) return semEtiqueta("falta configurar CHATWOOT_API_TOKEN");
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
 * Grava no Chatwoot a lista de etiquetas que o card pediu e deixa no rastro o
 * que entrou e o que saiu.
 *
 * A recusa de etiqueta inválida acontece AQUI, e não só na tela: o POST do
 * Chatwoot substitui a lista inteira, e uma lista que chegasse suja à API
 * poderia apagar o que a conversa tinha.
 */
export async function editarEtiquetasDoLead(
  supabase: SupabaseClient,
  leadId: string,
  pedidas: unknown,
  cfg: ConfigDoChatwoot | null,
  buscar?: Buscar,
): Promise<EdicaoDeEtiquetas> {
  if (!Array.isArray(pedidas)) {
    return { ok: false, status: 400, erro: "etiquetas deve ser uma lista" };
  }
  const invalida = pedidas.find((e) => normalizarEtiqueta(e) === null);
  if (invalida !== undefined) {
    return {
      ok: false,
      status: 400,
      erro: `Etiqueta inválida: "${String(invalida)}". Use letras minúsculas, números, hífen ou sublinhado.`,
    };
  }
  const etiquetas = normalizarEtiquetas(pedidas);
  if (etiquetas.length > MAXIMO_DE_ETIQUETAS) {
    return { ok: false, status: 400, erro: `No máximo ${MAXIMO_DE_ETIQUETAS} etiquetas por conversa.` };
  }
  if (!cfg) {
    return {
      ok: false,
      status: 503,
      erro: "A edição de etiquetas ainda não foi ligada: falta CHATWOOT_API_TOKEN no servidor.",
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

  // Lidas do Chatwoot, e não do banco: `atendimentos.tags` é o espelho do n8n
  // e pode estar atrás. O rastro tem de dizer o que a conversa tinha DE FATO.
  const antes = await lerEtiquetasDaConversa(conversa.valor, cfg, buscar);
  if (!antes.ok) return { ok: false, status: 502, erro: antes.motivo };
  const depois = await gravarEtiquetasDaConversa(conversa.valor, etiquetas, cfg, buscar);
  if (!depois.ok) return { ok: false, status: 502, erro: depois.motivo };

  const mudou =
    antes.valor.length !== depois.valor.length || antes.valor.some((e) => !depois.valor.includes(e));
  if (!mudou) return { ok: true, etiquetas: depois.valor };

  const { error } = await supabase.rpc("registrar_etiquetas_do_lead", {
    p_lead: leadId,
    p_antes: antes.valor,
    p_depois: depois.valor,
  });
  if (error) {
    // A etiqueta JÁ mudou no Chatwoot; responder erro faria a tela desfazer
    // o que está gravado lá. Antes da migração a função não existe — o rastro
    // é um ganho, não um requisito, o mesmo trato de `registrar_contato_do_lead`.
    if (!ehTabelaOuColunaAusente(error) && error.code !== "PGRST202") {
      console.warn("[Leads] Etiqueta gravada sem rastro:", error.message);
      return {
        ok: true,
        etiquetas: depois.valor,
        aviso: "As etiquetas foram gravadas no Chatwoot, mas o registro no histórico do lead falhou.",
      };
    }
  }
  return { ok: true, etiquetas: depois.valor };
}
