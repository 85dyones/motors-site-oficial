import {
  ROTULO_DA_TEMPERATURA,
  ROTULO_DO_MOTIVO_DA_ENTREGA,
  ROTULO_DO_PAGAMENTO,
  ROTULO_DO_PRAZO,
  fichaValida,
  type MotivoDaEntrega,
  type MotivoDoAquecimento,
  type Temperatura,
} from "./aquecimento";
import { ROTULO_DA_CADENCIA, type NomeDaCadencia } from "./cadencias";
import { ROTULO_DO_CONTEUDO, type ConteudoDaMensagem } from "./evolutionEventos";
import { ROTULO_DA_CAMADA, ehCamada } from "./fotosDoAtendimento";
import { espera } from "./funil";

/**
 * O que a aba de atendimento do lead diz, em funções puras — a tela só
 * desenha. Mesmo desenho de `filaDoFunil.ts` para o quadro.
 */

export type AbaDoAtendimento = "conversa" | "resumo" | "aquecimento";

export const ABAS_DO_ATENDIMENTO: readonly { valor: AbaDoAtendimento; rotulo: string }[] = [
  { valor: "conversa", rotulo: "Conversa" },
  { valor: "resumo", rotulo: "Resumo" },
  { valor: "aquecimento", rotulo: "Aquecimento" },
];

export interface MensagemNaTela {
  id: string;
  direcao: "entrada" | "saida";
  autor: "cliente" | "assistente" | "vendedor" | "sistema";
  autor_nome: string | null;
  conteudo: ConteudoDaMensagem | null;
  texto: string | null;
  situacao: "recebida" | "pendente" | "enviada" | "falhou";
  gatilho: string | null;
  erro: string | null;
  criado_em: string;
  /** A foto do carro que a loja mandou (2026-10-20), e de que camada. */
  midia_url?: string | null;
  camada?: string | null;
}

export interface EstadoDoAtendimento {
  aquecimento: number | null;
  temperatura: Temperatura | null;
  qualificacao: { ficha?: unknown; sinais?: unknown; motivos?: MotivoDoAquecimento[] } | null;
  resumo_ia: string | null;
  resumo_ia_em: string | null;
  assistente_fase: "qualificando" | "entregue" | "pausado" | "reaquecendo" | null;
  entregue_em: string | null;
  entregue_motivo: MotivoDaEntrega | "painel" | null;
  aviso_de_entrega_em: string | null;
  aviso_de_entrega_para: string | null;
  entrega_confirmada_em: string | null;
  cadencia: NomeDaCadencia | null;
  cadencia_passo: number | null;
  cadencia_proximo_em: string | null;
  optout_em: string | null;
  origem_conversa: { tipo?: string | null; titulo?: string | null; url?: string | null; entrada?: string | null } | null;
}

export interface ConversaDaApi {
  atendimento: EstadoDoAtendimento | null;
  mensagens: MensagemNaTela[];
  retratos: { aquecimento: number; temperatura: Temperatura; origem: string; criado_em: string }[];
  assistente: {
    ativo: boolean;
    nome: string;
    limiares: { morno: number; quente: number };
    whatsapp_ligado: boolean;
    /** Quantos toques cada cadência tem na configuração. */
    passos: Partial<Record<NomeDaCadencia, number>>;
  } | null;
  migracaoPendente?: boolean;
  aviso?: string;
}

/**
 * A resposta da rota, lida com desconfiança: o que não tiver a forma vira
 * vazio. A aba não pode derrubar o detalhe do lead por uma resposta torta.
 */
export function lerConversaDaApi(bruto: unknown): ConversaDaApi {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const assistente = b.assistente && typeof b.assistente === "object" ? (b.assistente as ConversaDaApi["assistente"]) : null;
  return {
    atendimento: b.atendimento && typeof b.atendimento === "object" ? (b.atendimento as EstadoDoAtendimento) : null,
    mensagens: Array.isArray(b.mensagens) ? (b.mensagens as MensagemNaTela[]).filter((m) => m && typeof m.id === "string") : [],
    retratos: Array.isArray(b.retratos) ? (b.retratos as ConversaDaApi["retratos"]) : [],
    assistente,
    migracaoPendente: b.migracaoPendente === true,
    aviso: typeof b.aviso === "string" ? b.aviso : undefined,
  };
}

