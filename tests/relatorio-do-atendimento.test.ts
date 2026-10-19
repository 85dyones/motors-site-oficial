import { describe, expect, it } from "vitest";
import { grupoDeOrigem, mediana, montarRelatorio, type LeadDoRelatorio } from "../src/lib/relatorioDoAtendimento";

/**
 * O relatório do atendimento (2026-10-20): origem, equipe, assistente e
 * cadências. A conversão é a do funil — descartado fora do denominador — e
 * tempo sem registro fica vazio, nunca zero.
 */

const AGORA = new Date("2026-10-20T15:00:00Z");

const lead = (parcial: Partial<LeadDoRelatorio>): LeadDoRelatorio => ({
  id: "l",
  created_at: "2026-10-18T10:00:00Z",
  canal: "WhatsApp",
  utm_source: null,
  utm_campaign: null,
  origem_conversa: null,
  responsavel: null,
  desfecho: null,
  temperatura: null,
  assistente_fase: null,
  entregue_em: null,
  entregue_motivo: null,
  aviso_de_entrega_em: null,
  aviso_de_entrega_para: null,
  entrega_confirmada_em: null,
  optout_em: null,
  ...parcial,
});

describe("a origem", () => {
  it("anúncio de clique para o WhatsApp, WhatsApp direto, canal do site com a fonte", () => {
    expect(grupoDeOrigem({ canal: "WhatsApp", origem_conversa: { tipo: "ad" } })).toBe("Anúncio → WhatsApp");
    expect(grupoDeOrigem({ canal: "WhatsApp" })).toBe("WhatsApp direto");
    expect(grupoDeOrigem({ canal: "WhatsApp Proposta", utm_source: "google" })).toBe("WhatsApp Proposta · google");
    expect(grupoDeOrigem({ canal: null })).toBe("Sem origem");
  });
});

describe("o relatório", () => {
  const leads = [
    lead({ id: "a", origem_conversa: { tipo: "ad" }, temperatura: "quente", assistente_fase: "entregue", entregue_em: "2026-10-18T10:30:00Z", entregue_motivo: "quente", responsavel: "Carla", aviso_de_entrega_para: "Carla", aviso_de_entrega_em: "2026-10-18T10:30:00Z", entrega_confirmada_em: "2026-10-18T10:35:00Z", desfecho: "ganho" }),
    lead({ id: "b", origem_conversa: { tipo: "ad" }, temperatura: "morno", assistente_fase: "qualificando" }),
    lead({ id: "c", temperatura: "frio", assistente_fase: "entregue", entregue_em: "2026-10-19T09:00:00Z", entregue_motivo: "pediu_humano", responsavel: "Carla", aviso_de_entrega_para: "Carla", aviso_de_entrega_em: "2026-10-19T09:00:00Z", desfecho: "perdido" }),
    lead({ id: "d", canal: "Formulário Contato", utm_source: "google", desfecho: "descartado" }),
    // Fora do período (90 dias atrás): não entra.
    lead({ id: "velho", created_at: "2026-07-01T10:00:00Z" }),
  ];
  const mensagens = [
    { lead_id: "a", direcao: "entrada" as const, autor: "cliente", gatilho: null, criado_em: "2026-10-18T10:00:00Z" },
    { lead_id: "a", direcao: "saida" as const, autor: "assistente", gatilho: "resposta", criado_em: "2026-10-18T10:01:00Z" },
    { lead_id: "b", direcao: "saida" as const, autor: "assistente", gatilho: "resposta", criado_em: "2026-10-18T11:01:00Z" },
    { lead_id: "b", direcao: "saida" as const, autor: "assistente", gatilho: "cadencia", criado_em: "2026-10-19T11:01:00Z" },
    { lead_id: "b", direcao: "entrada" as const, autor: "cliente", gatilho: null, criado_em: "2026-10-19T12:00:00Z" },
    { lead_id: "c", direcao: "saida" as const, autor: "assistente", gatilho: "resposta", criado_em: "2026-10-19T08:55:00Z" },
  ];
  const r = montarRelatorio({
    dias: 30,
    agora: AGORA,
    leads,
    mensagens,
    usos: [{ tokens_entrada: 1_000_000, tokens_cache: 0, tokens_saida: 1_000_000 }],
    contatos: [{ lead_id: "a", criado_em: "2026-10-18T10:50:00Z" }],
    cadenciasEmAndamento: 4,
  });

  it("o assistente: conversas, entregas por motivo, tempo até a entrega e custo", () => {
    expect(r.assistente).toMatchObject({
      conversas: 3,
      respostas: 3,
      entregues: 2,
      por_motivo: { quente: 1, pediu_humano: 1 },
      taxa_de_entrega: 67,
      chamadas_ao_modelo: 1,
      custo_estimado_usd: 0.75,
    });
    // a: 30 min desde a criação; c: 23 h. Mediana de dois = a média.
    expect(r.assistente.ate_a_entrega_mediana).toBe(Math.round((30 + 23 * 60) / 2));
  });

  it("a origem: conversão sem o descartado", () => {
    const anuncio = r.origens.find((o) => o.origem === "Anúncio → WhatsApp")!;
    expect(anuncio).toMatchObject({ leads: 2, conversaram: 2, quentes: 1, entregues: 1, ganhos: 1, perdidos: 0, conversao: 100 });
    const site = r.origens.find((o) => o.origem === "Formulário Contato · google")!;
    expect(site).toMatchObject({ leads: 1, ganhos: 0, perdidos: 0, conversao: 0 });
    expect(r.origens.map((o) => o.origem)).not.toContain("velho");
  });

  it("a equipe: recebidos, confirmação, primeiro contato — e 'sem contato' em vez de zero", () => {
    expect(r.equipe).toEqual([
      {
        vendedor: "Carla",
        recebidos: 2,
        confirmados: 1,
        confirmacao_mediana: 5,
        primeiro_contato_mediana: 20,
        sem_contato: 1,
        ganhos: 1,
        perdidos: 1,
        abertos: 0,
        conversao: 50,
      },
    ]);
  });

  it("as cadências: quem respondeu depois do toque foi reaquecido", () => {
    expect(r.cadencias).toEqual({ toques: 1, leads_tocados: 1, reaquecidos: 1, em_andamento: 4 });
  });

  it("a temperatura dos abertos do período", () => {
    expect(r.temperatura).toEqual({ frio: 0, morno: 1, quente: 0, sem_leitura: 0 });
  });
});

describe("a mediana", () => {
  it("ímpar, par e vazio", () => {
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([1, 2, 3, 4])).toBe(3);
    expect(mediana([])).toBeNull();
  });
});
