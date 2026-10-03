import {
  notaConfere,
  notaMaisRecente,
  type AgenteDoChatwoot,
  type MensagemDoChatwoot,
  type NotaDatada,
} from "./atribuicaoDoChatwoot";
import type { ConfigDoChatwoot, Resultado } from "./etiquetasDoChatwoot";

/**
 * O que a atribuição precisa buscar no Chatwoot (2026-10-03).
 *
 * O evento de conversa diz QUE o responsável mudou, nunca QUEM mudou. Quem
 * mudou está na mensagem de atividade da conversa, e o papel de quem mudou
 * está na lista de agentes da conta:
 *
 *   GET /api/v1/accounts/{conta}/conversations/{id}/messages → { payload: [...] }
 *   GET /api/v1/accounts/{conta}/agents                      → [ { name, email, role } ]
 *
 * Mesmo cabeçalho `api_access_token` e mesma configuração das etiquetas
 * (`configDoChatwoot`). A régua do que fazer com as duas respostas é pura e
 * mora em `atribuicaoDoChatwoot.ts`.
 *
 * ---------------------------------------------------------------------------
 * O orçamento de tempo
 * ---------------------------------------------------------------------------
 * Estas leituras acontecem DENTRO da resposta ao webhook, e o Chatwoot não
 * espera muito por ela. Quem chama passa um LIMITE (um instante, não uma
 * duração), e toda leitura daqui cabe no que falta até ele: o prazo de cada
 * chamada é o menor entre o prazo padrão e o tempo que resta. Sem tempo, a
 * chamada nem sai.
 *
 * A segunda leitura das mensagens existe porque o evento pode chegar antes de
 * a nota existir na conversa. Só acontece quando o evento DISSE que o
 * responsável mudou, a nota mais recente não é a dessa mudança, e ainda cabe
 * no orçamento esperar e ler de novo.
 * ⚠️ A ordem entre evento e nota não foi medida na instalação da loja: a
 * segunda leitura é precaução.
 *
 * Como as etiquetas, nada aqui lança: devolve `{ ok: false, motivo }`.
 */

/** Quanto o passo da atribuição pode gastar falando com o Chatwoot. */
export const ORCAMENTO_DO_CHATWOOT_MS = 3000;
/** Tempo máximo de cada leitura. */
const PRAZO_DA_LEITURA_MS = 1500;
/** Quanto esperar antes da segunda leitura das mensagens. */
const ESPERA_MS = 600;
/** Menos que isto de sobra não paga uma segunda leitura. */
const MINIMO_DA_SEGUNDA_MS = 500;

type Buscar = (url: string, init?: RequestInit) => Promise<Response>;
type Esperar = (ms: number) => Promise<void>;

const esperarDeVerdade: Esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function chamar(
  url: string,
  cfg: ConfigDoChatwoot,
  limite: number,
  buscar: Buscar,
): Promise<Resultado<unknown>> {
  const resta = limite - Date.now();
  if (resta <= 0) return { ok: false, motivo: "sem tempo para consultar o Chatwoot" };

  let resposta: Response;
  try {
    resposta = await buscar(url, {
      headers: { api_access_token: cfg.token, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(Math.min(PRAZO_DA_LEITURA_MS, resta)),
      cache: "no-store",
    });
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    return {
      ok: false,
      motivo: nome === "TimeoutError" ? "o Chatwoot não respondeu a tempo" : "sem conexão com o Chatwoot",
    };
  }
  if (!resposta.ok) return { ok: false, motivo: `o Chatwoot respondeu ${resposta.status}` };
  try {
    return { ok: true, valor: await resposta.json() };
  } catch {
    return { ok: false, motivo: "resposta ilegível do Chatwoot" };
  }
}

/** A lista que a resposta carrega, direto ou dentro de `payload`. */
function listaDe(corpo: unknown): unknown[] | null {
  if (Array.isArray(corpo)) return corpo;
  const payload = (corpo as { payload?: unknown } | null)?.payload;
  return Array.isArray(payload) ? payload : null;
}

/**
 * Os agentes da conta, com o papel de cada um NO CHATWOOT.
 *
 * É o que impede um agente de se passar por admin trocando o próprio nome de
 * exibição: a régua exige que o nome do autor seja de um único agente, e que
 * ele seja `administrator` aqui.
 */
export async function lerAgentesDoChatwoot(
  cfg: ConfigDoChatwoot,
  limite: number,
  buscar: Buscar = fetch,
): Promise<Resultado<AgenteDoChatwoot[]>> {
  const r = await chamar(`${cfg.base}/api/v1/accounts/${cfg.conta}/agents`, cfg, limite, buscar);
  if (!r.ok) return r;
  const lista = listaDe(r.valor);
  if (!lista) return { ok: false, motivo: "resposta ilegível do Chatwoot" };
  return { ok: true, valor: lista as AgenteDoChatwoot[] };
}

/**
 * A nota de atribuição mais recente da conversa, conferida com o evento
 * (`notaConfere`): se o evento traz o responsável atual, a nota aponta para ele.
 */
export async function lerNotaDaConversa(
  conversa: number,
  cfg: ConfigDoChatwoot,
  sinal: { responsavelNoChatwoot: string | null; explicito: boolean },
  limite: number,
  buscar: Buscar = fetch,
  esperar: Esperar = esperarDeVerdade,
): Promise<Resultado<NotaDatada>> {
  const url = `${cfg.base}/api/v1/accounts/${cfg.conta}/conversations/${conversa}/messages`;
  let motivo = "a conversa não tem nota de atribuição";

  for (let leitura = 1; leitura <= 2; leitura++) {
    if (leitura === 2) {
      if (!sinal.explicito) break;
      // Só relê se cabe esperar E ler dentro do que resta.
      if (limite - Date.now() < ESPERA_MS + MINIMO_DA_SEGUNDA_MS) break;
      await esperar(ESPERA_MS);
    }
    const r = await chamar(url, cfg, limite, buscar);
    if (!r.ok) return r;
    const lista = listaDe(r.valor);
    if (!lista) return { ok: false, motivo: "resposta ilegível do Chatwoot" };

    const achada = notaMaisRecente(lista as MensagemDoChatwoot[]);
    if (achada && notaConfere(achada.nota, sinal.responsavelNoChatwoot)) {
      return { ok: true, valor: achada };
    }
    motivo = achada
      ? "a nota mais recente não é do responsável atual da conversa"
      : "a conversa não tem nota de atribuição";
  }
  return { ok: false, motivo };
}
