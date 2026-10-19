/**
 * O webhook da Evolution API vira fato do atendimento.
 *
 * Função pura: recebe o corpo cru de `messages.upsert` (Evolution v2), devolve
 * a mensagem que importa ou o motivo de ignorar. Quem grava é
 * `atendimento-servidor.ts`; quem chama é `/api/atendimento/evolution`, com o
 * corpo que o n8n repassa sem mexer.
 *
 * ---------------------------------------------------------------------------
 * O que esta leitura NÃO faz, de propósito
 * ---------------------------------------------------------------------------
 * - **Não guarda o corpo.** O envelope da Evolution traz `apikey` — a chave da
 *   instância — em todo evento. Nada daqui o lê, e nada daqui devolve o
 *   envelope; só os campos abaixo saem.
 * - **Não segue grupo, status nem canal.** `@g.us`, `status@broadcast` e
 *   `@newsletter` não são cliente: um "bom dia" no grupo da família do
 *   vendedor não pode virar lead.
 * - **Não decide nada.** Se a mensagem é da equipe, do robô ou de gente da
 *   loja escrevendo no celular, quem decide é o servidor, que conhece o
 *   cadastro e as mensagens que ele mesmo mandou.
 */

export type ConteudoDaMensagem =
  | "texto"
  | "audio"
  | "imagem"
  | "video"
  | "documento"
  | "figurinha"
  | "localizacao"
  | "contato"
  | "outro";

/**
 * De onde a conversa veio, quando o WhatsApp conta: anúncio de clique para o
 * WhatsApp (Meta), link de conversa, busca. É o que o manobrAI não tem e o
 * painel precisa — sem isto, toda conversa que nasce de anúncio cai em
 * "WhatsApp" e o relatório de origem não separa verba de boca a boca.
 */
export interface OrigemDaConversa {
  /** `ad` quando veio de anúncio. */
  tipo: string | null;
  /** Id do anúncio na Meta (`sourceId`). */
  anuncio_id: string | null;
  titulo: string | null;
  url: string | null;
  /** O clique do anúncio (`ctwaClid`), para a CAPI casar a conversão. */
  ctwa_clid: string | null;
  /** `ctwa_ad`, `click_to_chat_link`, `global_search_new_chat`… */
  entrada: string | null;
}

export interface MensagemDaEvolution {
  tipo: "mensagem";
  /** O id da mensagem no WhatsApp (`key.id`). Chave de idempotência. */
  waId: string;
  /** Dígitos com DDI, como `leads.telefone`. */
  telefone: string;
  /** O nome que a pessoa pôs no WhatsApp (`pushName`). Pode ser apelido. */
  nome: string | null;
  /** Saiu do número da loja (robô, painel ou alguém no celular da loja). */
  deMim: boolean;
  conteudo: ConteudoDaMensagem;
  /** Texto, legenda ou transcrição. Nulo em mídia sem legenda. */
  texto: string | null;
  origem: OrigemDaConversa | null;
  /** ISO 8601. O horário do WhatsApp quando veio, senão o de agora. */
  em: string;
  /**
   * De onde a mensagem saiu, segundo a Evolution (`data.source`): `android`
   * e `ios` são gente com o celular na mão; `web` é WhatsApp Web OU envio
   * pela API — inclusive de outra automação do n8n. Ver `digitadaNoCelular`.
   */
  aparelho: string | null;
}

export interface EventoIgnorado {
  tipo: "ignorado";
  motivo: string;
}

export type EventoDaEvolution = MensagemDaEvolution | EventoIgnorado;

const ignorar = (motivo: string): EventoIgnorado => ({ tipo: "ignorado", motivo });

