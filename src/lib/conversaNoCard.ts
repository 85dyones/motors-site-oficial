/**
 * A conversa no card do quadro (21/10/2026): quem falou por último e se o
 * cliente está esperando resposta.
 *
 * Pedidos do dono, no mesmo dia: *"precisamos de uma forma visual de ver no
 * painel os leads que estão com mensagens atuais sem resposta"* — um selo no
 * card, um filtro "Esperando resposta" no quadro, e o selo fica vermelho aos
 * 10 minutos — e, logo depois, *"temos que ter uma visualização clara sobre
 * leads que estão com o Ney, assim como as mensagens, para não precisar abrir
 * cada um"*.
 *
 * A régua é a conversa do painel (`atendimento_mensagens`), que desde a saída
 * do Chatwoot é a conversa inteira: o cliente escreveu (entrada) e, depois
 * disso, ninguém da loja mandou nada (saída) — nem o Ney, nem o vendedor pelo
 * painel, nem o vendedor pelo celular da loja (o eco da Evolution entra como
 * saída). O "desde" é a PRIMEIRA mensagem sem resposta: quem mandou três
 * mensagens seguidas espera desde a primeira, e não desde a última.
 *
 * O que não conta como resposta: a saída que falhou. O cliente não a recebeu.
 *
 * O que não abre espera: a figurinha e o "ok, obrigado" (`soEncerra`). Sem o
 * botão "Já respondi" — que o dono não escolheu —, o "valeu 👍" no fim de uma
 * conversa resolvida deixaria o card vermelho até alguém escrever de novo, e
 * vermelho que não pede nada treina a equipe a ignorar vermelho. Pergunta
 * nunca encerra: com `?`, abre espera, curta ou não.
 *
 * Puro: o "agora" entra por parâmetro, em milissegundos. Quem lê o banco é
 * `conversaNoCard-servidor.ts`.
 */
import { semCpf } from "./aquecimento";
import { espera } from "./funil";

// ---------------------------------------------------------------------------
// A conversa → desde quando o cliente espera, e a última mensagem
// ---------------------------------------------------------------------------

/** O que a régua lê de cada linha de `atendimento_mensagens`. */
export interface MensagemDoCard {
  lead_id: string | null;
  direcao: string;
  autor?: string | null;
  autor_nome?: string | null;
  situacao?: string | null;
  conteudo?: string | null;
  texto?: string | null;
  criado_em: string;
}

/** A última mensagem da conversa, como o card a mostra. */
export interface UltimaMensagem {
  /** `cliente`, `assistente`, `vendedor` ou `sistema`. */
  autor: string;
  /** Quem escreveu, para a linha do card: "Cliente", o nome do Ney, o do vendedor. */
  quem: string;
  /** O texto, curto e sem CPF; sem texto, o tipo ("[Áudio]", "[Foto]"). */
  texto: string;
  criado_em: string;
}

/** A conversa de um lead no card. */
export interface ConversaNoCard {
  esperando_resposta_desde: string | null;
  ultima_mensagem: UltimaMensagem | null;
}

/**
 * As palavras de quem está encerrando. A mensagem só encerra se TODAS as
 * palavras dela estão aqui: "ok obrigado" encerra; "ok, quanto fica" não.
 * Sem acento e em minúsculas, como `normalizar` deixa o texto.
 *
 * Fora de propósito: "sim" e "pode" (respondem a uma pergunta da loja, e o
 * vendedor tem o que fazer), cumprimentos ("bom dia" abre conversa, não
 * fecha) e "bem" ("tudo bem" é tanto concordância quanto pergunta).
 */
const PALAVRAS_DE_QUEM_ENCERRA = new Set([
  "ok", "okay", "blz", "beleza", "obg", "obgd", "obrigado", "obrigada", "brigado", "brigada", "muito",
  "valeu", "vlw", "show", "top", "perfeito", "combinado", "certo", "ta", "bom", "tudo", "joia", "joinha",
  "ate", "mais", "logo", "amanha", "entao", "otimo", "otima", "massa", "fechado",
]);

/** Mensagem que encerra é curta; acima disto, é conversa. */
const TETO_DE_QUEM_ENCERRA = 40;

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // "okkk", "obrigadoo", "valeuuu": a letra esticada é a mesma palavra.
    .replace(/(\p{L})\1+/gu, "$1");
}

