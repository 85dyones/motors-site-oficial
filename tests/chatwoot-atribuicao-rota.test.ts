import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * A atribuição do Chatwoot na rota, EXECUTADA (2026-10-03).
 *
 * Quando um admin dá a conversa a um vendedor dentro do Chatwoot, o lead
 * vinculado ganha esse vendedor como responsável. A régua (quem pode dar, quem
 * pode receber) se prova em `atribuicao-do-chatwoot.test.ts`; aqui se trava a
 * FIAÇÃO:
 *   - o evento que diz que o responsável mudou faz a rota ler a nota na
 *     conversa e trocar o dono do lead;
 *   - o que a régua recusa não escreve nada;
 *   - o mesmo nome não gera escrita;
 *   - Chatwoot fora do ar, sem token ou com nota de outra atribuição: nada
 *     muda e a resposta continua 200;
 *   - o rastro diz que foi um admin, pelo Chatwoot, e não o motor.
 *
 * Banco em memória e Chatwoot falso (o `fetch` global), como em
 * `leads-etiquetas-rotas.test.ts`: a rota é chamada de verdade, com as funções
 * de `lib/` que ela usa. O gatilho de `leads` é simulado no `update`: com a
 * chave de serviço ele escreve a troca como `transferencia` automática.
 */

type Linha = Record<string, unknown>;

let banco: Record<string, Linha[]>;
let falhas: Record<string, { message: string } | undefined>;
let gravacoes: string[];
let proximoId = 1;

function consulta(tabela: string) {
  const filtros: Array<(l: Linha) => boolean> = [];
  let atualizacao: Linha | null = null;
  let insercao: Linha | null = null;
  const linhas = () => (banco[tabela] ?? []).filter((l) => filtros.every((f) => f(l)));
  const executar = async () => {
    const falha = falhas[tabela];
    if (falha) return { data: null, error: falha };
    if (insercao) {
      const nova = { id: `${tabela}-${proximoId++}`, criado_em: new Date().toISOString(), ...insercao };
      (banco[tabela] ??= []).push(nova);
      gravacoes.push(`insert ${tabela}`);
      return { data: [nova], error: null };
    }
    if (atualizacao) {
      for (const l of linhas()) {
        // O gatilho de `leads`, com a chave de serviço (`auth.uid()` nulo).
        if (tabela === "leads" && "responsavel" in atualizacao && atualizacao.responsavel !== l.responsavel) {
          (banco.leads_eventos ??= []).push({
            id: `ev-${proximoId++}`,
            lead_id: l.id,
            tipo: "transferencia",
            de: l.responsavel ?? null,
            para: atualizacao.responsavel,
            autor: null,
            automatico: true,
            detalhe: null,
            criado_em: new Date().toISOString(),
          });
          l.responsavel_desde = new Date().toISOString();
        }
        Object.assign(l, atualizacao);
      }
      gravacoes.push(`update ${tabela}`);
      return { data: null, error: null };
    }
    return { data: linhas(), error: null };
  };
  const q = {
    select: () => q,
    order: () => q,
    limit: () => q,
    eq: (coluna: string, valor: unknown) => {
      filtros.push((l) => l[coluna] === valor);
      return q;
    },
    gte: (coluna: string, valor: string) => {
      filtros.push((l) => String(l[coluna]) >= valor);
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
      atualizacao = campos;
      return q;
    },
    insert: (campos: Linha) => {
      insercao = campos;
      return q;
    },
    single: async () => {
      const r = await executar();
      return { data: (r.data as Linha[] | null)?.[0] ?? null, error: r.error };
    },
    maybeSingle: async () => {
      const r = await executar();
      return { data: (r.data as Linha[] | null)?.[0] ?? null, error: r.error };
    },
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => executar().then(ok, erro),
  };
  return q;
}

const CLIENTE = {
  from: (tabela: string) => consulta(tabela),
  rpc: async () => ({ data: null, error: null }),
};
vi.mock("../src/lib/supabase-server", () => ({ createAdminSupabaseClient: () => CLIENTE }));

const rota = await import("../src/app/api/chatwoot/eventos/route");

// ----------------------------------------------------------------------------
// O Chatwoot falso
// ----------------------------------------------------------------------------

/** As mensagens da conversa 412, como a API as devolve. */
let mensagens: Linha[];
/** O que a segunda leitura devolve, quando difere da primeira. */
let mensagensDepois: Linha[] | null;
let statusDoChatwoot: number | null;
const chamadas: Array<{ url: string; token: string | null }> = [];

