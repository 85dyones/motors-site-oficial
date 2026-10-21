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
import { prontidao, rotuloDaVisita, trocaParaLer } from "./metodoDeQualificacao";
import { ROTULO_DO_CONTEUDO, type ConteudoDaMensagem } from "./evolutionEventos";
import { tamanhoLegivel, temArquivo, type ConteudoDoAnexo } from "./anexosDoAtendimento";
import { ROTULO_DA_CAMADA, ehCamada } from "./fotosDoAtendimento";
import { espera } from "./funil";

/**
 * O que a aba de atendimento do lead diz, em funções puras — a tela só
 * desenha. Mesmo desenho de `filaDoFunil.ts` para o quadro.
 */


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
  /** O arquivo da mensagem no bucket (os anexos, 2026-10-20). */
  midia_caminho?: string | null;
  midia_tipo?: string | null;
  midia_nome?: string | null;
  midia_bytes?: number | null;
  /** Por que o arquivo não veio. */
  midia_erro?: string | null;
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
/**
 * Quem escreveu, como a conversa mostra. O cliente aparece pelo nome do lead
 * (o mesmo do cabeçalho, que a equipe pode corrigir), depois pelo nome do
 * WhatsApp da mensagem, e só sem nenhum dos dois como "Cliente" — pedido do
 * dono no teste do branch (2026-10-20).
 */
export function quemEscreveu(m: Pick<MensagemNaTela, "autor" | "autor_nome">, nomeDoAssistente: string, nomeDoCliente?: string | null): string {
  if (m.autor === "cliente") return nomeDoCliente?.trim() || m.autor_nome?.trim() || "Cliente";
  if (m.autor === "assistente") return `${m.autor_nome?.trim() || nomeDoAssistente} · assistente`;
  if (m.autor === "sistema") return "Sistema";
  return m.autor_nome?.trim() || "Equipe";
}

