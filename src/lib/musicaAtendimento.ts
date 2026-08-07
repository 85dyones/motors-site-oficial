import { Redis } from "@upstash/redis";

/**
 * Onde mora o "volume de antes do atendimento".
 *
 * ── O problema que este arquivo existe para resolver ────────────────────────
 *
 * A regra da A18 é: CHAMAR CONSULTOR abaixa o volume para 20% e ele **volta
 * sozinho em 90 s**. Para a volta acontecer, alguém precisa lembrar de dois
 * dados entre uma requisição e outra: o volume anterior e a hora em que caiu.
 *
 * Guardar isso numa variável de módulo funciona num servidor só. **No Vercel
 * não funciona**, e o modo como falha é silencioso: o POST de `abaixar` cai
 * numa instância, os polls de `/api/musica` que viriam a restaurar caem em
 * outra — que nunca soube do abaixamento e portanto nada restaura. A loja fica
 * a 20% até alguém arrastar a barra à mão, e o painel nem mostra o botão
 * RESTAURAR, porque para aquela instância não há atendimento em curso.
 *
 * Não é caso de borda em serverless: é o caminho normal.
 *
 * ── A saída ─────────────────────────────────────────────────────────────────
 *
 * Com `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` no ambiente, o
 * estado vai para o Redis e todas as instâncias enxergam o mesmo. O projeto já
 * depende do `@upstash/redis` (o rate limit de `src/proxy.ts` usa), então não
 * entra dependência nova — só a provisão do banco.
 *
 * Sem Upstash, cai na variável de módulo, que é o comportamento de antes: certo
 * em `next dev` e num servidor único, furado em serverless. `atendimentoEhConfiavel()`
 * diz qual dos dois está valendo, e o painel A18 mostra isso em vez de prometer
 * uma volta automática que não vai acontecer.
 *
 * A chave NÃO tem TTL de propósito. Expirar sozinha apagaria o registro sem que
 * ninguém subisse o volume no Spotify — o dado sumiria e o som ficaria baixo.
 * Quem apaga é `executar`, depois de mandar o volume de volta.
 */

export type Atendimento = { volume: number | null; em: number };

const CHAVE = "musica:atendimento";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

let redis: Redis | null = null;
if (url && token) {
  try {
    redis = new Redis({ url, token });
  } catch (e) {
    console.error("[Música] Falha ao iniciar o Upstash:", e);
  }
}

/** Fallback de processo único. Ver o cabeçalho. */
let emMemoria: Atendimento | null = null;

/**
 * `true` quando o estado é compartilhado entre instâncias — ou seja, quando a
 * volta automática dos 90 s realmente vale em produção.
 */
export function atendimentoEhConfiavel(): boolean {
  return redis !== null;
}

export async function lerAtendimento(): Promise<Atendimento | null> {
  if (!redis) return emMemoria;
  try {
    // O Upstash desserializa JSON sozinho; o `as` é só para tipar a volta.
    return ((await redis.get(CHAVE)) as Atendimento | null) ?? null;
  } catch (e) {
    // Redis fora do ar não pode derrubar a leitura de estado da TV. Cai no
    // valor local, que no pior caso é `null` — e `null` significa "não há
    // atendimento", que é o estado seguro.
    console.warn("[Música] Leitura do atendimento falhou:", (e as Error)?.message);
    return emMemoria;
  }
}

export async function gravarAtendimento(a: Atendimento): Promise<void> {
  emMemoria = a;
  if (!redis) return;
  try {
    await redis.set(CHAVE, a);
  } catch (e) {
    console.warn("[Música] Gravação do atendimento falhou:", (e as Error)?.message);
  }
}

export async function limparAtendimento(): Promise<void> {
  emMemoria = null;
  if (!redis) return;
  try {
    await redis.del(CHAVE);
  } catch (e) {
    console.warn("[Música] Limpeza do atendimento falhou:", (e as Error)?.message);
  }
}
