import {
  ETAPAS_PADRAO,
  NAO_E_OPORTUNIDADE,
  ROTULO_DO_DESFECHO,
  ehTipoDeDesfecho,
  type EtapaDoFunil,
  type MotivoDoFunil,
  type TipoDeDesfecho,
  type TipoDeEtapa,
} from "./funil";
import { CANAL_DO_EXAME, CANAL_DO_WHATSAPP } from "./leadDoRepasse";

/**
 * Os leads de um carro de repasse, como o painel os mostra (spec §4.4): os
 * pedidos de exame no pátio e, desde 28/09, os contatos pelo WhatsApp com o
 * carro no site. Os dois gravam `leads.repasse_id` (rota de leads, ramo do
 * repasse); aqui eles são lidos de volta, com o desfecho de cada um.
 *
 * Pedido do dono em 28/09: "quando o lead é baixado no painel, é preciso
 * sinalizar na lista de pedidos de exame no pátio o desfecho, se foi ganho,
 * perdido ou se não é oportunidade (teste)".
 *
 * Puro: a página lê o banco e entrega as linhas, as etapas e os motivos.
 */

/**
 * O canal que separa o pedido de exame dos outros leads do mesmo carro.
 *
 * O contato pelo WhatsApp também grava `leads.repasse_id`. Misturar os dois
 * punha cada "QUERO ESTE REPASSE" no bloco de pedidos de horário no pátio,
 * que não é o que ele é.
 */
export const CANAL_DO_PEDIDO_DE_EXAME = CANAL_DO_EXAME;
export const CANAL_DO_CONTATO_PELO_WHATSAPP = CANAL_DO_WHATSAPP;

export const COLUNAS_DOS_LEADS_DO_CARRO =
  "id, nome, telefone, interesse, created_at, canal, situacao, desfecho, desfecho_motivo, responsavel";

export interface LeadDoCarro {
  id: string;
  nome: string;
  telefone: string | null;
  interesse: string | null;
  created_at: string;
  canal: string | null;
  /** A chave da etapa do funil (`funil_etapas.chave`). */
  situacao: string | null;
  desfecho: TipoDeDesfecho | null;
  /** A chave do motivo (`funil_motivos.chave`, chave estrangeira). */
  desfecho_motivo: string | null;
  /** O nome de quem atende: TEXTO (`full_name`), não FK — migração 20260807210000. */
  responsavel: string | null;
}

/** O desfecho como a lista do carro o escreve. */
export interface SituacaoDoLead {
  tipo: TipoDeEtapa;
  /** "Em aberto · Proposta", "Ganho", "Perdido · Achou caro", "Não é oportunidade · Teste". */
  texto: string;
  /** O rótulo do motivo do desfecho; null em aberto ou sem motivo gravado. */
  motivo: string | null;
  /** Null quando o lead está sem dono. */
  responsavel: string | null;
}

export interface LeadDoCarroNaTela extends LeadDoCarro {
  situacaoNaTela: SituacaoDoLead;
}

export const EM_ABERTO = "Em aberto";
export const SEM_RESPONSAVEL = "Sem responsável";

/**
 * Ganho e perdido são os rótulos do Kanban; o descarte é o da caixa que o
 * fecha, "Não é oportunidade". Uma lista e não um ternário: o dia em que o
 * terceiro desfecho entrou, `ganho ? "Ganho" : "Perdido"` teria posto todo
 * teste na conta das perdas (ver o cabeçalho de `TIPOS_DE_ETAPA`).
 */
export const DESFECHO_NA_LISTA: Record<TipoDeDesfecho, string> = {
  ganho: ROTULO_DO_DESFECHO.ganho,
  perdido: ROTULO_DO_DESFECHO.perdido,
  descartado: NAO_E_OPORTUNIDADE,
};

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

export function leadDoCarroDaLinha(linha: Record<string, unknown>): LeadDoCarro | null {
  const id = texto(linha.id);
  const nome = texto(linha.nome);
  const created_at = texto(linha.created_at);
  if (!id || !nome || !created_at) return null;
  return {
    id,
    nome,
    telefone: texto(linha.telefone),
    interesse: texto(linha.interesse),
    created_at,
    canal: texto(linha.canal),
    situacao: texto(linha.situacao),
    desfecho: ehTipoDeDesfecho(linha.desfecho) ? linha.desfecho : null,
    desfecho_motivo: texto(linha.desfecho_motivo),
    responsavel: texto(linha.responsavel),
  };
}

/**
 * Aberto ou fechado é o `desfecho`, e não a etapa: é a régua do Kanban
 * (`emAberto`) e do relatório. Rótulo que o funil não tem mais cai na chave,
 * como o `rotuloDoMotivo` do Kanban.
 */
export function situacaoDoLead(
  lead: Pick<LeadDoCarro, "situacao" | "desfecho" | "desfecho_motivo" | "responsavel">,
  etapas: Pick<EtapaDoFunil, "chave" | "rotulo">[],
  motivos: Pick<MotivoDoFunil, "chave" | "rotulo">[],
): SituacaoDoLead {
  const responsavel = lead.responsavel?.trim() || null;
  if (lead.desfecho) {
    const chave = lead.desfecho_motivo;
    const motivo = chave ? (motivos.find((m) => m.chave === chave)?.rotulo?.trim() || chave) : null;
    const rotulo = DESFECHO_NA_LISTA[lead.desfecho];
    return { tipo: lead.desfecho, texto: motivo ? `${rotulo} · ${motivo}` : rotulo, motivo, responsavel };
  }
  const chave = lead.situacao;
  const etapa = chave ? (etapas.find((e) => e.chave === chave)?.rotulo?.trim() || chave) : null;
  return { tipo: "aberta", texto: etapa ? `${EM_ABERTO} · ${etapa}` : EM_ABERTO, motivo: null, responsavel };
}

/**
 * As duas listas da visão do carro, a partir das linhas de `leads` (uma
 * leitura por canal, em `lerLeadsDoCarro`), separadas de novo pelo canal.
 *
 * Sem etapas no banco (migração do funil pendente, ou leitura vazia), vale o
 * funil de sempre: a mesma queda do Kanban (`LeadsKanban`, `ETAPAS_PADRAO`).
 */
export function leadsDoCarroNaTela(args: {
  linhas: Record<string, unknown>[];
  etapas: Pick<EtapaDoFunil, "chave" | "rotulo">[] | null;
  motivos: Pick<MotivoDoFunil, "chave" | "rotulo">[] | null;
}): { pedidos: LeadDoCarroNaTela[]; contatos: LeadDoCarroNaTela[] } {
  const etapas = args.etapas?.length ? args.etapas : ETAPAS_PADRAO;
  const motivos = args.motivos ?? [];
  const leads = args.linhas.flatMap((linha) => {
    const lead = leadDoCarroDaLinha(linha);
    return lead ? [{ ...lead, situacaoNaTela: situacaoDoLead(lead, etapas, motivos) }] : [];
  });
  return {
    pedidos: leads.filter((l) => l.canal === CANAL_DO_PEDIDO_DE_EXAME),
    contatos: leads.filter((l) => l.canal === CANAL_DO_CONTATO_PELO_WHATSAPP),
  };
}
