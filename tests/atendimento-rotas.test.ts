import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * As portas que o n8n chama (2026-10-20): token próprio, 503 sem
 * configuração, 401 com alerta para quem trouxe credencial — e a entrada
 * nunca devolve erro fora disso.
 */

const falhas: { natureza: string; assunto: string }[] = [];
vi.mock("../src/lib/observabilidade", () => ({
  registrarFalha: async (natureza: string, assunto: string) => {
    falhas.push({ natureza, assunto });
  },
}));

const registrarEntrada = vi.fn(async () => ({ acao: "mensagem_registrada", lead: "l1", mensagem: "m1", responder: true, aguardar_ms: 12000 }));
const executarRodada = vi.fn(async (_s: unknown, o: { reservar: boolean }) => ({ ativo: true, reservado: o.reservar, entregas: [], toques: [], suprimidos: [], falhas: 0 }));
const classificarFotosDoEstoque = vi.fn(async () => ({ ok: true, carros_na_fila: 2, carros_classificados: 1, fotos_classificadas: 12, falhas: 0, restantes: 1 }));
vi.mock("../src/lib/atendimento-servidor", () => ({
  registrarEntrada: (...a: unknown[]) => registrarEntrada(...(a as [])),
  responderAoLead: async () => ({ acao: "respondido" }),
  executarRodada: (...a: unknown[]) => executarRodada(...(a as [unknown, { reservar: boolean }])),
  classificarFotosDoEstoque: () => classificarFotosDoEstoque(),
}));
const etiquetas: string[] = [];
vi.mock("next/cache", () => ({ revalidateTag: (t: string) => etiquetas.push(t), unstable_cache: (f: unknown) => f }));
vi.mock("../src/lib/supabase-server", () => ({ createAdminSupabaseClient: () => ({}) }));

const pedido = (caminho: string, corpo: unknown, cabecalhos: Record<string, string> = {}) =>
  new Request(`https://loja.teste${caminho}`, { method: "POST", headers: { "Content-Type": "application/json", ...cabecalhos }, body: JSON.stringify(corpo) });

const CORPO_DA_EVOLUTION = {
  event: "messages.upsert",
  data: { key: { remoteJid: "5541999990000@s.whatsapp.net", fromMe: false, id: "W1" }, pushName: "Rafael", message: { conversation: "oi" } },
};

