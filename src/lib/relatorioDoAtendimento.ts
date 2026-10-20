import type { MotivoDaEntrega, Temperatura } from "./aquecimento";
import { custoEstimado } from "./deepseek";
import { taxaDeConversao } from "./funil";

/**
 * O relatório do atendimento por IA (2026-10-20): o que o assistente fez, de
 * onde vieram os leads e como a equipe recebeu o que ele entregou.
 *
 * Função pura sobre as linhas que a rota lê. As três perguntas do dono que
 * ele responde:
 *
 *   1. **Origem** — *"continuam monitorando origem"*. Cada lead cai num grupo:
 *      anúncio de clique para o WhatsApp (o WhatsApp conta, ver
 *      `OrigemDaConversa`), WhatsApp direto, ou o canal do site com a fonte.
 *      Por grupo: quantos, quantos esquentaram, quantos foram entregues e a
 *      conversão (ganhos ÷ ganhos + perdidos, a régua do funil — descartado
 *      fica fora).
 *   2. **Equipe** — *"métricas de desempenho da equipe"*. Por vendedor, dos
 *      leads que o assistente entregou: quantos recebeu, quanto tempo levou
 *      para confirmar o aviso e para o primeiro contato registrado, e o
 *      resultado. O vendedor que atende do próprio número não aparece na
 *      conversa da loja; o contato dele chega pelo registro no painel (ou
 *      pela resposta no painel). Sem registro, o tempo fica vazio — e a
 *      tela diz "sem registro", em vez de inventar zero.
 *   3. **Assistente** — quantas conversas, quantas entregas e por quê, quanto
 *      tempo do primeiro contato à entrega, quanto custou (estimativa pela
 *      tabela da DeepSeek) e o que as cadências reaqueceram.
 */

export interface LeadDoRelatorio {
  id: string;
  created_at: string | null;
  canal: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  origem_conversa?: { tipo?: string | null; titulo?: string | null; entrada?: string | null } | null;
  responsavel: string | null;
  desfecho: string | null;
  temperatura: Temperatura | null;
  assistente_fase: string | null;
  entregue_em: string | null;
  entregue_motivo: MotivoDaEntrega | "painel" | null;
  aviso_de_entrega_em: string | null;
  aviso_de_entrega_para: string | null;
  entrega_confirmada_em: string | null;
  optout_em: string | null;
}

export interface MensagemDoRelatorio {
  lead_id: string;
  direcao: "entrada" | "saida";
  autor: string;
  gatilho: string | null;
  criado_em: string;
}

export interface UsoDoRelatorio {
  tokens_entrada: number;
  tokens_cache: number;
  tokens_saida: number;
}

/** Contato humano registrado (`leads_eventos` do tipo `contato`). */
export interface ContatoDoRelatorio {
  lead_id: string;
  criado_em: string;
}

export interface LinhaDeOrigem {
  origem: string;
  leads: number;
  conversaram: number;
  quentes: number;
  entregues: number;
  ganhos: number;
  perdidos: number;
  conversao: number;
}

export interface LinhaDaEquipe {
  vendedor: string;
  recebidos: number;
  confirmados: number;
  /** Minutos, mediana. Nulo sem nenhum caso. */
  confirmacao_mediana: number | null;
  primeiro_contato_mediana: number | null;
  sem_contato: number;
  ganhos: number;
  perdidos: number;
  abertos: number;
  conversao: number;
}

export interface RelatorioDoAtendimento {
  dias: number;
  assistente: {
    conversas: number;
    mensagens_do_cliente: number;
    respostas: number;
    entregues: number;
    por_motivo: Record<string, number>;
    taxa_de_entrega: number;
    ate_a_entrega_mediana: number | null;
    optouts: number;
    chamadas_ao_modelo: number;
    custo_estimado_usd: number;
  };
  temperatura: Record<Temperatura | "sem_leitura", number>;
  origens: LinhaDeOrigem[];
  equipe: LinhaDaEquipe[];
  cadencias: { toques: number; leads_tocados: number; reaquecidos: number; em_andamento: number };
}

