import { describe, it, expect } from "vitest";
import type { ParametrosDoCopiloto } from "../src/lib/copilotoDeMidia";
import {
  CORTE_MAXIMO_META_PCT,
  diagnosticarMeta,
  diagnosticoMetaParaBanco,
  fraseDaProposta,
  leadQualificado,
  somarDias,
  type AnuncioDoMeta,
  type CampanhaDoMeta,
  type DiaDoMeta,
  type LeadDoMeta,
  type RetratoDoMeta,
} from "../src/lib/copilotoMeta";

/**
 * O Copiloto do Meta, parte pura: o retrato de 14 dias com os leads do CRM, as
 * regras que viram achado e proposta, e o JSON que vai para o banco.
 *
 * O cenário-base é a conta de outubro: a campanha "01 Leads" com dois
 * conjuntos — "Broad", que traz lead, e "Heróis", que gasta sem trazer — e a
 * "04 Remarketing", pequena e com verba sobrando.
 */

const P: ParametrosDoCopiloto = {
  gastoMinimoTermo: 10,
  gastoMinimoGrupo: 50,
  gastoMinimoCampanha: 100,
  ritmoAltoPct: 90,
  ritmoBaixoPct: 50,
  reducaoVerbaPct: 30,
  iqBaixo: 3,
  leadsGclidMinimos: 2,
  cliquesMinimosGclid: 30,
  perdaPorVerbaPct: 10,
  perdaPorRankingPct: 30,
  concorrentes: [],
  cidadesFora: [],
  palavrasInformativas: [],
  horaDoDiagnostico: 7,
};

const JANELA = { de: "2026-10-03", ate: "2026-10-16" };
const QUALIDADE = { de: "2026-09-17", ate: "2026-10-16" };
const DIAS = Array.from({ length: 14 }, (_, i) => somarDias(JANELA.de, i));

const campanha = (id: string, nome: string, verba: number | null, situacao: CampanhaDoMeta["situacao"] = "no_ar"): CampanhaDoMeta => ({
  id,
  nome,
  situacao,
  verba,
});
const anuncio = (id: string, campanhaId: string, conjuntoId: string, conjuntoNome: string, situacao: AnuncioDoMeta["situacao"] = "no_ar"): AnuncioDoMeta => ({
  id,
  nome: `Anúncio ${id}`,
  campanhaId,
  conjuntoId,
  conjuntoNome,
  situacao,
  conjuntoSituacao: "no_ar",
});
/** O mesmo gasto todo dia da janela. */
const gastoDiario = (campanhaId: string, anuncioId: string, porDia: number, pixelNoPeriodo = 0): DiaDoMeta[] =>
  DIAS.map((dia, i) => ({ campanhaId, anuncioId, dia, gasto: porDia, impressoes: 1000, cliques: 20, leads: i < pixelNoPeriodo ? 1 : 0 }));
const leads = (n: number, campanhaId: string | null, anuncioId: string | null, dia = "2026-10-10", extra: Partial<LeadDoMeta> = {}): LeadDoMeta[] =>
  Array.from({ length: n }, () => ({ campanhaId, anuncioId, dia, qualificado: false, aberto: true, ...extra }));

/**
 * 01 Leads (R$ 100/dia): Broad (a1 traz 10 leads, a2 gasta R$ 252 sem lead) e
 * Heróis (b1 gasta R$ 280 sem lead). 04 Remarketing (R$ 20/dia): c1, R$ 70 e um lead.
 * Gasto 1.022, 11 leads: R$ 92,91 por lead, limite sem lead de R$ 232,27.
 */
function retratoBase(): RetratoDoMeta {
  return {
    conta: "act_802008949148808",
    janela: JANELA,
    janelaQualidade: QUALIDADE,
    campanhas: [campanha("A", "01 Leads", 100), campanha("B", "04 Remarketing", 20)],
    anuncios: [
      anuncio("a1", "A", "s1", "Broad"),
      anuncio("a2", "A", "s1", "Broad"),
      anuncio("b1", "A", "s2", "Heróis"),
      anuncio("c1", "B", "s3", "Remarketing 30d"),
    ],
    dias: [...gastoDiario("A", "a1", 30, 10), ...gastoDiario("A", "a2", 18), ...gastoDiario("A", "b1", 20), ...gastoDiario("B", "c1", 5, 1)],
    leads: [...leads(10, "A", "a1"), ...leads(1, "B", "c1")],
  };
}

