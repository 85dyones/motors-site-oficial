import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { interpretarEventoDoChatwoot } from "../src/lib/chatwootEventos";

/**
 * O token trocado na Vercel e esquecido na URL do Chatwoot (23/09 a 08/10).
 *
 * Em 2026-09-23, às 12:13 UTC, `CHATWOOT_WEBHOOK_TOKEN` foi trocado na Vercel e
 * o site republicado no mesmo commit. A URL do webhook no Chatwoot seguiu com o
 * token antigo em `?token=`, e toda entrega passou a levar 401 — 15 dias em
 * que a única marca era um `console.warn`:
 *
 *   - `contato` pelo Chatwoot: 24 em 22/09, zero de 23/09 em diante;
 *   - leads do canal `WhatsApp` (os que a rota cria): zero no mesmo período;
 *   - transferências automáticas: 1.583 em 40 leads, de 30–50 por dia para
 *     150–220.
 *
 * A régua do parser ("robô não atende") não tinha mudado, e não era ela: a
 * entrega morria na porta, antes de o corpo ser lido. Estes testes seguram as
 * duas metades:
 *
 *   1. a entrega exatamente como o Chatwoot manda — `?token=` na URL, o
 *      `User-Agent` do rest-client do Chatwoot, o corpo de `message_created` —
 *      com o token antigo é recusada sem tocar no banco, e PROCURA o dono;
 *   2. a mesma entrega com o token atual volta a registrar o contato, que é o
 *      que reinicia o relógio, e conversa nova do WhatsApp volta a virar lead.
 *
 * Banco em memória, como em `chatwoot-atribuicao-rota.test.ts`: a rota é
 * chamada de verdade, com o parser de verdade.
 */

type Linha = Record<string, unknown>;

let banco: Record<string, Linha[]>;
let escritas: string[];
let rpcs: Array<{ funcao: string; args: Linha }>;

function consulta(tabela: string) {
  const filtros: Array<(l: Linha) => boolean> = [];
  let mudanca: Linha | null = null;
  let nova: Linha | null = null;
  const executar = async () => {
    const linhas = (banco[tabela] ??= []);
    if (nova) {
      const linha = { id: `${tabela}-${linhas.length + 1}`, ...nova };
      linhas.push(linha);
      escritas.push(`insert ${tabela}`);
      return { data: [{ ...linha }], error: null };
    }
    const alcancadas = linhas.filter((l) => filtros.every((f) => f(l)));
    if (mudanca) {
      for (const l of alcancadas) Object.assign(l, mudanca);
      escritas.push(`update ${tabela}`);
    }
    return { data: alcancadas.map((l) => ({ ...l })), error: null };
  };
  const umaLinha = async () => {
    const r = await executar();
    return { data: r.data[0] ?? null, error: r.error };
  };
  const q = {
    select: () => q,
    order: () => q,
    limit: () => q,
    eq: (coluna: string, valor: unknown) => {
      filtros.push((l) => l[coluna] === valor);
      return q;
    },
    is: (coluna: string, valor: unknown) => {
      filtros.push((l) => (l[coluna] ?? null) === valor);
      return q;
    },
    in: (coluna: string, valores: unknown[]) => {
      filtros.push((l) => valores.includes(l[coluna]));
      return q;
    },
    update: (campos: Linha) => {
      mudanca = campos;
      return q;
    },
    insert: (campos: Linha) => {
      nova = campos;
      return q;
    },
    single: umaLinha,
    maybeSingle: umaLinha,
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => executar().then(ok, erro),
  };
  return q;
}

const CLIENTE = {
  from: (tabela: string) => consulta(tabela),
  rpc: async (funcao: string, args: Linha) => {
    rpcs.push({ funcao, args });
    return { data: null, error: null };
  },
};
vi.mock("../src/lib/supabase-server", () => ({ createAdminSupabaseClient: () => CLIENTE }));

const registrarFalha = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}));
vi.mock("../src/lib/observabilidade", () => ({ registrarFalha }));

const rota = await import("../src/app/api/chatwoot/eventos/route");

// ----------------------------------------------------------------------------
// A entrega, como o Chatwoot manda
// ----------------------------------------------------------------------------

/** O valor que a Vercel tem desde 23/09, 12:13 UTC. */
const TOKEN_ATUAL = "token-atual-da-vercel";
/** O que ficou na URL do webhook, no Chatwoot. */
const TOKEN_ANTIGO = "token-antigo-da-url";
/** O `User-Agent` de todas as entregas recusadas, lido no log da Vercel. */
const AGENTE_DO_CHATWOOT = "rest-client/2.1.0 (linux-musl x86_64) ruby/3.4.4p34";

