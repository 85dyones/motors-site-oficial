/**
 * O que o Chatwoot conta para o painel — e o que o painel faz com isso.
 *
 * Este módulo é só leitura de envelope: recebe o corpo cru do webhook e devolve
 * o fato em português. Não fala com banco, não faz rede, e por isso a régua
 * inteira cabe num teste de unidade — que é onde ela tem de ser discutida, e
 * não dentro de um `if` no meio de uma rota.
 *
 * ---------------------------------------------------------------------------
 * Os dois buracos que ele existe para tapar (medidos em 2026-09-15)
 * ---------------------------------------------------------------------------
 * 1. **Conversa que nasce no WhatsApp nunca virava lead.** 41 das 46 linhas de
 *    `atendimentos` estavam com `lead_id` nulo: o cliente escreveu, o Chatwoot
 *    abriu a conversa, e o painel nunca soube. Só quem preenchia formulário no
 *    site entrava no kanban, porque só `/api/leads` gravava em `leads`.
 *
 * 2. **Responder no Chatwoot não parava o relógio da estagnação.** O rastro
 *    tinha 4 eventos de `contato` (todos de clique no painel) contra 15
 *    `transferencia` automáticas. Quem atendia pelo Chatwoot continuava sendo
 *    cobrado — e perdia o lead para o próximo da fila — porque
 *    `ultimo_contato_em` só era escrito pela própria tela.
 *
 * ---------------------------------------------------------------------------
 * A regra que mais importa aqui: robô não atende
 * ---------------------------------------------------------------------------
 * Mensagem que SAI da loja reinicia o relógio **só quando um humano a
 * escreveu**. Um autoatendimento, um template de saudação ou uma campanha
 * saem como `outgoing` igualzinho — e se contassem como atendimento, o
 * primeiro "Olá! Recebemos seu contato" congelaria o lead para sempre: nunca
 * mais estagnado, nunca mais transferido, nunca mais cobrado de ninguém. O
 * funil ficaria verde com a carteira parada, que é o pior estado possível.
 *
 * Por isso o padrão é DESCARTAR: sem remetente identificado como gente, o
 * evento vira `ignorado`. Errar para o lado de continuar cobrando é
 * recuperável — o consultor clica no card. Errar para o outro lado é
 * silencioso.
 */

/** O que aconteceu, do ponto de vista do funil. */
export type TipoDeEventoDoChatwoot =
  /** O cliente escreveu. É o que cria lead e o que abre atendimento. */
  | "mensagem_do_cliente"
  /** Um consultor de carne e osso respondeu. É o que para o relógio. */
  | "mensagem_do_consultor"
  /** A conversa nasceu, mudou de status ou foi resolvida. */
  | "conversa"
  /** Nada que o funil precise saber. Sempre com motivo — ver `motivo`. */
  | "ignorado";

export interface EventoDoChatwoot {
  tipo: TipoDeEventoDoChatwoot;
  /** Id da conversa. Sem ele não há o que gravar: `atendimentos` é única por conversa. */
  conversaId: number | null;
  contatoId: number | null;
  inboxId: number | null;
  statusConversa: string | null;
  /** `resolved` é o único status que encerra. `closed` não existe no Chatwoot. */
  encerrada: boolean;
  /** Dígitos com DDI, como `leads.telefone` guarda. `null` quando não veio. */
  telefone: string | null;
  nome: string | null;
  /** Nome do agente que respondeu — vai para o `autor` do rastro. */
  autor: string | null;
  /** Por que foi ignorado. Fila que descarta em silêncio é fila que ninguém audita. */
  motivo?: string;
}

/** Lê um inteiro de um campo que pode vir número, string ou lixo. */
function inteiro(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.trunc(v) : null;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) {
    const n = Number(v.trim());
    return n > 0 ? n : null;
  }
  return null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * O telefone do Chatwoot em dígitos com DDI.
 *
 * Chega como E.164 (`+5541999990000`). O `+` sai, o resto fica — é o formato
 * que `leads.telefone` já usa (`55` + DDD + número), gravado por `/api/leads`.
 */