describe("leadQualificado — a régua da qualificação que vai ao Meta", () => {
  it("visita, negociação, a etapa de ganho e o desfecho ganho qualificam; o resto não", () => {
    expect(leadQualificado("visita", null)).toBe(true);
    expect(leadQualificado("negociacao", null)).toBe(true);
    expect(leadQualificado("fechado", null)).toBe(true);
    expect(leadQualificado(null, "ganho")).toBe(true);
    expect(leadQualificado("novo", null)).toBe(false);
    expect(leadQualificado("em_contato", null)).toBe(false);
    // "proposta" é o rótulo "Recontato": não é qualificado.
    expect(leadQualificado("proposta", "perdido")).toBe(false);
    expect(leadQualificado(undefined, undefined)).toBe(false);
  });
});

describe("diagnosticarMeta — o cenário-base", () => {
  const res = diagnosticarMeta(retratoBase(), P);

  it("resume pelo lead que chegou ao CRM, não pelo pixel", () => {
    expect(res.resumo).toMatchObject({ plataforma: "meta", gasto: 1022, leadsCrm: 11, leadsPixel: 11, custoPorLead: 92.91 });
  });

  it("propõe pausar o conjunto sem lead e o anúncio sem lead, a maior economia primeiro", () => {
    expect(res.propostas.map((p) => [p.tipo, p.chave])).toEqual([
      ["pausar_conjunto", "meta:pausar_conjunto:s2"],
      ["pausar_anuncio", "meta:pausar_anuncio:a2"],
    ]);
    expect(res.propostas.map(fraseDaProposta)).toEqual([
      "Pausar o conjunto Heróis (01 Leads)",
      "Pausar o anúncio Anúncio a2 (Broad · 01 Leads)",
    ]);
    expect(res.propostas[0].economia7d).toBe(140);
    expect(res.propostas[1]).toMatchObject({ grupoId: "s1", anuncioId: "a2", economia7d: 126 });
  });

  it("cada proposta aponta para o seu achado", () => {
    for (const p of res.propostas) {
      expect(res.achados[p.achado].regra).toBe("meta_sem_lead");
    }
    expect(res.achados[res.propostas[0].achado].gravidade).toBe("alta");
    expect(res.achados[res.propostas[1].achado].gravidade).toBe("media");
  });

  it("não corta a verba da campanha que já tem pausa proposta (uma mudança por vez)", () => {
    expect(res.propostas.some((p) => p.tipo === "mudar_verba")).toBe(false);
    expect(res.achados.some((a) => a.regra === "meta_custo_por_lead")).toBe(false);
  });

  it("aponta a verba sobrando, sem propor nada", () => {
    const ritmo = res.achados.filter((a) => a.regra === "ritmo_de_verba");
    expect(ritmo).toHaveLength(1);
    expect(ritmo[0].titulo).toContain("04 Remarketing");
    expect(ritmo[0].gravidade).toBe("baixa");
  });
});

