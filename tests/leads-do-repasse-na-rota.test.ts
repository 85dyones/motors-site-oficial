import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ERROS_DO_REPASSE } from "../src/lib/paginaDoRepasse";
import { bancoDeTeste, type Banco } from "./bancoDoRepasseDeTeste";

/**
 * `/api/leads` EXECUTADA contra um dublê do banco, no ramo do repasse (spec §8,
 * decisão 11 do PR 3). Prova a fiação que só a rota tem: a régua roda antes de
 * qualquer gravação e do n8n; o exame só entra para carro publicado; o lead
 * grava antes da inscrição, que o referencia; o texto livre do lead não leva o
 * perfil da lista; e a inscrição que falha volta 500 sem contar conversão.
 */
let banco: Banco;
const capi = vi.hoisted(() => ({ chamadas: [] as unknown[] }));
const falhas = vi.hoisted(() => ({ chamadas: [] as unknown[][] }));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("../src/lib/supabase-server", () => ({ createAdminSupabaseClient: () => banco.cliente }));
vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ webhooks: {}, companySettings: { metaPixelId: "px-1" } }),
}));
vi.mock("../src/lib/meta-capi", () => ({
  sendCapiEvent: async (evento: unknown) => {
    capi.chamadas.push(evento);
  },
}));
vi.mock("../src/lib/observabilidade", () => ({
  registrarFalha: async (...args: unknown[]) => {
    falhas.chamadas.push(args);
  },
}));
vi.mock("../src/lib/turnstile", async (original) => ({
  ...(await original<typeof import("../src/lib/turnstile")>()),
  verificarTurnstile: async () => ({ ok: true }),
}));

const { POST } = await import("../src/app/api/leads/route");

const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";
const EXTRAS = { turnstileToken: "tok", eventId: "evt-1", agUid: "ag-1", utm: {}, fbp: null, fbc: null };
const CLIENTE = { nome: "Ana Souza", whatsapp: "(41) 99737-2165" };
const LISTA = {
  canal: "repasse",
  tipo: "lead_repasse",
  mensagem: "Entrou na lista do repasse (compra para usar).",
  cliente: CLIENTE,
  intencao_busca: {
    repasse: { tipo: "lista", trilha: "consumidor", faixa: "30-50", carrocerias: ["hatch"], caminho: "/repasse" },
  },
  contentName: "Repasse Motors Lista",
  ...EXTRAS,
};
const LOJISTA = {
  ...LISTA,
  canal: "repasse-lojista",
  mensagem: "Entrou na lista do repasse (lojista).",
  intencao_busca: {
    repasse: { tipo: "lista", trilha: "lojista", cnpj: "11.222.333/0001-81", loja_cidade: "Loja Exemplo, Curitiba", caminho: "/repasse" },
  },
};
const EXAME = {
  canal: "repasse-exame",
  tipo: "lead_repasse_exame",
  mensagem: "texto qualquer do navegador",
  cliente: CLIENTE,
  intencao_busca: {
    repasse: { tipo: "exame", repasse_id: ID, slug: "renault-kwid-zen-1-0-2021-3f9a1c", dia: "2026-09-26", turno: "tarde", leva_mecanico: true },
  },
  contentName: "Renault Kwid",
  ...EXTRAS,
};
const CARRO_PUBLICADO = { id: ID, situacao: "publicado", marca: "Renault", modelo: "Kwid", versao: "Zen 1.0", ano_modelo: 2021 };