export function telefoneDoChatwoot(bruto: unknown): string | null {
  const digitos = (typeof bruto === "string" ? bruto : "").replace(/\D/g, "");
  // Menos de 12 não é número brasileiro com DDI (55 + DDD + 8). Mais de 13
  // também não. Fora da faixa devolve nulo: casar telefone errado junta o lead
  // de uma pessoa com a conversa de outra, e isso é pior que não casar.
  return digitos.length >= 12 && digitos.length <= 13 ? digitos : null;
}

/**
 * As formas em que o MESMO celular brasileiro aparece — com e sem o nono dígito.
 *
 * Sem isto o casamento falha exatamente onde dói. O site grava o que a pessoa
 * digitou no formulário; o WhatsApp devolve o que a operadora registrou, e as
 * duas formas convivem há mais de uma década. Um lead gravado como
 * `5541999990000` e uma conversa que chega como `554199990000` são a mesma
 * pessoa, e comparar string com string cria um lead duplicado a cada resposta.
 *
 * Só para celular (DDD + 9 dígitos começando em 9, ou DDD + 8). Fixo não tem
 * nono dígito e é devolvido como veio.
 */
export function variantesDoTelefone(digitos: string | null | undefined): string[] {
  const n = (digitos ?? "").replace(/\D/g, "");
  if (!n) return [];

  const ddi = n.slice(0, 2);
  const ddd = n.slice(2, 4);
  const resto = n.slice(4);
  if (ddi !== "55" || ddd.length !== 2) return [n];

  const formas = new Set<string>([n]);
  if (resto.length === 8) formas.add(`55${ddd}9${resto}`);
  if (resto.length === 9 && resto.startsWith("9")) formas.add(`55${ddd}${resto.slice(1)}`);
  return [...formas];
}

/**
 * Quem escreveu saiu de gente?
 *
 * O Chatwoot marca o remetente de mensagem de saída com `type: "user"` quando
 * é um agente logado. Bot de automação vem como `agent_bot`, e campanha ou
 * regra automática costuma vir sem remetente nenhum. Ausência é tratada como
 * robô de propósito — ver o cabeçalho deste arquivo.
 */
function ehAgenteHumano(remetente: unknown): boolean {
  if (!remetente || typeof remetente !== "object") return false;
  const r = remetente as Record<string, unknown>;
  const tipo = texto(r.type)?.toLowerCase();
  if (tipo === "agent_bot" || tipo === "contact") return false;
  // `type` é o sinal forte; `email` é a rede de segurança para versões do
  // Chatwoot que não mandam `type` no remetente de saída. Agente tem e-mail
  // de login, bot não tem.
  return tipo === "user" || Boolean(texto(r.email));
}

/**
 * `message_type` vem como texto ("incoming") ou inteiro (0 = entrada,
 * 1 = saída), dependendo da versão e do ponto do Chatwoot que emite.
 */
function direcaoDaMensagem(v: unknown): "entrada" | "saida" | null {
  if (v === 0 || v === "0" || v === "incoming") return "entrada";
  if (v === 1 || v === "1" || v === "outgoing") return "saida";
  return null;
}

const IGNORADO = (motivo: string): EventoDoChatwoot => ({
  tipo: "ignorado",
  conversaId: null,
  contatoId: null,
  inboxId: null,
  statusConversa: null,
  encerrada: false,
  telefone: null,
  nome: null,
  autor: null,
  motivo,
});

/**
 * O corpo cru do Chatwoot vira fato do funil.
 *
 * Aceita as duas formas que o Chatwoot manda: em `message_created` a conversa
 * vem aninhada em `conversation`; nos eventos de conversa o próprio corpo É a
 * conversa, e o contato mora em `meta.sender`.
 */
