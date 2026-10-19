import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseDeTeste, type Chamada, type Resposta } from "./supabaseDaConsultaDeDocumento";

/**
 * A consulta de placa por nível — a rede, o banco e o aprofundar
 * (`niveisDaPlaca-servidor.ts`, 19/10/2026).
 *
 * O gateway é um dublê que responde por produto (`tipo` do corpo) com as
 * respostas de `tests/fixtures/apibrasil/placa-niveis.json`, e o banco é o
 * dublê do supabase-js da consulta de documento. O que estes testes seguram é
 * o dinheiro:
 *  - a mesma placa e nível consultados há pouco voltam 409 SEM chamar o
 *    gateway, a menos que venha `repetir`;
 *  - o aprofundar chama o gateway só para os produtos que faltam, e grava os
 *    reaproveitados como tentativas que não cobraram;
 *  - aprofundar de consulta velha, de outro modo do fornecedor ou de outra
 *    placa é recusado ANTES de chamar o gateway;
 *  - nada voltou: 502/402 sem gravar; voltou em parte: grava só o que veio;
 *  - o custo só é somado quando se sabe; em homologação é zero.
 */

vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => null, createAdminSupabaseClient: () => null }));
const consultarGratuito = vi.fn();
vi.mock("../src/lib/consultaGratuita", () => ({ consultarGratuito: (...a: unknown[]) => consultarGratuito(...a) }));

const { consultarPlacaPorNivel, consultarProdutoDaPlaca, custoDasTentativas, lerParametrosDaPlaca, niveisComPreco, nivelDaGuardada, opcoesDeAprofundar } = await import(
  "../src/lib/niveisDaPlaca-servidor"
);
type ParametrosDaPlaca = import("../src/lib/niveisDaPlaca-servidor").ParametrosDaPlaca;
type TentativaDaPlaca = import("../src/lib/niveisDaPlaca-servidor").TentativaDaPlaca;
type BuscarNaApiBrasil = import("../src/lib/apiBrasil").BuscarNaApiBrasil;
type ConsultaGuardada = import("../src/lib/consultaDePlaca-servidor").ConsultaGuardada;
type NivelDaPlaca = import("../src/lib/niveisDaPlaca").NivelDaPlaca;

const FIXTURE = JSON.parse(readFileSync(join(__dirname, "fixtures", "apibrasil", "placa-niveis.json"), "utf8")) as Record<string, Record<string, unknown>>;
const VEICULOS_TOTAL = JSON.parse(readFileSync(join(__dirname, "fixtures", "apibrasil", "veiculos-total-mg-com-alienacao.json"), "utf8")) as Record<string, unknown>;
const MIGRACAO = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261019120000_niveis_da_consulta_de_placa.sql"), "utf8");
const PRECOS = JSON.parse(MIGRACAO.match(/-- A semente[\s\S]*?'(\{"estadual"[\s\S]*?\})'::jsonb/)![1]) as Record<string, number>;

const PLACA = "QOZ7702";
const TOKEN = "tok-da-loja";
const AGORA = new Date("2026-10-19T15:00:00.000Z");
const HORA = 3_600_000;
const DIA = 24 * HORA;
const ID_DA_BASICA = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ID_NOVO = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const PARAMETROS: ParametrosDaPlaca = { precos: PRECOS, tabelaDePrecosEm: "2026-10-19", diasParaAprofundar: 7, minutosContraRepeticao: 30 };

interface Pedida {
  url: string;
  headers: Record<string, string>;
  corpo: Record<string, unknown>;
}

const doExemplo = (produto: string) => ({ status: 200, corpo: structuredClone(FIXTURE[produto] ?? VEICULOS_TOTAL) });
const abortou = () => Object.assign(new Error("aborted"), { name: "AbortError" });

/** O gateway de mentira: responde por produto e guarda o que foi pedido. */
function gateway(responder: (produto: string) => { status: number; corpo: unknown } | Error = doExemplo) {
  const pedidas: Pedida[] = [];
  const buscar: BuscarNaApiBrasil = async (url, init) => {
    const corpo = JSON.parse(init.body) as Record<string, unknown>;
    pedidas.push({ url, headers: init.headers, corpo });
    const r = responder(String(corpo.tipo));
    if (r instanceof Error) throw r;
    return { status: r.status, json: async () => r.corpo };
  };
  return { buscar, pedidas, tipos: () => pedidas.map((p) => String(p.corpo.tipo)).sort() };
}

