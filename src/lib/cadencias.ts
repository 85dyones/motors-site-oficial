import { HORARIO_DA_LOJA, type ExpedienteDaLoja } from "./horarioDaLoja";
import { primeiroNome } from "./funil";

/**
 * As cadências de reaquecimento: quem recebe mensagem de acompanhamento, e
 * quando.
 *
 * ---------------------------------------------------------------------------
 * O pedido e a régua (2026-10-19)
 * ---------------------------------------------------------------------------
 * Pedido do dono: *"se a qualificação cai ou o lead não esquentou, ele tem
 * cadências de reaquecimento e engajamento"*. A régua vem do manobrAI, que
 * publica a dele:
 *
 *   - **follow-up** — perguntou de um carro e sumiu: até 3 mensagens, em dias
 *     diferentes;
 *   - **reativação** — sumiu sem dizer o que queria: até 3, uma por dia;
 *   - as duas param quando o cliente responde ou pede para sair, e só saem
 *     no horário da loja.
 *
 * A terceira é daqui: **engajamento**, para o lead que o vendedor DEVOLVE ao
 * assistente porque esfriou ("vai comprar mais para frente"). Prazos longos
 * (7, 15 e 30 dias), porque o assunto é outro: não é retomar uma conversa
 * de ontem, é lembrar que a loja existe quando o cliente voltar a procurar.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo nunca faz
 * ---------------------------------------------------------------------------
 * - **Disparo frio.** Só entra em cadência quem escreveu para a loja: o
 *   gatilho é sempre uma conversa que existiu. O número da loja entra no
 *   WhatsApp como aparelho conectado (Evolution), não pela API oficial, e
 *   mensagem em massa para quem nunca falou com a loja é o caminho mais curto
 *   para o número ser bloqueado — a mesma preocupação que o funil registrou
 *   em `docs/FUNIL_DE_VENDAS.md` §7.
 * - **Mais de um toque por vez.** A cadência anda um passo por rodada.
 * - **Toque fora do horário.** Fica para a abertura da loja; o relógio não
 *   anda, só espera.
 */

export type NomeDaCadencia = "follow_up" | "reativacao" | "engajamento";
export const NOMES_DAS_CADENCIAS: readonly NomeDaCadencia[] = ["follow_up", "reativacao", "engajamento"];

export const ROTULO_DA_CADENCIA: Record<NomeDaCadencia, string> = {
  follow_up: "Follow-up",
  reativacao: "Reativação",
  engajamento: "Engajamento",
};

export const QUANDO_A_CADENCIA_COMECA: Record<NomeDaCadencia, string> = {
  follow_up: "Perguntou de um carro e parou de responder.",
  reativacao: "Parou de responder sem dizer o que procura.",
  engajamento: "O vendedor devolveu o lead ao assistente porque esfriou.",
};

export interface PassoDaCadencia {
  /** Horas desde o passo anterior (ou desde a última mensagem, no primeiro). */
  apos_horas: number;
  /** O que este toque quer — vai para o modelo escrever a mensagem. */
  objetivo: string;
  /**
   * A mensagem pronta, com `{nome}` e `{interesse}`. É o que sai quando o
   * modelo não está disponível, e o tom que ele copia quando está.
   */
  modelo: string;
}

export interface Cadencia {
  ativa: boolean;
  passos: PassoDaCadencia[];
}

export type ReguaDeCadencias = Record<NomeDaCadencia, Cadencia>;

/** O teto do manobrAI, e o daqui: três toques e para. */
export const MAXIMO_DE_PASSOS = 3;

export const CADENCIAS_DE_FABRICA: ReguaDeCadencias = {
  follow_up: {
    ativa: true,
    passos: [
      {
        apos_horas: 20,
        objetivo: "Retomar o interesse no carro que ele perguntou, oferecendo fotos ou uma dúvida.",
        modelo: "Oi, {nome}! Ainda tem interesse no {interesse}? Se quiser, te mando mais fotos ou tiro alguma dúvida. 🙂",
      },
      {
        apos_horas: 48,
        objetivo: "Oferecer uma alternativa parecida do estoque ou a visita sem compromisso.",
        modelo: "{nome}, se o {interesse} não fechou com o que você precisa, tenho outras opções parecidas aqui. Quer que eu te mostre?",
      },
      {
        apos_horas: 72,
        objetivo: "Encerrar com gentileza, deixando a porta aberta.",
        modelo: "Vou deixar seu atendimento em pausa por aqui, {nome}. Quando quiser retomar, é só me chamar!",
      },
    ],
  },
  reativacao: {
    ativa: true,
    passos: [
      {
        apos_horas: 20,
        objetivo: "Descobrir o que ele procura, com uma pergunta simples.",
        modelo: "Oi, {nome}! Vi que você falou com a gente. Está procurando algum carro em especial?",
      },
      {
        apos_horas: 24,
        objetivo: "Oferecer ajuda para escolher, pedindo modelo ou quanto quer investir.",
        modelo: "{nome}, posso te ajudar a achar o carro certo: me conta o modelo que você procura ou quanto quer investir?",
      },
      {
        apos_horas: 24,
        objetivo: "Encerrar com gentileza, deixando a porta aberta.",
        modelo: "Fico à disposição, {nome}. Quando quiser, é só mandar uma mensagem por aqui.",
      },
    ],
  },
  engajamento: {
    ativa: true,
    passos: [
      {
        apos_horas: 24 * 7,
        objetivo: "Perguntar se ainda está procurando e citar uma novidade do estoque que combine com o interesse.",
        modelo: "Oi, {nome}! Tudo bem? Passando para saber se você ainda está procurando carro. Chegaram novidades aqui na loja.",
      },
      {
        apos_horas: 24 * 15,
        objetivo: "Mostrar uma opção do estoque parecida com o que ele queria.",
        modelo: "{nome}, lembrei de você: entrou um carro parecido com o {interesse}. Quer que eu te mande as fotos?",
      },
      {
        apos_horas: 24 * 30,
        objetivo: "Último contato, deixando a porta aberta.",
        modelo: "Oi, {nome}! Se em algum momento quiser voltar a ver carro, é só me chamar aqui. Abraço!",
      },
    ],
  },
};