/**
 * Esta mensagem do cliente só fecha a conversa — não pede nada.
 *
 * Figurinha encerra. Texto encerra quando não tem pergunta, é curto e é feito
 * só de emoji, pontuação e `PALAVRAS_DE_QUEM_ENCERRA`. Áudio, foto e
 * documento sem legenda NÃO encerram: não dá para saber o que dizem, e a
 * foto do carro na troca é justamente o que pede resposta.
 */
export function soEncerra(m: Pick<MensagemDoCard, "conteudo" | "texto">): boolean {
  if (m.conteudo === "figurinha") return true;
  if ((m.conteudo ?? "texto") !== "texto") return false;
  const texto = (m.texto ?? "").trim();
  if (!texto || texto.includes("?") || texto.length > TETO_DE_QUEM_ENCERRA) return false;
  const palavras = normalizar(texto).match(/[\p{L}\p{N}]+/gu) ?? [];
  // Só emoji e pontuação ("👍", "🙏🙏"): encerra.
  return palavras.every((p) => PALAVRAS_DE_QUEM_ENCERRA.has(p) || PALAVRAS_DE_QUEM_ENCERRA.has(p.replace(/s$/, "")));
}

/**
 * A resposta automática do WhatsApp Business do cliente (visto em produção,
 * 21/10): o Ney tocou o Javier e, 9 segundos depois, chegou "Olá! Seja
 * bem-vindo à *CÉSAS Effects & Designs!* 😊 Agradecemos muito pelo seu
 * contato… retornaremos com o orçamento". O Ney respondeu como se fosse o
 * cliente e entregou o lead de novo ao vendedor.
 *
 * Reconhece pela frase e pela pressa: a mensagem de boas-vindas, ausência ou
 * horário que chega até um minuto depois de uma mensagem da loja é a máquina
 * do cliente respondendo, não ele. "Mensagem automática" dita com todas as
 * letras vale a qualquer hora. Gente de verdade escreve "te retorno", não
 * "retornaremos".
 */
export const JANELA_DA_RESPOSTA_AUTOMATICA_MS = 60_000;
const FRASE_AUTOMATICA_SEMPRE = /\b(mensagem|resposta|atendimento)\s+autom[aá]tic[oa]\b/i;
const FRASE_AUTOMATICA_NA_PRESSA =
  /\b(seja|sejam)\s+bem[-\s]?vind[oa]s?\b|\bagradecemos\b[^.!?\n]{0,40}\b(contato|mensagem|prefer[eê]ncia)|\bobrigad[oa]\s+por\s+(entrar\s+em\s+contato|nos\s+contatar|sua\s+mensagem|seu\s+contato)|\bretornaremos\b|\bem\s+breve\s+(retornaremos|responderemos|entraremos)|\bhor[aá]rio\s+de\s+atendimento\b|\bfora\s+do\s+(nosso\s+)?hor[aá]rio\b|\bno\s+momento\s+n[aã]o\s+(podemos|estamos|conseguimos)/i;

export function pareceRespostaAutomatica(m: Pick<MensagemDoCard, "conteudo" | "texto">, msDesdeASaidaDaLoja: number | null): boolean {
  if ((m.conteudo ?? "texto") !== "texto") return false;
  const texto = (m.texto ?? "").trim();
  if (!texto) return false;
  if (FRASE_AUTOMATICA_SEMPRE.test(texto)) return true;
  return msDesdeASaidaDaLoja !== null && msDesdeASaidaDaLoja >= 0 && msDesdeASaidaDaLoja <= JANELA_DA_RESPOSTA_AUTOMATICA_MS && FRASE_AUTOMATICA_NA_PRESSA.test(texto);
}

const instante = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/**
 * Desde quando o cliente deste lead espera resposta; `null` se não espera.
 * As mensagens chegam em qualquer ordem — a leitura do banco vem da mais nova
 * para a mais antiga — e são de UM lead.
 */
export function esperandoDesde(mensagens: readonly MensagemDoCard[]): string | null {
  const emOrdem = [...mensagens].sort((a, b) => instante(a.criado_em) - instante(b.criado_em));
  let desde: string | null = null;
  let ultimaSaida: number | null = null;
  for (const m of emOrdem) {
    if (m.direcao === "saida") {
      if (m.situacao !== "falhou") desde = null;
      ultimaSaida = instante(m.criado_em);
    } else if (
      m.direcao === "entrada" &&
      desde === null &&
      !soEncerra(m) &&
      // A resposta automática do WhatsApp do cliente também não espera ninguém.
      !pareceRespostaAutomatica(m, ultimaSaida === null ? null : instante(m.criado_em) - ultimaSaida)
    ) {
      desde = m.criado_em;
    }
  }
  return desde;
}

