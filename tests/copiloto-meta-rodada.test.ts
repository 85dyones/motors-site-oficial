import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * A rodada agendada da sincronização do Meta com o copiloto: aplica o aprovado
 * ANTES de sincronizar, faz o diagnóstico DEPOIS, e o botão do painel só
 * sincroniza. O copiloto nunca derruba a sincronização.
 */

const ordem: string[] = [];
let segredoValido = "";
let staff = false;
let aplicacaoFalha = false;
let diagnosticoFalha = false;
let buscaFalha = false;

vi.mock("../src/lib/supabase-server", () => ({
  createAdminSupabaseClient: () => ({
    rpc: async (nome: string, args: { p_valor?: string; p?: { campanhas: unknown[] } }) => {
      if (nome === "midia_confere_segredo") return { data: args.p_valor === segredoValido, error: null };
      if (nome === "midia_gravar_lote") {
        ordem.push("gravar");
        return { data: { campanhas: 1, dias: 1 }, error: null };
      }
      return { data: null, error: { message: "rpc desconhecida" } };
    },
    from: () => ({ insert: async () => ({ error: null }) }),
  }),
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: staff ? { id: "u1" } : null } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { role: "admin", papeis: ["admin"] } }) }) }),
    }),
  }),
}));

vi.mock("../src/lib/midiaMeta", () => ({
  configMeta: () => ({ token: "leitura", versao: "v21.0", conta: "802008949148808" }),
  buscarMeta: async () => {
    ordem.push("buscar");
    if (buscaFalha) throw new Error("Meta fora do ar");
    return { plataforma: "meta", janela: { de: "2026-10-10", ate: "2026-10-17" }, campanhas: [] };
  },
}));

vi.mock("../src/lib/copilotoMeta-aplicar", () => ({
  aplicarAprovadasNoMeta: async (_admin: unknown, cfg: { conta: string }) => {
    if (cfg.conta !== "802008949148808") throw new Error("conta errada");
    ordem.push("aplicar");
    if (aplicacaoFalha) throw new Error("reserva falhou");
    return { feito: true, reservadas: 0, aplicadas: 0, semEfeito: 0, falhas: 0, ignoradas: 0 };
  },
}));

vi.mock("../src/lib/copilotoMeta-servidor", () => ({
  rodarDiagnosticoMeta: async (_admin: unknown, conta: string) => {
    ordem.push(`diagnosticar:${conta}`);
    if (diagnosticoFalha) throw new Error("gravação falhou");
    return { feito: false, motivo: "o diagnóstico de hoje já foi feito, ou ainda não é a hora" };
  },
}));

const { POST } = await import("../src/app/api/marketing/sincronizar/meta/route");

const SEGREDO = "a".repeat(64);
const agendado = () =>
  new Request("http://x/api", { method: "POST", headers: { authorization: `Bearer ${SEGREDO}` } }) as unknown as NextRequest;
const painel = () => new Request("http://x/api", { method: "POST" }) as unknown as NextRequest;

beforeEach(() => {
  ordem.length = 0;
  segredoValido = SEGREDO;
  staff = false;
  aplicacaoFalha = false;
  diagnosticoFalha = false;
  buscaFalha = false;
});

describe("POST /api/marketing/sincronizar/meta — o copiloto", () => {
  it("agendada: aplica, sincroniza e diagnostica, nessa ordem", async () => {
    const r = await POST(agendado());
    expect(r.status).toBe(200);
    expect(ordem).toEqual(["aplicar", "buscar", "gravar", "diagnosticar:act_802008949148808"]);
    const corpo = (await r.json()) as { copiloto: Record<string, { feito: boolean }> };
    expect(corpo.copiloto.aplicacao.feito).toBe(true);
    expect(corpo.copiloto.diagnostico.feito).toBe(false);
  });

  it("painel: só sincroniza", async () => {
    staff = true;
    const r = await POST(painel());
    expect(r.status).toBe(200);
    expect(ordem).toEqual(["buscar", "gravar"]);
    expect(await r.json()).not.toHaveProperty("copiloto");
  });

  it("a aplicação falhando não derruba a sincronização", async () => {
    aplicacaoFalha = true;
    const r = await POST(agendado());
    expect(r.status).toBe(200);
    expect(ordem).toContain("gravar");
    const corpo = (await r.json()) as { copiloto: Record<string, { feito: boolean; motivo?: string }> };
    expect(corpo.copiloto.aplicacao).toEqual({ feito: false, motivo: "reserva falhou" });
  });

  it("o diagnóstico falhando não derruba a sincronização", async () => {
    diagnosticoFalha = true;
    const r = await POST(agendado());
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { copiloto: Record<string, { feito: boolean; motivo?: string }> };
    expect(corpo.copiloto.diagnostico).toEqual({ feito: false, motivo: "gravação falhou" });
  });

  it("sem sincronizar, não diagnostica (o retrato seria velho)", async () => {
    buscaFalha = true;
    const r = await POST(agendado());
    expect(r.status).toBe(502);
    expect(ordem).toEqual(["aplicar", "buscar"]);
  });
});