/**
 * O banco: a trava devolve `trava`, o aprofundar lê `base`, e a inclusão
 * devolve a linha como o PostgREST devolveria (id e carimbo do banco).
 */
function banco(o: { trava?: Resposta; base?: Resposta; inclusao?: (valores: Record<string, unknown>) => Resposta } = {}) {
  return supabaseDeTeste({
    responder: (c: Chamada) => {
      if (c.operacao === "insert") {
        const valores = c.valores as Record<string, unknown>;
        return o.inclusao?.(valores) ?? { data: { ...valores, id: ID_NOVO, criado_em: AGORA.toISOString(), consultado_por_nome: "Ana" }, error: null };
      }
      if (c.fim === "maybeSingle") return o.base ?? { data: null, error: null };
      return o.trava ?? { data: [], error: null };
    },
  });
}

const inclusoes = (chamadas: Chamada[]) => chamadas.filter((c) => c.operacao === "insert").map((c) => c.valores as Record<string, unknown>);

async function consultar(
  nivel: NivelDaPlaca,
  o: { gw?: ReturnType<typeof gateway>; db?: ReturnType<typeof banco>; aprofundarDe?: string | null; repetir?: boolean; homologacao?: boolean; parametros?: ParametrosDaPlaca; placa?: string } = {},
) {
  const gw = o.gw ?? gateway();
  const db = o.db ?? banco();
  const r = await consultarPlacaPorNivel(
    db.cliente as unknown as SupabaseClient,
    { placa: o.placa ?? PLACA, nivel, aprofundarDe: o.aprofundarDe ?? null, repetir: o.repetir },
    { token: TOKEN, homologacao: o.homologacao ?? false, parametros: o.parametros ?? PARAMETROS, buscar: gw.buscar, agora: () => AGORA },
  );
  return { r, gw, db, gravado: inclusoes(db.chamadas)[0] as Record<string, unknown> | undefined };
}

/** A linha que o banco guardou da consulta básica, como a leitura do aprofundar a devolve. */
async function linhaDaBasica(muda: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const { gravado } = await consultar("basico");
  return JSON.parse(JSON.stringify({ ...gravado, id: ID_DA_BASICA, criado_em: new Date(AGORA.getTime() - 2 * DIA).toISOString(), consultado_por_nome: "Bia", ...muda }));
}

