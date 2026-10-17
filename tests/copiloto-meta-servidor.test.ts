import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { montarRetratoMeta, rodarDiagnosticoMeta } from "../src/lib/copilotoMeta-servidor";

/**
 * O Copiloto do Meta no servidor, com o banco trocado por um falso que anota
 * cada consulta: o retrato lê só a plataforma do Meta e, do lead, só origem,
 * data e etapa; o diagnóstico sai uma vez por dia, depois da hora; e, sem a
 * migração, nada é gravado (a função antiga gravaria o retrato como do Google).
 */

type Consulta = { tabela: string; select: string; filtros: Array<[string, ...unknown[]]> };
type Resultado = { data: unknown; error: { message: string; code?: string } | null };

function bancoFalso(responder: (c: Consulta) => Resultado, rpcs: Record<string, Resultado> = {}) {
  const consultas: Consulta[] = [];
  const chamadas: Array<{ nome: string; args: unknown }> = [];
  const from = (tabela: string) => {
    const c: Consulta = { tabela, select: "", filtros: [] };
    consultas.push(c);
    const b: Record<string, unknown> = {};
    const anotar =
      (nome: string) =>
      (...args: unknown[]) => {
        if (nome === "select") c.select = String(args[0]);
        else c.filtros.push([nome, ...args]);
        return b;
      };
    for (const m of ["select", "eq", "not", "in", "gte", "lte", "lt", "is", "order", "limit"]) b[m] = anotar(m);
    b.then = (ok: (r: Resultado) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(responder(c)).then(ok, erro);
    return b;
  };
  const rpc = async (nome: string, args: unknown) => {
    chamadas.push({ nome, args });
    return rpcs[nome] ?? { data: null, error: { message: `rpc inesperada ${nome}` } };
  };
  return { admin: { from, rpc } as unknown as SupabaseClient, consultas, chamadas };
}

const PARAMETROS = {
  gasto_minimo_termo: 10,
  gasto_minimo_grupo: 50,
  gasto_minimo_campanha: 100,
  ritmo_alto_pct: 90,
  ritmo_baixo_pct: 50,
  reducao_verba_pct: 30,
  iq_baixo: 3,
  leads_gclid_minimos: 2,
  cliques_minimos_gclid: 30,
  perda_por_verba_pct: 10,
  perda_por_ranking_pct: 30,
  concorrentes: [],
  cidades_fora: [],
  palavras_informativas: [],
  hora_do_diagnostico: 7,
  vigencia_desde: "2026-10-14",
  criado_por_nome: null,
};

/** 17/10, 9h em Brasília: depois da hora das regras (7h). */
const AGORA = new Date("2026-10-17T12:00:00Z");

const dias = (anuncioId: string, gasto: number) =>
  Array.from({ length: 14 }, (_, i) => ({
    campanha_id: "uuid-A",
    anuncio_id: anuncioId,
    dia: `2026-10-${String(3 + i).padStart(2, "0")}`,
    investido: gasto,
    impressoes: 100,
    cliques: 2,
    conversoes: 0,
  }));

function tabelas(extra: { ultimoDiagnostico?: Resultado } = {}) {
  return (c: Consulta): Resultado => {
    switch (c.tabela) {
      case "midia_copiloto_parametros":
        return { data: [PARAMETROS], error: null };
      case "midia_copiloto_diagnosticos":
        return extra.ultimoDiagnostico ?? { data: [], error: null };
      case "midia_campanhas":
        return {
          data: [
            { id: "uuid-A", id_externo: "A", nome: "01 Leads", situacao: "no_ar", orcamento_diario: "100.00" },
            { id: "uuid-B", id_externo: "B", nome: "04 Remarketing", situacao: "no_ar", orcamento_diario: null },
          ],
          error: null,
        };
      case "midia_anuncios":
        return {
          data: [
            { id: "an-1", campanha_id: "uuid-A", id_externo: "a1", nome: "Broad 1", conjunto_id_externo: "s1", conjunto_nome: "Broad", situacao: "no_ar", conjunto_situacao: "no_ar" },
            { id: "an-2", campanha_id: "uuid-A", id_externo: "b1", nome: "Heróis 1", conjunto_id_externo: "s2", conjunto_nome: "Heróis", situacao: "no_ar", conjunto_situacao: "no_ar" },
          ],
          error: null,
        };
      case "midia_diario":
        return { data: [...dias("an-1", 30), ...dias("an-2", 25)], error: null };
      case "leads":
        return {
          data: [
            ...Array.from({ length: 6 }, () => ({ utm_campaign: "A", utm_content: "a1", created_at: "2026-10-10T15:00:00Z", situacao: "novo", desfecho: null })),
            { utm_campaign: "A", utm_content: "a1", created_at: "2026-09-25T15:00:00Z", situacao: "visita", desfecho: null },
            // 02h UTC do dia 11 ainda é dia 10 em Brasília.
            { utm_campaign: "A", utm_content: "a1", created_at: "2026-10-11T02:00:00Z", situacao: null, desfecho: "ganho" },
          ],
          error: null,
        };
      default:
        return { data: null, error: { message: `tabela inesperada ${c.tabela}` } };
    }
  };
}

const GRAVOU = { data: { diagnostico: "d1", achados: 2, propostas: 1, puladas: 0, descartadas: 0, plataforma: "meta" }, error: null };

describe("montarRetratoMeta", () => {
  it("lê só o Meta, a janela de 14 dias até ontem e, do lead, só origem, data e etapa", async () => {
    const { admin, consultas } = bancoFalso(tabelas());
    const r = await montarRetratoMeta(admin, "act_1", AGORA);
    expect(r.janela).toEqual({ de: "2026-10-03", ate: "2026-10-16" });
    expect(r.janelaQualidade).toEqual({ de: "2026-09-17", ate: "2026-10-16" });

    const camp = consultas.find((c) => c.tabela === "midia_campanhas")!;
    expect(camp.filtros).toContainEqual(["eq", "plataforma", "meta"]);
    const diario = consultas.find((c) => c.tabela === "midia_diario")!;
    expect(diario.filtros).toContainEqual(["gte", "dia", "2026-10-03"]);
    expect(diario.filtros).toContainEqual(["lte", "dia", "2026-10-16"]);

    const leads = consultas.find((c) => c.tabela === "leads")!;
    expect(leads.select).toBe("utm_campaign, utm_content, created_at, situacao, desfecho");
    expect(leads.filtros).toContainEqual(["in", "utm_campaign", ["A", "B"]]);
    // Meia-noite de Brasília (03h UTC) do primeiro e do dia seguinte ao último.
    expect(leads.filtros).toContainEqual(["gte", "created_at", "2026-09-17T03:00:00.000Z"]);
    expect(leads.filtros).toContainEqual(["lt", "created_at", "2026-10-17T03:00:00.000Z"]);

    expect(r.campanhas).toEqual([
      { id: "A", nome: "01 Leads", situacao: "no_ar", verba: 100 },
      { id: "B", nome: "04 Remarketing", situacao: "no_ar", verba: null },
    ]);
    expect(r.anuncios[1]).toEqual({
      id: "b1",
      nome: "Heróis 1",
      campanhaId: "A",
      conjuntoId: "s2",
      conjuntoNome: "Heróis",
      situacao: "no_ar",
      conjuntoSituacao: "no_ar",
    });
    expect(r.dias[0]).toMatchObject({ campanhaId: "A", anuncioId: "a1", gasto: 30 });
    expect(r.leads.filter((l) => l.qualificado)).toHaveLength(2);
    expect(r.leads.at(-1)).toEqual({ campanhaId: "A", anuncioId: "a1", dia: "2026-10-10", qualificado: true, aberto: false });
    expect(r.leads[0]).toMatchObject({ qualificado: false, aberto: true });
  });

  it("sem campanha do Meta, não consulta mais nada", async () => {
    const { admin, consultas } = bancoFalso((c) => (c.tabela === "midia_campanhas" ? { data: [], error: null } : tabelas()(c)));
    const r = await montarRetratoMeta(admin, "act_1", AGORA);
    expect(r.campanhas).toEqual([]);
    expect(consultas.map((c) => c.tabela)).toEqual(["midia_campanhas"]);
  });
});

describe("rodarDiagnosticoMeta", () => {
  it("depois da hora e sem o de hoje: grava com plataforma 'meta' pela função do Google", async () => {
    const { admin, chamadas } = bancoFalso(tabelas(), { org_padrao: { data: "org-1", error: null }, midia_copiloto_gravar_diagnostico: GRAVOU });
    const r = await rodarDiagnosticoMeta(admin, "act_802008949148808", AGORA);
    expect(r).toMatchObject({ feito: true, diagnostico: "d1", propostas: 1 });
    const gravar = chamadas.find((c) => c.nome === "midia_copiloto_gravar_diagnostico")!;
    const p = (gravar.args as { p: Record<string, unknown> }).p;
    expect(p).toMatchObject({ plataforma: "meta", conta: "act_802008949148808", de: "2026-10-03", ate: "2026-10-16", previa: false });
    expect(p.dados).not.toHaveProperty("leads");
    expect(p.propostas).toEqual([expect.objectContaining({ tipo: "pausar_conjunto", grupo_id_externo: "s2", campanha_id_externo: "A" })]);
  });

  it("procura o último diagnóstico só entre os do Meta, da loja", async () => {
    const { admin, consultas } = bancoFalso(tabelas(), { org_padrao: { data: "org-1", error: null }, midia_copiloto_gravar_diagnostico: GRAVOU });
    await rodarDiagnosticoMeta(admin, "act_1", AGORA);
    const ultimo = consultas.find((c) => c.tabela === "midia_copiloto_diagnosticos")!;
    expect(ultimo.filtros).toEqual(
      expect.arrayContaining([
        ["eq", "org_id", "org-1"],
        ["eq", "plataforma", "meta"],
        ["eq", "previa", false],
      ]),
    );
  });

  it("o de hoje já feito: não grava", async () => {
    const { admin, chamadas } = bancoFalso(tabelas({ ultimoDiagnostico: { data: [{ recebido_em: "2026-10-17T10:05:00Z" }], error: null } }), {
      org_padrao: { data: "org-1", error: null },
    });
    const r = await rodarDiagnosticoMeta(admin, "act_1", AGORA);
    expect(r.feito).toBe(false);
    expect(chamadas.some((c) => c.nome === "midia_copiloto_gravar_diagnostico")).toBe(false);
  });

  it("antes da hora das regras: não grava", async () => {
    const { admin, chamadas } = bancoFalso(tabelas(), { org_padrao: { data: "org-1", error: null } });
    // 6h em Brasília.
    const r = await rodarDiagnosticoMeta(admin, "act_1", new Date("2026-10-17T09:00:00Z"));
    expect(r.feito).toBe(false);
    expect(chamadas.some((c) => c.nome === "midia_copiloto_gravar_diagnostico")).toBe(false);
  });

  it("sem a migração do Meta (coluna plataforma ausente): para antes de gravar", async () => {
    const { admin, chamadas } = bancoFalso(
      tabelas({ ultimoDiagnostico: { data: null, error: { message: "column midia_copiloto_diagnosticos.plataforma does not exist", code: "42703" } } }),
      { org_padrao: { data: "org-1", error: null }, midia_copiloto_gravar_diagnostico: GRAVOU },
    );
    await expect(rodarDiagnosticoMeta(admin, "act_1", AGORA)).rejects.toThrow(/plataforma does not exist/);
    expect(chamadas.some((c) => c.nome === "midia_copiloto_gravar_diagnostico")).toBe(false);
  });

  it("sem regra vigente: não roda", async () => {
    const { admin, chamadas } = bancoFalso((c) => (c.tabela === "midia_copiloto_parametros" ? { data: [], error: null } : tabelas()(c)), {
      org_padrao: { data: "org-1", error: null },
    });
    const r = await rodarDiagnosticoMeta(admin, "act_1", AGORA);
    expect(r).toEqual({ feito: false, motivo: "Nenhuma regra vigente para o copiloto." });
    expect(chamadas.map((c) => c.nome)).toEqual(["org_padrao"]);
  });
});
