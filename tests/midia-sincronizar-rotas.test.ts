import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * As duas rotas de sincronização com o banco trocado por um falso: quem não
 * tem o segredo não grava, payload torto não grava, e a rota do Meta não
 * abre para visitante sem sessão.
 */

interface ArgsRpc {
  p_nome?: string;
  p_valor?: string;
  p?: { campanhas: Array<{ id_externo: string }> };
}

const chamadas: { rpc: Array<{ nome: string; args: ArgsRpc }>; inserts: Array<{ tabela: string; linha: Record<string, unknown> }> } = {
  rpc: [],
  inserts: [],
};
let segredoValido = "";
let staff = false;

vi.mock("../src/lib/supabase-server", () => ({
  createAdminSupabaseClient: () => ({
    rpc: async (nome: string, args: ArgsRpc) => {
      chamadas.rpc.push({ nome, args });
      if (nome === "midia_confere_segredo") return { data: args.p_valor === segredoValido, error: null };
      if (nome === "midia_gravar_lote") return { data: { campanhas: args.p!.campanhas.length, dias: 1 }, error: null };
      return { data: null, error: { message: "rpc desconhecida" } };
    },
    from: (tabela: string) => ({
      insert: async (linha: Record<string, unknown>) => {
        chamadas.inserts.push({ tabela, linha });
        return { error: null };
      },
    }),
  }),
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: staff ? { id: "u1" } : null } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { role: "admin", papeis: ["admin"] } }) }) }),
    }),
  }),
}));

const { POST: postGoogle } = await import("../src/app/api/marketing/sincronizar/google/route");
const { POST: postMeta } = await import("../src/app/api/marketing/sincronizar/meta/route");

const SEGREDO = "a".repeat(64);
const payload = {
  conta: "1",
  de: "2026-09-20",
  ate: "2026-09-21",
  campanhas: [{ id: "10", nome: "Pesquisa", status: "ENABLED", dias: [{ dia: "2026-09-20", investido: 1, impressoes: 2, cliques: 0, conversoes: 0 }] }],
};

const req = (url: string, corpo: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(corpo) }) as unknown as NextRequest;

const gravou = () => chamadas.rpc.some((c) => c.nome === "midia_gravar_lote");

beforeEach(() => {
  chamadas.rpc = [];
  chamadas.inserts = [];
  segredoValido = SEGREDO;
  staff = false;
});

describe("POST /api/marketing/sincronizar/google", () => {
  it("sem segredo: 401, não grava e não registra rodada", async () => {
    const r = await postGoogle(req("http://x/api", payload));
    expect(r.status).toBe(401);
    expect(gravou()).toBe(false);
    expect(chamadas.inserts).toEqual([]);
  });

  it("segredo errado: 401", async () => {
    const r = await postGoogle(req("http://x/api", payload, { "x-motors-segredo": "b".repeat(64) }));
    expect(r.status).toBe(401);
    expect(gravou()).toBe(false);
  });

  it("payload torto: 400, registra a recusa e não grava", async () => {
    const r = await postGoogle(req("http://x/api", { ...payload, de: "ontem" }, { "x-motors-segredo": SEGREDO }));
    expect(r.status).toBe(400);
    expect(gravou()).toBe(false);
    expect(chamadas.inserts[0].linha).toMatchObject({ plataforma: "google", ok: false });
  });

  it("certo: grava o lote em snake_case e registra sucesso", async () => {
    const r = await postGoogle(req("http://x/api", payload, { "x-motors-segredo": SEGREDO }));
    expect(r.status).toBe(200);
    const g = chamadas.rpc.find((c) => c.nome === "midia_gravar_lote")!;
    expect(g.args.p!.campanhas[0].id_externo).toBe("10");
    expect(chamadas.inserts[0].linha).toMatchObject({ plataforma: "google", gatilho: "script", ok: true });
  });
});

describe("POST /api/marketing/sincronizar/meta", () => {
  it("visitante sem segredo nem sessão: 401 e nada acontece", async () => {
    const r = await postMeta(req("http://x/api", {}));
    expect(r.status).toBe(401);
    expect(gravou()).toBe(false);
    expect(chamadas.inserts).toEqual([]);
  });

  it("confere o Bearer contra o segredo do CRON, nunca o do Google", async () => {
    const r = await postMeta(req("http://x/api", {}, { authorization: `Bearer ${SEGREDO}` }));
    // O falso aceita o valor sob qualquer nome; o que se prova é o NOME pedido.
    const conferido = chamadas.rpc.find((c) => c.nome === "midia_confere_segredo")!;
    expect(conferido.args.p_nome).toBe("midia_cron_segredo");
    expect(r.status).not.toBe(401);
  });
});
