import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * O link do aviso ao vendedor, pela rota de verdade (2026-10-09).
 *
 * Pedido do dono, com o print de um aviso de transferência: *"esse link do
 * falar agora precisa ser o do chatwoot"*. O id da conversa já estava no
 * banco, em `atendimentos.chatwoot_conversation_id`; a rota só não o lia.
 *
 * A rota é chamada com o banco em memória: `montar_fila_do_funil` devolve a
 * fila, `atendimentos` devolve as conversas, e o texto que o n8n entrega ao
 * vendedor é conferido inteiro.
 */

type Linha = Record<string, unknown>;

let fila: Linha[];
let atendimentos: Linha[];
let falhaNosAtendimentos: boolean;

vi.mock("../src/lib/supabase-server", () => ({
  createAdminSupabaseClient: () => ({
    rpc: async () => ({ data: fila, error: null }),
    from: (tabela: string) => ({
      select: () => ({
        in: async (coluna: string, valores: string[]) => {
          if (tabela !== "atendimentos") throw new Error(`tabela inesperada: ${tabela}`);
          if (falhaNosAtendimentos) return { data: null, error: { message: "fora do ar" } };
          return { data: atendimentos.filter((a) => valores.includes(String(a[coluna]))), error: null };
        },
      }),
    }),
  }),
}));
vi.mock("../src/lib/autorizacaoDoFunil", () => ({ autorizarFunil: async () => ({ erro: null }) }));
vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: { name: "Motors Store" } }),
}));

const rota = await import("../src/app/api/funil/alertas/route");

function linhaDaFila(extra: Linha = {}): Linha {
  return {
    lead_id: "lead-jorge",
    nome: "Luiz Cavassin, Jorge",
    telefone: "5541984664749",
    interesse: "Hyundai Tucson 2.0 16V Flex Aut",
    canal: "WhatsApp",
    situacao: "em_contato",
    etapa: "Em contato",
    minutos_parado: 6048,
    aviso: "transferencia",
    responsavel: "Rodrigo Naumowicz",
    responsavel_whatsapp: "5541999990001",
    novo_responsavel: "Davi Perez",
    novo_whatsapp: "5541999990002",
    suprimido_por: null,
    ...extra,
  };
}

async function pedirAFila(): Promise<Array<{ lead_id: string; mensagem: string }>> {
  const r = await rota.POST(
    new Request("https://motorsstore.com.br/api/funil/alertas", {
      method: "POST",
      body: JSON.stringify({ reservar: true }),
      headers: { "content-type": "application/json" },
    }),
  );
  const corpo = (await r.json()) as { fila: Array<{ lead_id: string; mensagem: string }> };
  return corpo.fila;
}

beforeEach(() => {
  fila = [linhaDaFila()];
  atendimentos = [];
  falhaNosAtendimentos = false;
  vi.stubEnv("NEXT_PUBLIC_CHATWOOT_URL", "https://app.chat.v2o5.com.br");
  vi.stubEnv("NEXT_PUBLIC_CHATWOOT_CONTA_ID", "3");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("o link do aviso ao vendedor", () => {
  it("é a conversa do lead no Chatwoot, e não o wa.me do cliente", async () => {
    atendimentos = [{ lead_id: "lead-jorge", chatwoot_conversation_id: 436, iniciado_em: "2026-10-05T12:00:00Z" }];

    const [aviso] = await pedirAFila();

    expect(aviso.mensagem).toContain("Lead transferido para você (estava com Rodrigo Naumowicz)");
    expect(aviso.mensagem).toContain("Falar agora: https://app.chat.v2o5.com.br/app/accounts/3/conversations/436");
    expect(aviso.mensagem).not.toContain("wa.me");
  });

  it("com mais de uma conversa, vale a mais recente — a mesma que o card abre", async () => {
    atendimentos = [
      { lead_id: "lead-jorge", chatwoot_conversation_id: 120, iniciado_em: "2026-09-01T12:00:00Z" },
      { lead_id: "lead-jorge", chatwoot_conversation_id: 494, iniciado_em: "2026-10-09T14:01:00Z" },
      { lead_id: "lead-jorge", chatwoot_conversation_id: 301, created_at: "2026-09-20T12:00:00Z" },
    ];

    const [aviso] = await pedirAFila();

    expect(aviso.mensagem).toContain("/conversations/494");
  });

  it("atendimento sem id de conversa não estraga o link: vale a próxima conversa", async () => {
    atendimentos = [
      { lead_id: "lead-jorge", chatwoot_conversation_id: null, iniciado_em: "2026-10-09T15:00:00Z" },
      { lead_id: "lead-jorge", chatwoot_conversation_id: 436, iniciado_em: "2026-10-05T12:00:00Z" },
    ];

    const [aviso] = await pedirAFila();

    expect(aviso.mensagem).toContain("/conversations/436");
  });

  it("lead sem conversa leva ao lead no painel, e não ao WhatsApp", async () => {
    const [aviso] = await pedirAFila();

    expect(aviso.mensagem).toMatch(/Abrir no painel: https?:\/\/\S+\/admin\/leads\/lead-jorge/);
    expect(aviso.mensagem).not.toContain("wa.me");
  });

  it("cada lead leva a sua conversa", async () => {
    fila = [linhaDaFila(), linhaDaFila({ lead_id: "lead-ana", nome: "Ana Souza" })];
    atendimentos = [
      { lead_id: "lead-ana", chatwoot_conversation_id: 77, iniciado_em: "2026-10-01T12:00:00Z" },
      { lead_id: "lead-jorge", chatwoot_conversation_id: 436, iniciado_em: "2026-10-05T12:00:00Z" },
    ];

    const avisos = await pedirAFila();
    const doLead = (id: string) => avisos.find((a) => a.lead_id === id)?.mensagem ?? "";

    expect(doLead("lead-jorge")).toContain("/conversations/436");
    expect(doLead("lead-ana")).toContain("/conversations/77");
  });

  it("se a leitura das conversas falhar, o aviso sai mesmo assim, com o link do painel", async () => {
    // No modo reservado o lead JÁ foi transferido: o novo dono precisa saber.
    falhaNosAtendimentos = true;

    const avisos = await pedirAFila();

    expect(avisos).toHaveLength(1);
    expect(avisos[0].mensagem).toContain("Abrir no painel:");
    expect(console.warn).toHaveBeenCalledWith(
      "[Funil] Sem a conversa do Chatwoot nos avisos:",
      "fora do ar",
    );
  });

  it("linha suprimida não entra na leitura das conversas", async () => {
    fila = [linhaDaFila({ suprimido_por: "fora_do_horario" })];
    atendimentos = [{ lead_id: "lead-jorge", chatwoot_conversation_id: 436, iniciado_em: "2026-10-05T12:00:00Z" }];

    const avisos = await pedirAFila();

    expect(avisos).toEqual([]);
  });
});
