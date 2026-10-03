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
 *   - o rastro diz que foi um admin, pelo Chatwoot, e não o motor;
 *   - o que a revisão de 03/10 cobrou: e-mail não passa por cima do nome da
 *     nota, texto de nota escrito por gente não atribui nada, nota velha não
 *     cai em lead novo, duas entregas juntas gravam uma vez, o autor é
 *     conferido na lista de agentes, e o passo inteiro cabe no prazo.
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
/** Roda logo depois de a rota LER o lead: é onde outra entrega ganha a corrida. */
let depoisDeLerOLead: (() => void) | null;
/** O gatilho de `leads` escreve o rastro? Desligado, a rota é quem insere. */
let gatilhoEscreve: boolean;

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
      const alcancadas = linhas();
      for (const l of alcancadas) {
        // O gatilho de `leads`, com a chave de serviço (`auth.uid()` nulo).
        if (
          gatilhoEscreve &&
          tabela === "leads" &&
          "responsavel" in atualizacao &&
          atualizacao.responsavel !== l.responsavel
        ) {
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
      return { data: alcancadas, error: null };
    }
    const lidas = linhas().map((l) => ({ ...l }));
    if (tabela === "leads" && colunas.includes("responsavel_desde") && depoisDeLerOLead) {
      const gancho = depoisDeLerOLead;
      depoisDeLerOLead = null;
      gancho();
    }
    return { data: lidas, error: null };
  };
  let colunas = "";
  const q = {
    select: (quais = "") => {
      colunas = quais;
      return q;
    },
    order: () => q,
    limit: () => q,
    eq: (coluna: string, valor: unknown) => {
      // `detalhe->>origem`, como o PostgREST lê um campo de jsonb.
      const [raiz, campo] = coluna.split("->>");
      filtros.push((l) =>
        campo === undefined ? l[coluna] === valor : (l[raiz] as Linha | null | undefined)?.[campo] === valor,
      );
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
let agentes: Linha[];
let statusDoChatwoot: number | null;
let statusDosAgentes: number | null;
/** O Chatwoot não responde: a chamada só termina quando o prazo dela estoura. */
let chatwootMudo: boolean;
const chamadas: Array<{ url: string; token: string | null }> = [];
const leituras = () => chamadas.filter((c) => c.url.endsWith("/messages"));
const consultasDeAgentes = () => chamadas.filter((c) => c.url.endsWith("/agents"));

async function chatwootFalso(url: string, init?: RequestInit): Promise<Response> {
  const cabecalhos = new Headers(init?.headers);
  chamadas.push({ url, token: cabecalhos.get("api_access_token") });
  if (chatwootMudo) {
    return new Promise<Response>((_, recusar) => {
      const sinal = init?.signal;
      sinal?.addEventListener("abort", () => recusar(sinal.reason));
    });
  }
  if (url.endsWith("/accounts/3/agents")) {
    if (statusDosAgentes) return new Response("{}", { status: statusDosAgentes });
    return Response.json(agentes);
  }
  if (statusDoChatwoot) return new Response("{}", { status: statusDoChatwoot });
  if (!/\/conversations\/412\/messages$/.test(url)) return new Response("{}", { status: 404 });
  const lista = leituras().length > 1 && mensagensDepois ? mensagensDepois : mensagens;
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
  statusDosAgentes = null;
  chatwootMudo = false;
  depoisDeLerOLead = null;
  gatilhoEscreve = true;
  mensagensDepois = null;
  agentes = [
    { id: 1, name: "Dyones Oliveira", email: "dyones@chatwoot.com", role: "administrator" },
    { id: 5, name: "Rodrigo Naumowicz", email: "rodrigo@chatwoot.com", role: "agent" },
    { id: 6, name: "Ana Lima", email: "ana@painel.com", role: "agent" },
    { id: 9, name: "Mari Marketing", email: "mari@painel.com", role: "agent" },
  ];
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
    expect(chamadas).toHaveLength(2);
    expect(chamadas).toEqual(
      expect.arrayContaining([
        { url: "https://chat.exemplo.com.br/api/v1/accounts/3/conversations/412/messages", token: "tok-123" },
        { url: "https://chat.exemplo.com.br/api/v1/accounts/3/agents", token: "tok-123" },
      ]),
    );
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

  it("a nota que vem no próprio evento dispensa ler as mensagens, não os agentes", async () => {
    const { corpo } = await entregar({
      event: "message_created",
      message_type: "activity",
      content: "Atribuído a Rodrigo Naumowicz por Dyones Oliveira",
      created_at: NOTA_DE_HOJE,
      conversation: conversa(),
    });

    expect(corpo.acao).toBe("responsavel_atribuido");
    expect(lead().responsavel).toBe("Rodrigo Naumowicz");
    expect(leituras()).toHaveLength(0);
    expect(consultasDeAgentes()).toHaveLength(1);
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
    expect(leituras()).toHaveLength(2);
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

    expect(leituras()).toHaveLength(2);
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

/**
 * O defeito bloqueante da revisão: a nota de TIME chega com o e-mail de quem o
 * Chatwoot sorteou dentro do time. O admin nomeou o time, não a pessoa.
 */
describe("o e-mail do evento não passa por cima do nome da nota", () => {
  const doRodrigo = { id: 5, name: "Rodrigo Naumowicz", email: "rodrigo@painel.com" };

  it("nota de time lida na conversa, com o e-mail do vendedor no evento: nada muda", async () => {
    mensagens = [atividade("Atribuído a Comercial por Dyones Oliveira")];
    vi.useFakeTimers();
    const entrega = entregar(atribuiu(conversa(doRodrigo)));
    await vi.runAllTimersAsync();
    const { status, corpo } = await entrega;

    expect(status).toBe(200);
    expect(String(corpo.detalhe)).toMatch(/não é do responsável atual/);
    expect(lead().responsavel).toBe("Ana Lima");
    expect(trocasDeDono()).toBe(0);
  });

  it("nota de time que vem NO evento, com o vendedor como responsável: nada muda", async () => {
    const { corpo } = await entregar({
      event: "message_created",
      message_type: "activity",
      content: "Atribuído a Comercial por Dyones Oliveira",
      created_at: NOTA_DE_HOJE,
      conversation: conversa(doRodrigo),
    });

    expect(String(corpo.detalhe)).toMatch(/não é do responsável atual/);
    expect(lead().responsavel).toBe("Ana Lima");
    expect(chamadas).toHaveLength(0);
  });

  it("nota de time sem responsável no evento: o time não é perfil de ninguém", async () => {
    const { corpo } = await entregar({
      event: "message_created",
      message_type: "activity",
      content: "Atribuído a Comercial por Dyones Oliveira",
      created_at: NOTA_DE_HOJE,
      conversation: conversa(null),
    });
    expect(String(corpo.detalhe)).toContain("destino-nao-e-comercial");
    expect(lead().responsavel).toBe("Ana Lima");
  });
});

/**
 * Só a mensagem de ATIVIDADE é nota. A mesma frase digitada por alguém, de
 * qualquer lado, é só texto.
 */
describe("texto de nota escrito por gente não atribui nada", () => {
  const FRASE = "Atribuído a Rodrigo Naumowicz por Dyones Oliveira";

  it("o cliente escrevendo a frase", async () => {
    const { corpo } = await entregar({
      event: "message_created",
      message_type: "incoming",
      content: FRASE,
      conversation: conversa(),
      sender: { id: 88, name: "Fulano", phone_number: "+5541999990000", type: "contact" },
    });
    expect(corpo.acao).toBe("atendimento_vinculado");
    expect(lead().responsavel).toBe("Ana Lima");
    expect(chamadas).toHaveLength(0);
  });

  it("o consultor respondendo com a frase", async () => {
    const { corpo } = await entregar({
      event: "message_created",
      message_type: "outgoing",
      content: FRASE,
      conversation: conversa(),
      sender: { id: 6, name: "Ana Lima", type: "user" },
    });
    expect(corpo.acao).toBe("contato_registrado");
    expect(lead().responsavel).toBe("Ana Lima");
    expect(chamadas).toHaveLength(0);
  });

  it("a nota privada com a frase", async () => {
    const { corpo } = await entregar({
      event: "message_created",
      message_type: "outgoing",
      private: true,
      content: FRASE,
      conversation: conversa(),
      sender: { id: 6, name: "Ana Lima", type: "user" },
    });
    expect(corpo.acao).toBe("contato_registrado");
    expect(lead().responsavel).toBe("Ana Lima");
    expect(chamadas).toHaveLength(0);
  });

  it("na conversa lida pela API, só a atividade conta", async () => {
    mensagens = [
      { message_type: 0, content: FRASE, created_at: NOTA_DE_HOJE },
      { message_type: 1, content: FRASE, created_at: NOTA_DE_HOJE },
      { message_type: 1, private: true, content: FRASE, created_at: NOTA_DE_HOJE },
    ];
    vi.useFakeTimers();
    const entrega = entregar(atribuiu());
    await vi.runAllTimersAsync();
    const { corpo } = await entrega;

    expect(String(corpo.detalhe)).toContain("não tem nota de atribuição");
    expect(lead().responsavel).toBe("Ana Lima");
    expect(trocasDeDono()).toBe(0);
  });
});

/**
 * O nome da nota é nome de exibição, que o agente edita. A rota confere o
 * autor na lista de agentes do Chatwoot, e sem a lista não age.
 */
describe("o autor é conferido na lista de agentes do Chatwoot", () => {
  async function recusa(motivo: string | RegExp) {
    const { status, corpo } = await entregar(atribuiu());
    expect(status).toBe(200);
    expect(String(corpo.detalhe)).toMatch(motivo);
    expect(lead().responsavel).toBe("Ana Lima");
    expect(trocasDeDono()).toBe(0);
    expect(banco.leads_eventos).toHaveLength(0);
  }

  it("vendedor que se renomeou para o nome do admin: dois agentes com o nome, recusa", async () => {
    agentes.push({ id: 7, name: "Dyones Oliveira", email: "esperto@chatwoot.com", role: "agent" });
    await recusa("nome-ambiguo");
  });

  it("autor que no Chatwoot não é administrador: recusa", async () => {
    agentes[0].role = "agent";
    await recusa("autor-nao-e-admin");
  });

  it("lista de agentes fora do ar: recusa, com o motivo", async () => {
    statusDosAgentes = 403;
    await recusa(/agentes do Chatwoot ilegíveis.*403/);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Agentes não lidos"), expect.anything());
  });

  it("vale também para a nota que vem no próprio evento", async () => {
    statusDosAgentes = 500;
    const { corpo } = await entregar({
      event: "message_created",
      message_type: 2,
      content: "Atribuído a Rodrigo Naumowicz por Dyones Oliveira",
      created_at: NOTA_DE_HOJE,
      conversation: conversa(),
    });
    expect(String(corpo.detalhe)).toContain("agentes do Chatwoot ilegíveis");
    expect(lead().responsavel).toBe("Ana Lima");
  });
});

/**
 * Conversa reaberta: o negócio antigo foi encerrado, o cliente voltou a
 * escrever na mesma conversa e nasceu um lead NOVO. A nota de atribuição da
 * conversa é do negócio antigo.
 */
describe("a nota velha não cai num lead novo", () => {
  beforeEach(() => {
    mensagens = [atividade("Atribuído a Rodrigo Naumowicz por Dyones Oliveira", NOTA_DE_ONTEM)];
    Object.assign(lead(), {
      responsavel: null,
      responsavel_desde: null,
      created_at: "2026-10-03T08:00:00Z",
    });
  });

  it("evento sem `changed_attributes`: o lead novo fica sem dono", async () => {
    const { status, corpo } = await entregar(atribuiu({ changed_attributes: undefined }));
    expect(status).toBe(200);
    expect(String(corpo.detalhe)).toContain("nota-anterior-ao-lead");
    expect(lead().responsavel).toBeNull();
    expect(trocasDeDono()).toBe(0);
  });

  it("`changed_attributes` nulo conta como ausente", async () => {
    const { corpo } = await entregar(atribuiu({ changed_attributes: null }));
    expect(String(corpo.detalhe)).toContain("nota-anterior-ao-lead");
    expect(lead().responsavel).toBeNull();
  });

  it("nota sem data, em evento que só carrega um responsável: recusa", async () => {
    mensagens = [{ message_type: 2, content: "Atribuído a Rodrigo Naumowicz por Dyones Oliveira" }];
    const { corpo } = await entregar(atribuiu({ changed_attributes: undefined }));
    expect(String(corpo.detalhe)).toContain("nota-sem-data");
    expect(lead().responsavel).toBeNull();
  });

  it("lead sem dono recebe a nota NOVA (a condição da gravação é `is null`)", async () => {
    mensagens = [atividade("Atribuído a Rodrigo Naumowicz por Dyones Oliveira", NOTA_DE_HOJE)];
    const { corpo } = await entregar(atribuiu({ changed_attributes: undefined }));
    expect(corpo.acao).toBe("responsavel_atribuido");
    expect(lead().responsavel).toBe("Rodrigo Naumowicz");
    expect(banco.leads_eventos[0]).toMatchObject({ tipo: "responsavel", de: null, autor: "Dyones Oliveira" });
  });
});

describe("duas entregas ao mesmo tempo", () => {
  it("juntas, gravam uma vez e deixam uma linha no rastro", async () => {
    const [a, b] = await Promise.all([entregar(atribuiu()), entregar(atribuiu())]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect([a.corpo.acao, b.corpo.acao].filter((x) => x === "responsavel_atribuido")).toHaveLength(1);
    expect(lead().responsavel).toBe("Rodrigo Naumowicz");
    expect(banco.leads_eventos).toHaveLength(1);
    expect(banco.leads_eventos[0]).toMatchObject({ tipo: "responsavel", autor: "Dyones Oliveira" });
  });

  it("o dono mudou entre a leitura e a gravação: não grava e não toca o rastro", async () => {
    // O painel devolve o lead a outra pessoa depois de a rota já tê-lo lido.
    depoisDeLerOLead = () => {
      lead().responsavel = "Dyones Oliveira";
    };
    const { status, corpo } = await entregar(atribuiu());

    expect(status).toBe(200);
    expect(String(corpo.detalhe)).toContain("responsavel-mudou-durante-a-troca");
    expect(lead().responsavel).toBe("Dyones Oliveira");
    expect(banco.leads_eventos).toHaveLength(0);
  });

  it("sem a linha do gatilho, insere a do Chatwoot uma vez", async () => {
    gatilhoEscreve = false;
    await entregar(atribuiu());
    expect(banco.leads_eventos).toHaveLength(1);
    expect(banco.leads_eventos[0]).toMatchObject({
      lead_id: "lead-1",
      tipo: "responsavel",
      de: "Ana Lima",
      para: "Rodrigo Naumowicz",
      autor: "Dyones Oliveira",
      automatico: false,
      detalhe: { origem: "chatwoot", nota: "atribuida" },
    });
  });

  it("sem a linha do gatilho, não insere em dobro a que outra entrega já escreveu", async () => {
    gatilhoEscreve = false;
    banco.leads_eventos.push({
      id: "ev-da-outra",
      lead_id: "lead-1",
      tipo: "responsavel",
      para: "Rodrigo Naumowicz",
      autor: "Dyones Oliveira",
      automatico: false,
      detalhe: { origem: "chatwoot", conversa: 412, nota: "atribuida" },
      criado_em: new Date().toISOString(),
    });
    const { corpo } = await entregar(atribuiu());

    expect(corpo.acao).toBe("responsavel_atribuido");
    expect(banco.leads_eventos).toHaveLength(1);
  });
});

/**
 * O passo inteiro acontece dentro da resposta ao webhook. Relógio de verdade
 * aqui: o prazo é do `AbortSignal`, que os temporizadores falsos não alcançam.
 */
describe("o passo da atribuição cabe no prazo", () => {
  it("Chatwoot que não responde: 200 em menos de 4 s, nada muda", async () => {
    chatwootMudo = true;
    const inicio = Date.now();
    const { status, corpo } = await entregar(atribuiu());
    const gasto = Date.now() - inicio;

    expect(status).toBe(200);
    expect(corpo.ok).toBe(true);
    expect(String(corpo.detalhe)).toContain("não respondeu a tempo");
    expect(gasto).toBeLessThan(4000);
    // Estourou o prazo da primeira leitura: não há segunda.
    expect(leituras()).toHaveLength(1);
    expect(lead().responsavel).toBe("Ana Lima");
    expect(trocasDeDono()).toBe(0);
  });

  it("Chatwoot que emudece na SEGUNDA leitura: ainda 200 em menos de 4 s", async () => {
    mensagens = [{ message_type: 0, content: "Oi", created_at: NOTA_DE_ONTEM }];
    const fetchDeAntes = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (leituras().length >= 1 && url.endsWith("/messages")) chatwootMudo = true;
        return fetchDeAntes(url, init);
      }),
    );
    const inicio = Date.now();
    const { status, corpo } = await entregar(atribuiu());
    const gasto = Date.now() - inicio;

    expect(status).toBe(200);
    expect(String(corpo.detalhe)).toContain("não respondeu a tempo");
    expect(leituras()).toHaveLength(2);
    expect(gasto).toBeLessThan(4000);
    expect(lead().responsavel).toBe("Ana Lima");
  });
});
