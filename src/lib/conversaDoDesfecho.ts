import type { SupabaseClient } from "@supabase/supabase-js";
import { ehTabelaOuColunaAusente } from "./erroDeSchema";
import {
  chamarChatwoot,
  motivoSemChatwoot,
  type ConfigDoChatwoot,
} from "./etiquetasDoChatwoot";
import { NAO_E_OPORTUNIDADE, ROTULO_DO_DESFECHO, type TipoDeDesfecho } from "./funil";

/**
 * Encerrar o lead no painel resolve a conversa no Chatwoot (2026-10-06).
 *
 * Relato do dono: *"encerrei um lead como perdido no painel e a conversa não
 * foi resolvida automaticamente no chatwoot"*. Até aqui nada resolvia: o
 * vendedor fechava o negócio no painel e a conversa seguia aberta na caixa de
 * entrada, pedindo um segundo clique em outro sistema.
 *
 * ---------------------------------------------------------------------------
 * Quais conversas
 * ---------------------------------------------------------------------------
 * Todas as de `atendimentos` com `lead_id` do lead e `chatwoot_conversation_id`
 * preenchido, MENOS as que o espelho `status_conversa` já diz `resolved`. Não
 * é só a mais recente (a régua do card e das etiquetas): um lead encerrado
 * não deve deixar nenhuma conversa aberta para trás. `pending` e `snoozed`
 * contam como abertas.
 *
 * O espelho é escrito pelo webhook (`/api/chatwoot/eventos`) a cada evento da
 * conversa. Se ele estiver atrás e a conversa já estiver resolvida, o pedido
 * de resolver de novo não muda nada lá; o custo é uma nota a mais.
 *
 * ---------------------------------------------------------------------------
 * A API
 * ---------------------------------------------------------------------------
 *   POST /api/v1/accounts/{conta}/conversations/{id}/messages
 *        { content, message_type: "outgoing", private: true }
 *   POST /api/v1/accounts/{conta}/conversations/{id}/toggle_status
 *        { status: "resolved" }
 *
 * A nota vai ANTES de resolver, e é sempre PRIVADA: `private: true` é o que a
 * separa de uma mensagem de WhatsApp para o cliente. Ela diz quem encerrou e
 * por quê, para quem abrir a conversa depois não precisar ir ao painel.
 * Falhou a nota, a conversa é resolvida do mesmo jeito (a nota é contexto, o
 * pedido do dono é a conversa resolvida), e a tela avisa que a nota não entrou.
 * Resolvida é só a conversa cujo `toggle_status` respondeu 2xx: 404 e qualquer
 * outra resposta são falha, com aviso.
 *
 * ---------------------------------------------------------------------------
 * Nunca trava o desfecho
 * ---------------------------------------------------------------------------
 * Quem chama já gravou o lead. Nada aqui lança, e tudo cabe num orçamento de
 * tempo curto, porque roda DENTRO da resposta do painel (e não em `after()`):
 * o dono quer saber quando não deu certo, e só a resposta consegue dizer.
 * Falhou, volta `conversa_resolvida: false` e o `aviso` que a tela mostra.
 *
 * ---------------------------------------------------------------------------
 * A volta pelo webhook
 * ---------------------------------------------------------------------------
 * As duas chamadas voltam como eventos em `/api/chatwoot/eventos`. A nota é
 * reconhecida pelo começo do texto (`ehNotaDoPainel`) e ignorada em
 * `interpretarEventoDoChatwoot`: sem isso ela contaria como resposta de
 * consultor e, com o lead já encerrado, CRIARIA um lead novo. O evento de
 * conversa resolvida só atualiza o espelho.
 */

/** Quanto o encerramento pode gastar falando com o Chatwoot, ao todo. */
export const ORCAMENTO_DO_DESFECHO_MS = 4000;
/** Tempo máximo de cada chamada. */
const PRAZO_DA_CHAMADA_MS = 2500;
/** Nota livre maior que isto não entra na nota da conversa. */
const NOTA_CURTA = 200;

/**
 * Como a nota do painel começa. É por aqui que o webhook a reconhece na
 * volta: mudar o texto é mudar `ehNotaDoPainel` junto.
 */