beforeEach(() => {
  consultarGratuito.mockReset();
  consultarGratuito.mockResolvedValue({ empresaDoFaturamento: null, fipeOficial: null, falhas: [] });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("os parâmetros e o que a tela mostra antes de cobrar", () => {
  it("lerParametrosDaPlaca lê a vigente: preços (só os do catálogo), data, prazo e trava", async () => {
    const { cliente, chamadas } = supabaseDeTeste({
      responder: () => ({
        data: { precos_de_referencia: { ...PRECOS, recall: "0,62", inventado: 9 }, tabela_de_precos_em: "2026-10-19", dias_para_aprofundar: 7, minutos_contra_repeticao: 30 },
        error: null,
      }),
    });
    const r = await lerParametrosDaPlaca(cliente as unknown as SupabaseClient);
    expect(r).toEqual({ ok: true, parametros: { ...PARAMETROS, precos: { ...PRECOS, recall: 0.62 } } });
    expect(chamadas[0]).toMatchObject({ tabela: "parametros_consulta_veiculo", filtros: [["is", "vigencia_ate", null]], fim: "maybeSingle" });
  });

  it("sem tabela é falta de migração; sem vigente é motivo próprio", async () => {
    const semTabela = supabaseDeTeste({ responder: () => ({ data: null, error: { code: "42P01", message: 'relation "parametros_consulta_veiculo" does not exist' } }) });
    expect(await lerParametrosDaPlaca(semTabela.cliente as unknown as SupabaseClient)).toMatchObject({ ok: false, faltaMigracao: true });
    const vazia = supabaseDeTeste({ responder: () => ({ data: null, error: null }) });
    const r = await lerParametrosDaPlaca(vazia.cliente as unknown as SupabaseClient);
    expect(r).toMatchObject({ ok: false, faltaMigracao: false });
    expect(!r.ok && r.motivo).toContain("parametros_consulta_veiculo");
  });

  it("niveisComPreco: os quatro, com os preços da semente e os nomes dos produtos", () => {
    const n = niveisComPreco(PRECOS);
    expect(n.map((x) => [x.id, x.preco])).toEqual([
      ["basico", 3.18],
      ["intermediario", 5.58],
      ["economico", 10.58],
      ["completo", 30],
    ]);
    expect(n[0].nomesDosProdutos).toEqual(["Base Estadual (Detran)", "Recall", "FIPE"]);
    expect(niveisComPreco({})[0].preco).toBeNull();
  });
});

describe("opcoesDeAprofundar", () => {
  const guardada = (muda: Partial<ConsultaGuardada> = {}): ConsultaGuardada => ({
    id: ID_DA_BASICA,
    placa: PLACA,
    retrato: { placa: PLACA } as ConsultaGuardada["retrato"],
    custo: 3.18,
    homologacao: false,
    criadoEm: new Date(AGORA.getTime() - 2 * DIA).toISOString(),
    consultadoPor: "Bia",
    nivel: "basico",
    produtos: ["estadual", "recall", "fipe"],
    fragmentos: { estadual: {}, recall: {}, fipe: {} },
    ...muda,
  });

  it("da básica guardada: cada nível acima com o preço do que falta, e o id a reaproveitar", () => {
    expect(opcoesDeAprofundar(guardada(), PARAMETROS, false, AGORA)).toEqual([
      { nivel: "intermediario", aprofundarDe: ID_DA_BASICA, rotulo: "Intermediário", nomesDosProdutos: ["Check List (leilão, sinistro, chassi)"], preco: 2.4, reaproveitados: 3 },
      {
        nivel: "economico",
        aprofundarDe: ID_DA_BASICA,
        rotulo: "Econômico 10/10",
        nomesDosProdutos: ["Check List (leilão, sinistro, chassi)", "Histórico de Proprietários"],
        preco: 7.4,
        reaproveitados: 3,
      },
      // O completo é um produto só: paga inteiro e não reaproveita nada.
      { nivel: "completo", aprofundarDe: null, rotulo: "Completo", nomesDosProdutos: ["Veículos Total"], preco: 30, reaproveitados: 0 },
    ]);
  });

  it("produto que a guardada diz ter mas cujo fragmento falta é pago de novo", () => {
    const [inter] = opcoesDeAprofundar(guardada({ fragmentos: { estadual: {}, fipe: {} } }), PARAMETROS, false, AGORA);
    expect(inter).toMatchObject({ preco: 3.02, reaproveitados: 2, aprofundarDe: ID_DA_BASICA });
  });

  it.each([
    ["velha (8 dias)", { criadoEm: new Date(AGORA.getTime() - 8 * DIA).toISOString() }, false],
    ["de outro modo do fornecedor", { homologacao: true }, false],
    ["não gravada (sem id)", { id: null }, false],
    ["sem fragmentos", { fragmentos: undefined }, false],
  ])("guardada %s: nada é reaproveitado, `aprofundarDe` null e o preço é o do nível inteiro", (_nome, muda, homolog) => {
    const op = opcoesDeAprofundar(guardada(muda as Partial<ConsultaGuardada>), PARAMETROS, homolog, AGORA);
    expect(op.map((o) => [o.nivel, o.aprofundarDe, o.preco, o.reaproveitados])).toEqual([
      ["intermediario", null, 5.58, 0],
      ["economico", null, 10.58, 0],
      ["completo", null, 30, 0],
    ]);
  });

  it("o prazo tem folga da espera do fornecedor + 5 min: na borda dos 7 dias, não reaproveita", () => {
    const comIdade = (ms: number) => opcoesDeAprofundar(guardada({ criadoEm: new Date(AGORA.getTime() - ms).toISOString() }), PARAMETROS, false, AGORA)[0].aprofundarDe;
    // A folga é de 5 min 45 s: com 6 dias e 23 horas a guardada ainda serve.
    expect(comIdade(7 * DIA - HORA)).toBe(ID_DA_BASICA);
    expect(comIdade(7 * DIA - 10 * 60_000)).toBe(ID_DA_BASICA);
    // 45 s de espera + 5 min: a 5 min da borda já não serve.
    expect(comIdade(7 * DIA - 5 * 60_000)).toBeNull();
    expect(comIdade(7 * DIA)).toBeNull();
  });

  it("a antiga, sem nível, é o completo: não há para onde subir", () => {
    const antiga = guardada({ nivel: undefined, produtos: undefined, fragmentos: undefined });
    expect(nivelDaGuardada(antiga)).toEqual({ nivel: "completo", produtos: ["veiculos-total"] });
    expect(opcoesDeAprofundar(antiga, PARAMETROS, false, AGORA)).toEqual([]);
  });
});

describe("custoDasTentativas", () => {
  const t = (muda: Partial<TentativaDaPlaca>): TentativaDaPlaca => ({ produto: "estadual", ok: true, status: 200, motivo: null, pode_ter_cobrado: true, custo: 2.5, reaproveitado: false, ...muda });

  it("soma o que se sabe e não conta o reaproveitado", () => {
    expect(custoDasTentativas([t({}), t({ produto: "recall", custo: 0.62 }), t({ produto: "fipe", reaproveitado: true, custo: null, pode_ter_cobrado: false, status: null })], false)).toBe(3.12);
  });

  it("quem respondeu, ou pode ter cobrado, sem dizer quanto deixa o total desconhecido", () => {
    expect(custoDasTentativas([t({}), t({ produto: "recall", custo: null })], false)).toBeNull();
    expect(custoDasTentativas([t({}), t({ produto: "recall", ok: false, status: 500, custo: null })], false)).toBeNull();
  });

  it("quem falhou sem cobrar (402/401) não atrapalha a soma; em homologação é zero", () => {
    expect(custoDasTentativas([t({}), t({ produto: "recall", ok: false, status: 401, pode_ter_cobrado: false, custo: null })], false)).toBe(2.5);
    expect(custoDasTentativas([t({ custo: null })], true)).toBe(0);
  });
});

describe("um produto, uma chamada (consultarProdutoDaPlaca)", () => {
  it("POST com o tipo e a placa, token só no cabeçalho, `homolog` só em teste", async () => {
    const gw = gateway();
    await consultarProdutoDaPlaca("recall", PLACA, { token: TOKEN, homologacao: false, buscar: gw.buscar });
    await consultarProdutoDaPlaca("recall", PLACA, { token: TOKEN, homologacao: true, buscar: gw.buscar });
    expect(gw.pedidas[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(gw.pedidas[0].corpo).toEqual({ tipo: "recall", placa: PLACA });
    expect(gw.pedidas[1].corpo).toEqual({ tipo: "recall", placa: PLACA, homolog: true });
  });

  it("estouro de tempo e rede caída PODEM ter cobrado", async () => {
    for (const erro of [abortou(), new Error("ECONNRESET")]) {
      const r = await consultarProdutoDaPlaca("estadual", PLACA, { token: TOKEN, homologacao: false, buscar: gateway(() => erro).buscar });
      expect(r).toMatchObject({ ok: false, status: null, podeTerCobrado: true, custo: null });
      expect(!r.ok && r.motivo).toContain("PODE ter sido cobrada");
    }
  });
});

describe("a consulta por nível (consultarPlacaPorNivel)", () => {
  it("básico: chama os três produtos de uma vez e grava nível, produtos, fragmentos, tentativas e custo", async () => {
    const { r, gw, gravado, db } = await consultar("basico");
    expect(gw.tipos()).toEqual(["estadual", "fipe", "recall"]);
    expect(r).toMatchObject({ ok: true, gravada: true, avisos: [] });
    expect(gravado).toMatchObject({ placa: PLACA, produto: "niveis", nivel: "basico", produtos: ["estadual", "recall", "fipe"], custo: 3.18, homologacao: false, aproveitou_de: null });
    expect(Object.keys(gravado!.fragmentos as object).sort()).toEqual(["estadual", "fipe", "recall"]);
    expect((gravado!.tentativas as TentativaDaPlaca[]).map((t) => [t.produto, t.ok, t.status, t.pode_ter_cobrado, t.custo, t.reaproveitado])).toEqual([
      ["estadual", true, 200, true, 2.5, false],
      ["recall", true, 200, true, 0.62, false],
      ["fipe", true, 200, true, 0.06, false],
    ]);
    expect((gravado!.retrato as { nivel: string; placa: string }).nivel).toBe("basico");
    // A parte gratuita recebe o que a paga descobriu.
    expect(consultarGratuito).toHaveBeenCalledWith({ cnpj: null, codigoFipe: "001177-0", anoModelo: 2025 });
    // A trava foi perguntada antes, com a janela dos parâmetros.
    const trava = db.chamadas[0];
    expect(trava).toMatchObject({ tabela: "consultas_de_placa", operacao: "select" });
    expect(trava.filtros).toEqual([
      ["eq", "placa", PLACA],
      ["eq", "nivel", "basico"],
      ["eq", "homologacao", false],
      ["gte", "criado_em", new Date(AGORA.getTime() - 30 * 60_000).toISOString()],
      ["order", "criado_em", { ascending: false }],
      ["limit", 1],
    ]);
    if (r.ok) expect(r.consulta).toMatchObject({ id: ID_NOVO, nivel: "basico", produtos: ["estadual", "recall", "fipe"] });
  });

  it("nível desconhecido é 400 sem banco nem gateway", async () => {
    const { r, gw, db } = await consultar("premium" as NivelDaPlaca);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(gw.pedidas).toHaveLength(0);
    expect(db.chamadas).toHaveLength(0);
  });

  describe("a trava contra repetição", () => {
    const anterior = { id: ID_DA_BASICA, placa: PLACA, nivel: "basico", produtos: ["estadual"], fragmentos: {}, retrato: { placa: PLACA }, custo: 3.18, homologacao: false, criado_em: AGORA.toISOString(), consultado_por_nome: "Bia" };

    it("mesma placa e nível há pouco: 409 com a anterior, SEM chamar o gateway nem gravar", async () => {
      const { r, gw, db } = await consultar("basico", { db: banco({ trava: { data: [anterior], error: null } }) });
      expect(r).toMatchObject({ ok: false, status: 409 });
      expect(!r.ok && r.status === 409 && r.repeticao).toMatchObject({ id: ID_DA_BASICA, consultadoPor: "Bia" });
      expect(!r.ok && r.motivo).toContain("30 minutos");
      expect(gw.pedidas).toHaveLength(0);
      expect(inclusoes(db.chamadas)).toHaveLength(0);
    });

    it("com `repetir`, nem pergunta: paga de novo", async () => {
      const { r, gw, db } = await consultar("basico", { repetir: true, db: banco({ trava: { data: [anterior], error: null } }) });
      expect(r.ok).toBe(true);
      expect(gw.pedidas).toHaveLength(3);
      expect(db.chamadas.filter((c) => c.operacao === "select")).toHaveLength(0);
    });

    it("janela zero desliga a trava", async () => {
      const { r, db } = await consultar("basico", { parametros: { ...PARAMETROS, minutosContraRepeticao: 0 }, db: banco({ trava: { data: [anterior], error: null } }) });
      expect(r.ok).toBe(true);
      expect(db.chamadas.filter((c) => c.operacao === "select")).toHaveLength(0);
    });

    it("não deu para conferir: fecha no erro (503), sem gateway", async () => {
      const { r, gw } = await consultar("basico", { db: banco({ trava: { data: null, error: { message: "timeout" } } }) });
      expect(r).toMatchObject({ ok: false, status: 503, podeTerCobrado: false });
      expect(gw.pedidas).toHaveLength(0);
    });
  });

  describe("o aprofundar", () => {
    it("básico → econômico: o gateway só vê check-list e histórico; os três reaproveitados não cobram", async () => {
      const base = await linhaDaBasica();
      const { r, gw, gravado, db } = await consultar("economico", { aprofundarDe: ID_DA_BASICA, db: banco({ base: { data: base, error: null } }) });
      expect(r).toMatchObject({ ok: true, gravada: true });
      expect(gw.tipos()).toEqual(["check-list", "historico-proprietarios"]);
      expect(db.chamadas.find((c) => c.fim === "maybeSingle")!.filtros).toEqual([["eq", "id", ID_DA_BASICA]]);
      expect(gravado).toMatchObject({
        produto: "niveis",
        nivel: "economico",
        produtos: ["estadual", "recall", "fipe", "check-list", "historico-proprietarios"],
        aproveitou_de: ID_DA_BASICA,
        custo: 7.4,
      });
      const tentativas = gravado!.tentativas as TentativaDaPlaca[];
      expect(tentativas.filter((t) => t.reaproveitado)).toEqual(
        ["estadual", "recall", "fipe"].map((produto) => ({ produto, ok: true, status: null, motivo: null, pode_ter_cobrado: false, custo: null, reaproveitado: true })),
      );
      expect(tentativas.filter((t) => !t.reaproveitado).map((t) => [t.produto, t.ok, t.custo])).toEqual([
        ["check-list", true, 2.4],
        ["historico-proprietarios", true, 5],
      ]);
      // O fragmento reaproveitado é CÓPIA do da origem (o gatilho do banco compara).
      const fragmentos = gravado!.fragmentos as Record<string, unknown>;
      for (const p of ["estadual", "recall", "fipe"]) expect(fragmentos[p]).toEqual((base.fragmentos as Record<string, unknown>)[p]);
      // E o retrato tem as dez checagens: nada faltou.
      expect((gravado!.retrato as { naoVeio: unknown[] }).naoVeio).toEqual([]);
    });

    it.each([
      ["velha (8 dias)", { criado_em: new Date(AGORA.getTime() - 8 * DIA).toISOString() }, 400],
      ["na borda do prazo (a 5 min dos 7 dias)", { criado_em: new Date(AGORA.getTime() - 7 * DIA + 5 * 60_000).toISOString() }, 400],
      ["de homologação, com o painel em produção", { homologacao: true }, 400],
      ["de outra placa", { placa: "ABC1D23" }, 404],
    ])("guardada %s: recusada ANTES de chamar o gateway", async (_nome, muda, status) => {
      const base = await linhaDaBasica(muda);
      const { r, gw, db } = await consultar("economico", { aprofundarDe: ID_DA_BASICA, db: banco({ base: { data: base, error: null } }) });
      expect(r).toMatchObject({ ok: false, status, podeTerCobrado: false });
      expect(gw.pedidas).toHaveLength(0);
      expect(inclusoes(db.chamadas)).toHaveLength(0);
    });

    it("id que não é uuid, guardada que não existe ou leitura que falha: nada é chamado", async () => {
      for (const [aprofundarDe, base, status] of [
        ["c1", undefined, 404],
        [ID_DA_BASICA, { data: null, error: null }, 404],
        [ID_DA_BASICA, { data: null, error: { message: "timeout" } }, 503],
      ] as const) {
        const { r, gw } = await consultar("economico", { aprofundarDe, db: banco({ base }) });
        expect(r, aprofundarDe).toMatchObject({ ok: false, status });
        expect(gw.pedidas).toHaveLength(0);
      }
    });

    it("sem nada a comprar é reabrir, não consultar: 400", async () => {
      const base = await linhaDaBasica();
      const { r, gw, db } = await consultar("basico", { aprofundarDe: ID_DA_BASICA, db: banco({ base: { data: base, error: null } }) });
      expect(r).toMatchObject({ ok: false, status: 400 });
      expect(!r.ok && r.motivo).toContain("abra a guardada");
      expect(gw.pedidas).toHaveLength(0);
      expect(inclusoes(db.chamadas)).toHaveLength(0);
    });
  });

  describe("quando o fornecedor falha", () => {
    it("tudo falhou (5xx): 502 sem gravar, e pode ter cobrado", async () => {
      const { r, db } = await consultar("basico", { gw: gateway(() => ({ status: 500, corpo: null })) });
      expect(r).toMatchObject({ ok: false, status: 502, podeTerCobrado: true });
      expect(!r.ok && r.motivo).toContain("Pode ter sido cobrado");
      expect(inclusoes(db.chamadas)).toHaveLength(0);
    });

    it("tudo sem saldo: 402 sem gravar, e não cobrou", async () => {
      const { r, db } = await consultar("basico", { gw: gateway(() => ({ status: 402, corpo: { error: true, message: "Saldo insuficiente" } })) });
      expect(r).toMatchObject({ ok: false, status: 402, podeTerCobrado: false });
      expect(inclusoes(db.chamadas)).toHaveLength(0);
    });

    it("402 com outro produto estourando o tempo: ainda 402, mas PODE ter cobrado", async () => {
      const { r } = await consultar("basico", { gw: gateway((p) => (p === "fipe" ? abortou() : { status: 402, corpo: null })) });
      expect(r).toMatchObject({ ok: false, status: 402, podeTerCobrado: true });
      expect(!r.ok && r.motivo).toContain("confira o saldo");
    });

    it("em homologação, nada falho 'pode ter cobrado'", async () => {
      const { r } = await consultar("basico", { homologacao: true, gw: gateway(() => ({ status: 500, corpo: null })) });
      expect(r).toMatchObject({ ok: false, status: 502, podeTerCobrado: false });
    });

    it("parcial: grava só os produtos que vieram, com a tentativa de quem falhou e o aviso", async () => {
      const { r, gravado } = await consultar("basico", { gw: gateway((p) => (p === "recall" ? { status: 503, corpo: null } : doExemplo(p))) });
      expect(r).toMatchObject({ ok: true, gravada: true });
      expect(gravado!.produtos).toEqual(["estadual", "fipe"]);
      expect(Object.keys(gravado!.fragmentos as object).sort()).toEqual(["estadual", "fipe"]);
      const recall = (gravado!.tentativas as TentativaDaPlaca[]).find((t) => t.produto === "recall")!;
      expect(recall).toMatchObject({ ok: false, status: 503, pode_ter_cobrado: true, custo: null, reaproveitado: false });
      // Quem falhou pode ter cobrado sem dizer quanto: o custo da linha é desconhecido.
      expect(gravado!.custo).toBeNull();
      expect(r.ok && r.avisos.join(" ")).toMatch(/^Recall: a APIBrasil está fora do ar \(HTTP 503\)\. Pode ter sido cobrado/);
      // O recall não conferido aparece como tal.
      expect((gravado!.retrato as { cobertura: Record<string, boolean> }).cobertura.recall).toBe(false);
    });

    it("quem falhou dizendo o custo entra na soma", async () => {
      const { gravado } = await consultar("basico", {
        gw: gateway((p) => (p === "recall" ? { status: 200, corpo: { error: true, message: "Placa sem cadastro de recall", valor_consulta: 0.62 } } : doExemplo(p))),
      });
      expect(gravado!.custo).toBe(3.18);
    });

    it("quem falhou sem cobrar (token recusado) não deixa o custo desconhecido", async () => {
      const { gravado } = await consultar("basico", { gw: gateway((p) => (p === "recall" ? { status: 401, corpo: null } : doExemplo(p))) });
      expect(gravado!.custo).toBe(2.56);
      expect((gravado!.tentativas as TentativaDaPlaca[]).find((t) => t.produto === "recall")).toMatchObject({ ok: false, status: 401, pode_ter_cobrado: false });
    });

    it("produto que respondeu sem dizer o custo deixa o custo da linha null", async () => {
      const { gravado } = await consultar("basico", {
        gw: gateway((p) => {
          const r = doExemplo(p);
          if (p === "fipe") {
            delete (r.corpo as Record<string, unknown>).valor_consulta;
            delete (r.corpo as Record<string, unknown>).message;
          }
          return r;
        }),
      });
      expect(gravado!.custo).toBeNull();
    });

    it("resposta de teste com o painel em produção: o produto falha e o carro de exemplo não entra", async () => {
      const { r, gravado } = await consultar("basico", {
        gw: gateway((p) => {
          const r = doExemplo(p);
          if (p === "estadual") Object.assign(r.corpo as object, { homolog: true, api_limit_for: "homolog", valor_consulta: 0 });
          return r;
        }),
      });
      expect(r.ok).toBe(true);
      expect(gravado!.produtos).toEqual(["recall", "fipe"]);
      expect((gravado!.tentativas as TentativaDaPlaca[]).find((t) => t.produto === "estadual")).toMatchObject({ ok: false, motivo: "respondeu em modo de teste (dados de exemplo)" });
      expect((gravado!.retrato as { veiculo: { chassi: string | null } }).veiculo.chassi).toBeNull();
    });

    it("Base Estadual de outra placa não entra", async () => {
      const { gravado } = await consultar("basico", {
        gw: gateway((p) => {
          const r = doExemplo(p);
          if (p === "estadual") ((r.corpo as { data: { bin_estadual: { placa: string } } }).data.bin_estadual.placa = "XYZ9Z99");
          return r;
        }),
      });
      expect(gravado!.produtos).toEqual(["recall", "fipe"]);
      expect((gravado!.tentativas as TentativaDaPlaca[]).find((t) => t.produto === "estadual")!.motivo).toBe("respondeu sobre outra placa (XYZ9Z99)");
    });
  });

  it("homologação: custo 0, `homolog` no corpo, e a placa do exemplo não é conferida", async () => {
    const { r, gw, gravado } = await consultar("basico", {
      homologacao: true,
      gw: gateway((p) => {
        const r = doExemplo(p);
        Object.assign(r.corpo as object, { homolog: true, api_limit_for: "homolog", valor_consulta: 0, message: "Dados validos em homologacao! Voce nao foi tarifado." });
        if (p === "estadual") ((r.corpo as { data: { bin_estadual: { placa: string } } }).data.bin_estadual.placa = "EXE0A00");
        return r;
      }),
    });
    expect(r.ok).toBe(true);
    expect(gw.pedidas.every((p) => p.corpo.homolog === true)).toBe(true);
    expect(gravado).toMatchObject({ homologacao: true, custo: 0, produtos: ["estadual", "recall", "fipe"] });
  });

  it("completo: o Veículos Total sozinho, gravado como produto veiculos-total", async () => {
    const { r, gw, gravado } = await consultar("completo", { placa: "ABC1D23" });
    expect(gw.tipos()).toEqual(["veiculos-total"]);
    expect(r).toMatchObject({ ok: true, saldo: 970 });
    expect(gravado).toMatchObject({
      placa: "ABC1D23",
      produto: "veiculos-total",
      nivel: "completo",
      produtos: ["veiculos-total"],
      fragmentos: {},
      tentativas: [{ produto: "veiculos-total", ok: true, status: 200, motivo: null, pode_ter_cobrado: true, custo: 30, reaproveitado: false }],
      custo: 30,
      aproveitou_de: null,
    });
    expect((gravado!.retrato as { nivel: string }).nivel).toBe("completo");
  });

  it("completo que falha na rede volta com o status dela, sem gravar", async () => {
    const { r, db } = await consultar("completo", { placa: "ABC1D23", gw: gateway(() => ({ status: 402, corpo: null })) });
    expect(r).toMatchObject({ ok: false, status: 402, podeTerCobrado: false });
    expect(inclusoes(db.chamadas)).toHaveLength(0);
  });

  describe("a gravação que falha DEPOIS de pagar", () => {
    it("o retrato volta assim mesmo, sem id, com o aviso", async () => {
      const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { r } = await consultar("basico", { db: banco({ inclusao: () => ({ data: null, error: { message: "new row violates check constraint", code: "23514" } }) }) });
      erro.mockRestore();
      expect(r).toMatchObject({ ok: true, gravada: false });
      if (r.ok) {
        expect(r.consulta).toMatchObject({ id: null, placa: PLACA, nivel: "basico", produtos: ["estadual", "recall", "fipe"], custo: 3.18 });
        expect(r.avisos.join(" ")).toContain("NÃO foi guardada");
      }
    });

    it("sem a migração dos níveis, o aviso diz qual falta", async () => {
      const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { r } = await consultar("basico", { db: banco({ inclusao: () => ({ data: null, error: { message: 'column "nivel" of relation does not exist', code: "42703" } }) }) });
      erro.mockRestore();
      expect(r.ok && r.avisos.join(" ")).toContain("20261019120000_niveis_da_consulta_de_placa");
    });
  });
});