/** O rótulo da mensagem sem texto, como a conversa do painel a mostra. */
const SEM_TEXTO: Record<string, string> = {
  audio: "[Áudio]",
  imagem: "[Foto]",
  video: "[Vídeo]",
  documento: "[Documento]",
  figurinha: "[Figurinha]",
  localizacao: "[Localização]",
  contato: "[Contato]",
};

/** O texto da linha do card: uma linha só, até este tamanho. */
export const TETO_DO_TEXTO_NO_CARD = 140;

/**
 * A última mensagem de UM lead, para a linha do card. A saída que falhou não
 * conta: o cliente não a leu, e a linha diria que a loja falou por último.
 */
export function ultimaMensagem(mensagens: readonly MensagemDoCard[]): UltimaMensagem | null {
  let ultima: MensagemDoCard | null = null;
  for (const m of mensagens) {
    if (m.direcao === "saida" && m.situacao === "falhou") continue;
    if (!ultima || instante(m.criado_em) >= instante(ultima.criado_em)) ultima = m;
  }
  if (!ultima) return null;
  const autor = ultima.autor ?? (ultima.direcao === "entrada" ? "cliente" : "vendedor");
  // A saída leva o nome de quem a escreveu: o do assistente (o nome da
  // configuração), o do vendedor no painel, "Loja" no histórico do celular.
  const quem = autor === "cliente" ? "Cliente" : (ultima.autor_nome ?? "").trim().split(/\s+/)[0] || (autor === "assistente" ? "Ney" : "Loja");
  const escrito = semCpf((ultima.texto ?? "").replace(/\s+/g, " ").trim());
  const texto = escrito
    ? escrito.length > TETO_DO_TEXTO_NO_CARD
      ? `${escrito.slice(0, TETO_DO_TEXTO_NO_CARD - 1).trimEnd()}…`
      : escrito
    : (SEM_TEXTO[ultima.conteudo ?? ""] ?? "[Mensagem]");
  return { autor, quem, texto, criado_em: ultima.criado_em };
}

/** A conversa de cada lead, de UMA leitura de mensagens de vários leads. Só os que têm mensagem. */
export function conversasPorLead(mensagens: readonly MensagemDoCard[]): Map<string, ConversaNoCard> {
  const porLead = new Map<string, MensagemDoCard[]>();
  for (const m of mensagens) {
    if (!m.lead_id) continue;
    const lista = porLead.get(m.lead_id);
    if (lista) lista.push(m);
    else porLead.set(m.lead_id, [m]);
  }
  const conversas = new Map<string, ConversaNoCard>();
  for (const [lead, lista] of porLead) {
    conversas.set(lead, { esperando_resposta_desde: esperandoDesde(lista), ultima_mensagem: ultimaMensagem(lista) });
  }
  return conversas;
}

// ---------------------------------------------------------------------------
// A tela: o selo, o filtro e a ordem da coluna
// ---------------------------------------------------------------------------

/** Aos 10 minutos o selo fica vermelho (escolha do dono, 21/10/2026). */
export const PRAZO_DA_RESPOSTA_MIN = 10;

/**
 * Com o Ney na conversa, a resposta leva até uns dois minutos: 12 s de espera
 * pela rajada (`ESPERA_DA_RAJADA_MS`) e até 2 min de geração. Antes disto o
 * selo não aparece — o cliente não está esperando ninguém, o Ney está
 * escrevendo. Depois, aparece: o Ney travou, e alguém precisa olhar.
 */
export const FOLGA_DO_ASSISTENTE_MIN = 3;

/** O que o selo precisa saber do lead. */
export interface LeadQueEspera {
  esperando_resposta_desde?: string | null;
  assistente_fase?: string | null;
  desfecho?: string | null;
}

/** As fases em que o Ney responde o cliente (`FASES_COM_O_ASSISTENTE` do servidor). */
function oNeyResponde(lead: LeadQueEspera): boolean {
  return lead.assistente_fase === "qualificando" || lead.assistente_fase === "reaquecendo";
}

/** Há quantos minutos o cliente espera; `null` quando não espera (ou o Ney ainda está no prazo dele). */
export function minutosEsperando(lead: LeadQueEspera, agora: number): number | null {
  if (lead.desfecho || !lead.esperando_resposta_desde) return null;
  const desde = Date.parse(lead.esperando_resposta_desde);
  if (!Number.isFinite(desde)) return null;
  const minutos = Math.max(0, Math.floor((agora - desde) / 60000));
  if (oNeyResponde(lead) && minutos < FOLGA_DO_ASSISTENTE_MIN) return null;
  return minutos;
}