/** "Ney" quando é o assistente; o nome de quem escreveu, quando é gente. */
export function quemEscreveu(m: Pick<MensagemNaTela, "autor" | "autor_nome">, nomeDoAssistente: string): string {
  if (m.autor === "cliente") return "Cliente";
  if (m.autor === "assistente") return `${m.autor_nome?.trim() || nomeDoAssistente} · assistente`;
  if (m.autor === "sistema") return "Sistema";
  return m.autor_nome?.trim() || "Equipe";
}

/** O que a mensagem diz, inclusive a mídia sem legenda. A foto do carro diz só a legenda: a tela já mostra a foto. */
export function textoDaMensagem(m: Pick<MensagemNaTela, "conteudo" | "texto" | "midia_url">): string {
  const texto = (m.texto ?? "").trim();
  if (fotoDaMensagem(m)) return texto;
  const conteudo = (m.conteudo ?? "texto") as ConteudoDaMensagem;
  if (conteudo === "texto") return texto || "(mensagem vazia)";
  const rotulo = ROTULO_DO_CONTEUDO[conteudo] ?? "Mensagem";
  return texto ? `[${rotulo}] ${texto}` : `[${rotulo}]`;
}

/** A foto que a loja mandou, quando é uma — só endereço http(s) vira `<img>`. */
export function fotoDaMensagem(m: Pick<MensagemNaTela, "midia_url">): string | null {
  const url = (m.midia_url ?? "").trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

/** As marcas da mensagem: o que ela foi, e se saiu. */
export function marcasDaMensagem(m: Pick<MensagemNaTela, "gatilho" | "situacao" | "camada" | "midia_url">): string[] {
  const marcas: string[] = [];
  if (fotoDaMensagem(m)) marcas.push(ehCamada(m.camada) ? `foto · ${ROTULO_DA_CAMADA[m.camada]}` : "foto");
  if (m.gatilho === "cadencia") marcas.push("cadência");
  if (m.gatilho === "passagem") marcas.push("passagem ao vendedor");
  if (m.gatilho === "celular") marcas.push("pelo celular da loja");
  if (m.situacao === "pendente") marcas.push("enviando");
  if (m.situacao === "falhou") marcas.push("não saiu");
  return marcas;
}

/** Hora da loja: "14:32" hoje, "19/10 14:32" em outro dia. */
export function horaDaMensagem(iso: string, agora: Date): string {
  const opcoes = { timeZone: "America/Sao_Paulo" } as const;
  const d = new Date(iso);
  const dia = d.toLocaleDateString("pt-BR", { ...opcoes, day: "2-digit", month: "2-digit" });
  const hoje = agora.toLocaleDateString("pt-BR", { ...opcoes, day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { ...opcoes, hour: "2-digit", minute: "2-digit" });
  return dia === hoje ? hora : `${dia} ${hora}`;
}

/**
 * Onde o lead está para o assistente, numa linha — o rótulo do bloco.
 */
export function situacaoDoAssistente(
  estado: Pick<EstadoDoAtendimento, "assistente_fase" | "aviso_de_entrega_para" | "entregue_em" | "optout_em" | "cadencia">,
  assistente: Pick<NonNullable<ConversaDaApi["assistente"]>, "ativo" | "nome"> | null,
  agora: number = Date.now(),
): string {
  const nome = assistente?.nome || "Assistente";
  if (estado.optout_em) return "O cliente pediu para não receber mensagens";
  switch (estado.assistente_fase) {
    case "qualificando":
      return assistente?.ativo ? `${nome} está atendendo` : `${nome} está desligado: ninguém responde automaticamente`;
    case "entregue": {
      const quando = estado.entregue_em ? ` há ${espera(estado.entregue_em, agora)}` : "";
      const para = estado.aviso_de_entrega_para;
      if (!para) return `Entregue${quando}: o resumo sai na abertura do horário`;
      return para === "administrador" ? `Entregue${quando}: aguardando o responsável` : `Entregue a ${para}${quando}`;
    }
    case "pausado":
      return `${nome} pausado: a equipe atende`;
    case "reaquecendo":
      return `Com o assistente para reaquecer${estado.cadencia ? ` (${ROTULO_DA_CADENCIA[estado.cadencia].toLowerCase()})` : ""}`;
    default:
      return assistente?.ativo ? `${nome} não pegou este lead: a equipe já atendia` : "Sem assistente neste lead";
  }
}

export type AcaoNaTela = "pausar" | "retomar" | "entregar" | "devolver";

export const ROTULO_DA_ACAO: Record<AcaoNaTela, string> = {
  pausar: "Pausar assistente",
  retomar: "Devolver a conversa ao assistente",
  entregar: "Entregar ao vendedor agora",
  devolver: "Devolver para reaquecer",
};

/** Os botões que fazem sentido agora. Opt-out só deixa pausar. */
export function acoesDisponiveis(estado: Pick<EstadoDoAtendimento, "assistente_fase" | "optout_em">): AcaoNaTela[] {
  if (estado.optout_em) return estado.assistente_fase === "qualificando" ? ["pausar"] : [];
  switch (estado.assistente_fase) {
    case "qualificando":
      return ["entregar", "pausar"];
    case "reaquecendo":
      return ["entregar", "pausar"];
    case "entregue":
      return ["devolver"];
    case "pausado":
      return ["retomar", "devolver"];
    default:
      // O assistente nunca pegou este lead: não há conversa dele a retomar.
      return [];
  }
}

export interface LinhaDaFicha {
  rotulo: string;
  valor: string | null;
}

/** A ficha, na ordem em que o vendedor lê. Campo não dito vem nulo. */
export function linhasDaFicha(qualificacao: EstadoDoAtendimento["qualificacao"]): LinhaDaFicha[] {
  const f = fichaValida(qualificacao?.ficha);
  return [
    { rotulo: "Procura", valor: f.interesse },
    { rotulo: "Quer investir", valor: f.orcamento },
    { rotulo: "Pagamento", valor: f.pagamento ? ROTULO_DO_PAGAMENTO[f.pagamento] : null },
    { rotulo: "Entrada", valor: f.entrada },
    { rotulo: "Carro na troca", valor: f.troca },
    { rotulo: "Prazo", valor: f.prazo ? ROTULO_DO_PRAZO[f.prazo] : null },
    { rotulo: "Visita", valor: f.visita },
    { rotulo: "Cidade", valor: f.cidade },
  ];
}

export function rotuloDaEntrega(motivo: EstadoDoAtendimento["entregue_motivo"]): string | null {
  if (!motivo) return null;
  return motivo === "painel" ? "Entregue pelo painel" : ROTULO_DO_MOTIVO_DA_ENTREGA[motivo];
}

export function seloDaTemperatura(temperatura: Temperatura | null | undefined, pontos: number | null | undefined): string | null {
  if (!temperatura) return null;
  const n = Number(pontos);
  return `${ROTULO_DA_TEMPERATURA[temperatura]}${Number.isFinite(n) ? ` · ${Math.round(n)}` : ""}`;
}

/** "Follow-up · toque 2 de 3 · próximo 20/10 09:00". */
export function linhaDaCadencia(
  estado: Pick<EstadoDoAtendimento, "cadencia" | "cadencia_passo" | "cadencia_proximo_em">,
  totalDePassos: number,
  agora: Date,
): string | null {
  if (!estado.cadencia) return null;
  const passo = Math.max(0, Number(estado.cadencia_passo ?? 0));
  const nome = ROTULO_DA_CADENCIA[estado.cadencia];
  if (!estado.cadencia_proximo_em || passo >= totalDePassos) return `${nome} · concluída (${passo} de ${totalDePassos})`;
  return `${nome} · toque ${passo + 1} de ${totalDePassos} · próximo ${horaDaMensagem(estado.cadencia_proximo_em, agora)}`;
}

/** Onde a nota está na régua, em porcentagem da largura. */
export function posicaoNaRegua(pontos: number | null | undefined): number {
  const n = Number(pontos);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}