export function interpretarEventoDoChatwoot(bruto: unknown): EventoDoChatwoot {
  if (!bruto || typeof bruto !== "object") return IGNORADO("corpo vazio ou não-objeto");
  const corpo = bruto as Record<string, unknown>;
  const evento = texto(corpo.event);
  if (!evento) return IGNORADO("sem campo `event`");

  const conversa = (
    corpo.conversation && typeof corpo.conversation === "object" ? corpo.conversation : corpo
  ) as Record<string, unknown>;
  const meta = (conversa.meta && typeof conversa.meta === "object" ? conversa.meta : {}) as Record<
    string,
    unknown
  >;

  const conversaId = inteiro(conversa.id) ?? inteiro(corpo.conversation_id);
  const statusConversa = texto(conversa.status);
  const caixaDeEntrada = (
    corpo.inbox && typeof corpo.inbox === "object" ? corpo.inbox : {}
  ) as Record<string, unknown>;
  const inboxId = inteiro(conversa.inbox_id) ?? inteiro(caixaDeEntrada.id);

  // O contato é o CLIENTE. Em `message_created` de entrada ele é o `sender`;
  // em evento de conversa, `meta.sender`. Nunca é o agente — por isso o
  // remetente de saída não alimenta telefone nem nome.
  const contatoDaConversa = (
    meta.sender && typeof meta.sender === "object" ? meta.sender : {}
  ) as Record<string, unknown>;
  const remetente = (corpo.sender && typeof corpo.sender === "object" ? corpo.sender : {}) as Record<
    string,
    unknown
  >;

  const base = {
    conversaId,
    inboxId,
    statusConversa,
    encerrada: statusConversa === "resolved",
  };

  if (evento === "message_created") {
    if (!conversaId) return IGNORADO("mensagem sem id de conversa");
    const direcao = direcaoDaMensagem(corpo.message_type);
    if (!direcao) return IGNORADO(`message_type desconhecido: ${String(corpo.message_type)}`);

    if (direcao === "entrada") {
      // O cliente escreveu: é aqui que o lead nasce, e é do `sender` que saem
      // telefone e nome.
      const contato = Object.keys(remetente).length ? remetente : contatoDaConversa;
      return {
        ...base,
        tipo: "mensagem_do_cliente",
        contatoId: inteiro(contato.id),
        telefone: telefoneDoChatwoot(contato.phone_number ?? contato.identifier),
        nome: texto(contato.name),
        autor: null,
      };
    }

    // Saída. Nota privada conta: o consultor que escreve "cliente pediu para
    // ligar terça" está trabalhando o lead, e o comentário de
    // `leads.ultimo_contato_em` já lista "anotar" como toque humano.
    if (!ehAgenteHumano(remetente)) {
      return IGNORADO("mensagem de saída automática — robô não atende");
    }
    return {
      ...base,
      tipo: "mensagem_do_consultor",
      contatoId: inteiro(contatoDaConversa.id),
      telefone: telefoneDoChatwoot(contatoDaConversa.phone_number ?? contatoDaConversa.identifier),
      nome: texto(contatoDaConversa.name),
      autor: texto(remetente.name) ?? texto(remetente.available_name),
    };
  }

  if (
    evento === "conversation_created" ||
    evento === "conversation_status_changed" ||
    evento === "conversation_updated" ||
    evento === "conversation_resolved"
  ) {
    if (!conversaId) return IGNORADO("evento de conversa sem id");
    return {
      ...base,
      tipo: "conversa",
      contatoId: inteiro(contatoDaConversa.id),
      telefone: telefoneDoChatwoot(contatoDaConversa.phone_number ?? contatoDaConversa.identifier),
      nome: texto(contatoDaConversa.name),
      autor: null,
    };
  }

  return IGNORADO(`evento sem efeito no funil: ${evento}`);
}