/** `esperando` (âmbar) até o prazo; `atrasada` (vermelho) dali em diante. */
export type NivelDaEspera = "esperando" | "atrasada";

export function nivelDaEspera(minutos: number | null): NivelDaEspera | null {
  if (minutos === null) return null;
  return minutos >= PRAZO_DA_RESPOSTA_MIN ? "atrasada" : "esperando";
}

/** "Cliente esperando · 12 min" — a régua de texto do rodapé do card (`espera`). */
export function textoDaEspera(lead: LeadQueEspera, agora: number): string | null {
  if (minutosEsperando(lead, agora) === null) return null;
  return `Cliente esperando · ${espera(lead.esperando_resposta_desde as string, agora)}`;
}

/** O filtro "Esperando resposta". */
export function filtrarEsperando<T extends LeadQueEspera>(leads: readonly T[], agora: number): T[] {
  return leads.filter((l) => minutosEsperando(l, agora) !== null);
}

/**
 * A coluna com quem espera no topo, quem espera há mais tempo primeiro. O
 * resto mantém a ordem em que veio (a da fila, o mais novo primeiro).
 */
export function esperandoPrimeiro<T extends LeadQueEspera>(leads: readonly T[], agora: number): T[] {
  const esperando: Array<{ lead: T; minutos: number }> = [];
  const resto: T[] = [];
  for (const lead of leads) {
    const minutos = minutosEsperando(lead, agora);
    if (minutos === null) resto.push(lead);
    else esperando.push({ lead, minutos });
  }
  esperando.sort((a, b) => b.minutos - a.minutos);
  return [...esperando.map((e) => e.lead), ...resto];
}

// ---------------------------------------------------------------------------
// As novidades do minuto (`GET /api/leads/novidades`)
// ---------------------------------------------------------------------------

/** O estado que as novidades trazem de cada lead que mudou. */
export const CAMPOS_DAS_NOVIDADES = [
  "situacao",
  "responsavel",
  "desfecho",
  "assistente_fase",
  "cadencia",
  "cadencia_passo",
  "cadencia_proximo_em",
  "temperatura",
  "aquecimento",
  "optout_em",
] as const;

export interface NovidadesDoQuadro {
  agora?: unknown;
  conversas?: unknown;
  leads?: unknown;
}

/**
 * Junta as novidades aos leads da tela.
 *
 *   - a conversa vale para TODOS os leads: quem não veio em `conversas` não
 *     teve mensagem na janela e não espera ninguém;
 *   - o estado (`CAMPOS_DAS_NOVIDADES`) só nos leads que já estão na tela e
 *     que ninguém mexeu agora há pouco (`intocaveis`): o card que acabou de
 *     ser arrastado não volta para a coluna de antes porque a resposta saiu
 *     antes da gravação. O lead que mudou e não está na tela fica para o
 *     próximo Atualizar.
 *
 * Resposta fora do formato não muda nada.
 */
export function aplicarNovidades<T extends { id: string; esperando_resposta_desde?: string | null; ultima_mensagem?: UltimaMensagem | null }>(
  leads: readonly T[],
  novidades: NovidadesDoQuadro | null | undefined,
  intocaveis: ReadonlySet<string> = new Set(),
): T[] {
  if (!novidades || typeof novidades !== "object") return [...leads];
  const conversas =
    novidades.conversas && typeof novidades.conversas === "object" && !Array.isArray(novidades.conversas)
      ? (novidades.conversas as Record<string, ConversaNoCard | undefined>)
      : null;
  const estados = new Map<string, Record<string, unknown>>();
  if (Array.isArray(novidades.leads)) {
    for (const l of novidades.leads as Array<Record<string, unknown>>) {
      if (l && typeof l.id === "string" && !intocaveis.has(l.id)) estados.set(l.id, l);
    }
  }
  return leads.map((lead) => {
    let novo: T = lead;
    if (conversas) {
      const c = conversas[lead.id];
      novo = { ...novo, esperando_resposta_desde: c?.esperando_resposta_desde ?? null, ultima_mensagem: c?.ultima_mensagem ?? null };
    }
    const estado = estados.get(lead.id);
    if (estado) {
      const campos: Record<string, unknown> = {};
      for (const campo of CAMPOS_DAS_NOVIDADES) if (campo in estado) campos[campo] = estado[campo];
      novo = { ...novo, ...campos };
    }
    return novo;
  });
}
