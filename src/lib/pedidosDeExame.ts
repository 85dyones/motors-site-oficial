import { CANAL_DO_EXAME } from "./leadDoRepasse";

/**
 * Os pedidos de exame no pátio de um carro de repasse, como o editor do
 * painel os mostra (spec §4.4). O lead do exame grava `leads.repasse_id`
 * (rota de leads, ramo do repasse); aqui ele é lido de volta.
 */

/**
 * O canal que separa o pedido de exame dos outros leads do mesmo carro.
 *
 * Desde 28/09 o contato pelo WhatsApp com o carro no site também grava
 * `leads.repasse_id`. Ler só por `repasse_id` punha cada "QUERO ESTE
 * REPASSE" no bloco de pedidos de horário no pátio, que não é o que ele é.
 */
export const CANAL_DO_PEDIDO_DE_EXAME = CANAL_DO_EXAME;
export interface PedidoDeExameNoPainel {
  id: string;
  nome: string;
  telefone: string | null;
  interesse: string | null;
  created_at: string;
}

export const COLUNAS_DO_PEDIDO_DE_EXAME = "id, nome, telefone, interesse, created_at";

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

export function pedidoDeExameDaLinha(linha: Record<string, unknown>): PedidoDeExameNoPainel | null {
  const id = texto(linha.id);
  const nome = texto(linha.nome);
  const created_at = texto(linha.created_at);
  if (!id || !nome || !created_at) return null;
  return { id, nome, telefone: texto(linha.telefone), interesse: texto(linha.interesse), created_at };
}
