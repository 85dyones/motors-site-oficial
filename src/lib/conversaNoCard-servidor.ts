import type { SupabaseClient } from "@supabase/supabase-js";
import { conversasPorLead, type ConversaNoCard, type MensagemDoCard } from "./conversaNoCard";
import { ehTabelaOuColunaAusente } from "./erroDeSchema";

/**
 * A conversa de cada lead para o card do quadro (21/10/2026): quem falou por
 * último e desde quando o cliente espera resposta. As regras moram em
 * `conversaNoCard.ts`; aqui, a leitura.
 *
 * UMA leitura de `atendimento_mensagens` para todos os leads, com a sessão de
 * quem pede: a política da tabela pergunta a `leads`, que tem RLS por escopo
 * — o vendedor só lê a conversa dos leads dele. Só a última semana: o selo é
 * de mensagem ATUAL sem resposta, e a conversa parada há mais tempo é
 * assunto da régua de estagnação. Em produção, uma semana são umas 500
 * mensagens (21/10); o teto é o do PostgREST, e batido, vem um aviso.
 *
 * Nunca lança. Leitura que falha devolve `lida: false`, o mapa vazio e o
 * aviso — o quadro continua inteiro, só sem o selo; banco sem a tabela
 * (ambiente atrasado), nem aviso. `lida` é o que separa "ninguém tem
 * mensagem" de "não deu para ler": as novidades do minuto não podem apagar
 * os selos da tela por uma leitura que falhou.
 */

/** A janela: só a conversa da última semana entra no card. */
export const JANELA_DA_CONVERSA_NO_CARD_MS = 7 * 24 * 60 * 60 * 1000;
/** O PostgREST corta em 1000 linhas: o teto é pedido às claras. */
export const TETO_DE_MENSAGENS_NO_CARD = 1000;

export const AVISO_SEM_CONVERSAS = "Não deu para ler as mensagens: o selo de cliente esperando não aparece agora.";
export const AVISO_DE_MENSAGENS_DEMAIS = "Há mensagens demais na última semana: a espera de alguns clientes pode aparecer menor do que é.";

export async function lerConversasDoQuadro(
  supabase: SupabaseClient,
  agora: Date = new Date(),
): Promise<{ porLead: Map<string, ConversaNoCard>; avisos: string[]; lida: boolean }> {
  try {
    const { data, error } = await supabase
      .from("atendimento_mensagens")
      .select("lead_id, direcao, autor, autor_nome, situacao, conteudo, texto, criado_em")
      .gte("criado_em", new Date(agora.getTime() - JANELA_DA_CONVERSA_NO_CARD_MS).toISOString())
      .order("criado_em", { ascending: false })
      .limit(TETO_DE_MENSAGENS_NO_CARD);
    if (error) {
      if (ehTabelaOuColunaAusente(error)) return { porLead: new Map(), avisos: [], lida: false };
      console.warn("[Leads] Conversas do quadro ilegíveis:", error.message);
      return { porLead: new Map(), avisos: [AVISO_SEM_CONVERSAS], lida: false };
    }
    const mensagens = (data ?? []) as MensagemDoCard[];
    return {
      porLead: conversasPorLead(mensagens),
      avisos: mensagens.length >= TETO_DE_MENSAGENS_NO_CARD ? [AVISO_DE_MENSAGENS_DEMAIS] : [],
      lida: true,
    };
  } catch (erro) {
    console.warn("[Leads] Conversas do quadro ilegíveis:", erro instanceof Error ? erro.message : String(erro));
    return { porLead: new Map(), avisos: [AVISO_SEM_CONVERSAS], lida: false };
  }
}