const pedido = (corpo: unknown) =>
  new NextRequest("http://teste/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
const insertDoLead = () => banco.escritasEm("leads")[0]?.valores as Record<string, unknown>;
let n8n: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-23T15:00:00Z")); // qua 23/09, 12h em Curitiba
  banco = bancoDeTeste();
  banco.responderEscrita((e) =>
    e.tabela === "leads" && e.operacao === "insert" ? { data: { id: "lead-1" }, error: null } : { data: null, error: null },
  );
  capi.chamadas = [];
  falhas.chamadas = [];
  n8n = vi.fn(async () => new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", n8n);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a lista do repasse", () => {
  it("consumidor: grava o lead e DEPOIS a inscrição, ligada a ele", async () => {
    const res = await POST(pedido(LISTA));
    expect(res.status).toBe(200);
    expect(insertDoLead()).toMatchObject({
      canal: "repasse",
      interesse: "Entrou na lista do repasse (compra para usar).",
      telefone: "5541997372165",
    });
    const [inscricao] = banco.escritasEm("repasse_inscritos");
    expect(inscricao.operacao).toBe("insert");
    expect(inscricao.valores).toEqual({
      trilha: "consumidor",
      nome: "Ana Souza",
      whatsapp: "5541997372165",
      faixa: "30-50",
      carrocerias: ["hatch"],
      cnpj: null,
      loja_cidade: null,
      lead_id: "lead-1",
    });
    expect(banco.lidas.indexOf("leads")).toBeLessThan(banco.lidas.indexOf("repasse_inscritos"));
    expect(banco.consultas.find((c) => c.tabela === "repasse_inscritos")?.filtros).toEqual([
      ["trilha", "consumidor"],
      ["whatsapp", "5541997372165"],
    ]);
    expect(capi.chamadas).toHaveLength(1);
  });

  it("o texto livre do lead não leva CNPJ nem a loja, mesmo que o navegador mande", async () => {
    await POST(pedido({ ...LOJISTA, mensagem: "CNPJ 11.222.333/0001-81, Loja Exemplo" }));
    const linha = JSON.stringify(insertDoLead());
    expect(linha).not.toContain("11.222.333");
    expect(linha).not.toContain("11222333");
    expect(linha).not.toContain("Loja Exemplo");
    expect(insertDoLead().interesse).toBe("Entrou na lista do repasse (lojista).");
  });

  it("lojista: a inscrição guarda o CNPJ formatado, a loja e a cidade", async () => {
    await POST(pedido({ ...LOJISTA, intencao_busca: { repasse: { ...LOJISTA.intencao_busca.repasse, cnpj: "11222333000181" } } }));
    expect(banco.escritasEm("repasse_inscritos")[0].valores).toMatchObject({
      trilha: "lojista",
      cnpj: "11.222.333/0001-81",
      loja_cidade: "Loja Exemplo, Curitiba",
      faixa: null,
      carrocerias: [],
    });
  });

  it("quem já está na lista é atualizado, e CNPJ trocado perde a conferência", async () => {
    banco.leituras.repasse_inscritos = { data: { id: "i-1", cnpj: "12.ABC.345/01DE-35" }, error: null };
    await POST(pedido(LOJISTA));
    const [update] = banco.escritasEm("repasse_inscritos");
    expect(update.operacao).toBe("update");
    expect(update.filtros).toEqual([["id", "i-1"]]);
    expect(update.valores).toMatchObject({
      cnpj: "11.222.333/0001-81",
      lead_id: "lead-1",
      cnpj_conferido_em: null,
      cnpj_conferido_por: null,
    });
  });

  it("mesmo CNPJ: a conferência fica", async () => {
    banco.leituras.repasse_inscritos = { data: { id: "i-1", cnpj: "11222333000181" }, error: null };
    await POST(pedido(LOJISTA));
    expect(banco.escritasEm("repasse_inscritos")[0].valores).not.toHaveProperty("cnpj_conferido_em");
  });

  it("inscrição que não grava: 500 com a mensagem da lista, falha na triagem e nenhuma conversão no servidor", async () => {
    banco.responderEscrita((e) =>
      e.tabela === "leads"
        ? { data: { id: "lead-1" }, error: null }
        : e.tabela === "repasse_inscritos"
          ? { data: null, error: { message: "falhou", code: "XX000" } }
          : { data: null, error: null },
    );
    const res = await POST(pedido(LISTA));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe(ERROS_DO_REPASSE.lista);
    expect(falhas.chamadas[0]?.slice(0, 2)).toEqual(["quebra", "repasse-inscricao"]);
    expect(falhas.chamadas[0]?.[3]).toMatchObject({ rota: "/api/leads", origem: "servidor", lead_id: "lead-1" });
    expect(capi.chamadas).toEqual([]);
  });

  it("corpo torto: 400 antes de qualquer gravação e do n8n", async () => {
    const res = await POST(
      pedido({ ...LOJISTA, intencao_busca: { repasse: { ...LOJISTA.intencao_busca.repasse, cnpj: "11.222.333/0001-82" } } }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(ERROS_DO_REPASSE.cnpj);
    expect(banco.escritas).toEqual([]);
    expect(n8n).not.toHaveBeenCalled();
  });

  it("canal que começa com repasse e não existe: 400", async () => {
    const res = await POST(pedido({ ...LISTA, canal: "repasse-vip" }));
    expect(res.status).toBe(400);
    expect(banco.escritas).toEqual([]);
  });
});

describe("o exame no pátio", () => {
  it("carro publicado: o lead leva repasse_id, e o interesse é o pedido montado no servidor", async () => {
    banco.leituras.repasses = { data: CARRO_PUBLICADO, error: null };
    const res = await POST(pedido(EXAME));
    expect(res.status).toBe(200);
    expect(insertDoLead()).toMatchObject({ canal: "repasse-exame", repasse_id: ID, veiculo_id: null });
    expect(insertDoLead().interesse).toBe(
      "Quero marcar o exame no pátio do Renault Kwid Zen 1.0 2021: Sáb 26/09, tarde. Vou levar o meu mecânico.",
    );
    expect(banco.consultas.find((c) => c.tabela === "repasses")?.filtros).toEqual([["id", ID]]);
    expect(banco.escritasEm("repasse_inscritos")).toEqual([]);
  });

  it.each([
    ["reservado", { data: { ...CARRO_PUBLICADO, situacao: "reservado" }, error: null }],
    ["vendido", { data: { ...CARRO_PUBLICADO, situacao: "vendido" }, error: null }],
    ["inexistente", { data: null, error: null }],
  ])("carro %s: 409 sem gravar nada e sem n8n", async (_caso, leitura) => {
    banco.leituras.repasses = leitura;
    const res = await POST(pedido(EXAME));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(ERROS_DO_REPASSE.exameFechado);
    expect(banco.escritas).toEqual([]);
    expect(n8n).not.toHaveBeenCalled();
  });

  // final-review I2 (25/09): no exame o lead É o pedido — é por ele que o
  // pedido aparece no editor do carro, e o visitante não vai para o WhatsApp.
  // Gravação que falha não pode sumir em silêncio atrás de um 200.
  it.each([
    [
      "erro devolvido",
      () => banco.responderEscrita((e) => (e.tabela === "leads" ? { data: null, error: { message: "falhou", code: "XX000" } } : { data: null, error: null })),
    ],
    [
      "exceção",
      () =>
        banco.responderEscrita((e) => {
          if (e.tabela === "leads") throw new Error("caiu a conexão");
          return { data: null, error: null };
        }),
    ],
  ])("lead que não grava (%s): 500, falha na triagem e nenhuma conversão no servidor", async (_caso, quebrar) => {
    banco.leituras.repasses = { data: CARRO_PUBLICADO, error: null };
    quebrar();
    const res = await POST(pedido(EXAME));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe(ERROS_DO_REPASSE.generico);
    expect(falhas.chamadas[0]?.slice(0, 2)).toEqual(["quebra", "repasse-exame"]);
    expect(falhas.chamadas[0]?.[3]).toEqual({ rota: "/api/leads", origem: "servidor" });
    expect(capi.chamadas).toEqual([]);
  });

  it("domingo: 400 da régua, antes de ler o carro", async () => {
    const res = await POST(
      pedido({ ...EXAME, intencao_busca: { repasse: { ...EXAME.intencao_busca.repasse, dia: "2026-09-27" } } }),
    );
    expect(res.status).toBe(400);
    expect(banco.lidas).not.toContain("repasses");
  });
});

describe("os outros canais não mudam", () => {
  it("a encomenda grava sem repasse_id e sem tocar nas tabelas do repasse", async () => {
    const res = await POST(
      pedido({ canal: "Encomenda", tipo: "lead_encomenda", mensagem: "Olá! Procuro carro Toyota Corolla.", cliente: CLIENTE, ...EXTRAS }),
    );
    expect(res.status).toBe(200);
    expect(insertDoLead()).not.toHaveProperty("repasse_id");
    expect(insertDoLead().interesse).toBe("Olá! Procuro carro Toyota Corolla.");
    expect(banco.lidas).not.toContain("repasses");
    expect(banco.lidas).not.toContain("repasse_inscritos");
  });

  it.each([
    ["a encomenda", { canal: "Encomenda", tipo: "lead_encomenda", mensagem: "Olá! Procuro carro Toyota Corolla.", cliente: CLIENTE, ...EXTRAS }],
    ["a lista do repasse", LISTA],
  ])("%s com o lead que não grava segue como antes: 200, sem triagem e com a CAPI", async (_canal, corpo) => {
    banco.responderEscrita((e) => (e.tabela === "leads" ? { data: null, error: { message: "falhou", code: "XX000" } } : { data: null, error: null }));
    const res = await POST(pedido(corpo));
    expect(res.status).toBe(200);
    expect(falhas.chamadas).toEqual([]);
    expect(capi.chamadas).toHaveLength(1);
  });
});
