import { baseDoChatwoot, contaDoChatwoot } from "./chatwoot";

/**
 * As etiquetas da conversa no Chatwoot, lidas e gravadas pelo site (2026-09-25).
 *
 * As etiquetas moram na CONVERSA do Chatwoot (labels) e chegam ao banco pelo
 * n8n, em `atendimentos.tags`. Até aqui o site só as espelhava; agora ele
 * também escreve, por dois caminhos:
 *   - o card do kanban, onde o SDR (e o Comercial) põe e tira etiqueta;
 *   - a passagem do SDR para o Comercial, que garante "resgate" e
 *     "reaquecido" sem ninguém lembrar (pedido do dono: *"isso tem que ser
 *     feito automático"*).
 *
 * O Chatwoot é a fonte da verdade das etiquetas; o rastro do lead
 * (`leads_eventos`, migração 20260925180000) é a prova que não depende dele.
 *
 * ---------------------------------------------------------------------------
 * A API
 * ---------------------------------------------------------------------------
 *   GET  /api/v1/accounts/{conta}/conversations/{id}/labels  → { payload: string[] }
 *   POST /api/v1/accounts/{conta}/conversations/{id}/labels  { labels } → { payload }
 *
 * O POST SUBSTITUI a lista inteira. Por isso "garantir" lê antes e grava a
 * união: gravar só as duas da passagem apagaria "origem-site", "quer-comprar"
 * e o que mais a conversa tivesse.
 *
 * Autenticação pelo cabeçalho `api_access_token`, com o token de um usuário do
 * Chatwoot em `CHATWOOT_API_TOKEN` — segredo de servidor, nunca `NEXT_PUBLIC_`.
 * Host e conta são os mesmos que o card já usa para montar o link da conversa.
 *
 * ---------------------------------------------------------------------------
 * Falha não derruba a tela
 * ---------------------------------------------------------------------------
 * Toda função devolve `{ ok: false, motivo }` em vez de lançar: a passagem do
 * lead não pode falhar porque o Chatwoot demorou, e o crédito do SDR já ficou
 * no banco pelo gatilho. Quem chama decide o que dizer.
 */

/** O que a passagem do SDR para o Comercial garante na conversa. */
export const ETIQUETAS_DA_PASSAGEM = ["resgate", "reaquecido"] as const;

/** Quantas etiquetas o card aceita gravar de uma vez. */
export const MAXIMO_DE_ETIQUETAS = 20;

/** Tempo máximo de cada chamada ao Chatwoot. */
const PRAZO_MS = 8000;

export type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: string };

export interface ConfigDoChatwoot {
  base: string;
  conta: string;
  token: string;
}

type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Uma etiqueta no formato do Chatwoot, ou `null` se não for uma.
 *
 * O Chatwoot guarda o título em minúsculas, com letras, números, hífen e
 * sublinhado — "Quer Comprar" não é etiqueta, "quer-comprar" é. Recusar aqui, e
 * não deixar a API recusar, dá à tela uma mensagem que ela sabe mostrar.
 */
export function normalizarEtiqueta(bruta: unknown): string | null {
  if (typeof bruta !== "string") return null;
  const etiqueta = bruta.trim().toLowerCase();
  if (!etiqueta || etiqueta.length > 50) return null;
  return /^[\p{L}\p{N}_-]+$/u.test(etiqueta) ? etiqueta : null;
}

/** A lista limpa: só etiquetas válidas, sem repetir, na ordem em que vieram. */
export function normalizarEtiquetas(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  const vistas = new Set<string>();
  for (const bruta of lista) {
    const etiqueta = normalizarEtiqueta(bruta);
    if (etiqueta) vistas.add(etiqueta);
  }
  return [...vistas];
}

/** As atuais, mais as novas que faltam — as atuais nunca saem. */
export function juntarEtiquetas(atuais: readonly string[], novas: readonly string[]): string[] {
  return normalizarEtiquetas([...atuais, ...novas]);
}

/** Host, conta e token. `null` quando falta qualquer um: o recurso fica desligado. */
export function configDoChatwoot(
  env: Record<string, string | undefined> = process.env,
): ConfigDoChatwoot | null {
  const base = baseDoChatwoot({ url: env.NEXT_PUBLIC_CHATWOOT_URL });
  const conta = contaDoChatwoot({ conta: env.NEXT_PUBLIC_CHATWOOT_CONTA_ID });
  const token = (env.CHATWOOT_API_TOKEN ?? "").trim();
  if (!base || !conta || !token) return null;
  return { base, conta, token };
}

function urlDasEtiquetas(cfg: ConfigDoChatwoot, conversa: number): string {
  return `${cfg.base}/api/v1/accounts/${cfg.conta}/conversations/${conversa}/labels`;
}

function conversaValida(conversa: unknown): conversa is number {
  return typeof conversa === "number" && Number.isInteger(conversa) && conversa > 0;
}

