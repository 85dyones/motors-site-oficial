import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * `POST /api/leads` (a captura PÚBLICA) e a primeira opção em `leads_veiculos`,
 * com o handler EXECUTADO (revisão de 05/10/2026).
 *
 * A captura é o caminho do dinheiro: o visitante deixou o telefone e está a
 * caminho do WhatsApp. A gravação nova só serve ao relatório por veículo, e
 * por isso:
 *
 *   - a resposta NUNCA espera por ela: vai para `after()` e, onde `after()`
 *     não existe (aqui, sem escopo de requisição), é disparada solta. Um
 *     insert que nunca resolve não segura a resposta;
 *   - a resposta não DEPENDE dela: insert que falha, que lança ou tabela que
 *     não existe dão o mesmo 200, com o lead gravado;
 *   - nenhum texto do pedido vira rótulo de carro: só `lead_id` e `veiculo_id`
 *     seguem, e não há segunda tentativa.
 */

type Linha = Record<string, unknown>;

const leads: Linha[] = [];
const opcoes: Linha[] = [];
/** Como `leads_veiculos` responde ao insert. */
let aoInserirOpcao: (linha: Linha) => unknown;
/** O que o Next recebeu em `after()`, quando há escopo. `null`: `after()` estoura, como fora de uma requisição. */
let agendadas: Array<() => unknown> | null;

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (tarefa: () => unknown) => {
    if (agendadas === null) throw new Error("`after` was called outside a request scope.");
    agendadas.push(tarefa);
  },
}));
vi.mock("../src/lib/turnstile", () => ({
  verificarTurnstile: async () => ({ ok: true, hostname: "x", action: "lead" }),
  ACOES_DE_LEADS: ["lead"],
  ipDoVisitante: () => "127.0.0.1",
}));
vi.mock("../src/lib/supabase-server", () => ({
  createAdminSupabaseClient: () => ({
    from: (tabela: string) => {
      if (tabela === "leads") {
        return {
          insert: (linha: Linha) => {
            leads.push(linha);
            const resultado = { data: { id: "a0000000-0000-4000-8000-000000000001" }, error: null };
            return {
              select: () => ({ maybeSingle: async () => resultado }),
              then: (ok: (r: typeof resultado) => unknown, falha?: (e: unknown) => unknown) =>
                Promise.resolve(resultado).then(ok, falha),
            };
          },
        };
      }
      if (tabela === "leads_veiculos") {
        return {
          insert: (linha: Linha) => {
            opcoes.push(linha);
            return aoInserirOpcao(linha);
          },
        };
      }
      throw new Error(`tabela inesperada: ${tabela}`);
    },
  }),
}));
vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ webhooks: { webhookUrl: "https://n8n.teste/webhook/lead" }, companySettings: {} }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("../src/lib/telemetry", () => ({ logLeadCaptured: () => {}, META_CONTENT_TYPE: "product" }));
vi.mock("../src/lib/meta-capi", () => ({ sendCapiEvent: async () => {} }));

const { POST } = await import("../src/app/api/leads/route");

/** O que o visitante pode ter escrito, e que não pode virar nome de carro. */
const TEXTO_DO_VISITANTE = "Carro do Joao 41999990000 <b>barato</b>";

const CORPO = {
  canal: "PDP",
  tipo: "lead",
  mensagem: TEXTO_DO_VISITANTE,
  cliente: { nome: "Paula", whatsapp: "(41) 99999-0000" },
  veiculo: { id: "8203724", marca: TEXTO_DO_VISITANTE, modelo: TEXTO_DO_VISITANTE, versao: "x", ano: 2020, preco: 1 },
  utm: {},
  eventId: "ev-1",
  turnstileToken: "tok",
};

const enviar = (corpo: Linha = CORPO) =>
  POST(
    new NextRequest("http://x/api/leads", {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }),
  );

/** A resposta, ou "pendurou" se o handler não respondeu no prazo. */
const emTempo = async (resposta: Promise<Response>) =>
  Promise.race([resposta, new Promise<"pendurou">((ok) => setTimeout(() => ok("pendurou"), 1500))]);

