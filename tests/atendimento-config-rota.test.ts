import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoDeTeste, LOJA_DE_TESTE, type BancoDeTeste } from "./bancoDoAtendimentoDeTeste";

/**
 * A rota da configuração do assistente (2026-10-20): lê e grava a linha DA
 * LOJA (a chave de serviço não filtra pela RLS), e desligar o assistente
 * devolve à equipe, na hora, todo lead que estava com ele.
 */

let perfil: Record<string, unknown> | null;
let banco: BancoDeTeste;

vi.mock("../src/lib/observabilidade", () => ({ registrarFalha: async () => undefined }));
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: perfil ? { id: "u1" } : null } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: perfil }) }) }) }),
  }),
  createAdminSupabaseClient: () => banco.cliente,
}));

const DONO = { role: "admin", papeis: ["admin"], full_name: "Dono da Loja", is_active: true };
const ESTA = { id: "cfg-esta", org_id: LOJA_DE_TESTE, ativo: true, nome_do_assistente: "Ney", limiar_morno: 35, limiar_quente: 65 };
const OUTRA = { id: "cfg-outra", org_id: "outra-loja", ativo: true, nome_do_assistente: "Bia", limiar_morno: 35, limiar_quente: 65 };

const put = (corpo: unknown) =>
  new Request("https://loja.teste/api/atendimento/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });

beforeEach(() => {
  perfil = DONO;
  banco = bancoDeTeste({
    atendimento_config: [{ ...OUTRA }, { ...ESTA }],
    leads: [
      { id: "lead-1", telefone: "5541999990000", assistente_fase: "qualificando", desfecho: null, cadencia: "follow_up", cadencia_proximo_em: "2026-10-21T12:00:00Z" },
      { id: "lead-2", telefone: "5541999991111", assistente_fase: null, desfecho: null },
    ],
    atendimentos: [{ id: "at-1", lead_id: "lead-1", com_assistente: true, chatwoot_conversation_id: null, created_at: "2026-10-20T10:00:00Z" }],
    leads_eventos: [],
  });
});

describe("a configuração do assistente", () => {
  it("o GET lê a linha desta loja, e não a primeira que aparecer", async () => {
    const { GET } = await import("../src/app/api/atendimento/config/route");
    const r = await GET();
    expect(r.status).toBe(200);
    expect((await r.json()).config.nome_do_assistente).toBe("Ney");
  });

  it("o PUT grava na linha desta loja e não toca a da outra", async () => {
    const { PUT } = await import("../src/app/api/atendimento/config/route");
    const r = await PUT(put({ ativo: true, nome_do_assistente: "Lia" }) as never);
    expect(r.status).toBe(200);
    expect(banco.tabelas.atendimento_config.find((c) => c.id === "cfg-esta")).toMatchObject({ nome_do_assistente: "Lia", atualizado_por: "Dono da Loja" });
    expect(banco.tabelas.atendimento_config.find((c) => c.id === "cfg-outra")!.nome_do_assistente).toBe("Bia");
  });

  it("desligar devolve à equipe os leads que estavam com o assistente", async () => {
    const { PUT } = await import("../src/app/api/atendimento/config/route");
    const r = await PUT(put({ ativo: false }) as never);
    expect(await r.json()).toMatchObject({ ok: true, liberados: 1 });
    expect(banco.tabelas.leads.find((l) => l.id === "lead-1")).toMatchObject({ assistente_fase: "pausado", cadencia: null, cadencia_proximo_em: null });
    expect(banco.tabelas.atendimentos[0].com_assistente).toBe(false);
    expect(banco.tabelas.leads.find((l) => l.id === "lead-2")!.assistente_fase).toBeNull();
  });

  it("gravar com o assistente já desligado não mexe em lead nenhum", async () => {
    banco.tabelas.atendimento_config.find((c) => c.id === "cfg-esta")!.ativo = false;
    const { PUT } = await import("../src/app/api/atendimento/config/route");
    const r = await PUT(put({ ativo: false, nome_do_assistente: "Ney" }) as never);
    expect(await r.json()).toMatchObject({ ok: true, liberados: 0 });
    expect(banco.tabelas.leads.find((l) => l.id === "lead-1")!.assistente_fase).toBe("qualificando");
  });

  it("perfil que não configura o atendimento: 403", async () => {
    perfil = { role: "comercial", papeis: ["comercial"], full_name: "Carla", is_active: true };
    const { PUT } = await import("../src/app/api/atendimento/config/route");
    expect((await PUT(put({ ativo: false }) as never)).status).toBe(403);
    expect(banco.tabelas.leads.find((l) => l.id === "lead-1")!.assistente_fase).toBe("qualificando");
  });
});