const CONTATO = {
  additional_attributes: {},
  custom_attributes: {},
  email: null,
  id: 388,
  identifier: null,
  name: "Cliente Exemplo",
  phone_number: "+5541999990000",
  thumbnail: "",
  blocked: false,
  type: "contact",
};

/**
 * A resposta de uma consultora, no envelope do webhook do Chatwoot.
 *
 * Não há corpo real gravado em lugar nenhum: a rota guarda só o desfecho, no
 * log, e o banco guarda só o efeito. Este é o `Message#webhook_data` do
 * Chatwoot com `event: "message_created"` — remetente no formato de
 * `User#webhook_data` (`type: "user"`, com e-mail), conversa com o contato em
 * `meta.sender` —, com dados fictícios. É a forma que a produção aceitou até
 * 22/09: 24 respostas registradas naquele dia, a última na conversa 420, às
 * 00:59 UTC de 23/09.
 */
function respostaDaConsultora(extra: Linha = {}): Linha {
  return {
    account: { id: 1, name: "Motors Store" },
    additional_attributes: {},
    content_attributes: {},
    content_type: "text",
    content: "Boa tarde! O Onix segue disponível, posso te mandar o vídeo?",
    conversation: {
      additional_attributes: {},
      can_reply: true,
      channel: "Channel::Api",
      contact_inbox: { id: 401, contact_id: 388, inbox_id: 11, source_id: "5541999990000" },
      id: 420,
      inbox_id: 11,
      labels: ["origem-site", "quer-comprar"],
      meta: {
        sender: CONTATO,
        assignee: { id: 6, name: "Ana Lima", available_name: "Ana Lima", type: "user" },
        team: null,
        hmac_verified: false,
      },
      status: "open",
      custom_attributes: {},
      snoozed_until: null,
      unread_count: 0,
      priority: null,
      waiting_since: 0,
      timestamp: 1790125163,
      created_at: 1790124000,
    },
    created_at: "2026-09-23T00:59:23.000Z",
    id: 9876,
    inbox: { id: 11, name: "WhatsApp Motors" },
    message_type: "outgoing",
    private: false,
    sender: { id: 6, name: "Ana Lima", email: "ana@painel.com", type: "user" },
    source_id: null,
    event: "message_created",
    ...extra,
  };
}

/** O cliente escrevendo numa conversa que o painel ainda não conhece. */
function clienteNovoEscrevendo(): Linha {
  const contato = { ...CONTATO, id: 512, name: "Cliente Novo", phone_number: "+5541988887777" };
  return {
    ...respostaDaConsultora(),
    content: "Oi, vi o anúncio do Onix",
    conversation: {
      ...(respostaDaConsultora().conversation as Linha),
      id: 495,
      meta: { sender: contato, assignee: null, team: null, hmac_verified: false },
    },
    message_type: "incoming",
    sender: contato,
  };
}

async function entregar(
  corpo: unknown,
  credencial: { token?: string; bearer?: string; autorizacao?: string } = {},
): Promise<{ status: number; corpo: Linha }> {
  const url = new URL("https://motorsstore.com.br/api/chatwoot/eventos");
  if (credencial.token !== undefined) url.searchParams.set("token", credencial.token);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": AGENTE_DO_CHATWOOT,
  };
  if (credencial.bearer !== undefined) headers.Authorization = `Bearer ${credencial.bearer}`;
  if (credencial.autorizacao !== undefined) headers.Authorization = credencial.autorizacao;
  const r = await rota.POST(new Request(url, { method: "POST", body: JSON.stringify(corpo), headers }));
  return { status: r.status, corpo: (await r.json()) as Linha };
}

/** O texto que iria ao WhatsApp na chamada `n` a `registrarFalha`. */
const textoDoAlerta = (n = 0) => String(registrarFalha.mock.calls[n]?.[2]);