function passoValido(bruto: unknown): PassoDaCadencia | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  const horas = Number(b.apos_horas);
  const modelo = typeof b.modelo === "string" ? b.modelo.trim() : "";
  const objetivo = typeof b.objetivo === "string" ? b.objetivo.trim() : "";
  // Menos de uma hora seria cutucar o cliente na mesma conversa; mais de 90
  // dias, uma cadência que ninguém lembra de ter ligado.
  if (!Number.isFinite(horas) || horas < 1 || horas > 24 * 90 || !modelo) return null;
  return { apos_horas: Math.round(horas), objetivo: objetivo.slice(0, 300), modelo: modelo.slice(0, 600) };
}

/**
 * A régua lida do banco, com a de fábrica onde faltar. Cadência sem passo
 * válido nenhum fica com os de fábrica (e não vazia), e nenhuma passa de três.
 */
export function reguaValida(bruto: unknown): ReguaDeCadencias {
  const regua = structuredClone(CADENCIAS_DE_FABRICA);
  if (!bruto || typeof bruto !== "object") return regua;
  for (const nome of NOMES_DAS_CADENCIAS) {
    const lida = (bruto as Record<string, unknown>)[nome];
    if (!lida || typeof lida !== "object") continue;
    const l = lida as Record<string, unknown>;
    if (typeof l.ativa === "boolean") regua[nome].ativa = l.ativa;
    if (Array.isArray(l.passos)) {
      const passos = l.passos.map(passoValido).filter((p): p is PassoDaCadencia => p !== null).slice(0, MAXIMO_DE_PASSOS);
      if (passos.length > 0) regua[nome].passos = passos;
    }
  }
  return regua;
}

// ----------------------------------------------------------------------------
// O relógio
// ----------------------------------------------------------------------------

const DESLOCAMENTO_DE_CURITIBA_MS = -3 * 60 * 60 * 1000;

