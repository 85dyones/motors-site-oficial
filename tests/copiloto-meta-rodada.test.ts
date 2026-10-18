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
let repescagemFalha = false;
let configFalha = false;
let prazoRecebido: number | undefined;

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
  configMeta: () => (configFalha ? { erro: "META_ADS_TOKEN ausente" } : { token: "leitura", versao: "v21.0", conta: "802008949148808" }),
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

vi.mock("../src/lib/qualificacaoParaMeta-servidor", () => ({
  repescarQualificacoes: async (_admin: unknown, _fontes: unknown, _agora: unknown, prazo: number) => {
    ordem.push("repescar");
    prazoRecebido = prazo;
    if (repescagemFalha) throw new Error("Meta recusou");
    return { pendentes: 0, enviados: 0, naoAceitos: 0 };
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
  repescagemFalha = false;
  configFalha = false;
  prazoRecebido = undefined;
});

describe("POST /api/marketing/sincronizar/meta — o copiloto", () => {
  it("agendada: aplica, sincroniza, diagnostica e repesca o LeadQualificado, nessa ordem", async () => {
    const r = await POST(agendado());
    expect(r.status).toBe(200);
    expect(ordem).toEqual(["aplicar", "buscar", "gravar", "diagnosticar:act_802008949148808", "repescar"]);
    const corpo = (await r.json()) as { copiloto: Record<string, { feito: boolean }>; repescagem: unknown };
    expect(corpo.copiloto.aplicacao.feito).toBe(true);
    expect(corpo.copiloto.diagnostico.feito).toBe(false);
    // A repescagem não é do copiloto: vai fora dele, com prazo dentro dos 60 s da rota.
    expect(corpo.copiloto).not.toHaveProperty("repescagem");
    expect(corpo.repescagem).toEqual({ pendentes: 0, enviados: 0, naoAceitos: 0 });
    expect(prazoRecebido! - Date.now()).toBeLessThanOrEqual(45_000);
    expect(prazoRecebido! - Date.now()).toBeGreaterThan(30_000);
  });

  it("a repescagem falhando não derruba a sincronização", async () => {
    repescagemFalha = true;
    const r = await POST(agendado());
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { repescagem: unknown };
    expect(corpo.repescagem).toEqual({ feito: false, motivo: "Meta recusou" });
  });

  it("painel: só sincroniza", async () => {
    staff = true;
    const r = await POST(painel());
    expect(r.status).toBe(200);
    expect(ordem).toEqual(["buscar", "gravar"]);
    const corpo = await r.json();
    expect(corpo).not.toHaveProperty("copiloto");
    expect(corpo).not.toHaveProperty("repescagem");
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

  it("sem sincronizar, não diagnostica (o retrato seria velho) — mas repesca, que vai pela CAPI", async () => {
    buscaFalha = true;
    const r = await POST(agendado());
    expect(r.status).toBe(502);
    expect(ordem).toEqual(["aplicar", "buscar", "repescar"]);
    expect(await r.json()).toMatchObject({ error: "Meta fora do ar", repescagem: { enviados: 0 } });
  });

  it("sem a configuração dos anúncios, a repescagem roda do mesmo jeito", async () => {
    configFalha = true;
    const r = await POST(agendado());
    expect(r.status).toBe(500);
    expect(ordem).toEqual(["repescar"]);
  });

  it("painel sem a configuração dos anúncios: não repesca", async () => {
    staff = true;
    configFalha = true;
    const r = await POST(painel());
    expect(r.status).toBe(500);
    expect(ordem).toEqual([]);
  });
});
