import {
  destinoDaNota,
  normalizarNome,
  notaMaisRecente,
  type MensagemDoChatwoot,
  type NotaDatada,
} from "./atribuicaoDoChatwoot";
import type { ConfigDoChatwoot, Resultado } from "./etiquetasDoChatwoot";

/**
 * A nota de atribuição, lida da conversa no Chatwoot (2026-10-03).
 *
 * O evento de conversa diz QUE o responsável mudou, nunca QUEM mudou. Quem
 * mudou está na mensagem de atividade da conversa, e é aqui que ela é buscada:
 *
 *   GET /api/v1/accounts/{conta}/conversations/{id}/messages → { payload: [...] }
 *
 * Mesmo cabeçalho `api_access_token` e mesma configuração das etiquetas
 * (`configDoChatwoot`). A régua do que fazer com a nota é pura e mora em
 * `atribuicaoDoChatwoot.ts`.
 *
 * ---------------------------------------------------------------------------
 * Prazo curto, e uma segunda leitura
 * ---------------------------------------------------------------------------
 * Esta leitura acontece DENTRO da resposta ao webhook, e o Chatwoot não espera
 * muito por ela. Por isso o prazo é menor que o das etiquetas, que rodam no
 * clique de alguém.
 *
 * A segunda leitura existe porque o evento pode chegar antes de a nota existir
 * na conversa. Quando o evento DISSE que o responsável mudou e a nota mais
 * recente não é a dessa mudança, espera um instante e lê de novo, uma vez só.
 * ⚠️ A ordem entre evento e nota não foi medida na instalação da loja: a
 * segunda leitura é precaução, e sai sem prejuízo se a medição mostrar que a
 * nota sempre chega antes.
 *
 * Como as etiquetas, nada aqui lança: devolve `{ ok: false, motivo }`.
 */

/** Tempo máximo de cada leitura das mensagens. */
const PRAZO_MS = 2500;
/** Quanto esperar antes da segunda leitura. */
const ESPERA_MS = 1000;

type Buscar = (url: string, init?: RequestInit) => Promise<Response>;
type Esperar = (ms: number) => Promise<void>;

const esperarDeVerdade: Esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function lerMensagens(
  conversa: number,
  cfg: ConfigDoChatwoot,
  buscar: Buscar,
): Promise<Resultado<MensagemDoChatwoot[]>> {
  let resposta: Response;
  try {
    resposta = await buscar(
      `${cfg.base}/api/v1/accounts/${cfg.conta}/conversations/${conversa}/messages`,
      {
        headers: { api_access_token: cfg.token, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(PRAZO_MS),
        cache: "no-store",
      },
    );
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    return {
      ok: false,
      motivo: nome === "TimeoutError" ? "o Chatwoot não respondeu a tempo" : "sem conexão com o Chatwoot",
    };
  }
  if (!resposta.ok) return { ok: false, motivo: `o Chatwoot respondeu ${resposta.status}` };
  try {
    const corpo = (await resposta.json()) as { payload?: unknown } | unknown[] | null;
    const lista = Array.isArray(corpo) ? corpo : corpo?.payload;
    if (!Array.isArray(lista)) return { ok: false, motivo: "resposta ilegível do Chatwoot" };
    return { ok: true, valor: lista as MensagemDoChatwoot[] };
  } catch {
    return { ok: false, motivo: "resposta ilegível do Chatwoot" };
  }
}

/** A nota confere com quem o evento diz que está com a conversa? */
function confere(achada: NotaDatada | null, responsavelNoChatwoot: string | null): achada is NotaDatada {
  if (!achada) return false;
  if (!responsavelNoChatwoot) return true;
  const destino = destinoDaNota(achada.nota);
  return destino !== null && normalizarNome(destino) === normalizarNome(responsavelNoChatwoot);
}

/**
 * A nota de atribuição mais recente da conversa, conferida com o evento.
 *
 * Quando o evento traz o nome do responsável atual, a nota precisa apontar
 * para ele. Se não aponta, a nota lida é de OUTRA atribuição (mais velha), e
 * agir por ela daria o lead a quem já não está com a conversa.
 */
export async function lerNotaDaConversa(
  conversa: number,
  cfg: ConfigDoChatwoot,
  sinal: { responsavelNoChatwoot: string | null; explicito: boolean },
  buscar: Buscar = fetch,
  esperar: Esperar = esperarDeVerdade,
): Promise<Resultado<NotaDatada>> {
  const tentativas = sinal.explicito ? 2 : 1;
  let motivo = "a conversa não tem nota de atribuição";

  for (let i = 0; i < tentativas; i++) {
    if (i > 0) await esperar(ESPERA_MS);
    const lidas = await lerMensagens(conversa, cfg, buscar);
    if (!lidas.ok) return lidas;
    const achada = notaMaisRecente(lidas.valor);
    if (confere(achada, sinal.responsavelNoChatwoot)) return { ok: true, valor: achada };
    motivo = achada
      ? "a nota mais recente não é do responsável atual da conversa"
      : "a conversa não tem nota de atribuição";
  }
  return { ok: false, motivo };
}
