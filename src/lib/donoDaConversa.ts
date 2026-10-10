import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarNome, type AgenteDoChatwoot } from "./atribuicaoDoChatwoot";
import { lerAgentesDoChatwoot } from "./atribuicaoDoChatwoot-servidor";
import { chamarChatwoot, type ConfigDoChatwoot, type Resultado } from "./etiquetasDoChatwoot";

/**
 * O dono do lead vira o dono da conversa no Chatwoot (2026-10-10).
 *
 * *"As conversas sobre responsabilidade do Rodrigo não aparecem pra ele"* —
 * no Chatwoot. O painel troca o dono do lead (o rodízio do funil, ou alguém
 * à mão) e a conversa ficava com quem estava: a 460, do Rodrigo no painel,
 * seguia atribuída ao Dyones no Chatwoot. O vendedor abre "Minhas" e não
 * acha o cliente que o sistema acabou de mandar para ele.
 *
 * O caminho contrário já existia (03/10): o admin atribui no Chatwoot e o
 * painel acompanha (`atribuicaoDoChatwoot`). Este é o de ida. Os dois não
 * brigam: a atribuição feita aqui volta como evento do Chatwoot e encontra o
 * painel já com o mesmo dono — nada muda.
 *
 * ---------------------------------------------------------------------------
 * Quem é o agente
 * ---------------------------------------------------------------------------
 * `leads.responsavel` é o `full_name` do perfil; o Chatwoot tem `name` e
 * `available_name`. Vale o agente cujo nome confere (sem acento, sem caixa)
 * com o do responsável — e só se for exatamente um. Dois agentes com o mesmo
 * nome não se desempatam aqui: atribuir ao errado esconde a conversa de quem
 * devia vê-la, que é o defeito que este arquivo existe para consertar.
 *
 * Nada aqui lança, e nada aqui desfaz a troca de dono: ela já valeu no painel.
 * O que não deu certo vira `{ ok: false, motivo }` para o log.
 */

/** Quanto a atribuição pode gastar falando com o Chatwoot. */
export const ORCAMENTO_DA_ATRIBUICAO_MS = 4000;
/** O começo do aviso da tela quando a conversa não acompanhou a troca. */
export const AVISO_DE_CONVERSA_COM_O_DONO_ANTIGO =
  "O lead mudou de dono, mas a conversa no Chatwoot continua com quem estava";
/** Tempo máximo de cada chamada. */
const PRAZO_DA_CHAMADA_MS = 2500;

type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

/** O id do agente do Chatwoot que atende por este nome, ou o motivo de não haver. */
export function agenteDoResponsavel(
  nome: string | null | undefined,
  agentes: readonly AgenteDoChatwoot[],
): Resultado<number> {
  const alvo = normalizarNome(nome);
  if (!alvo) return { ok: false, motivo: "o lead está sem responsável" };
  const iguais = agentes.filter(
    (a) =>
      a &&
      typeof a === "object" &&
      [a.name, a.available_name].some((n) => typeof n === "string" && normalizarNome(n) === alvo),
  );
  if (iguais.length === 0) {
    return { ok: false, motivo: `nenhum agente do Chatwoot se chama "${String(nome).trim()}"` };
  }
  if (iguais.length > 1) {
    return { ok: false, motivo: `mais de um agente do Chatwoot se chama "${String(nome).trim()}"` };
  }
  const id = Number(iguais[0].id);
  return Number.isInteger(id) && id > 0
    ? { ok: true, valor: id }
    : { ok: false, motivo: "o agente do Chatwoot veio sem id" };
}

/** As conversas abertas de cada lead, a partir das linhas de `atendimentos`. */
export function conversasAbertasPorLead(
  linhas: ReadonlyArray<{ lead_id?: unknown; chatwoot_conversation_id?: unknown; status_conversa?: unknown }>,
): Map<string, number[]> {
  const mapa = new Map<string, number[]>();
  for (const a of linhas) {
    if (typeof a.lead_id !== "string" || a.status_conversa === "resolved") continue;
    const id = Number(a.chatwoot_conversation_id);
    if (!Number.isInteger(id) || id <= 0) continue;
    const lista = mapa.get(a.lead_id) ?? [];
    if (!lista.includes(id)) lista.push(id);
    mapa.set(a.lead_id, lista);
  }
  return mapa;
}

/**
 * Atribui as conversas ao agente. Devolve quantas entraram e, se alguma não
 * entrou, por quê.
 */