beforeEach(() => {
  escritas = [];
  rpcs = [];
  registrarFalha.mockClear();
  banco = {
    leads: [
      {
        id: "lead-1",
        nome: "Cliente Exemplo",
        telefone: "5541999990000",
        desfecho: null,
        responsavel: "Ana Lima",
      },
    ],
    atendimentos: [{ id: "at-1", lead_id: "lead-1", chatwoot_conversation_id: 420 }],
    leads_eventos: [],
  };
  vi.stubEnv("CHATWOOT_WEBHOOK_TOKEN", TOKEN_ATUAL);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// ----------------------------------------------------------------------------

describe("o corpo não era o problema", () => {
  it("a resposta da consultora é lida como consultor, com o nome dela e o telefone do cliente", () => {
    const e = interpretarEventoDoChatwoot(respostaDaConsultora());
    expect(e).toMatchObject({
      tipo: "mensagem_do_consultor",
      conversaId: 420,
      inboxId: 11,
      autor: "Ana Lima",
      telefone: "5541999990000",
    });
  });

  it("o mesmo envelope vindo de bot continua não contando — robô não atende", () => {
    const e = interpretarEventoDoChatwoot(
      respostaDaConsultora({ sender: { id: 2, name: "Assistente", type: "agent_bot" } }),
    );
    expect(e.tipo).toBe("ignorado");
  });
});

describe("23/09 a 08/10: a URL do Chatwoot com o token antigo", () => {
  it("a resposta da consultora é recusada com 401 e não toca no banco", async () => {
    const { status } = await entregar(respostaDaConsultora(), { token: TOKEN_ANTIGO });

    expect(status).toBe(401);
    expect(rpcs).toEqual([]);
    expect(escritas).toEqual([]);
  });

  it("e procura o dono: parada, com assunto estável, em vez de só um aviso no log", async () => {
    await entregar(respostaDaConsultora(), { token: TOKEN_ANTIGO });

    expect(registrarFalha).toHaveBeenCalledTimes(1);
    expect(registrarFalha).toHaveBeenCalledWith(
      "parada",
      "chatwoot-entrada-recusada",
      expect.stringContaining("CHATWOOT_WEBHOOK_TOKEN"),
      expect.objectContaining({ rota: "/api/chatwoot/eventos" }),
    );
  });

  it("o assunto é o mesmo a cada entrega, para a carência do alerta segurar a enxurrada", async () => {
    await entregar(respostaDaConsultora(), { token: TOKEN_ANTIGO });
    await entregar(clienteNovoEscrevendo(), { token: TOKEN_ANTIGO });
    await entregar(respostaDaConsultora(), { bearer: TOKEN_ANTIGO });

    const assuntos = registrarFalha.mock.calls.map((c) => c[1]);
    expect(assuntos).toEqual(["chatwoot-entrada-recusada", "chatwoot-entrada-recusada", "chatwoot-entrada-recusada"]);
  });

  it("o alerta diz o que parou e como consertar, e cabe nos 300 caracteres que o WhatsApp recebe", async () => {
    await entregar(respostaDaConsultora(), { token: TOKEN_ANTIGO });
    const texto = textoDoAlerta();

    expect(texto).toContain("URL do webhook");
    expect(texto).toContain("relógio");
    expect(texto).toContain("Conserto:");
    // `alertaDeFalha` corta em 300: o que passasse disso seria o conserto.
    expect(texto.length).toBeLessThanOrEqual(300);
  });

  it("o alerta não leva o token, nem o recebido nem o certo, nem o texto de quem bateu", async () => {
    await entregar(respostaDaConsultora(), { token: TOKEN_ANTIGO });
    await entregar(respostaDaConsultora(), { bearer: TOKEN_ANTIGO });
    // Sem as duas chamadas, as negativas abaixo passariam sobre uma lista
    // vazia — inclusive contra a rota que não avisava ninguém.
    expect(registrarFalha).toHaveBeenCalledTimes(2);
    const tudo = JSON.stringify(registrarFalha.mock.calls);

    expect(tudo).not.toContain(TOKEN_ANTIGO);
    expect(tudo).not.toContain(TOKEN_ATUAL);
    expect(tudo).not.toContain("rest-client");
  });

  it("o log do 401 diz por que não conferiu, sem nunca mostrar o token", async () => {
    // 2026-10-09: a variável da Vercel preenchida com "Bearer <token>" e a URL
    // do Chatwoot com o token puro — o MESMO valor, estragado de um lado.
    vi.stubEnv("CHATWOOT_WEBHOOK_TOKEN", `Bearer ${TOKEN_ATUAL}`);
    await entregar(respostaDaConsultora(), { token: TOKEN_ATUAL });
    await entregar(respostaDaConsultora(), { token: TOKEN_ANTIGO });

    const linhas = vi.mocked(console.warn).mock.calls.filter((c) => c[0] === "[Chatwoot] 401 —");
    expect(linhas).toHaveLength(2);
    const [estragado, outro] = linhas.map((c) => JSON.parse(String(c[1])) as Linha);
    expect(estragado).toMatchObject({
      veio_query: true,
      diagnostico: "esperado_com_bearer",
      recebido_tamanho: TOKEN_ATUAL.length,
      esperado_tamanho: `Bearer ${TOKEN_ATUAL}`.length,
    });
    expect(outro).toMatchObject({ diagnostico: "diferente", recebido_tamanho: TOKEN_ANTIGO.length });

    const tudo = JSON.stringify(linhas);
    expect(tudo).not.toContain(TOKEN_ATUAL);
    expect(tudo).not.toContain(TOKEN_ANTIGO);
  });

  it("o Bearer errado — o caminho do n8n — também avisa, com o conserto do Bearer", async () => {
    const { status } = await entregar(respostaDaConsultora(), { bearer: TOKEN_ANTIGO });

    expect(status).toBe(401);
    expect(textoDoAlerta()).toContain("Bearer");
    expect(textoDoAlerta().length).toBeLessThanOrEqual(300);
  });

  it("sem credencial nenhuma é varredura de robô: 401, e o celular do dono não toca", async () => {
    const { status } = await entregar(respostaDaConsultora());

    expect(status).toBe(401);
    expect(registrarFalha).not.toHaveBeenCalled();
    expect(escritas).toEqual([]);
  });

  it("`?token=` vazio e `Authorization` que não é Bearer também não são credencial desta porta", async () => {
    const vazio = await entregar(respostaDaConsultora(), { token: "" });
    const basico = await entregar(respostaDaConsultora(), { autorizacao: "Basic dXN1YXJpbzpzZW5oYQ==" });

    expect([vazio.status, basico.status]).toEqual([401, 401]);
    expect(registrarFalha).not.toHaveBeenCalled();
  });

  it("sem CHATWOOT_WEBHOOK_TOKEN na Vercel: 503, e o alerta tem assunto próprio", async () => {
    vi.stubEnv("CHATWOOT_WEBHOOK_TOKEN", "");
    const { status } = await entregar(respostaDaConsultora(), { token: TOKEN_ANTIGO });

    expect(status).toBe(503);
    expect(registrarFalha).toHaveBeenCalledWith(
      "parada",
      "chatwoot-entrada-sem-token",
      expect.stringContaining("CHATWOOT_WEBHOOK_TOKEN"),
      expect.objectContaining({ rota: "/api/chatwoot/eventos" }),
    );
    expect(textoDoAlerta().length).toBeLessThanOrEqual(300);
    expect(escritas).toEqual([]);
  });

  it("sem a variável, avisa mesmo sem credencial: ninguém entra, e a porta está mesmo fechada", async () => {
    vi.stubEnv("CHATWOOT_WEBHOOK_TOKEN", "");
    await entregar(respostaDaConsultora());

    expect(registrarFalha).toHaveBeenCalledTimes(1);
    expect(registrarFalha.mock.calls[0]?.[1]).toBe("chatwoot-entrada-sem-token");
  });
});

describe("com o token atual na URL, a mesma entrega volta a valer", () => {
  it("a resposta da consultora registra o contato, que é o que reinicia o relógio", async () => {
    const { status, corpo } = await entregar(respostaDaConsultora(), { token: TOKEN_ATUAL });

    expect(status).toBe(200);
    expect(corpo).toMatchObject({ acao: "contato_registrado", conversa: 420, lead: "lead-1" });
    // `registrar_contato_do_lead` (20260915120000) é quem carimba
    // `ultimo_contato_em` e zera `alertado_em`; o nome vai para o rastro.
    expect(rpcs).toEqual([
      {
        funcao: "registrar_contato_do_lead",
        args: { p_lead: "lead-1", p_canal: "chatwoot", p_autor: "Ana Lima" },
      },
    ]);
    expect(registrarFalha).not.toHaveBeenCalled();
  });

  it("o Bearer atual continua valendo, para quem chama pelo n8n", async () => {
    const { corpo } = await entregar(respostaDaConsultora(), { bearer: TOKEN_ATUAL });
    expect(corpo.acao).toBe("contato_registrado");
  });

  it("a mensagem de bot na mesma conversa passa pela porta e não registra contato", async () => {
    const { status, corpo } = await entregar(
      respostaDaConsultora({ sender: { id: 2, name: "Assistente", type: "agent_bot" } }),
      { token: TOKEN_ATUAL },
    );

    expect(status).toBe(200);
    expect(corpo.acao).toBe("ignorado");
    expect(rpcs).toEqual([]);
  });

  it("conversa nova do WhatsApp volta a virar lead, com o atendimento vinculado", async () => {
    const { corpo } = await entregar(clienteNovoEscrevendo(), { token: TOKEN_ATUAL });

    expect(corpo).toMatchObject({ acao: "atendimento_vinculado", conversa: 495 });
    const novo = banco.leads.find((l) => l.telefone === "5541988887777");
    expect(novo).toMatchObject({ canal: "WhatsApp", nome: "Cliente Novo" });
    expect(banco.atendimentos.find((a) => a.chatwoot_conversation_id === 495)?.lead_id).toBe(novo?.id);
  });
});
