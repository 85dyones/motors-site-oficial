/**
 * Enviar WhatsApp pela Evolution API — a primeira vez que o SITE envia.
 *
 * ---------------------------------------------------------------------------
 * Por que isto muda uma regra antiga (2026-10-19)
 * ---------------------------------------------------------------------------
 * Até aqui o site nunca enviava mensagem (`WEBHOOKS_N8N.md`, "Fora do
 * repositório"): quem falava com a Evolution era o n8n, e o painel só
 * escutava o Chatwoot. O pedido do dono troca o Chatwoot por Evolution + n8n
 * com o atendimento DENTRO do painel. Responder do painel é síncrono — a
 * pessoa aperta enviar e precisa saber, na hora, se saiu —, e uma volta pelo
 * n8n só para repassar o texto acrescentaria um ponto de falha mudo entre o
 * botão e o cliente.
 *
 * O n8n continua dono do TEMPO (juntar as mensagens que o cliente manda em
 * rajada, acordar as cadências); o site passa a ser dono do ENVIO. Uma porta
 * de saída só: o que o assistente responde, o que a cadência manda, o que o
 * vendedor escreve no painel e o resumo que vai para o vendedor saem todos
 * por aqui, e todos ficam gravados em `atendimento_mensagens` com o id que a
 * Evolution devolve — é por esse id que o eco do webhook é reconhecido.
 *
 * Credencial na Vercel (`EVOLUTION_API_URL`, `EVOLUTION_API_KEY`,
 * `EVOLUTION_INSTANCIA`), como as outras integrações deste repositório. Na
 * plataforma multi-loja ela vira dado da loja no Vault (HANDOFF, decisão 8).
 */

export type Transporte = (url: string, init?: RequestInit) => Promise<Response>;

export interface ConfigDaEvolution {
  url: string;
  chave: string;
  instancia: string;
}

export function configDaEvolution(): ConfigDaEvolution | null {
  const url = (process.env.EVOLUTION_API_URL || "").trim().replace(/\/+$/, "");
  const chave = (process.env.EVOLUTION_API_KEY || "").trim();
  const instancia = (process.env.EVOLUTION_INSTANCIA || "").trim();
  if (!url || !chave || !instancia) return null;
  return { url, chave, instancia };
}

/** O que falta, nomeado — a tela e o log dizem qual variável. */
export function motivoSemEvolution(): string {
  const faltam = ["EVOLUTION_API_URL", "EVOLUTION_API_KEY", "EVOLUTION_INSTANCIA"].filter(
    (v) => !(process.env[v] || "").trim(),
  );
  return faltam.length > 0
    ? `falta ${faltam.join(", ")} na Vercel`
    : "a Evolution não está configurada";
}

export type ResultadoDoEnvio = { ok: true; waId: string | null } | { ok: false; motivo: string };

const TIMEOUT_MS = 15_000;

/** O que se lê da resposta da Evolution — sucesso traz `key.id`, erro traz `response.message`. */
interface CorpoDaResposta {
  key?: { id?: unknown };
  response?: { message?: unknown };
  message?: unknown;
  error?: unknown;
}

/** Só dígitos: é o que `/message/sendText` espera em `number`. */
export function numeroParaEnvio(telefone: string | null | undefined): string | null {
  const d = (telefone ?? "").replace(/\D/g, "");
  return d.length >= 12 && d.length <= 13 ? d : null;
}

/**
 * Um texto para um número. Nunca lança.
 *
 * `atrasoMs` vira o `delay` da Evolution: ela mostra "digitando…" por esse
 * tempo antes de enviar. Uma resposta de três parágrafos que chega 200 ms
 * depois da pergunta denuncia o robô e soa a disparo; um atraso proporcional
 * ao tamanho (ver `atrasoDeDigitacao`) é o que o atendimento humano parece.
 */
export async function enviarTexto(
  numero: string,
  texto: string,
  cfg: ConfigDaEvolution,
  opcoes: { atrasoMs?: number; transporte?: Transporte } = {},
): Promise<ResultadoDoEnvio> {
  const destino = numeroParaEnvio(numero);
  if (!destino) return { ok: false, motivo: "telefone inválido para envio" };
  const corpoDoTexto = texto.trim();
  if (!corpoDoTexto) return { ok: false, motivo: "mensagem vazia" };

  const transporte = opcoes.transporte ?? fetch;
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS + (opcoes.atrasoMs ?? 0));
  try {
    const resposta = await transporte(`${cfg.url}/message/sendText/${encodeURIComponent(cfg.instancia)}`, {
      method: "POST",
      headers: { apikey: cfg.chave, "Content-Type": "application/json" },
      body: JSON.stringify({
        number: destino,
        text: corpoDoTexto,
        ...(opcoes.atrasoMs ? { delay: Math.round(opcoes.atrasoMs) } : {}),
      }),
      signal: controle.signal,
    });
    const corpo = (await resposta.json().catch(() => null)) as CorpoDaResposta | null;
    if (!resposta.ok) {
      const detalhe = corpo?.response?.message ?? corpo?.message ?? corpo?.error ?? `HTTP ${resposta.status}`;
      return { ok: false, motivo: `a Evolution recusou o envio: ${String(Array.isArray(detalhe) ? detalhe.join("; ") : detalhe).slice(0, 200)}` };
    }
    const waId = typeof corpo?.key?.id === "string" ? corpo.key.id : null;
    return { ok: true, waId };
  } catch (erro) {
    const abortou = erro instanceof Error && erro.name === "AbortError";
    return {
      ok: false,
      motivo: abortou ? "a Evolution não respondeu a tempo" : `falha ao falar com a Evolution: ${erro instanceof Error ? erro.message : String(erro)}`,
    };
  } finally {
    clearTimeout(relogio);
  }
}

/** ~35 caracteres por segundo, entre 1,2 s e 6 s. */
export function atrasoDeDigitacao(texto: string): number {
  return Math.max(1200, Math.min(6000, Math.round((texto.length / 35) * 1000)));
}