describe("diagnosticarMeta — o que segura a mão", () => {
  it("o único conjunto no ar vira achado, nunca pausa (pararia a campanha)", () => {
    const r = retratoBase();
    r.anuncios = r.anuncios.map((a) => (a.conjuntoId === "s1" ? { ...a, conjuntoSituacao: "pausada" as const } : a));
    const res = diagnosticarMeta(r, P);
    expect(res.propostas.some((p) => p.tipo === "pausar_conjunto")).toBe(false);
    const achado = res.achados.find((a) => a.regra === "meta_sem_lead" && a.titulo.includes("Heróis"));
    expect(achado?.detalhe).toContain("A campanha não tem outro conjunto no ar que continue entregando");
  });

  it("dois conjuntos sem lead: nenhum é pausado (pausar os dois pararia a campanha)", () => {
    const r = retratoBase();
    // Broad pausado (os leads dele são de antes); Heróis e um conjunto novo gastando sem lead.
    r.anuncios = r.anuncios.map((a) => (a.conjuntoId === "s1" ? { ...a, conjuntoSituacao: "pausada" as const } : a));
    r.anuncios.push(anuncio("d1", "A", "s4", "Interesses"));
    // R$ 25/dia nos dois: R$ 350 cada, acima do limite (R$ 327,69).
    r.dias = r.dias.map((d) => (d.anuncioId === "b1" ? { ...d, gasto: 25 } : d));
    r.dias.push(...gastoDiario("A", "d1", 25));
    const res = diagnosticarMeta(r, P);
    expect(res.propostas.filter((p) => p.tipo === "pausar_conjunto")).toEqual([]);
    expect(res.achados.filter((a) => a.regra === "meta_sem_lead" && a.titulo.startsWith("Conjunto"))).toHaveLength(2);
  });

  it("o conjunto que fica precisa estar entregando (gasto nos últimos 7 dias)", () => {
    const r = retratoBase();
    // Broad no ar, mas parou de gastar na segunda semana: não segura a campanha.
    r.dias = r.dias.map((d) => (d.anuncioId?.startsWith("a") && d.dia >= "2026-10-10" ? { ...d, gasto: 0 } : d));
    const res = diagnosticarMeta(r, P);
    expect(res.propostas.some((p) => p.tipo === "pausar_conjunto")).toBe(false);
  });

  it("dois anúncios sem lead e o que trouxe lead pausado: nenhum é pausado", () => {
    const r = retratoBase();
    r.anuncios = r.anuncios.map((a) => (a.id === "a1" ? { ...a, situacao: "pausada" as const } : a));
    r.anuncios.push(anuncio("a3", "A", "s1", "Broad"));
    // R$ 25/dia em a2 e a3: R$ 350 cada, acima do limite (R$ 334,09).
    r.dias = r.dias.map((d) => (d.anuncioId === "a2" ? { ...d, gasto: 25 } : d));
    r.dias.push(...gastoDiario("A", "a3", 25));
    const res = diagnosticarMeta(r, P);
    expect(res.propostas.filter((p) => p.tipo === "pausar_anuncio")).toEqual([]);
    const achados = res.achados.filter((a) => a.titulo.startsWith("Anúncio Anúncio a"));
    expect(achados.map((a) => a.titulo.split(":")[0])).toEqual(["Anúncio Anúncio a2", "Anúncio Anúncio a3"]);
    for (const a of achados) expect(a.detalhe).toContain("pausar pararia o conjunto");
  });

  it("o anúncio só é pausado quando o conjunto tem outro no ar", () => {
    const r = retratoBase();
    r.anuncios = r.anuncios.map((a) => (a.id === "a1" ? { ...a, situacao: "pausada" as const } : a));
    const res = diagnosticarMeta(r, P);
    expect(res.propostas.some((p) => p.tipo === "pausar_anuncio")).toBe(false);
  });

  it("lead da campanha sem anúncio conhecido impede julgar conjunto e anúncio dela", () => {
    const r = retratoBase();
    r.leads.push(...leads(1, "A", null));
    const res = diagnosticarMeta(r, P);
    expect(res.propostas.filter((p) => p.campanhaId === "A" && p.tipo !== "mudar_verba")).toEqual([]);
  });

  it("campanha pausada não recebe proposta", () => {
    const r = retratoBase();
    r.campanhas[0] = { ...r.campanhas[0], situacao: "pausada" };
    expect(diagnosticarMeta(r, P).propostas).toEqual([]);
  });

  it("gasto abaixo de 2,5× o custo por lead da conta é azar, não proposta", () => {
    const r = retratoBase();
    // b1 passa a gastar R$ 10/dia: R$ 140, abaixo do limite.
    r.dias = r.dias.map((d) => (d.anuncioId === "b1" ? { ...d, gasto: 10 } : d));
    const res = diagnosticarMeta(r, P);
    expect(res.propostas.some((p) => p.tipo === "pausar_conjunto")).toBe(false);
  });

  it("sem nenhum lead do Meta no CRM, acusa a medição e não propõe nada", () => {
    const r = retratoBase();
    r.leads = [];
    const res = diagnosticarMeta(r, P);
    expect(res.propostas).toEqual([]);
    expect(res.resumo.custoPorLead).toBeNull();
    const medicao = res.achados.filter((a) => a.regra === "meta_medicao");
    expect(medicao[0]).toMatchObject({ gravidade: "alta" });
    expect(medicao[0].titulo).toContain("nenhum lead do Meta no CRM");
  });

  it("lead fora da janela de 14 dias não conta como lead do anúncio", () => {
    const r = retratoBase();
    r.leads = [...leads(10, "A", "a1", "2026-09-20"), ...leads(1, "B", "c1")];
    const res = diagnosticarMeta(r, P);
    expect(res.resumo.leadsCrm).toBe(1);
  });
});

