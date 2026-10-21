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

/**
 * `incerto`: o tempo acabou antes da resposta da Evolution — a mensagem pode
 * ter saído (a Evolution segue baixando a foto e manda). Quem chama não a
 * trata como falha certa: o eco do webhook diz depois.
 */
export type ResultadoDoEnvio = { ok: true; waId: string | null } | { ok: false; motivo: string; incerto?: boolean };

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
      ...(abortou ? { incerto: true } : {}),
    };
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Uma foto por URL, com legenda opcional (2026-10-20, as fotos do carro em
 * camadas). Nunca lança. É o `sendMedia` da Evolution v2 — `mediatype:
 * "image"` e a URL em `media`, que a Evolution baixa e manda —, conferido no
 * `SendMediaDto` do código-fonte dela. As fotos vêm de `whatsapp_images`, que
 * é JPEG justamente porque o WhatsApp não lida bem com WebP
 * (`lib/fotosDoVeiculo.ts`).
 */
export async function enviarImagem(
  numero: string,
  imagem: { url: string; legenda?: string | null },
  cfg: ConfigDaEvolution,
  opcoes: { atrasoMs?: number; transporte?: Transporte; timeoutMs?: number } = {},
): Promise<ResultadoDoEnvio> {
  const destino = numeroParaEnvio(numero);
  if (!destino) return { ok: false, motivo: "telefone inválido para envio" };
  const url = imagem.url.trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, motivo: "foto sem endereço http(s)" };
  const legenda = (imagem.legenda ?? "").trim();

  const transporte = opcoes.transporte ?? fetch;
  const controle = new AbortController();
  // A Evolution baixa a foto antes de responder: mais folga que o texto, a
  // menos que quem chama tenha prazo (a conversa tem).
  const relogio = setTimeout(() => controle.abort(), (opcoes.timeoutMs ?? TIMEOUT_MS * 2) + (opcoes.atrasoMs ?? 0));
  try {
    const resposta = await transporte(`${cfg.url}/message/sendMedia/${encodeURIComponent(cfg.instancia)}`, {
      method: "POST",
      headers: { apikey: cfg.chave, "Content-Type": "application/json" },
      body: JSON.stringify({
        number: destino,
        mediatype: "image",
        media: url,
        ...(legenda ? { caption: legenda } : {}),
        ...(opcoes.atrasoMs ? { delay: Math.round(opcoes.atrasoMs) } : {}),
      }),
      signal: controle.signal,
    });
    const corpo = (await resposta.json().catch(() => null)) as CorpoDaResposta | null;
    if (!resposta.ok) {
      const detalhe = corpo?.response?.message ?? corpo?.message ?? corpo?.error ?? `HTTP ${resposta.status}`;
      return { ok: false, motivo: `a Evolution recusou a foto: ${String(Array.isArray(detalhe) ? detalhe.join("; ") : detalhe).slice(0, 200)}` };
    }
    const waId = typeof corpo?.key?.id === "string" ? corpo.key.id : null;
    return { ok: true, waId };
  } catch (erro) {
    const abortou = erro instanceof Error && erro.name === "AbortError";
    return {
      ok: false,
      motivo: abortou ? "a Evolution não respondeu a tempo" : `falha ao falar com a Evolution: ${erro instanceof Error ? erro.message : String(erro)}`,
      ...(abortou ? { incerto: true } : {}),
    };
  } finally {
    clearTimeout(relogio);
  }
}

/** O que a Evolution entrega de um anexo: o arquivo em base64 e o tipo. */
interface CorpoDaMidia extends CorpoDaResposta {
  base64?: unknown;
  mimetype?: unknown;
  fileName?: unknown;
}

export type MidiaBaixada = { ok: true; base64: string; tipo: string | null; nome: string | null } | { ok: false; motivo: string };

/**
 * O arquivo de uma mensagem que chegou (2026-10-20, os anexos). Nunca lança.
 *
 * A URL do WhatsApp no webhook é cifrada: quem decifra é a Evolution, pelo
 * `getBase64FromMediaMessage` da v2, que acha a mensagem pelo id (a instância
 * guarda as mensagens) e devolve o arquivo em base64. `converterParaMp4` é
 * para o áudio: a nota de voz vem em OGG/Opus, que o Safari não toca; a
 * Evolution converte para MP4.
 */