export async function atribuirConversas(
  conversas: readonly number[],
  agenteId: number,
  cfg: ConfigDoChatwoot,
  limite: number,
  buscar: Buscar = fetch,
): Promise<{ atribuidas: number; falhas: string[] }> {
  const feitas = await Promise.all(
    conversas.map(async (conversa) => {
      const resta = limite - Date.now();
      if (resta <= 0) return { ok: false as const, motivo: "sem tempo para falar com o Chatwoot" };
      const r = await chamarChatwoot(
        buscar,
        `${cfg.base}/api/v1/accounts/${cfg.conta}/conversations/${conversa}/assignments`,
        cfg,
        { method: "POST", body: JSON.stringify({ assignee_id: agenteId }) },
        Math.min(PRAZO_DA_CHAMADA_MS, resta),
      );
      return r.ok ? r : { ok: false as const, motivo: `conversa ${conversa}: ${r.motivo}` };
    }),
  );
  return {
    atribuidas: feitas.filter((f) => f.ok).length,
    falhas: feitas.filter((f): f is { ok: false; motivo: string } => !f.ok).map((f) => f.motivo),
  };
}

/**
 * As conversas de um lead para o agente que atende pelo nome do responsável,
 * com a lista de agentes já lida.
 */
async function atribuirAoResponsavel(
  conversas: readonly number[],
  responsavel: string | null,
  agentes: readonly AgenteDoChatwoot[],
  cfg: ConfigDoChatwoot,
  limite: number,
  buscar: Buscar,
): Promise<{ atribuidas: number; falhas: string[] }> {
  const agente = agenteDoResponsavel(responsavel, agentes);
  if (!agente.ok) return { atribuidas: 0, falhas: [agente.motivo] };
  return atribuirConversas(conversas, agente.valor, cfg, limite, buscar);
}

/** O texto da exceção, para o log. */
function motivoDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Para o painel: depois que um lead troca de dono, as conversas abertas dele
 * passam para o agente do novo dono. Ver o cabeçalho. Nunca lança.
 */
export async function atribuirConversasDoLead(
  supabase: SupabaseClient,
  leadId: string,
  responsavel: string,
  cfg: ConfigDoChatwoot | null,
  buscar: Buscar = fetch,
  orcamentoMs: number = ORCAMENTO_DA_ATRIBUICAO_MS,
): Promise<{ ok: true; atribuidas: number } | { ok: false; motivo: string }> {
  try {
    const limite = Date.now() + orcamentoMs;
    const { data, error } = await supabase
      .from("atendimentos")
      .select("lead_id, chatwoot_conversation_id, status_conversa")
      .eq("lead_id", leadId);
    if (error) return { ok: false, motivo: `conversas do lead ilegíveis: ${error.message}` };
    const conversas = conversasAbertasPorLead(data ?? []).get(leadId) ?? [];
    if (conversas.length === 0) return { ok: true, atribuidas: 0 };
    if (!cfg) return { ok: false, motivo: "Chatwoot não configurado no site" };

    const agentes = await lerAgentesDoChatwoot(cfg, limite, buscar);
    if (!agentes.ok) return agentes;
    const r = await atribuirAoResponsavel(conversas, responsavel, agentes.valor, cfg, limite, buscar);
    return r.falhas.length === 0 ? { ok: true, atribuidas: r.atribuidas } : { ok: false, motivo: r.falhas.join("; ") };
  } catch (e) {
    return { ok: false, motivo: motivoDe(e) };
  }
}

/**
 * Para o rodízio do funil: os leads que a fila acabou de passar de mão, com
 * uma leitura só da lista de agentes para todos. As conversas vêm prontas
 * (a rota já leu `atendimentos` para o link do aviso). Nunca lança; o que não
 * entrou volta em `falhas`, com o lead na frente.
 */
export async function atribuirConversasDaFila(
  trocas: ReadonlyArray<{ leadId: string; responsavel: string | null }>,
  conversasPorLead: ReadonlyMap<string, readonly number[]>,
  cfg: ConfigDoChatwoot | null,
  buscar: Buscar = fetch,
  orcamentoMs: number = ORCAMENTO_DA_ATRIBUICAO_MS,
): Promise<{ atribuidas: number; falhas: string[] }> {
  const comConversa = trocas.filter((t) => (conversasPorLead.get(t.leadId)?.length ?? 0) > 0);
  if (comConversa.length === 0) return { atribuidas: 0, falhas: [] };
  if (!cfg) return { atribuidas: 0, falhas: ["Chatwoot não configurado no site"] };
  try {
    const limite = Date.now() + orcamentoMs;
    const agentes = await lerAgentesDoChatwoot(cfg, limite, buscar);
    if (!agentes.ok) return { atribuidas: 0, falhas: [agentes.motivo] };
    const feitas = await Promise.all(
      comConversa.map(async (t) => {
        const r = await atribuirAoResponsavel(
          conversasPorLead.get(t.leadId) ?? [],
          t.responsavel,
          agentes.valor,
          cfg,
          limite,
          buscar,
        );
        return { atribuidas: r.atribuidas, falhas: r.falhas.map((f) => `lead ${t.leadId}: ${f}`) };
      }),
    );
    return {
      atribuidas: feitas.reduce((n, f) => n + f.atribuidas, 0),
      falhas: feitas.flatMap((f) => f.falhas),
    };
  } catch (e) {
    return { atribuidas: 0, falhas: [motivoDe(e)] };
  }
}