describe("diagnosticarMeta — custo por lead da campanha", () => {
  /** X: R$ 700 e 10 leads (R$ 70). Y: R$ 600 e 2 leads (R$ 300), verba de R$ 50. */
  function retratoCaro(verbaY: number | null = 50): RetratoDoMeta {
    return {
      conta: "act_1",
      janela: JANELA,
      janelaQualidade: QUALIDADE,
      campanhas: [campanha("X", "Campanha X", 50), campanha("Y", "Campanha Y", verbaY)],
      anuncios: [anuncio("x1", "X", "sx", "Conjunto X"), anuncio("y1", "Y", "sy", "Conjunto Y")],
      dias: [...gastoDiario("X", "x1", 50), ...gastoDiario("Y", "y1", 600 / 14)],
      leads: [...leads(10, "X", "x1"), ...leads(2, "Y", "y1")],
    };
  }

  it("corta no máximo 20% da verba da campanha com o dobro do custo da conta", () => {
    const res = diagnosticarMeta(retratoCaro(), P);
    expect(CORTE_MAXIMO_META_PCT).toBe(20);
    expect(res.propostas).toHaveLength(1);
    expect(res.propostas[0]).toMatchObject({ tipo: "mudar_verba", chave: "verba:Y", verbaAtual: 50, verbaNova: 40, economia7d: 70 });
    expect(fraseDaProposta(res.propostas[0])).toBe("Verba de Campanha Y: R$\u00a050,00 → R$\u00a040,00 por dia");
    expect(res.achados[res.propostas[0].achado].regra).toBe("meta_custo_por_lead");
  });

  it("o parâmetro da loja vale abaixo do teto", () => {
    const res = diagnosticarMeta(retratoCaro(), { ...P, reducaoVerbaPct: 10 });
    expect(res.propostas[0].verbaNova).toBe(45);
  });

  it("verba nos conjuntos: achado sem proposta", () => {
    const res = diagnosticarMeta(retratoCaro(null), P);
    expect(res.propostas).toEqual([]);
    expect(res.achados.find((a) => a.regra === "meta_custo_por_lead")?.detalhe).toContain("fica nos conjuntos");
  });

  it("com uma campanha só, não há com quem comparar", () => {
    const r = retratoCaro();
    r.campanhas = [r.campanhas[1]];
    r.dias = r.dias.filter((d) => d.campanhaId === "Y");
    r.leads = r.leads.filter((l) => l.campanhaId === "Y");
    expect(diagnosticarMeta(r, P).propostas).toEqual([]);
  });
});

describe("diagnosticarMeta — medição e qualidade", () => {
  it("pixel contando o dobro do CRM vira achado de medição da campanha", () => {
    const r = retratoBase();
    r.dias = r.dias.map((d) => (d.anuncioId === "c1" ? { ...d, leads: 1 } : d));
    const res = diagnosticarMeta(r, P);
    const medicao = res.achados.find((a) => a.regra === "meta_medicao" && a.titulo.includes("04 Remarketing"));
    expect(medicao?.titulo).toBe("04 Remarketing: o pixel contou 14, o CRM recebeu 1");
  });

  it("leads maduros sem nenhum qualificado e funil parado viram achados de qualidade", () => {
    const r = retratoBase();
    r.leads.push(...leads(8, "B", "c1", "2026-09-25"));
    const res = diagnosticarMeta(r, P);
    expect(res.resumo).toMatchObject({ maduros: 8, qualificados: 0, abertosParados: 8 });
    const qualidade = res.achados.filter((a) => a.regra === "meta_qualidade");
    expect(qualidade.map((a) => a.gravidade)).toEqual(["media", "baixa"]);
  });

  it("lead com menos de 7 dias não é maduro; o qualificado conta", () => {
    const r = retratoBase();
    r.leads = [
      ...leads(3, "A", "a1", "2026-10-15"),
      ...leads(2, "A", "a1", "2026-10-01", { qualificado: true, aberto: false }),
      ...leads(1, "A", "a1", "2026-10-01"),
    ];
    const res = diagnosticarMeta(r, P);
    expect(res.resumo).toMatchObject({ maduros: 3, qualificados: 2, abertosParados: 1 });
  });
});

describe("diagnosticoMetaParaBanco", () => {
  it("vai com plataforma 'meta', sem os leads, e com o anúncio na proposta", () => {
    const r = retratoBase();
    const p = diagnosticoMetaParaBanco(r, diagnosticarMeta(r, P));
    expect(p).toMatchObject({ plataforma: "meta", conta: "act_802008949148808", de: JANELA.de, ate: JANELA.ate, previa: false, erros: {} });
    expect(p.dados).not.toHaveProperty("leads");
    expect(p.propostas[1]).toMatchObject({
      tipo: "pausar_anuncio",
      campanha_id_externo: "A",
      grupo_id_externo: "s1",
      grupo_nome: "Broad",
      anuncio_id_externo: "a2",
      anuncio_nome: "Anúncio a2",
    });
    expect(p.resumo.plataforma).toBe("meta");
  });
});