async function chamar(
  buscar: Buscar,
  url: string,
  cfg: ConfigDoChatwoot,
  init: RequestInit = {},
): Promise<Resultado<unknown>> {
  let resposta: Response;
  try {
    resposta = await buscar(url, {
      ...init,
      headers: {
        api_access_token: cfg.token,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(PRAZO_MS),
      cache: "no-store",
    });
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    return {
      ok: false,
      motivo: nome === "TimeoutError" ? "o Chatwoot não respondeu a tempo" : "sem conexão com o Chatwoot",
    };
  }
  if (!resposta.ok) {
    return {
      ok: false,
      motivo:
        resposta.status === 401 || resposta.status === 403
          ? "o Chatwoot recusou o token (CHATWOOT_API_TOKEN)"
          : resposta.status === 404
            ? "a conversa não existe mais no Chatwoot"
            : `o Chatwoot respondeu ${resposta.status}`,
    };
  }
  try {
    return { ok: true, valor: await resposta.json() };
  } catch {
    return { ok: false, motivo: "resposta ilegível do Chatwoot" };
  }
}

/** As etiquetas que a conversa tem AGORA no Chatwoot. */
export async function lerEtiquetasDaConversa(
  conversa: number,
  cfg: ConfigDoChatwoot,
  buscar: Buscar = fetch,
): Promise<Resultado<string[]>> {
  if (!conversaValida(conversa)) return { ok: false, motivo: "conversa inválida" };
  const r = await chamar(buscar, urlDasEtiquetas(cfg, conversa), cfg);
  if (!r.ok) return r;
  const payload = (r.valor as { payload?: unknown } | null)?.payload;
  if (!Array.isArray(payload)) return { ok: false, motivo: "resposta ilegível do Chatwoot" };
  return { ok: true, valor: normalizarEtiquetas(payload) };
}

/** Grava a lista INTEIRA de etiquetas da conversa e devolve a que ficou. */
export async function gravarEtiquetasDaConversa(
  conversa: number,
  etiquetas: readonly string[],
  cfg: ConfigDoChatwoot,
  buscar: Buscar = fetch,
): Promise<Resultado<string[]>> {
  if (!conversaValida(conversa)) return { ok: false, motivo: "conversa inválida" };
  const limpas = normalizarEtiquetas(etiquetas);
  const r = await chamar(buscar, urlDasEtiquetas(cfg, conversa), cfg, {
    method: "POST",
    body: JSON.stringify({ labels: limpas }),
  });
  if (!r.ok) return r;
  const payload = (r.valor as { payload?: unknown } | null)?.payload;
  // Algumas versões do Chatwoot devolvem só um status. Sem lista de volta, o
  // que foi pedido é o que ficou.
  return { ok: true, valor: Array.isArray(payload) ? normalizarEtiquetas(payload) : limpas };
}

/**
 * As etiquetas CRIADAS na conta — as que o Chatwoot sabe mostrar.
 *
 *   GET /api/v1/accounts/{conta}/labels → { payload: [{ title, ... }] }
 *
 * A conversa aceita qualquer título, mas a tela do Chatwoot só desenha o que
 * existe na conta: oferecer no card uma etiqueta que não foi criada lá seria
 * gravar algo que ninguém no Chatwoot vê.
 */
export async function lerEtiquetasDaConta(
  cfg: ConfigDoChatwoot,
  buscar: Buscar = fetch,
): Promise<Resultado<string[]>> {
  const r = await chamar(buscar, `${cfg.base}/api/v1/accounts/${cfg.conta}/labels`, cfg);
  if (!r.ok) return r;
  const payload = (r.valor as { payload?: unknown } | null)?.payload;
  if (!Array.isArray(payload)) return { ok: false, motivo: "resposta ilegível do Chatwoot" };
  return {
    ok: true,
    valor: normalizarEtiquetas(payload.map((e) => (e as { title?: unknown } | null)?.title)),
  };
}

/**
 * Garante que a conversa tenha as etiquetas pedidas, sem tirar nenhuma.
 *
 * Lê, junta e só grava se faltava alguma — a passagem repetida para o mesmo
 * vendedor não gera escrita nem evento no Chatwoot.
 */
export async function garantirEtiquetas(
  conversa: number,
  novas: readonly string[],
  cfg: ConfigDoChatwoot,
  buscar: Buscar = fetch,
): Promise<Resultado<{ antes: string[]; depois: string[]; mudou: boolean }>> {
  const lidas = await lerEtiquetasDaConversa(conversa, cfg, buscar);
  if (!lidas.ok) return lidas;
  const alvo = juntarEtiquetas(lidas.valor, novas);
  if (alvo.length === lidas.valor.length) {
    return { ok: true, valor: { antes: lidas.valor, depois: lidas.valor, mudou: false } };
  }
  const gravadas = await gravarEtiquetasDaConversa(conversa, alvo, cfg, buscar);
  if (!gravadas.ok) return gravadas;
  return { ok: true, valor: { antes: lidas.valor, depois: gravadas.valor, mudou: true } };
}
