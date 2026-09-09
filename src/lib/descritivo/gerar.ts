import { MODELO, montarEntrada, montarInstrucoes } from "./briefing";
import type { Dossie } from "./dossie";
import type { CampoDeTexto } from "./validacao";

/**
 * A fronteira com a OpenAI — o ÚNICO arquivo que sabe qual é o fornecedor.
 *
 * Sem SDK: o projeto tem 8 dependências e nenhuma é de LLM, e a chamada é um
 * POST só. O preço disso é que timeout não vem de graça, então ele é
 * explícito aqui.
 */

const ENDPOINT = "https://api.openai.com/v1/responses";
const TIMEOUT_MS = 30_000;

/** O `fetch` entra por parâmetro para a suíte não tocar a rede. */
export type Transporte = (url: string, init?: RequestInit) => Promise<Response>;

export type ResultadoGeracao =
  | { ok: true; texto: string; entrada: number; saida: number }
  | { ok: false; status: 502 | 503; motivo: string };

function textoDaResposta(j: any): string {
  if (typeof j?.output_text === "string" && j.output_text.trim()) return j.output_text.trim();
  if (Array.isArray(j?.output)) {
    const t = j.output
      .flatMap((o: any) => (o?.content ?? []).filter((c: any) => c?.type === "output_text").map((c: any) => c.text))
      .join("")
      .trim();
    if (t) return t;
  }
  return "";
}

export async function gerarTexto(opts: {
  dossie: Dossie;
  campo: CampoDeTexto;
  chave: string;
  transporte?: Transporte;
}): Promise<ResultadoGeracao> {
  const { dossie, campo, chave } = opts;
  const transporte = opts.transporte ?? fetch;

  if (!chave || !chave.trim()) {
    return {
      ok: false,
      status: 503,
      motivo: "Gerador indisponível: falta OPENAI_API_KEY nas variáveis de ambiente.",
    };
  }

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const resposta = await transporte(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        instructions: montarInstrucoes(dossie),
        input: montarEntrada(dossie, campo),
      }),
      signal: controle.signal,
    });

    const corpo = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      const detalhe = corpo?.error?.message ?? `HTTP ${resposta.status}`;
      return { ok: false, status: 502, motivo: `A OpenAI recusou a chamada: ${detalhe}` };
    }

    const texto = textoDaResposta(corpo);
    if (!texto) {
      return { ok: false, status: 502, motivo: "A OpenAI respondeu sem texto." };
    }

    return {
      ok: true,
      texto,
      entrada: Number(corpo?.usage?.input_tokens ?? 0),
      saida: Number(corpo?.usage?.output_tokens ?? 0),
    };
  } catch (erro: any) {
    const motivo = erro?.name === "AbortError"
      ? `A geração passou de ${TIMEOUT_MS / 1000} segundos e foi interrompida.`
      : `Falha ao falar com a OpenAI: ${erro?.message ?? String(erro)}`;
    return { ok: false, status: 502, motivo };
  } finally {
    clearTimeout(relogio);
  }
}