beforeEach(() => {
  leads.length = 0;
  opcoes.length = 0;
  agendadas = null;
  aoInserirOpcao = async () => ({ data: null, error: null });
  globalThis.fetch = (async () => ({ ok: true, status: 200, text: async () => "" })) as never;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/leads — a primeira opção do lead não segura nem decide a captura", () => {
  it("o controle: com tudo certo, o lead é gravado e a opção leva só lead e carro", async () => {
    const r = await enviar();
    expect(r.status).toBe(200);
    expect(leads).toHaveLength(1);
    expect(leads[0].veiculo_id).toBe(8203724);
    await vi.waitFor(() => expect(opcoes).toHaveLength(1));
    expect(opcoes[0]).toEqual({ lead_id: "a0000000-0000-4000-8000-000000000001", veiculo_id: 8203724 });
  });

  it("insert que NUNCA resolve: a resposta sai do mesmo jeito", async () => {
    aoInserirOpcao = () => new Promise(() => {});
    const r = await emTempo(enviar());
    expect(r).not.toBe("pendurou");
    expect((r as Response).status).toBe(200);
    expect(leads).toHaveLength(1);
    // E ele foi de fato disparado: a prova não é a de um código que nem chamou.
    expect(opcoes).toHaveLength(1);
  });

  it("dentro de uma requisição vai para `after()`: nada roda antes de a resposta sair", async () => {
    agendadas = [];
    aoInserirOpcao = () => new Promise(() => {});
    const r = await emTempo(enviar());
    expect((r as Response).status).toBe(200);
    expect(agendadas).toHaveLength(1);
    expect(opcoes).toEqual([]);
    // Só quando o Next roda a tarefa, depois da resposta, o insert acontece.
    void agendadas[0]();
    await vi.waitFor(() => expect(opcoes).toHaveLength(1));
  });

  it.each([
    ["o banco recusa", async () => ({ data: null, error: { code: "57014", message: "timeout" } })],
    ["a tabela ainda não existe", async () => ({ data: null, error: { code: "PGRST205", message: "Could not find the table 'public.leads_veiculos' in the schema cache" } })],
    ["o carro não está no estoque (23502)", async () => ({ data: null, error: { code: "23502", message: 'null value in column "veiculo_rotulo"' } })],
    ["o insert rejeita", async () => { throw new Error("rede caiu"); }],
    ["o insert lança na hora", () => { throw new Error("cliente quebrado"); }],
  ])("%s: mesma resposta, lead gravado, e nenhuma rejeição solta", async (_caso, comportamento) => {
    const soltas: unknown[] = [];
    const ouvir = (e: unknown) => soltas.push(e);
    process.on("unhandledRejection", ouvir);
    try {
      const certo = await enviar();
      const corpoCerto = await certo.json();
      leads.length = 0;
      opcoes.length = 0;

      aoInserirOpcao = comportamento;
      const r = await enviar();
      expect(r.status).toBe(certo.status);
      expect(await r.json()).toEqual(corpoCerto);
      expect(leads).toHaveLength(1);
      // Uma tentativa só: não há segunda, com rótulo de reserva.
      await vi.waitFor(() => expect(opcoes).toHaveLength(1));
      await new Promise((ok) => setTimeout(ok, 20));
      expect(opcoes).toHaveLength(1);
      expect(soltas).toEqual([]);
    } finally {
      process.off("unhandledRejection", ouvir);
    }
  });

  it("agendada em `after()`, a falha também não escapa da tarefa", async () => {
    agendadas = [];
    aoInserirOpcao = async () => { throw new Error("rede caiu"); };
    expect((await enviar()).status).toBe(200);
    await expect(Promise.resolve(agendadas[0]())).resolves.toBeUndefined();
  });

  it("nenhum texto do pedido vira rótulo: nem a mensagem, nem o nome do carro que o navegador mandou", async () => {
    aoInserirOpcao = async () => ({ data: null, error: { code: "23502", message: "null value" } });
    await enviar();
    await vi.waitFor(() => expect(opcoes).toHaveLength(1));
    await new Promise((ok) => setTimeout(ok, 20));
    for (const linha of opcoes) {
      expect(Object.keys(linha).sort()).toEqual(["lead_id", "veiculo_id"]);
      expect(JSON.stringify(linha)).not.toContain("Joao");
    }
  });

  it("lead sem carro (campanha, busca): nada é agendado", async () => {
    agendadas = [];
    const { veiculo: _fora, ...semCarro } = CORPO;
    void _fora;
    expect((await enviar(semCarro)).status).toBe(200);
    // Agendada ou não, o que importa: nenhuma linha em `leads_veiculos`.
    for (const tarefa of agendadas) await tarefa();
    expect(opcoes).toEqual([]);
  });
});