export const INICIO_DA_NOTA_DO_PAINEL = "Lead encerrado no painel:";

export const AVISO_DE_CONVERSA_ABERTA =
  "O lead foi encerrado, mas a conversa no Chatwoot continua aberta: resolva por lá.";

export const AVISO_DE_PAINEL_SEM_CHATWOOT =
  "O lead foi encerrado, mas o painel não está ligado ao Chatwoot: resolva a conversa por lá.";

const AVISO_DE_NOTA_QUE_NAO_ENTROU =
  "O lead foi encerrado e a conversa no Chatwoot foi resolvida, mas a nota do encerramento não entrou nela.";

/** Quando nem deu para saber se há conversa aberta: não afirma que há. */
const AVISO_DE_CONVERSA_NAO_CONFERIDA =
  "O lead foi encerrado, mas não deu para conferir a conversa no Chatwoot: se ela estiver aberta, resolva por lá.";

type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

/** O desfecho como a caixa de desfecho o chama. */
function nomeDoDesfecho(tipo: TipoDeDesfecho): string {
  return tipo === "descartado" ? NAO_E_OPORTUNIDADE : ROTULO_DO_DESFECHO[tipo];
}

/** Uma linha só, sem espaço sobrando e sem ponto final repetido. */
function emUmaLinha(v: string | null | undefined): string {
  return (v ?? "").replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
}

export interface DadosDoDesfecho {
  tipo: TipoDeDesfecho;
  /** O rótulo do motivo, como a tela o mostra. */
  motivo: string | null;
  /** Quem encerrou. */
  autor: string | null;
  /** A nota livre da caixa de desfecho. */
  nota?: string | null;
}

/** O texto da nota privada que fica na conversa. */
export function notaDeDesfecho(dados: DadosDoDesfecho): string {
  const partes = [`${INICIO_DA_NOTA_DO_PAINEL} ${nomeDoDesfecho(dados.tipo)}.`];
  const motivo = emUmaLinha(dados.motivo);
  if (motivo) partes.push(`Motivo: ${motivo}.`);
  const autor = emUmaLinha(dados.autor);
  if (autor) partes.push(`Por ${autor}.`);
  const nota = emUmaLinha(dados.nota);
  if (nota && nota.length <= NOTA_CURTA) partes.push(`Nota: ${nota}.`);
  return partes.join(" ");
}

/**
 * Esta mensagem de saída é a nota que o próprio painel escreveu na conversa?
 * Só quando é PRIVADA (`private === true`) e começa como a nota começa.
 */
export function ehNotaDoPainel(conteudo: unknown, privada: unknown): boolean {
  return (
    privada === true &&
    typeof conteudo === "string" &&
    conteudo.trimStart().startsWith(INICIO_DA_NOTA_DO_PAINEL)
  );
}

export interface ConversaDoDesfecho {
  /**
   * `true`: toda conversa aberta do lead foi resolvida. `false`: alguma
   * continua aberta. Ausente: não havia conversa aberta para resolver.
   */
  conversa_resolvida?: boolean;
  /** O que a tela mostra quando alguma conversa continua aberta. */
  aviso?: string;
}

/** `semNota`: a conversa foi resolvida, mas a nota do desfecho não entrou. */
type DeUmaConversa = { ok: true; semNota?: string } | { ok: false; motivo: string };