export function grupoDeOrigem(lead: Pick<LeadDoRelatorio, "canal" | "utm_source" | "origem_conversa">): string {
  const conversa = lead.origem_conversa;
  if (conversa?.tipo === "ad" || conversa?.entrada === "ctwa_ad") return "Anúncio → WhatsApp";
  const canal = lead.canal?.trim() || "";
  const fonte = lead.utm_source?.trim() || "";
  if (/^whatsapp$/i.test(canal) && !fonte) return "WhatsApp direto";
  if (canal && fonte) return `${canal} · ${fonte}`;
  return canal || fonte || "Sem origem";
}

export function mediana(valores: readonly number[]): number | null {
  const v = valores.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2);
}

function minutosEntre(de: string | null | undefined, ate: string | null | undefined): number | null {
  if (!de || !ate) return null;
  const m = (new Date(ate).getTime() - new Date(de).getTime()) / 60000;
  return Number.isFinite(m) && m >= 0 ? Math.round(m) : null;
}

const naJanela = (iso: string | null | undefined, desde: number) => Boolean(iso) && new Date(iso!).getTime() >= desde;

export function montarRelatorio(entrada: {
  dias: number;
  agora: Date;
  leads: readonly LeadDoRelatorio[];
  mensagens: readonly MensagemDoRelatorio[];
  usos: readonly UsoDoRelatorio[];
  /**
   * A classificação das fotos do estoque (custo da LOJA): entra no custo, mas
   * não em `chamadas_ao_modelo` — cada linha é uma foto, não uma chamada.
   */
  usosDasFotos?: readonly UsoDoRelatorio[];
  contatos: readonly ContatoDoRelatorio[];
  cadenciasEmAndamento: number;
}): RelatorioDoAtendimento {
  const desde = entrada.agora.getTime() - entrada.dias * 24 * 60 * 60 * 1000;
  const doPeriodo = entrada.leads.filter((l) => naJanela(l.created_at, desde));
  const entreguesNoPeriodo = entrada.leads.filter((l) => naJanela(l.entregue_em, desde));
  const mensagens = entrada.mensagens.filter((m) => naJanela(m.criado_em, desde));

  // Assistente ------------------------------------------------------------
  const respostas = mensagens.filter((m) => m.autor === "assistente" && m.gatilho === "resposta");
  const conversas = new Set(respostas.map((m) => m.lead_id));
  const porMotivo: Record<string, number> = {};
  for (const l of entreguesNoPeriodo) {
    const motivo = l.entregue_motivo ?? "quente";
    porMotivo[motivo] = (porMotivo[motivo] ?? 0) + 1;
  }
  const custo = [...entrada.usos, ...(entrada.usosDasFotos ?? [])].reduce(
    (soma, u) => soma + custoEstimado({ entrada: u.tokens_entrada, entradaEmCache: u.tokens_cache, saida: u.tokens_saida }),
    0,
  );

  // Temperatura dos abertos do período -------------------------------------
  const temperatura: Record<Temperatura | "sem_leitura", number> = { frio: 0, morno: 0, quente: 0, sem_leitura: 0 };
  for (const l of doPeriodo.filter((x) => !x.desfecho)) {
    temperatura[l.temperatura ?? "sem_leitura"] += 1;
  }

  // Origem -----------------------------------------------------------------
  const porOrigem = new Map<string, LinhaDeOrigem>();
  for (const l of doPeriodo) {
    const chave = grupoDeOrigem(l);
    const linha =
      porOrigem.get(chave) ??
      { origem: chave, leads: 0, conversaram: 0, quentes: 0, entregues: 0, ganhos: 0, perdidos: 0, conversao: 0 };
    linha.leads += 1;
    if (conversas.has(l.id) || l.assistente_fase) linha.conversaram += 1;
    if (l.temperatura === "quente" || l.entregue_em) linha.quentes += 1;
    if (l.entregue_em) linha.entregues += 1;
    if (l.desfecho === "ganho") linha.ganhos += 1;
    if (l.desfecho === "perdido") linha.perdidos += 1;
    porOrigem.set(chave, linha);
  }
  const origens = [...porOrigem.values()]
    .map((o) => ({ ...o, conversao: taxaDeConversao(o.ganhos, o.perdidos) }))
    .sort((a, b) => b.leads - a.leads || a.origem.localeCompare(b.origem, "pt-BR"));

  // Equipe -----------------------------------------------------------------
  const primeiroContato = new Map<string, string[]>();
  for (const c of entrada.contatos) {
    const lista = primeiroContato.get(c.lead_id) ?? [];
    lista.push(c.criado_em);
    primeiroContato.set(c.lead_id, lista);
  }
  const porVendedor = new Map<string, { linha: LinhaDaEquipe; confirmacoes: number[]; contatos: number[] }>();
  for (const l of entreguesNoPeriodo) {
    const nome = l.responsavel?.trim();
    if (!nome) continue;
    const item =
      porVendedor.get(nome) ??
      {
        linha: { vendedor: nome, recebidos: 0, confirmados: 0, confirmacao_mediana: null, primeiro_contato_mediana: null, sem_contato: 0, ganhos: 0, perdidos: 0, abertos: 0, conversao: 0 },
        confirmacoes: [],
        contatos: [],
      };
    item.linha.recebidos += 1;
    const avisado = l.aviso_de_entrega_para === nome ? l.aviso_de_entrega_em : null;
    if (l.entrega_confirmada_em && avisado) {
      item.linha.confirmados += 1;
      const m = minutosEntre(avisado, l.entrega_confirmada_em);
      if (m !== null) item.confirmacoes.push(m);
    }
    const marco = avisado ?? l.entregue_em;
    const depois = (primeiroContato.get(l.id) ?? []).filter((c) => marco && c >= marco).sort()[0];
    const m = minutosEntre(marco, depois);
    if (m === null) item.linha.sem_contato += 1;
    else item.contatos.push(m);
    if (l.desfecho === "ganho") item.linha.ganhos += 1;
    else if (l.desfecho === "perdido") item.linha.perdidos += 1;
    else if (!l.desfecho) item.linha.abertos += 1;
    porVendedor.set(nome, item);
  }
  const equipe = [...porVendedor.values()]
    .map(({ linha, confirmacoes, contatos }) => ({
      ...linha,
      confirmacao_mediana: mediana(confirmacoes),
      primeiro_contato_mediana: mediana(contatos),
      conversao: taxaDeConversao(linha.ganhos, linha.perdidos),
    }))
    .sort((a, b) => b.recebidos - a.recebidos || a.vendedor.localeCompare(b.vendedor, "pt-BR"));

  // Cadências --------------------------------------------------------------
  const toques = mensagens.filter((m) => m.gatilho === "cadencia");
  const tocados = new Set(toques.map((m) => m.lead_id));
  const reaquecidos = [...tocados].filter((id) => {
    const primeiroToque = toques.filter((t) => t.lead_id === id).map((t) => t.criado_em).sort()[0];
    return mensagens.some((m) => m.lead_id === id && m.direcao === "entrada" && m.criado_em > primeiroToque);
  });

  const comConversa = doPeriodo.filter((l) => conversas.has(l.id));
  return {
    dias: entrada.dias,
    assistente: {
      conversas: conversas.size,
      mensagens_do_cliente: mensagens.filter((m) => m.direcao === "entrada").length,
      respostas: respostas.length,
      entregues: entreguesNoPeriodo.length,
      por_motivo: porMotivo,
      taxa_de_entrega: conversas.size > 0 ? Math.round((entreguesNoPeriodo.filter((l) => conversas.has(l.id)).length / conversas.size) * 100) : 0,
      ate_a_entrega_mediana: mediana(
        comConversa.map((l) => minutosEntre(l.created_at, l.entregue_em)).filter((m): m is number => m !== null),
      ),
      optouts: entrada.leads.filter((l) => naJanela(l.optout_em, desde)).length,
      chamadas_ao_modelo: entrada.usos.length,
      custo_estimado_usd: Math.round(custo * 100) / 100,
    },
    temperatura,
    origens,
    equipe,
    cadencias: {
      toques: toques.length,
      leads_tocados: tocados.size,
      reaquecidos: reaquecidos.length,
      em_andamento: entrada.cadenciasEmAndamento,
    },
  };
}
