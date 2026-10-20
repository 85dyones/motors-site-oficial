/**
 * A fronteira com a DeepSeek — o único arquivo do atendimento que sabe qual é
 * o fornecedor do modelo.
 *
 * ---------------------------------------------------------------------------
 * Por que DeepSeek (2026-10-19)
 * ---------------------------------------------------------------------------
 * Pedido do dono: *"atendimento via modelo deepseek pra baratear o custo"*. O
 * assistente responde TODA conversa, então o custo por mensagem é o que
 * decide se a conta fecha. Na tabela da DeepSeek de 19/10/2026
 * (api-docs.deepseek.com/quick_start/pricing), o `deepseek-flash` custa
 * US$ 0,15 por milhão de tokens de entrada (US$ 0,003 quando o começo do
 * prompt repete e cai no cache) e US$ 0,60 por milhão de saída, fora do
 * horário de pico. O prompt do agente é montado com a parte fixa (regras,
 * loja, catálogo) na FRENTE justamente para cair nesse cache.
 *
 * ---------------------------------------------------------------------------
 * Três escolhas da chamada
 * ---------------------------------------------------------------------------
 *   - **Sem SDK**, como `lib/descritivo/gerar.ts`: é um POST, no formato da
 *     OpenAI, e o projeto não tem dependência de LLM.
 *   - **`thinking: disabled`.** O `deepseek-flash` raciocina por padrão
 *     (modo "thinking", esforço alto). Para conversa de WhatsApp isso é mais
 *     lento, mais caro e não melhora a resposta curta que se quer.
 *   - **`response_format: json_object`.** A resposta é lida por código
 *     (`lerRespostaDoAgente`), não por gente. A documentação avisa que o
 *     modo JSON pode, raramente, devolver conteúdo vazio: isso vira falha
 *     com motivo, e quem chama decide o que fazer — nunca um JSON inventado.
 */

export type Transporte = (url: string, init?: RequestInit) => Promise<Response>;

export const URL_PADRAO_DA_DEEPSEEK = "https://api.deepseek.com";
export const MODELO_PADRAO = "deepseek-flash";
/**
 * O modelo que classifica as fotos do estoque. Fixo, e não o da configuração:
 * na página de visão da DeepSeek (20/10/2026), o `deepseek-flash` lê imagem e
 * o `deepseek-v4-pro` não — trocar o modelo da conversa não pode parar a
 * classificação.
 */
export const MODELO_DE_VISAO = "deepseek-flash";

/**
 * Preço de tabela por milhão de tokens, em dólar, fora do pico (19/10/2026).
 * Serve só à ESTIMATIVA de custo do painel — a cobrança de verdade é a da
 * fatura. No pico (01h–04h e 06h–10h UTC, dias úteis) o preço dobra, e a
 * estimativa diz isso na tela em vez de fingir precisão.
 */
export const PRECO_POR_MILHAO = { entrada: 0.15, entradaEmCache: 0.003, saida: 0.6 } as const;

export interface ConfigDoModelo {
  chave: string;
  url: string;
  modelo: string;
}

/** Lida do ambiente. Sem chave, não há modelo — e quem chama diz isso. */
export function configDoModelo(modelo?: string | null): ConfigDoModelo | null {
  const chave = (process.env.DEEPSEEK_API_KEY || "").trim();
  if (!chave) return null;
  const url = (process.env.DEEPSEEK_BASE_URL || URL_PADRAO_DA_DEEPSEEK).trim().replace(/\/+$/, "");
  return { chave, url, modelo: (modelo || "").trim() || MODELO_PADRAO };
}

/**
 * Um pedaço da mensagem de usuário com imagem (2026-10-20, classificação das
 * fotos do estoque): o `deepseek-flash` lê imagem no formato da OpenAI, só em
 * mensagem de usuário. `detail: low` reduz a imagem a 512 px antes de o modelo
 * ver — api-docs.deepseek.com/guides/vision.
 */
export type ParteDaMensagem =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export interface MensagemDoModelo {
  role: "system" | "user" | "assistant";
  content: string | ParteDaMensagem[];
}

export interface UsoDoModelo {
  entrada: number;
  entradaEmCache: number;
  saida: number;
}

export type ResultadoDoModelo =
  | { ok: true; conteudo: string; uso: UsoDoModelo }
  | { ok: false; motivo: string };

const TIMEOUT_MS = 25_000;

/** O que se lê da resposta — o resto do corpo é ignorado. */
interface CorpoDaResposta {
  error?: { message?: unknown };
  choices?: { message?: { content?: unknown } }[];
  usage?: Record<string, unknown>;
}

function numero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Custo estimado em dólar, pela tabela fora do pico. */
export function custoEstimado(uso: UsoDoModelo): number {
  const semCache = Math.max(0, uso.entrada - uso.entradaEmCache);
  return (
    (semCache * PRECO_POR_MILHAO.entrada +
      uso.entradaEmCache * PRECO_POR_MILHAO.entradaEmCache +
      uso.saida * PRECO_POR_MILHAO.saida) /
    1_000_000
  );
}

/**
 * Uma chamada, com resposta em JSON. Nunca lança: o que der errado volta com
 * motivo legível, sem a chave e sem o prompt.
 */
export async function completarEmJson(opcoes: {
  cfg: ConfigDoModelo;
  mensagens: MensagemDoModelo[];
  maxTokens?: number;
  temperatura?: number;
  transporte?: Transporte;
  timeoutMs?: number;
  /**
   * `false` tira o `response_format: json_object` — para o pedido com imagem,
   * em que a documentação da DeepSeek não diz se o modo JSON vale. O texto
   * pede JSON e quem lê tolera a cerca de código; um 400 por combinação não
   * documentada pararia a classificação inteira.
   */
  modoJson?: boolean;
}): Promise<ResultadoDoModelo> {
  const transporte = opcoes.transporte ?? fetch;
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), opcoes.timeoutMs ?? TIMEOUT_MS);
  try {
    const resposta = await transporte(`${opcoes.cfg.url}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opcoes.cfg.chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opcoes.cfg.modelo,
        messages: opcoes.mensagens,
        thinking: { type: "disabled" },
        ...(opcoes.modoJson === false ? {} : { response_format: { type: "json_object" } }),
        max_tokens: opcoes.maxTokens ?? 900,
        temperature: opcoes.temperatura ?? 0.5,
        stream: false,
      }),
      signal: controle.signal,
    });
    const corpo = (await resposta.json().catch(() => null)) as CorpoDaResposta | null;
    if (!resposta.ok) {
      const detalhe = corpo?.error?.message ?? `HTTP ${resposta.status}`;
      return { ok: false, motivo: `A DeepSeek recusou a chamada: ${String(detalhe).slice(0, 200)}` };
    }
    const conteudo = corpo?.choices?.[0]?.message?.content;
    if (typeof conteudo !== "string" || !conteudo.trim()) {
      return { ok: false, motivo: "A DeepSeek respondeu sem conteúdo." };
    }
    const uso = corpo?.usage ?? {};
    return {
      ok: true,
      conteudo,
      uso: {
        entrada: numero(uso.prompt_tokens),
        entradaEmCache: numero(uso.prompt_cache_hit_tokens),
        saida: numero(uso.completion_tokens),
      },
    };
  } catch (erro) {
    const abortou = erro instanceof Error && erro.name === "AbortError";
    return {
      ok: false,
      motivo: abortou ? "A DeepSeek não respondeu a tempo." : `Falha ao falar com a DeepSeek: ${erro instanceof Error ? erro.message : String(erro)}`,
    };
  } finally {
    clearTimeout(relogio);
  }
}
