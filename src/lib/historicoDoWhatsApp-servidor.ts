import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarMensagens, configDaEvolution, motivoSemEvolution, type ConfigDaEvolution, type Transporte } from "./evolution";
import { HISTORICO_POR_LEAD, jidsDoTelefone, lidsDosRegistros, mensagensDoHistorico } from "./historicoDoWhatsApp";

/**
 * Traz o histórico do WhatsApp de um lead para a conversa do painel
 * (2026-10-21) — ver o cabeçalho de `historicoDoWhatsApp.ts`.
 *
 * Três buscas na Evolution: o telefone como conversa (a loja escrevendo), o
 * telefone ao lado de um LID (o cliente escrevendo) e cada LID que aparecer
 * (a loja respondendo a ele). Grava com a chave de serviço — a conversa só é
 * escrita pelo servidor — e só o que ainda não está no painel.
 */

type Banco = SupabaseClient;

export interface DependenciasDoHistorico {
  /** `undefined` lê do ambiente; `null` simula a falta. */
  evolution?: ConfigDaEvolution | null;
  transporte?: Transporte;
}

export type ResultadoDoHistorico =
  | { ok: true; lead: string; trazidas: number; ja_estavam: number }
  | { ok: false; lead: string; motivo: string };

const BUSCA_POR_CONVERSA = 100;

export async function trazerHistoricoDoWhatsApp(
  supabase: Banco,
  lead: { id: string; telefone: string | null },
  deps: DependenciasDoHistorico = {},
  opcoes: { quantas?: number; autor?: string } = {},
): Promise<ResultadoDoHistorico> {
  const cfg = deps.evolution === undefined ? configDaEvolution() : deps.evolution;
  if (!cfg) return { ok: false, lead: lead.id, motivo: motivoSemEvolution() };
  const jids = jidsDoTelefone(lead.telefone);
  if (jids.length === 0) return { ok: false, lead: lead.id, motivo: "o lead não tem telefone de WhatsApp" };

  const registros: Record<string, unknown>[] = [];
  const buscar = async (filtro: { remoteJid: string } | { remoteJidAlt: string }) => {
    const r = await buscarMensagens(filtro, cfg, { quantas: BUSCA_POR_CONVERSA, transporte: deps.transporte });
    if (!r.ok) throw new Error(r.motivo);
    registros.push(...r.registros);
  };
  try {
    for (const jid of jids) {
      await buscar({ remoteJid: jid });
      await buscar({ remoteJidAlt: jid });
    }
    for (const lid of lidsDosRegistros(registros)) await buscar({ remoteJid: lid });
  } catch (erro) {
    return { ok: false, lead: lead.id, motivo: erro instanceof Error ? erro.message : String(erro) };
  }

  const linhas = mensagensDoHistorico(registros, { id: lead.id, telefone: String(lead.telefone) }, opcoes.quantas ?? HISTORICO_POR_LEAD);
  if (linhas.length === 0) return { ok: true, lead: lead.id, trazidas: 0, ja_estavam: 0 };

  // O que já está no painel (entrou pelo webhook, ou numa vinda anterior) fica.
  const { data: existentes, error: erroDaLeitura } = await supabase
    .from("atendimento_mensagens")
    .select("wa_id")
    .in("wa_id", linhas.map((l) => l.wa_id));
  if (erroDaLeitura) return { ok: false, lead: lead.id, motivo: `a conversa do painel não pôde ser lida: ${erroDaLeitura.message}` };
  const jaEstao = new Set(((existentes ?? []) as { wa_id: string | null }[]).map((e) => String(e.wa_id)));
  const novas = linhas.filter((l) => !jaEstao.has(l.wa_id));

  let trazidas = 0;
  if (novas.length > 0) {
    const { error } = await supabase.from("atendimento_mensagens").insert(novas);
    if (!error) {
      trazidas = novas.length;
    } else {
      // Uma de cada vez: a que entrou pelo webhook nesse meio-tempo (23505) ou
      // a que o banco recusa não derruba as outras.
      for (const linha of novas) {
        const { error: erroDaLinha } = await supabase.from("atendimento_mensagens").insert(linha);
        if (!erroDaLinha) trazidas += 1;
        else if (erroDaLinha.code !== "23505") console.warn("[Histórico] Mensagem não gravada:", erroDaLinha.message);
      }
    }
  }

  if (trazidas > 0) {
    const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
    const autor = opcoes.autor?.trim() || "Sistema";
    const { error } = await supabase.from("leads_eventos").insert({
      lead_id: lead.id,
      tipo: "nota",
      autor,
      automatico: !opcoes.autor,
      detalhe: {
        acao: "historico_do_whatsapp",
        trazidas,
        origem: "historico",
        texto: `Histórico do WhatsApp trazido para a conversa do painel: ${trazidas} mensagem(ns), de ${dia(novas[0].criado_em)} a ${dia(novas[novas.length - 1].criado_em)}.`,
      },
    });
    if (error) console.warn("[Histórico] Rastro não gravado:", error.message);
  }
  return { ok: true, lead: lead.id, trazidas, ja_estavam: linhas.length - novas.length };
}