export async function baixarMidia(
  waId: string,
  cfg: ConfigDaEvolution,
  opcoes: { converterParaMp4?: boolean; transporte?: Transporte; timeoutMs?: number } = {},
): Promise<MidiaBaixada> {
  const id = waId.trim();
  if (!id) return { ok: false, motivo: "mensagem sem id" };
  const transporte = opcoes.transporte ?? fetch;
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), opcoes.timeoutMs ?? TIMEOUT_MS * 2);
  try {
    const resposta = await transporte(`${cfg.url}/chat/getBase64FromMediaMessage/${encodeURIComponent(cfg.instancia)}`, {
      method: "POST",
      headers: { apikey: cfg.chave, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { key: { id } }, convertToMp4: opcoes.converterParaMp4 === true }),
      signal: controle.signal,
    });
    const corpo = (await resposta.json().catch(() => null)) as CorpoDaMidia | null;
    if (!resposta.ok) {
      const detalhe = corpo?.response?.message ?? corpo?.message ?? corpo?.error ?? `HTTP ${resposta.status}`;
      return { ok: false, motivo: `a Evolution não entregou o arquivo: ${String(Array.isArray(detalhe) ? detalhe.join("; ") : detalhe).slice(0, 200)}` };
    }
    const base64 = typeof corpo?.base64 === "string" ? corpo.base64.replace(/^data:[^,]*,/, "").trim() : "";
    if (!base64) return { ok: false, motivo: "a Evolution respondeu sem o arquivo" };
    return {
      ok: true,
      base64,
      tipo: typeof corpo?.mimetype === "string" && corpo.mimetype.trim() ? corpo.mimetype.trim() : null,
      nome: typeof corpo?.fileName === "string" && corpo.fileName.trim() ? corpo.fileName.trim() : null,
    };
  } catch (erro) {
    const abortou = erro instanceof Error && erro.name === "AbortError";
    return { ok: false, motivo: abortou ? "a Evolution não entregou o arquivo a tempo" : `falha ao falar com a Evolution: ${erro instanceof Error ? erro.message : String(erro)}` };
  } finally {
    clearTimeout(relogio);
  }
}

export interface AnexoParaEnvio {
  /** Uma URL que a Evolution consegue baixar (a assinada do bucket). */
  url: string;
  conteudo: "imagem" | "video" | "audio" | "documento";
  tipo: string;
  nome?: string | null;
  legenda?: string | null;
}

/**
 * Um anexo do painel (2026-10-20). Nunca lança.
 *
 * Foto, vídeo e documento vão pelo `sendMedia` (com `mimetype` e `fileName`,
 * que é o nome que o cliente vê no documento); o áudio vai pelo
 * `sendWhatsAppAudio`, que a Evolution converte e entrega como nota de voz —
 * o áudio como documento chega ao cliente como um arquivo para baixar.
 * Áudio não tem legenda no WhatsApp: a legenda, se houver, fica de fora (quem
 * chama manda o texto à parte).
 */
export async function enviarAnexo(
  numero: string,
  anexo: AnexoParaEnvio,
  cfg: ConfigDaEvolution,
  opcoes: { transporte?: Transporte; timeoutMs?: number } = {},
): Promise<ResultadoDoEnvio> {
  const destino = numeroParaEnvio(numero);
  if (!destino) return { ok: false, motivo: "telefone inválido para envio" };
  const url = anexo.url.trim();
  if (!/^https:\/\//i.test(url)) return { ok: false, motivo: "anexo sem endereço https" };
  const legenda = (anexo.legenda ?? "").trim();
  const nome = (anexo.nome ?? "").trim();

  const ehAudio = anexo.conteudo === "audio";
  const rota = ehAudio ? "sendWhatsAppAudio" : "sendMedia";
  const corpoDoEnvio = ehAudio
    ? { number: destino, audio: url }
    : {
        number: destino,
        mediatype: anexo.conteudo === "imagem" ? "image" : anexo.conteudo === "video" ? "video" : "document",
        mimetype: anexo.tipo,
        media: url,
        ...(legenda ? { caption: legenda } : {}),
        ...(nome ? { fileName: nome } : {}),
      };

  const transporte = opcoes.transporte ?? fetch;
  const controle = new AbortController();
  // Vídeo e documento são maiores que a foto do carro: a Evolution baixa,
  // sobe para o WhatsApp e só então responde.
  const relogio = setTimeout(() => controle.abort(), opcoes.timeoutMs ?? TIMEOUT_MS * 4);
  try {
    const resposta = await transporte(`${cfg.url}/message/${rota}/${encodeURIComponent(cfg.instancia)}`, {
      method: "POST",
      headers: { apikey: cfg.chave, "Content-Type": "application/json" },
      body: JSON.stringify(corpoDoEnvio),
      signal: controle.signal,
    });
    const corpo = (await resposta.json().catch(() => null)) as CorpoDaResposta | null;
    if (!resposta.ok) {
      const detalhe = corpo?.response?.message ?? corpo?.message ?? corpo?.error ?? `HTTP ${resposta.status}`;
      return { ok: false, motivo: `a Evolution recusou o anexo: ${String(Array.isArray(detalhe) ? detalhe.join("; ") : detalhe).slice(0, 200)}` };
    }
    const waId = typeof corpo?.key?.id === "string" ? corpo.key.id : null;
    return { ok: true, waId };
  } catch (erro) {
    const abortou = erro instanceof Error && erro.name === "AbortError";
    return {
      ok: false,
      motivo: abortou ? "a Evolution não respondeu a tempo" : `falha ao falar com a Evolution: ${erro instanceof Error ? erro.message : String(erro)}`,
      ...(abortou ? { incerto: true } : {}),
    };
  } finally {
    clearTimeout(relogio);
  }
}

/** ~35 caracteres por segundo, entre 1,2 s e 6 s. */
export function atrasoDeDigitacao(texto: string): number {
  return Math.max(1200, Math.min(6000, Math.round((texto.length / 35) * 1000)));
}