/** O que a mensagem diz, inclusive a mídia sem legenda. A foto do carro diz só a legenda: a tela já mostra a foto. */
export function textoDaMensagem(
  m: Pick<MensagemNaTela, "conteudo" | "texto" | "midia_url"> & Partial<Pick<MensagemNaTela, "midia_caminho" | "midia_nome">>,
): string {
  const texto = (m.texto ?? "").trim();
  if (fotoDaMensagem(m)) return texto;
  // Com o arquivo na tela, fica só a legenda — e o documento sem legenda, cujo
  // "texto" é o próprio nome do arquivo, não repete o nome que o cartão já mostra.
  if (m.midia_caminho && temArquivo(m.conteudo)) return texto === (m.midia_nome ?? "").trim() ? "" : texto;
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

export interface AnexoNaTela {
  conteudo: ConteudoDoAnexo;
  /** A porta do painel, que confere o escopo e redireciona para a URL assinada. */
  src: string;
  /** Para o documento: baixar com o nome. */
  baixar: string;
  nome: string | null;
  tamanho: string;
}

/**
 * O arquivo da mensagem, quando ele foi guardado: foto, vídeo, áudio ou
 * documento. Abre pela porta do painel (`/api/leads/[id]/conversa/midia/[m]`),
 * nunca por um endereço direto do bucket, que é privado.
 */
export function anexoDaMensagem(
  m: Pick<MensagemNaTela, "id" | "conteudo"> & Partial<Pick<MensagemNaTela, "midia_caminho" | "midia_nome" | "midia_bytes">>,
  leadId: string,
): AnexoNaTela | null {
  if (!m.midia_caminho || !temArquivo(m.conteudo)) return null;
  const src = `/api/leads/${encodeURIComponent(leadId)}/conversa/midia/${encodeURIComponent(m.id)}`;
  return {
    conteudo: m.conteudo,
    src,
    baixar: `${src}?baixar=1`,
    nome: m.midia_nome?.trim() || null,
    tamanho: tamanhoLegivel(m.midia_bytes),
  };
}

/** As marcas da mensagem: o que ela foi, e se saiu. */
export function marcasDaMensagem(
  m: Pick<MensagemNaTela, "gatilho" | "situacao" | "camada" | "midia_url"> & Partial<Pick<MensagemNaTela, "conteudo" | "midia_caminho" | "midia_erro">>,
): string[] {
  const marcas: string[] = [];
  if (fotoDaMensagem(m)) marcas.push(ehCamada(m.camada) ? `foto · ${ROTULO_DA_CAMADA[m.camada]}` : "foto");
  // O arquivo que não veio: o WhatsApp do celular da loja ainda o tem.
  if (!m.midia_caminho && m.midia_erro && temArquivo(m.conteudo)) marcas.push("arquivo só no celular da loja");
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

export type AcaoNaTela = "pausar" | "retomar" | "entregar" | "devolver" | "assumir" | "ler";

export const ROTULO_DA_ACAO: Record<AcaoNaTela, string> = {
  pausar: "Pausar assistente",
  retomar: "Ney volta a responder",
  entregar: "Entregar ao vendedor agora",
  assumir: "Ney retoma agora",
  devolver: "Ney reaquece com o tempo",
  ler: "Ney lê a conversa",
};

/**
 * O que cada botão faz, numa linha (21/10): a equipe escolhe como passar o
 * lead ao Ney — *"seria interessante ter a opção de escolher"*.
 */
export const EXPLICACAO_DA_ACAO: Record<AcaoNaTela, string> = {
  pausar: "o Ney sai da conversa e o SLA do vendedor volta a correr",
  retomar: "o Ney responde quando o cliente escrever",
  entregar: "passa ao vendedor agora, com o resumo",
  assumir: "lê a conversa e escreve na próxima rodada, de onde ela parou — ou não escreve, se a conversa não pedir",
  devolver: "toques em 7, 15 e 30 dias, lendo a conversa antes de cada um",
  ler: "só a ficha, a nota e o resumo para o comercial, sem escrever ao cliente",
};

/**
 * Os botões que fazem sentido agora. Opt-out só deixa pausar (e ler). Com o
 * Ney fora da conversa — nunca pegou, pausado ou entregue —, a equipe escolhe
 * como passar o lead a ele (21/10).
 */
export function acoesDisponiveis(estado: Pick<EstadoDoAtendimento, "assistente_fase" | "optout_em">): AcaoNaTela[] {
  if (estado.optout_em) return estado.assistente_fase === "qualificando" ? ["pausar"] : ["ler"];
  switch (estado.assistente_fase) {
    case "qualificando":
      return ["entregar", "pausar"];
    case "reaquecendo":
      return ["entregar", "pausar"];
    case "pausado":
      return ["retomar", "assumir", "devolver", "ler"];
    default:
      // Entregue, ou o lead que o Ney nunca pegou (a equipe já atendia).
      return ["assumir", "devolver", "ler"];
  }
}

export interface LinhaDaFicha {
  rotulo: string;
  valor: string | null;
}

/**
 * A ficha, na ordem do método da loja (os 5P: Produto, Pagamento, Pessoa,
 * Prazo e Passo — `metodoDeQualificacao.ts`). Campo não dito vem nulo.
 */
export function linhasDaFicha(qualificacao: EstadoDoAtendimento["qualificacao"]): LinhaDaFicha[] {
  const f = fichaValida(qualificacao?.ficha);
  return [
    { rotulo: "Nome", valor: f.nome },
    { rotulo: "Procura", valor: f.interesse },
    { rotulo: "Uso", valor: f.uso },
    { rotulo: "O que quer resolver", valor: f.dor ?? null },
    { rotulo: "Quer investir", valor: f.orcamento },
    { rotulo: "Pagamento", valor: f.pagamento ? ROTULO_DO_PAGAMENTO[f.pagamento] : null },
    { rotulo: "Entrada", valor: f.entrada },
    { rotulo: "Parcela", valor: f.parcela },
    { rotulo: "Carro na troca", valor: trocaParaLer(f.troca) },
    { rotulo: "Quem decide", valor: f.decisor },
    { rotulo: "Prazo", valor: f.prazo ? ROTULO_DO_PRAZO[f.prazo] : null },
    { rotulo: "Acordo para fechar", valor: f.intencao ?? null },
    { rotulo: "Visita", valor: rotuloDaVisita(f) ?? f.visita },
    { rotulo: "Objeções", valor: f.objecoes ?? null },
    { rotulo: "Cidade", valor: f.cidade },
  ];
}

/**
 * Onde o lead está no método, numa linha: a visita marcada, a simulação
 * pronta, ou o que falta (os três primeiros itens). `pronto` acende a marca.
 */
export function situacaoDoMetodo(
  estado: EstadoDoAtendimento | null,
  agora: Date,
  /** O nome do lead: com ele, "como ele se chama" não entra no que falta. */
  nomeDoLead?: string | null,
): { texto: string; pronto: boolean } {
  const f = fichaValida(estado?.qualificacao?.ficha);
  const visita = rotuloDaVisita(f);
  const p = prontidao(f, agora, { nomeNoWhatsApp: nomeDoLead });
  if (estado?.entregue_motivo === "agendou" && visita) return { texto: `Visita marcada: ${visita}`, pronto: true };
  if (estado?.entregue_motivo === "simulacao") return { texto: "Pronto para simular o financiamento", pronto: true };
  if (p.pronto === "agendou" && visita) return { texto: `Visita marcada: ${visita}`, pronto: true };
  if (p.pronto === "simulacao") return { texto: "Pronto para simular o financiamento", pronto: true };
  // As sugestões do playbook (a dor, o acordo) não são o que falta: o painel mostra o método.
  const itens = p.faltam.filter((x) => !x.sugestao).slice(0, 3).map((x) => x.item);
  return { texto: itens.length > 0 ? `Falta: ${itens.join("; ")}` : "Os 5P estão completos", pronto: false };
}

/**
 * O resumo para o comercial, em texto, para colar no WhatsApp ou numa
 * planilha: a nota, onde está no método, a ficha dita e o resumo do
 * assistente. Campo não dito fica de fora.
 */
export function textoDoResumo(estado: EstadoDoAtendimento | null, agora: Date, nomeDoLead?: string | null): string {
  if (!estado) return "";
  const linhas = [
    estado.aquecimento !== null && estado.temperatura
      ? `Aquecimento: ${estado.aquecimento}/100 (${ROTULO_DA_TEMPERATURA[estado.temperatura]})`
      : "",
    situacaoDoMetodo(estado, agora, nomeDoLead).texto,
    ...linhasDaFicha(estado.qualificacao)
      .filter((l) => l.valor)
      .map((l) => `${l.rotulo}: ${l.valor}`),
    estado.origem_conversa?.titulo ? `Veio do anúncio: ${estado.origem_conversa.titulo}` : "",
    estado.resumo_ia?.trim() ? `Resumo: ${estado.resumo_ia.trim()}` : "",
  ];
  return linhas.filter(Boolean).join("\n");
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
