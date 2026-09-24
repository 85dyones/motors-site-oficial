import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O PATCH de `/api/leads/gerenciar` com os valores da avaliação, EXECUTADO.
 *
 * O consultor registra no card o que ofereceu e o que a loja pagou pelo carro
 * avaliado (migração 20260924190000). O que se trava aqui:
 *   - o valor chega ao banco já em número, lido como se digita em português;
 *   - vazio limpa; ilegível RECUSA e não grava nada — "abc" não apaga R$ 55.000;
 *   - o retrato `avaliacao` não é editável pelo painel: é o que o cliente
 *     preencheu, e um PATCH que o traga não o grava.
 *
 * Mesmo dublê de banco de `leads-gerenciar-desfecho.test.ts`, reduzido.
 */

const CLIENTE = { auth: { getUser: vi.fn() }, from: vi.fn(), rpc: vi.fn() };
vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => CLIENTE }));

const { PATCH } = await import("../src/app/api/leads/gerenciar/route");

let gravacoes: Record<string, unknown>[];

interface Consulta {
  select: () => Consulta;
  eq: () => Consulta;
  single: () => Promise<{ data: unknown; error: null }>;
  maybeSingle: () => Promise<{ data: unknown; error: null }>;
}

function consulta(dado: unknown): Consulta {
  const q: Consulta = {
    select: () => q,
    eq: () => q,
    single: async () => ({ data: dado, error: null }),
    maybeSingle: async () => ({ data: dado, error: null }),
  };
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  gravacoes = [];
  CLIENTE.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  CLIENTE.rpc.mockResolvedValue({ error: null });
  CLIENTE.from.mockImplementation((tabela: string) => {
    if (tabela === "profiles") return consulta({ role: "comercial", papeis: ["comercial"] });
    if (tabela === "leads") {
      return {
        update: (campos: Record<string, unknown>) => {
          gravacoes.push(campos);
          return { eq: async () => ({ error: null }) };
        },
      };
    }
    throw new Error(`tabela inesperada: ${tabela}`);
  });
});

const chamar = (corpo: Record<string, unknown>) =>
  PATCH(
    new Request("http://x/api/leads/gerenciar", {
      method: "PATCH",
      body: JSON.stringify({ id: "lead-1", ...corpo }),
      headers: { "content-type": "application/json" },
    }) as never,
  );

describe("PATCH — valores da avaliação", () => {
  it("grava ofertado e pago em número", async () => {
    const r = await chamar({ avaliacao_valor_ofertado: "55.000", avaliacao_valor_pago: "53.500,50" });
    expect(r.status).toBe(200);
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0]).toMatchObject({ avaliacao_valor_ofertado: 55000, avaliacao_valor_pago: 53500.5 });
  });

  it("vazio limpa o valor", async () => {
    await chamar({ avaliacao_valor_pago: "" });
    expect(gravacoes[0]).toHaveProperty("avaliacao_valor_pago", null);
    expect(gravacoes[0]).not.toHaveProperty("avaliacao_valor_ofertado");
  });

  it("ilegível, zero e negativo recusam com 400 e não gravam nada", async () => {
    for (const valor of ["abc", "0", -10, "55000.50", true]) {
      gravacoes = [];
      const r = await chamar({ avaliacao_valor_ofertado: valor });
      expect(r.status, String(valor)).toBe(400);
      expect(gravacoes, String(valor)).toEqual([]);
    }
  });

  it("o retrato do cliente não é editável pelo painel", async () => {
    await chamar({ avaliacao: { marca: "outra" }, avaliacao_valor_ofertado: 50000 });
    expect(gravacoes[0]).not.toHaveProperty("avaliacao");
  });

  it("junto com o clique de contato, o valor ainda é gravado", async () => {
    const r = await chamar({ contato: "whatsapp", avaliacao_valor_ofertado: 50000 });
    expect(r.status).toBe(200);
    expect(gravacoes[0]).toMatchObject({ avaliacao_valor_ofertado: 50000 });
  });
});