async function chatwootFalso(url: string, init?: RequestInit): Promise<Response> {
  const cabecalhos = new Headers(init?.headers);
  chamadas.push({ url, token: cabecalhos.get("api_access_token") });
  if (statusDoChatwoot) return new Response("{}", { status: statusDoChatwoot });
  if (!/\/conversations\/412\/messages$/.test(url)) return new Response("{}", { status: 404 });
  const lista = chamadas.length > 1 && mensagensDepois ? mensagensDepois : mensagens;
  return Response.json({ meta: {}, payload: lista });
}

const NOTA_DE_ONTEM = Math.floor(Date.parse("2026-10-02T09:00:00Z") / 1000);
const NOTA_DE_HOJE = Math.floor(Date.parse("2026-10-03T12:00:00Z") / 1000);

const atividade = (content: string, created_at = NOTA_DE_HOJE) => ({ message_type: 2, content, created_at });

beforeEach(() => {
  falhas = {};
  gravacoes = [];
  chamadas.length = 0;
  statusDoChatwoot = null;
  mensagensDepois = null;
  mensagens = [
    { message_type: 0, content: "Oi, tem o Onix?", created_at: NOTA_DE_ONTEM },
    atividade("Atribuído a Rodrigo Naumowicz por Dyones Oliveira"),
  ];
  banco = {
    profiles: [
      { full_name: "Dyones Oliveira", email: "dyones@painel.com", papeis: ["admin", "comercial"], is_active: true },
      { full_name: "Rodrigo Naumowicz", email: "rodrigo@painel.com", papeis: ["comercial"], is_active: true },
      { full_name: "Ana Lima", email: "ana@painel.com", papeis: ["comercial"], is_active: true },
      { full_name: "Mari Marketing", email: "mari@painel.com", papeis: ["marketing"], is_active: true },
    ],
    leads: [
      {
        id: "lead-1",
        nome: "Fulano",
        telefone: "5541999990000",
        desfecho: null,
        responsavel: "Ana Lima",
        responsavel_desde: "2026-10-01T10:00:00Z",
        alertado_em: "2026-10-02T10:00:00Z",
        created_at: "2026-10-01T10:00:00Z",
      },
    ],
    atendimentos: [{ id: "at-1", lead_id: "lead-1", chatwoot_conversation_id: 412 }],
    leads_eventos: [],
  };
  vi.stubGlobal("fetch", vi.fn(chatwootFalso));
  vi.stubEnv("CHATWOOT_WEBHOOK_TOKEN", "segredo-do-webhook");
  vi.stubEnv("NEXT_PUBLIC_CHATWOOT_URL", "https://chat.exemplo.com.br");
  vi.stubEnv("NEXT_PUBLIC_CHATWOOT_CONTA_ID", "3");
  vi.stubEnv("CHATWOOT_API_TOKEN", "tok-123");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const conversa = (responsavel: Linha | null = { id: 5, name: "Rodrigo Naumowicz", email: "rodrigo@chatwoot.com" }) => ({
  id: 412,
  status: "open",
  inbox_id: 11,
  meta: {
    sender: { id: 88, name: "Fulano", phone_number: "+5541999990000" },
    ...(responsavel ? { assignee: responsavel } : {}),
  },
});

const atribuiu = (extra: Linha = {}) => ({
  event: "conversation_updated",
  ...conversa(),
  changed_attributes: [{ assignee_id: { previous_value: null, current_value: 5 } }],
  ...extra,
});

async function entregar(corpo: unknown) {
  const r = await rota.POST(
    new Request("http://x/api/chatwoot/eventos", {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json", Authorization: "Bearer segredo-do-webhook" },
    }),
  );
  return { status: r.status, corpo: (await r.json()) as Linha };
}

const lead = () => banco.leads[0];
const trocasDeDono = () => gravacoes.filter((g) => g === "update leads").length;

// ----------------------------------------------------------------------------

describe("o admin atribui no Chatwoot e o lead muda de dono", () => {
  it("lê a nota na conversa e grava o vendedor como responsável", async () => {
    const { status, corpo } = await entregar(atribuiu());

    expect(status).toBe(200);
    expect(corpo.acao).toBe("responsavel_atribuido");
    expect(lead().responsavel).toBe("Rodrigo Naumowicz");
    expect(chamadas).toEqual([
      { url: "https://chat.exemplo.com.br/api/v1/accounts/3/conversations/412/messages", token: "tok-123" },
    ]);
  });

  it("o vendedor recebe o lead com o prazo novo, como na troca pelo painel", async () => {
    await entregar(atribuiu());
    expect(lead().alertado_em).toBeNull();
    expect(typeof lead().ultimo_contato_em).toBe("string");
  });

  it("o rastro diz que foi o admin, pelo Chatwoot, e não o motor", async () => {
    await entregar(atribuiu());

    expect(banco.leads_eventos).toHaveLength(1);
    expect(banco.leads_eventos[0]).toMatchObject({
      lead_id: "lead-1",
      tipo: "responsavel",
      de: "Ana Lima",
      para: "Rodrigo Naumowicz",
      autor: "Dyones Oliveira",
      automatico: false,
      detalhe: { origem: "chatwoot", conversa: 412, nota: "atribuida" },
    });
  });

  it("não reescreve a transferência antiga que o motor fez para a mesma pessoa", async () => {
    banco.leads_eventos.push({
      id: "ev-antigo",
      lead_id: "lead-1",
      tipo: "transferencia",
      de: "Ana Lima",
      para: "Rodrigo Naumowicz",
      autor: null,
      automatico: true,
      criado_em: "2026-09-20T10:00:00.000Z",
    });
    await entregar(atribuiu());

    expect(banco.leads_eventos.find((e) => e.id === "ev-antigo")).toMatchObject({
      tipo: "transferencia",
      automatico: true,
    });
    expect(banco.leads_eventos.filter((e) => e.tipo === "responsavel")).toHaveLength(1);
  });

  it("sem `changed_attributes`, o evento que carrega um responsável basta", async () => {
    const { corpo } = await entregar(atribuiu({ changed_attributes: undefined }));
    expect(corpo.acao).toBe("responsavel_atribuido");
    expect(lead().responsavel).toBe("Rodrigo Naumowicz");
  });

  it("a nota que vem no próprio evento dispensa a ida ao Chatwoot", async () => {
    const { corpo } = await entregar({
      event: "message_created",
      message_type: "activity",
      content: "Atribuído a Rodrigo Naumowicz por Dyones Oliveira",
      created_at: NOTA_DE_HOJE,
      conversation: conversa(),
    });

    expect(corpo.acao).toBe("responsavel_atribuido");
    expect(lead().responsavel).toBe("Rodrigo Naumowicz");
    expect(chamadas).toHaveLength(0);
  });

  it("admin que também é Comercial pega a conversa para si", async () => {
    mensagens = [atividade("Dyones Oliveira atribuiu a si mesmo essa conversa")];
    await entregar(atribuiu(conversa({ id: 1, name: "Dyones Oliveira", email: "dyones@chatwoot.com" })));
    expect(lead().responsavel).toBe("Dyones Oliveira");
  });

  it("entregue duas vezes, grava uma vez só", async () => {
    await entregar(atribuiu());
    const { corpo } = await entregar(atribuiu());

    expect(trocasDeDono()).toBe(1);
    expect(banco.leads_eventos).toHaveLength(1);
    expect(corpo.acao).toBe("atendimento_vinculado");
    expect(corpo.detalhe).toContain("ja-e-o-responsavel");
  });
});

describe("o que não muda o dono do lead", () => {
  async function semEfeito(motivo: string | RegExp) {
    const { status, corpo } = await entregar(atribuiu());
    expect(status).toBe(200);
    expect(corpo.ok).toBe(true);
    expect(corpo.acao).toBe("atendimento_vinculado");
    expect(String(corpo.detalhe)).toMatch(motivo);
    expect(lead().responsavel).toBe("Ana Lima");
    expect(trocasDeDono()).toBe(0);
    expect(banco.leads_eventos).toHaveLength(0);
  }

  it("atribuição feita por quem não é admin", async () => {
    mensagens = [atividade("Atribuído a Rodrigo Naumowicz por Ana Lima")];
    await semEfeito("autor-nao-e-admin");
  });

  it("atribuição feita por automação", async () => {
    mensagens = [atividade("Atribuído a Rodrigo Naumowicz por Automation System")];
    await semEfeito("autor-nao-e-admin");
  });

  it("atribuição a quem não é do Comercial", async () => {
    mensagens = [atividade("Atribuído a Mari Marketing por Dyones Oliveira")];
    const { corpo } = await entregar(atribuiu(conversa({ id: 9, name: "Mari Marketing" })));
    expect(String(corpo.detalhe)).toContain("destino-nao-e-comercial");
    expect(lead().responsavel).toBe("Ana Lima");
    expect(trocasDeDono()).toBe(0);
  });

  it("vendedor inativo não recebe", async () => {
    banco.profiles[1].is_active = false;
    await semEfeito("destino-nao-e-comercial");
  });

  it("a nota mais recente é de OUTRA pessoa que a do evento", async () => {
    // O evento diz Rodrigo; a conversa só tem a nota antiga, para a Ana.
    mensagens = [atividade("Atribuído a Ana Lima por Dyones Oliveira", NOTA_DE_ONTEM)];
    vi.useFakeTimers();
    const entrega = semEfeito(/não é do responsável atual/);
    await vi.runAllTimersAsync();
    await entrega;
    // Evento explícito: leu, esperou e leu de novo, uma vez só.
    expect(chamadas).toHaveLength(2);
  });

  it("a remoção", async () => {
    mensagens = [atividade("Conversa desatribuída por Dyones Oliveira")];
    const { corpo } = await entregar(
      atribuiu({
        ...conversa(null),
        changed_attributes: [{ assignee_id: { previous_value: 5, current_value: null } }],
      }),
    );
    expect(String(corpo.detalhe)).toContain("remocao");
    expect(lead().responsavel).toBe("Ana Lima");
    expect(trocasDeDono()).toBe(0);
  });

  it("a nota velha não desfaz a troca que o painel fez depois", async () => {
    // O painel devolveu o lead à Ana DEPOIS da nota; um evento sem
    // `changed_attributes` relê a mesma nota e não pode reaplicá-la.
    lead().responsavel_desde = "2026-10-03T15:00:00Z";
    const { corpo } = await entregar(atribuiu({ changed_attributes: undefined }));
    expect(String(corpo.detalhe)).toContain("nota-anterior-a-ultima-troca");
    expect(lead().responsavel).toBe("Ana Lima");
    expect(trocasDeDono()).toBe(0);
  });

  it("`conversation_updated` de outra coisa nem vai ao Chatwoot", async () => {
    const { corpo } = await entregar(
      atribuiu({ changed_attributes: [{ label_list: { previous_value: [], current_value: ["x"] } }] }),
    );
    expect(corpo.acao).toBe("atendimento_vinculado");
    expect(chamadas).toHaveLength(0);
    expect(lead().responsavel).toBe("Ana Lima");
  });

  it("conversa sem lead vinculado nem vai ao Chatwoot", async () => {
    banco.leads = [];
    banco.atendimentos = [];
    const { status, corpo } = await entregar(atribuiu());
    expect(status).toBe(200);
    expect(corpo.acao).toBe("atendimento_sem_lead");
    expect(chamadas).toHaveLength(0);
  });
});

describe("o Chatwoot falhando não vira erro para o Chatwoot", () => {
  it("API fora do ar: 200, nada muda, motivo na resposta", async () => {
    statusDoChatwoot = 500;
    const { status, corpo } = await entregar(atribuiu());
    expect(status).toBe(200);
    expect(corpo.ok).toBe(true);
    expect(String(corpo.detalhe)).toContain("respondeu 500");
    expect(lead().responsavel).toBe("Ana Lima");
  });

  it("sem conexão: 200, nada muda", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const { status, corpo } = await entregar(atribuiu());
    expect(status).toBe(200);
    expect(String(corpo.detalhe)).toContain("sem conexão");
    expect(lead().responsavel).toBe("Ana Lima");
  });

  it("sem CHATWOOT_API_TOKEN: 200, nada muda, nenhuma chamada", async () => {
    vi.stubEnv("CHATWOOT_API_TOKEN", "");
    const { status, corpo } = await entregar(atribuiu());
    expect(status).toBe(200);
    expect(String(corpo.detalhe)).toContain("chatwoot-nao-configurado");
    expect(chamadas).toHaveLength(0);
    expect(lead().responsavel).toBe("Ana Lima");
  });

  it("perfis ilegíveis: 200, nada muda", async () => {
    falhas.profiles = { message: "banco fora" };
    const { status, corpo } = await entregar(atribuiu());
    expect(status).toBe(200);
    expect(String(corpo.detalhe)).toContain("perfis ilegíveis");
    expect(lead().responsavel).toBe("Ana Lima");
  });

  it("a nota que ainda não tinha chegado aparece na segunda leitura", async () => {
    mensagens = [{ message_type: 0, content: "Oi", created_at: NOTA_DE_ONTEM }];
    mensagensDepois = [atividade("Atribuído a Rodrigo Naumowicz por Dyones Oliveira")];
    vi.useFakeTimers();
    const entrega = entregar(atribuiu());
    await vi.runAllTimersAsync();
    const { corpo } = await entrega;

    expect(chamadas).toHaveLength(2);
    expect(corpo.acao).toBe("responsavel_atribuido");
    expect(lead().responsavel).toBe("Rodrigo Naumowicz");
  });

  it("token errado continua sendo 401", async () => {
    const r = await rota.POST(
      new Request("http://x/api/chatwoot/eventos", { method: "POST", body: JSON.stringify(atribuiu()) }),
    );
    expect(r.status).toBe(401);
    expect(trocasDeDono()).toBe(0);
  });
});