beforeEach(() => {
  falhas.length = 0;
  etiquetas.length = 0;
  classificarFotosDoEstoque.mockClear();
  registrarEntrada.mockClear();
  executarRodada.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("a porta do motor do atendimento", () => {
  it("sem ATENDIMENTO_MOTOR_TOKEN: 503 e alerta", async () => {
    vi.stubEnv("ATENDIMENTO_MOTOR_TOKEN", "");
    const { POST } = await import("../src/app/api/atendimento/evolution/route");
    const r = await POST(pedido("/api/atendimento/evolution", CORPO_DA_EVOLUTION, { Authorization: "Bearer x" }));
    expect(r.status).toBe(503);
    expect(falhas).toEqual([{ natureza: "parada", assunto: "atendimento-sem-token" }]);
  });

  it("token errado com credencial: 401 e alerta; sem credencial: 401 calado", async () => {
    vi.stubEnv("ATENDIMENTO_MOTOR_TOKEN", "certo");
    const { POST } = await import("../src/app/api/atendimento/evolution/route");
    expect((await POST(pedido("/api/atendimento/evolution", CORPO_DA_EVOLUTION, { Authorization: "Bearer errado" }))).status).toBe(401);
    expect(falhas).toEqual([{ natureza: "parada", assunto: "atendimento-entrada-recusada" }]);
    expect((await POST(pedido("/api/atendimento/evolution", CORPO_DA_EVOLUTION))).status).toBe(401);
    expect(falhas).toHaveLength(1);
    expect(registrarEntrada).not.toHaveBeenCalled();
  });

  it("não aceita o token do funil nem o do Chatwoot: segredo mede acesso", async () => {
    vi.stubEnv("ATENDIMENTO_MOTOR_TOKEN", "do-atendimento");
    vi.stubEnv("FUNIL_MOTOR_TOKEN", "do-funil");
    vi.stubEnv("CHATWOOT_WEBHOOK_TOKEN", "do-chatwoot");
    const { POST } = await import("../src/app/api/atendimento/evolution/route");
    expect((await POST(pedido("/api/atendimento/evolution", CORPO_DA_EVOLUTION, { Authorization: "Bearer do-funil" }))).status).toBe(401);
    expect((await POST(pedido("/api/atendimento/evolution?token=do-chatwoot", CORPO_DA_EVOLUTION))).status).toBe(401);
  });

  it("Bearer certo: entra, e devolve o que o n8n lê", async () => {
    vi.stubEnv("ATENDIMENTO_MOTOR_TOKEN", "certo");
    const { POST } = await import("../src/app/api/atendimento/evolution/route");
    const r = await POST(pedido("/api/atendimento/evolution", CORPO_DA_EVOLUTION, { Authorization: "Bearer certo" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, acao: "mensagem_registrada", responder: true, aguardar_ms: 12000, lead: "l1", mensagem: "m1" });
  });

  it("token na URL não abre a porta, nem o certo: fica em log de acesso", async () => {
    vi.stubEnv("ATENDIMENTO_MOTOR_TOKEN", "certo");
    const { POST } = await import("../src/app/api/atendimento/evolution/route");
    expect((await POST(pedido("/api/atendimento/evolution?token=certo", CORPO_DA_EVOLUTION))).status).toBe(401);
    expect(registrarEntrada).not.toHaveBeenCalled();
  });

  it("evento ignorado responde 200 com o motivo e responder: false", async () => {
    vi.stubEnv("ATENDIMENTO_MOTOR_TOKEN", "certo");
    const { POST } = await import("../src/app/api/atendimento/evolution/route");
    const r = await POST(pedido("/api/atendimento/evolution", { event: "connection.update", data: {} }, { Authorization: "Bearer certo" }));
    expect(await r.json()).toEqual({ ok: true, acao: "ignorado", detalhe: "evento connection.update", responder: false });
    expect(registrarEntrada).not.toHaveBeenCalled();
  });

  it("falha nossa na entrada não vira erro HTTP", async () => {
    vi.stubEnv("ATENDIMENTO_MOTOR_TOKEN", "certo");
    registrarEntrada.mockRejectedValueOnce(new Error("banco fora"));
    const { POST } = await import("../src/app/api/atendimento/evolution/route");
    const r = await POST(pedido("/api/atendimento/evolution", CORPO_DA_EVOLUTION, { Authorization: "Bearer certo" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ acao: "falhou", responder: false });
  });
});

describe("a resposta e a rodada", () => {
  it("responder sem lead_id válido é defeito do workflow: 400", async () => {
    vi.stubEnv("ATENDIMENTO_MOTOR_TOKEN", "certo");
    const { POST } = await import("../src/app/api/atendimento/responder/route");
    expect((await POST(pedido("/api/atendimento/responder", { lead_id: "x" }, { Authorization: "Bearer certo" }))).status).toBe(400);
  });

  it("a rodada sem `reservar: true` é prévia", async () => {
    vi.stubEnv("ATENDIMENTO_MOTOR_TOKEN", "certo");
    const { POST } = await import("../src/app/api/atendimento/rodada/route");
    await POST(pedido("/api/atendimento/rodada", {}, { Authorization: "Bearer certo" }));
    await POST(pedido("/api/atendimento/rodada", { reservar: "true" }, { Authorization: "Bearer certo" }));
    await POST(pedido("/api/atendimento/rodada", { reservar: true }, { Authorization: "Bearer certo" }));
    expect(executarRodada.mock.calls.map((c) => c[1].reservar)).toEqual([false, false, true]);
  });
});

describe("a rodada das fotos", () => {
  it("mesma porta do motor: sem o token certo, nada é classificado", async () => {
    vi.stubEnv("ATENDIMENTO_MOTOR_TOKEN", "certo");
    const { POST } = await import("../src/app/api/atendimento/fotos/route");
    expect((await POST(pedido("/api/atendimento/fotos", {}, { Authorization: "Bearer errado" }))).status).toBe(401);
    expect(classificarFotosDoEstoque).not.toHaveBeenCalled();
  });

  it("classificou algo novo: devolve o placar e revalida o catálogo das fotos", async () => {
    vi.stubEnv("ATENDIMENTO_MOTOR_TOKEN", "certo");
    const { POST } = await import("../src/app/api/atendimento/fotos/route");
    const r = await POST(pedido("/api/atendimento/fotos", {}, { Authorization: "Bearer certo" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, fotos_classificadas: 12, restantes: 1 });
    expect(etiquetas).toEqual(["atendimento-fotos"]);
  });

  it("nada novo: não revalida", async () => {
    vi.stubEnv("ATENDIMENTO_MOTOR_TOKEN", "certo");
    classificarFotosDoEstoque.mockResolvedValueOnce({ ok: true, carros_na_fila: 0, carros_classificados: 0, fotos_classificadas: 0, falhas: 0, restantes: 0 });
    const { POST } = await import("../src/app/api/atendimento/fotos/route");
    await POST(pedido("/api/atendimento/fotos", {}, { Authorization: "Bearer certo" }));
    expect(etiquetas).toEqual([]);
  });
});
