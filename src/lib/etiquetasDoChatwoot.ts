import { baseDoChatwoot, contaDoChatwoot } from "./chatwoot";
import {
  aplicarMudanca,
  limparEtiquetas,
  mesmaEtiqueta,
  mesmasEtiquetas,
  type MudancaDeEtiquetas,
} from "./etiquetas";

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
 * O POST SUBSTITUI a lista inteira. Por isso nada aqui grava uma lista que
 * veio de fora: toda escrita é uma MUDANÇA (pôr umas, tirar outras) aplicada
 * sobre o que a conversa tem AGORA, lido na hora. Gravar a lista que o card
 * tinha na tela apagaria o que ele não via — a do espelho `atendimentos.tags`
 * pode estar atrás, e a revisão de 25/09 mostrou o Comercial "tirando" resgate
 * e reaquecido que nunca viu.
 *
 * O que a conversa já tem volta como está (`limparEtiquetas`), sem normalizar:
 * ver o cabeçalho de `etiquetas.ts`.
 *
 * Autenticação pelo cabeçalho `api_access_token`, com o token de um usuário do
 * Chatwoot em `CHATWOOT_API_TOKEN` — segredo de servidor, nunca `NEXT_PUBLIC_`.
 * Host e conta são os mesmos que o card já usa para montar o link da conversa.
 *
 * ---------------------------------------------------------------------------
 * Falha não derruba a tela
 * ---------------------------------------------------------------------------
 * Toda função devolve `{ ok: false, motivo }` em vez de lançar: a passagem do
 * lead não pode falhar porque o Chatwoot demorou — o crédito do SDR mora no
 * banco, no gatilho, e não depende daqui. Quem chama decide o que dizer.
 */

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
 * Host, conta e token. `null` quando falta qualquer um: o recurso fica
 * desligado. Só `https`: o token vai no cabeçalho de toda chamada, e em
 * `http` ele atravessaria a rede em texto aberto.
 */
export function configDoChatwoot(
  env: Record<string, string | undefined> = process.env,
): ConfigDoChatwoot | null {
  const base = baseDoChatwoot({ url: env.NEXT_PUBLIC_CHATWOOT_URL });
  const conta = contaDoChatwoot({ conta: env.NEXT_PUBLIC_CHATWOOT_CONTA_ID });
  const token = (env.CHATWOOT_API_TOKEN ?? "").trim();
  if (!base || !conta || !token || !/^https:\/\//i.test(base)) return null;
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
  return { ok: true, valor: limparEtiquetas(payload) };
}

/**
 * Grava a lista INTEIRA de etiquetas da conversa e devolve a que ficou.
 *
 * Não exportada de propósito: quem vem de fora pede MUDANÇA (`mudarEtiquetas`,
 * `garantirEtiquetas`), que parte sempre do que foi lido na hora.
 */
async function gravarEtiquetasDaConversa(
  conversa: number,
  etiquetas: readonly string[],
  cfg: ConfigDoChatwoot,
  buscar: Buscar = fetch,
): Promise<Resultado<string[]>> {
  if (!conversaValida(conversa)) return { ok: false, motivo: "conversa inválida" };
  const limpas = limparEtiquetas(etiquetas);
  const r = await chamar(buscar, urlDasEtiquetas(cfg, conversa), cfg, {
    method: "POST",
    body: JSON.stringify({ labels: limpas }),
  });
  if (!r.ok) return r;
  const payload = (r.valor as { payload?: unknown } | null)?.payload;
  // Algumas versões do Chatwoot devolvem só um status. Sem lista de volta, o
  // que foi pedido é o que ficou.
  return { ok: true, valor: Array.isArray(payload) ? limparEtiquetas(payload) : limpas };
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
    valor: limparEtiquetas(payload.map((e) => (e as { title?: unknown } | null)?.title)),
  };
}

export interface EtiquetasMudadas {
  /** O que a conversa tinha, lido na hora. */
  antes: string[];
  /** O que ficou, segundo o Chatwoot. */
  depois: string[];
  /** Houve escrita? */
  mudou: boolean;
}

/**
 * Aplica uma mudança sobre o que a conversa tem AGORA: lê, calcula, e só
 * grava se a lista muda. Leitura que falha não vira gravação — gravar às
 * cegas substituiria a lista inteira pelo que o site imagina que ela é.
 */
export async function mudarEtiquetas(
  conversa: number,
  mudanca: MudancaDeEtiquetas,
  cfg: ConfigDoChatwoot,
  buscar: Buscar = fetch,
): Promise<Resultado<EtiquetasMudadas>> {
  const lidas = await lerEtiquetasDaConversa(conversa, cfg, buscar);
  if (!lidas.ok) return lidas;
  const alvo = aplicarMudanca(lidas.valor, mudanca);
  if (mesmasEtiquetas(alvo, lidas.valor)) {
    return { ok: true, valor: { antes: lidas.valor, depois: lidas.valor, mudou: false } };
  }
  const gravadas = await gravarEtiquetasDaConversa(conversa, alvo, cfg, buscar);
  if (!gravadas.ok) return gravadas;
  return { ok: true, valor: { antes: lidas.valor, depois: gravadas.valor, mudou: true } };
}

/**
 * Garante que a conversa tenha as etiquetas pedidas, sem tirar nenhuma.
 *
 * Lê, junta e só grava se faltava alguma — a passagem repetida para o mesmo
 * vendedor não gera escrita nem evento no Chatwoot.
 *
 * E CONFERE depois de gravar. Ler-juntar-gravar não é atômico: outra edição
 * da mesma conversa entre a leitura e a gravação (alguém no card, alguém no
 * próprio Chatwoot) grava a lista dela por cima da nossa, e as duas da
 * passagem somem sem ninguém saber. Relê uma vez; faltando, grava de novo
 * sobre o que leu. Uma vez só: duas corridas seguidas no mesmo segundo não
 * justificam um laço contra a API.
 */
export async function garantirEtiquetas(
  conversa: number,
  novas: readonly string[],
  cfg: ConfigDoChatwoot,
  buscar: Buscar = fetch,
): Promise<Resultado<EtiquetasMudadas>> {
  const primeira = await mudarEtiquetas(conversa, { incluir: novas }, cfg, buscar);
  if (!primeira.ok || !primeira.valor.mudou) return primeira;

  const faltam = (lista: readonly string[]) => novas.some((n) => !lista.some((e) => mesmaEtiqueta(e, n)));
  const conferida = await lerEtiquetasDaConversa(conversa, cfg, buscar);
  // A gravação já deu certo; a conferência que não responde não a desfaz.
  if (!conferida.ok || !faltam(conferida.valor)) {
    return {
      ok: true,
      valor: { ...primeira.valor, depois: conferida.ok ? conferida.valor : primeira.valor.depois },
    };
  }
  const segunda = await mudarEtiquetas(conversa, { incluir: novas }, cfg, buscar);
  if (!segunda.ok) return segunda;
  return { ok: true, valor: { antes: primeira.valor.antes, depois: segunda.valor.depois, mudou: true } };
}