async function resolverUma(
  conversa: number,
  nota: string,
  cfg: ConfigDoChatwoot,
  limite: number,
  buscar: Buscar,
): Promise<DeUmaConversa> {
  const raiz = `${cfg.base}/api/v1/accounts/${cfg.conta}/conversations/${conversa}`;
  const pedir = async (caminho: string, corpo: unknown) => {
    const resta = limite - Date.now();
    if (resta <= 0) return { ok: false as const, motivo: "sem tempo para falar com o Chatwoot" };
    return chamarChatwoot(
      buscar,
      `${raiz}/${caminho}`,
      cfg,
      { method: "POST", body: JSON.stringify(corpo) },
      Math.min(PRAZO_DA_CHAMADA_MS, resta),
    );
  };

  const anotada = await pedir("messages", { content: nota, message_type: "outgoing", private: true });
  if (!anotada.ok) {
    console.warn(`[Leads] Nota do desfecho não gravada na conversa ${conversa}:`, anotada.motivo);
  }

  // Só a resposta 2xx DESTE pedido conta como conversa resolvida. Qualquer
  // outra, 404 inclusive, é falha: o painel não afirma o que não confirmou.
  const resolvida = await pedir("toggle_status", { status: "resolved" });
  if (!resolvida.ok) return resolvida;
  // `{ payload: { success, current_status } }`. O status vai explícito no
  // pedido, mas a resposta é o que diz como a conversa ficou.
  const payload = (resolvida.valor as { payload?: { success?: unknown; current_status?: unknown } } | null)?.payload;
  if (payload?.success === false) return { ok: false, motivo: "o Chatwoot não resolveu a conversa" };
  if (typeof payload?.current_status === "string" && payload.current_status !== "resolved") {
    return { ok: false, motivo: `a conversa ficou como "${payload.current_status}"` };
  }
  return anotada.ok ? { ok: true } : { ok: true, semNota: anotada.motivo };
}

/**
 * Resolve as conversas abertas do lead que acabou de ser encerrado.
 * Ver o cabeçalho. Nunca lança.
 */
export async function resolverConversasDoLead(
  supabase: SupabaseClient,
  leadId: string,
  dados: DadosDoDesfecho,
  cfg: ConfigDoChatwoot | null,
  buscar: Buscar = fetch,
  orcamentoMs: number = ORCAMENTO_DO_DESFECHO_MS,
): Promise<ConversaDoDesfecho> {
  try {
    const limite = Date.now() + orcamentoMs;
    const { data, error } = await supabase
      .from("atendimentos")
      .select("chatwoot_conversation_id, status_conversa")
      .eq("lead_id", leadId);
    if (error) {
      // Ambiente sem a tabela: não há conversa para resolver.
      if (ehTabelaOuColunaAusente(error)) return {};
      console.warn("[Leads] Conversas do lead ilegíveis no desfecho:", error.message);
      return { conversa_resolvida: false, aviso: AVISO_DE_CONVERSA_NAO_CONFERIDA };
    }

    const abertas = [
      ...new Set(
        ((data ?? []) as Array<{ chatwoot_conversation_id?: unknown; status_conversa?: unknown }>)
          .filter((a) => a.status_conversa !== "resolved")
          .map((a) => Number(a.chatwoot_conversation_id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];
    if (abertas.length === 0) return {};

    if (!cfg) {
      // O motivo técnico fica no log: quem lê o aviso é o vendedor.
      console.warn("[Leads] Conversa não resolvida no desfecho:", motivoSemChatwoot());
      return { conversa_resolvida: false, aviso: AVISO_DE_PAINEL_SEM_CHATWOOT };
    }

    const nota = notaDeDesfecho(dados);
    const feitas = await Promise.all(abertas.map((c) => resolverUma(c, nota, cfg, limite, buscar)));
    const falhas = feitas.filter((f): f is { ok: false; motivo: string } => !f.ok);
    if (falhas.length === 0) {
      // Resolvida, mas sem a nota: a tela diz, para ninguém procurar por ela.
      const semNota = feitas.some((f) => f.ok && f.semNota);
      return semNota ? { conversa_resolvida: true, aviso: AVISO_DE_NOTA_QUE_NAO_ENTROU } : { conversa_resolvida: true };
    }

    const motivos = [...new Set(falhas.map((f) => f.motivo))].join("; ");
    console.warn("[Leads] Conversa não resolvida no desfecho:", motivos);
    const aviso =
      abertas.length === 1
        ? AVISO_DE_CONVERSA_ABERTA
        : `O lead foi encerrado, mas ${falhas.length} de ${abertas.length} conversas no Chatwoot continuam abertas: resolva por lá.`;
    return { conversa_resolvida: false, aviso: `${aviso} Motivo: ${motivos}.` };
  } catch (e) {
    console.warn("[Leads] Falha ao resolver a conversa no desfecho:", e instanceof Error ? e.message : e);
    return { conversa_resolvida: false, aviso: AVISO_DE_CONVERSA_NAO_CONFERIDA };
  }
}
