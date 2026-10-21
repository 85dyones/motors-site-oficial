import { temArquivo, tipoBase } from "./anexosDoAtendimento";
import { variantesDoTelefone } from "./chatwootEventos";
import { interpretarEventoDaEvolution } from "./evolutionEventos";

/**
 * O histórico do WhatsApp no painel (2026-10-21). Pedido do dono: *"é possível
 * trazer o histórico mais recente de mensagens dos leads ainda ativos no
 * painel?"*.
 *
 * A conversa do painel começou na troca (21/10). O que veio antes — pelo
 * Chatwoot, pelo celular da loja — está guardado na instância da Evolution
 * desde julho. Isto traz as mensagens mais recentes de cada lead para
 * `atendimento_mensagens`, como se tivessem entrado pelo webhook, com três
 * cuidados:
 *
 *   - **nenhuma resposta**: a mensagem do cliente entra já respondida
 *     (`respondida_em`), e o assistente não responde ao passado;
 *   - **sem repetir**: o id do WhatsApp (`wa_id`) é único — o que já está no
 *     painel fica, e trazer de novo não duplica;
 *   - **o arquivo fica no celular**: foto, áudio e documento antigos entram
 *     como rótulo, com a marca "arquivo só no celular da loja".
 *
 * Quem escreveu pela loja antes da troca — consultor no Chatwoot, o Ney
 * antigo, alguém no celular — não dá para separar: entra como "Loja".
 *
 * Puro: quem busca na Evolution e grava é `historicoDoWhatsApp-servidor.ts`.
 */

/** Quantas mensagens por lead: as mais recentes. */
export const HISTORICO_POR_LEAD = 50;

/** Quem escreveu pela loja antes da troca. */
export const AUTOR_DO_HISTORICO = "Loja";

/** Por que o arquivo antigo não está no painel. */
export const ARQUIVO_DO_HISTORICO = "histórico do WhatsApp: o arquivo ficou no celular da loja";

/** Os JIDs do telefone do lead: com e sem o nono dígito, como o WhatsApp pode tê-lo guardado. */
export function jidsDoTelefone(telefone: string | null | undefined): string[] {
  return variantesDoTelefone(telefone)
    .filter((v) => v.length >= 12 && v.length <= 13)
    .map((v) => `${v}@s.whatsapp.net`);
}

/** Os LIDs das conversas que vieram — a loja respondeu a eles, e as respostas moram lá. */
export function lidsDosRegistros(registros: readonly Record<string, unknown>[]): string[] {
  const lids = new Set<string>();
  for (const r of registros) {
    const jid = (r.key as Record<string, unknown> | undefined)?.remoteJid;
    if (typeof jid === "string" && jid.endsWith("@lid")) lids.add(jid);
  }
  return [...lids];
}

export interface MensagemDoHistorico {
  lead_id: string;
  telefone: string;
  direcao: "entrada" | "saida";
  autor: "cliente" | "vendedor";
  autor_nome: string | null;
  conteudo: string;
  texto: string | null;
  wa_id: string;
  situacao: "recebida" | "enviada";
  gatilho: null;
  respondida_em: string | null;
  criado_em: string;
  midia_tipo: string | null;
  midia_nome: string | null;
  midia_bytes: number | null;
  midia_erro: string | null;
}

/** O mimetype no formato que o banco aceita (`atendimento_mensagens_midia_no_formato`), ou nulo. */
function tipoDoArquivo(tipo: string | null | undefined): string | null {
  const base = tipoBase(tipo);
  return base.length >= 3 && base.length <= 120 && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(base) ? base : null;
}

/**
 * As linhas da conversa, das mensagens que a Evolution guardou: sem repetir,
 * da mais velha à mais nova, só as `quantas` mais recentes.
 *
 * Cada registro passa pela mesma leitura do webhook
 * (`interpretarEventoDaEvolution`): grupo, canal, reação e protocolo ficam de
 * fora do mesmo jeito. A resposta da loja a um LID às vezes vem sem o
 * telefone ao lado; o telefone do lead vai junto, para ela não se perder.
 */
export function mensagensDoHistorico(
  registros: readonly Record<string, unknown>[],
  lead: { id: string; telefone: string },
  quantas = HISTORICO_POR_LEAD,
): MensagemDoHistorico[] {
  const telefone = lead.telefone.replace(/\D/g, "");
  const porId = new Map<string, MensagemDoHistorico>();
  for (const r of registros) {
    const chave = (r.key ?? {}) as Record<string, unknown>;
    const comTelefone = { ...r, key: { ...chave, remoteJidAlt: chave.remoteJidAlt ?? `${telefone}@s.whatsapp.net` } };
    const evento = interpretarEventoDaEvolution({ event: "messages.upsert", data: comTelefone });
    if (evento.tipo !== "mensagem" || porId.has(evento.waId)) continue;
    const deMim = evento.deMim;
    const comArquivo = temArquivo(evento.conteudo);
    porId.set(evento.waId, {
      lead_id: lead.id,
      telefone,
      direcao: deMim ? "saida" : "entrada",
      autor: deMim ? "vendedor" : "cliente",
      autor_nome: deMim ? AUTOR_DO_HISTORICO : evento.nome,
      conteudo: evento.conteudo,
      texto: evento.texto,
      wa_id: evento.waId,
      situacao: deMim ? "enviada" : "recebida",
      gatilho: null,
      // O cliente já foi respondido (ou não) naquela época: o assistente não pega o passado.
      respondida_em: deMim ? null : evento.em,
      criado_em: evento.em,
      midia_tipo: comArquivo ? tipoDoArquivo(evento.midia?.tipo) : null,
      midia_nome: comArquivo ? evento.midia?.nome?.slice(0, 255) || null : null,
      midia_bytes: comArquivo ? evento.midia?.bytes ?? null : null,
      midia_erro: comArquivo ? ARQUIVO_DO_HISTORICO : null,
    });
  }
  return [...porId.values()].sort((a, b) => a.criado_em.localeCompare(b.criado_em)).slice(-Math.max(1, quantas));
}