function texto(v: unknown, max = 4000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Os dígitos de um JID de pessoa, ou nulo.
 *
 * Só `@s.whatsapp.net` (e o antigo `@c.us`) são número de telefone. Mesma
 * faixa de `telefoneDoChatwoot`: 12 ou 13 dígitos, que é o celular ou fixo
 * brasileiro com DDI. Fora disso devolve nulo — casar telefone errado junta o
 * lead de uma pessoa com a conversa de outra.
 */
export function telefoneDoJid(jid: unknown): string | null {
  const j = texto(jid, 200);
  if (!j) return null;
  const [usuario, dominio] = j.split("@");
  if (dominio !== "s.whatsapp.net" && dominio !== "c.us") return null;
  const digitos = (usuario ?? "").split(":")[0].replace(/\D/g, "");
  return digitos.length >= 12 && digitos.length <= 13 ? digitos : null;
}

/**
 * O JID que identifica a pessoa da conversa.
 *
 * Desde 2025 o WhatsApp pode entregar o remetente como LID (`…@lid`), um id
 * que não é telefone. A Evolution manda o número de verdade ao lado, num
 * campo cujo nome mudou de versão em versão (`remoteJidAlt`, `senderPn`).
 * Sem esta volta, a conversa de quem tem LID chegaria sem telefone e nunca
 * casaria com o lead do formulário.
 */
function jidDaPessoa(chave: Record<string, unknown>, dados: Record<string, unknown>): string | null {
  const remoto = texto(chave.remoteJid, 200);
  if (remoto && !remoto.endsWith("@lid")) return remoto;
  for (const alternativo of [chave.remoteJidAlt, chave.senderPn, dados.senderPn, chave.participantAlt]) {
    const t = texto(alternativo, 200);
    if (t && !t.endsWith("@lid")) return t.includes("@") ? t : `${t}@s.whatsapp.net`;
  }
  return remoto;
}

/** Tira os envelopes que o WhatsApp põe em volta da mensagem de verdade. */
function desembrulhar(mensagem: Record<string, unknown>): Record<string, unknown> {
  let atual = mensagem;
  for (let i = 0; i < 4; i += 1) {
    const envelope =
      objeto(atual.ephemeralMessage) ??
      objeto(atual.viewOnceMessage) ??
      objeto(atual.viewOnceMessageV2) ??
      objeto(atual.viewOnceMessageV2Extension) ??
      objeto(atual.documentWithCaptionMessage);
    const dentro = objeto(envelope?.message);
    if (!dentro) break;
    atual = dentro;
  }
  return atual;
}

/** O que a mensagem diz, e de que tipo ela é. */
function lerConteudo(mensagem: Record<string, unknown>): { conteudo: ConteudoDaMensagem; texto: string | null } | null {
  const m = desembrulhar(mensagem);

  // Reação, apagar, editar e confirmações de protocolo não são fala do cliente.
  if (m.reactionMessage || m.protocolMessage || m.editedMessage) return null;

  // A transcrição que a Evolution faz quando o speech-to-text está ligado.
  const transcricao = texto(m.speechToText) ?? texto(mensagem.speechToText);

  const conversa = texto(m.conversation);
  if (conversa) return { conteudo: "texto", texto: conversa };
  const estendido = objeto(m.extendedTextMessage);
  if (estendido) return { conteudo: "texto", texto: texto(estendido.text) };

  const botao =
    texto(objeto(m.buttonsResponseMessage)?.selectedDisplayText) ??
    texto(objeto(m.templateButtonReplyMessage)?.selectedDisplayText) ??
    texto(objeto(m.listResponseMessage)?.title);
  if (botao) return { conteudo: "texto", texto: botao };

  if (m.audioMessage) return { conteudo: "audio", texto: transcricao };
  const imagem = objeto(m.imageMessage);
  if (imagem) return { conteudo: "imagem", texto: texto(imagem.caption) };
  const video = objeto(m.videoMessage);
  if (video) return { conteudo: "video", texto: texto(video.caption) };
  const documento = objeto(m.documentMessage);
  if (documento) return { conteudo: "documento", texto: texto(documento.caption) ?? texto(documento.fileName, 200) };
  if (m.stickerMessage) return { conteudo: "figurinha", texto: null };
  if (m.locationMessage || m.liveLocationMessage) return { conteudo: "localizacao", texto: null };
  if (m.contactMessage || m.contactsArrayMessage) return { conteudo: "contato", texto: null };

  return { conteudo: "outro", texto: transcricao };
}

/** O `contextInfo` pode vir dentro da mensagem ou no nível dos dados. */
function lerOrigem(dados: Record<string, unknown>, mensagem: Record<string, unknown>): OrigemDaConversa | null {
  const m = desembrulhar(mensagem);
  const candidatos = [
    objeto(dados.contextInfo),
    objeto(objeto(m.extendedTextMessage)?.contextInfo),
    objeto(objeto(m.imageMessage)?.contextInfo),
    objeto(objeto(m.videoMessage)?.contextInfo),
    objeto(m.messageContextInfo),
  ];
  for (const contexto of candidatos) {
    if (!contexto) continue;
    const anuncio = objeto(contexto.externalAdReply);
    const entrada = texto(contexto.entryPointConversionSource, 80) ?? texto(contexto.conversionSource, 80);
    if (!anuncio && !entrada) continue;
    return {
      tipo: texto(anuncio?.sourceType, 40),
      anuncio_id: texto(anuncio?.sourceId, 80),
      titulo: texto(anuncio?.title, 200),
      url: texto(anuncio?.sourceUrl, 500),
      ctwa_clid: texto(anuncio?.ctwaClid, 200),
      entrada,
    };
  }
  return null;
}

/** `messageTimestamp` vem em segundos, como número, texto ou `{ low, high }`. */
function quando(bruto: unknown, agora: Date): string {
  let segundos: number | null = null;
  if (typeof bruto === "number") segundos = bruto;
  else if (typeof bruto === "string" && /^\d+$/.test(bruto)) segundos = Number(bruto);
  else if (objeto(bruto) && typeof objeto(bruto)!.low === "number") segundos = objeto(bruto)!.low as number;
  // Fora de 2020–2100 é lixo ou milissegundo: fica o relógio daqui.
  if (segundos === null || segundos < 1_577_836_800 || segundos > 4_102_444_800) return agora.toISOString();
  return new Date(segundos * 1000).toISOString();
}

/**
 * O corpo da Evolution, como o n8n repassa.
 *
 * Aceita o envelope inteiro (`{ event, instance, data }`) e também `data`
 * sozinho, que é como um nó do n8n costuma achatar. `event` vem como
 * `messages.upsert` ou, em configurações antigas, `MESSAGES_UPSERT`.
 */
export function interpretarEventoDaEvolution(bruto: unknown, agora: Date = new Date()): EventoDaEvolution {
  const corpo = objeto(bruto);
  if (!corpo) return ignorar("corpo vazio ou não-objeto");

  const evento = texto(corpo.event, 80)?.toLowerCase().replace(/_/g, ".");
  if (evento && evento !== "messages.upsert") return ignorar(`evento ${evento}`);

  // `data` pode vir como lista quando a Evolution agrupa.
  const dadosBrutos = Array.isArray(corpo.data) ? corpo.data[0] : corpo.data ?? corpo;
  const dados = objeto(dadosBrutos);
  if (!dados) return ignorar("sem `data`");

  const chave = objeto(dados.key);
  if (!chave) return ignorar("sem `key`");
  const waId = texto(chave.id, 200);
  if (!waId) return ignorar("sem id de mensagem");

  const jid = jidDaPessoa(chave, dados);
  if (!jid) return ignorar("sem remetente");
  if (jid.endsWith("@g.us")) return ignorar("grupo");
  if (jid.endsWith("@broadcast")) return ignorar("status ou lista de transmissão");
  if (jid.endsWith("@newsletter")) return ignorar("canal");

  const telefone = telefoneDoJid(jid);
  if (!telefone) return ignorar("telefone não reconhecível");

  const mensagem = objeto(dados.message);
  if (!mensagem) return ignorar("sem `message`");
  const lido = lerConteudo(mensagem);
  if (!lido) return ignorar("reação, edição ou protocolo");

  const deMim = chave.fromMe === true;
  return {
    tipo: "mensagem",
    waId,
    telefone,
    // Em mensagem de saída, `pushName` é o nome da LOJA, não do cliente.
    nome: deMim ? null : texto(dados.pushName, 120),
    deMim,
    conteudo: lido.conteudo,
    texto: lido.texto,
    origem: deMim ? null : lerOrigem(dados, mensagem),
    em: quando(dados.messageTimestamp, agora),
    aparelho: texto(dados.source, 20)?.toLowerCase() ?? null,
  };
}

/**
 * Mensagem do celular da loja que tira o assistente da conversa?
 *
 * Régua do manobrAI, e com razão: **texto e vídeo pausam; áudio, foto e
 * documento não**. Quem manda a foto do carro pelo celular da loja está
 * ajudando o assistente, não assumindo; quem escreve está conversando.
 * Vídeo entra junto do texto porque é o vídeo de apresentação que o vendedor
 * grava para aquele cliente.
 */
export function mensagemDaLojaAssume(conteudo: ConteudoDaMensagem): boolean {
  return conteudo === "texto" || conteudo === "video";
}

/**
 * A mensagem do número da loja foi digitada por gente, com certeza?
 *
 * Só `android` e `ios`. Envio pela API (o fluxo do Ciclo no n8n, um disparo
 * de outra ferramenta) chega como `web`, igual ao WhatsApp Web — e contar
 * robô como atendimento congelaria o relógio do funil (a régua "robô não
 * atende" de WEBHOOKS_N8N.md). Na dúvida, não reinicia: cobrar de novo se
 * conserta com um clique; deixar de cobrar é silencioso.
 */
export function digitadaNoCelular(aparelho: string | null | undefined): boolean {
  return aparelho === "android" || aparelho === "ios";
}

/** Rótulo curto para a conversa no painel quando não há texto. */
export const ROTULO_DO_CONTEUDO: Record<ConteudoDaMensagem, string> = {
  texto: "Mensagem",
  audio: "Áudio",
  imagem: "Foto",
  video: "Vídeo",
  documento: "Documento",
  figurinha: "Figurinha",
  localizacao: "Localização",
  contato: "Contato",
  outro: "Mensagem",
};