function horaLocal(agora: Date): { dia: number; minutos: number } {
  const local = new Date(agora.getTime() + DESLOCAMENTO_DE_CURITIBA_MS);
  return { dia: local.getUTCDay(), minutos: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

function emMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * A loja está aberta agora? É quando a mensagem ao CLIENTE pode sair — a
 * régua do manobrAI ("no horário da loja"), lida da mesma constante que o
 * schema da loja e o exame no pátio usam.
 */
export function dentroDoExpediente(agora: Date, horario: readonly ExpedienteDaLoja[] = HORARIO_DA_LOJA): boolean {
  const { dia, minutos } = horaLocal(agora);
  return horario.some(
    (e) => (e.dias as readonly number[]).includes(dia) && minutos >= emMinutos(e.abre) && minutos < emMinutos(e.fecha),
  );
}

/**
 * Pode mandar aviso à EQUIPE agora? A janela do funil: 8h às 20h, nada aos
 * domingos — a mesma de `montar_fila_do_funil`, pelo mesmo motivo do manual
 * do Ciclo §4.3: o vendedor não é um servidor. Lead que esquenta às 23h fica
 * com o dono escolhido e o aviso sai de manhã, como no manobrAI.
 */
export function podeAvisarAEquipe(agora: Date): boolean {
  const { dia, minutos } = horaLocal(agora);
  return dia !== 0 && minutos >= 8 * 60 && minutos < 20 * 60;
}

// ----------------------------------------------------------------------------
// A decisão
// ----------------------------------------------------------------------------

/** O que a decisão precisa saber do lead. */
export interface LeadNaCadencia {
  cadencia: NomeDaCadencia | null;
  cadencia_passo: number;
  cadencia_proximo_em: string | null;
  desfecho: string | null;
  optout_em: string | null;
  assistente_fase: string | null;
}

export type DecisaoDoToque =
  | { tocar: true; cadencia: NomeDaCadencia; passo: number; definicao: PassoDaCadencia }
  | { tocar: false; motivo: MotivoSemToque };

export type MotivoSemToque =
  | "sem_cadencia"
  | "encerrado"
  | "optout"
  | "com_o_vendedor"
  | "pausado"
  | "cadencia_desligada"
  | "cadencia_concluida"
  | "ainda_nao"
  | "fora_do_expediente";

export const MOTIVO_SEM_TOQUE: Record<MotivoSemToque, string> = {
  sem_cadencia: "Nenhuma cadência em andamento.",
  encerrado: "O lead já foi encerrado.",
  optout: "O cliente pediu para não receber mensagens.",
  com_o_vendedor: "O lead está com o vendedor.",
  pausado: "O assistente está pausado neste lead.",
  cadencia_desligada: "Esta cadência está desligada na configuração.",
  cadencia_concluida: "A cadência já mandou todos os toques.",
  ainda_nao: "O próximo toque ainda não venceu.",
  fora_do_expediente: "Fora do horário da loja: sai na abertura.",
};

/**
 * Este lead recebe um toque agora?
 *
 * A ordem das recusas importa e vai da mais definitiva para a mais
 * passageira: um lead encerrado não é "fora do expediente", ele simplesmente
 * não recebe — e a resposta da rota mostra o motivo verdadeiro.
 */
export function decidirToque(lead: LeadNaCadencia, agora: Date, regua: ReguaDeCadencias): DecisaoDoToque {
  if (!lead.cadencia || !NOMES_DAS_CADENCIAS.includes(lead.cadencia)) return { tocar: false, motivo: "sem_cadencia" };
  if (lead.desfecho) return { tocar: false, motivo: "encerrado" };
  if (lead.optout_em) return { tocar: false, motivo: "optout" };
  if (lead.assistente_fase === "entregue") return { tocar: false, motivo: "com_o_vendedor" };
  if (lead.assistente_fase === "pausado") return { tocar: false, motivo: "pausado" };
  const cadencia = regua[lead.cadencia];
  if (!cadencia.ativa) return { tocar: false, motivo: "cadencia_desligada" };
  const passo = Math.max(0, Math.trunc(lead.cadencia_passo || 0));
  if (passo >= cadencia.passos.length || !lead.cadencia_proximo_em) return { tocar: false, motivo: "cadencia_concluida" };
  if (new Date(lead.cadencia_proximo_em).getTime() > agora.getTime()) return { tocar: false, motivo: "ainda_nao" };
  if (!dentroDoExpediente(agora)) return { tocar: false, motivo: "fora_do_expediente" };
  return { tocar: true, cadencia: lead.cadencia, passo, definicao: cadencia.passos[passo] };
}

/** Quando o passo `passo` vence, contado a partir de `desde`. Nulo se acabou. */
export function vencimentoDoPasso(
  regua: ReguaDeCadencias,
  cadencia: NomeDaCadencia,
  passo: number,
  desde: Date,
): string | null {
  const definicao = regua[cadencia].passos[passo];
  if (!definicao) return null;
  return new Date(desde.getTime() + definicao.apos_horas * 60 * 60 * 1000).toISOString();
}

/**
 * Qual cadência começa quando o cliente para de responder ao assistente: com
 * carro de interesse, follow-up; sem, reativação.
 */
export function cadenciaDoSilencio(temInteresse: boolean): NomeDaCadencia {
  return temInteresse ? "follow_up" : "reativacao";
}

/**
 * O primeiro nome, quando parece nome. O `pushName` do WhatsApp é o que a
 * pessoa escreveu no perfil — apelido, emoji, nome da empresa — e o lead sem
 * nome nasce como "WhatsApp 1234". "Oi, Whatsapp!" é pior do que "Oi!".
 */
export function nomeParaTratar(nome: string | null | undefined): string {
  const bruto = (nome ?? "").trim();
  if (!bruto || /^whatsapp\b/i.test(bruto)) return "";
  const primeiro = primeiroNome(bruto);
  return /^[A-Za-zÀ-ÖØ-öø-ÿ'-]{2,20}$/.test(primeiro) ? primeiro : "";
}

/**
 * `{nome}` e `{interesse}` preenchidos, sem chave sobrando. Sem nome, a
 * vírgula que o acompanhava sai junto: "Oi, {nome}!" vira "Oi!".
 */
export function preencherModelo(modelo: string, dados: { nome?: string | null; interesse?: string | null }): string {
  const nome = nomeParaTratar(dados.nome);
  const interesse = (dados.interesse ?? "").trim() || "carro que você procurava";
  let texto = modelo.replace(/\{interesse\}/g, interesse);
  texto = nome
    ? texto.replace(/\{nome\}/g, nome)
    : texto
        .replace(/,\s*\{nome\}/g, "")
        .replace(/\{nome\}\s*,\s*/g, "")
        .replace(/\{nome\}/g, "");
  texto = texto.replace(/\{[a-z_]+\}/g, "").replace(/\s{2,}/g, " ").trim();
  return texto ? texto[0].toUpperCase() + texto.slice(1) : texto;
}
