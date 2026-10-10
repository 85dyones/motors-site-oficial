import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ETAPAS_PADRAO } from "../src/lib/funil";
import {
  AVISO_DE_CONVERSA_COM_O_DONO_ANTIGO,
  agenteDoResponsavel,
  atribuirConversasDaFila,
  conversasAbertasPorLead,
} from "../src/lib/donoDaConversa";

/**
 * O dono do lead vira o dono da conversa no Chatwoot (2026-10-10).
 *
 * Relato do dono: *"as conversas sobre responsabilidade do Rodrigo não
 * aparecem pra ele"* — no Chatwoot —, e depois: *"o painel precisa
 * atribuir"*. A conversa 460 era de um lead do Rodrigo no painel e seguia
 * atribuída ao Dyones no Chatwoot. O que este arquivo segura:
 *   - quem é o agente: o de nome igual ao do responsável, e só se for um;
 *   - o PATCH de `/api/leads/gerenciar`, EXECUTADO: trocar o dono atribui as
 *     conversas abertas do lead ao agente do novo dono; o Chatwoot que falha
 *     não desfaz a troca, e a tela recebe o aviso;
 *   - a fila do funil, EXECUTADA: no modo reservado, o lead que o rodízio
 *     passou de mão leva as conversas junto; a prévia não fala com o Chatwoot.
 *
 * Um banco em memória para as duas rotas, e um Chatwoot falso no `fetch`.
 */

type Linha = Record<string, unknown>;

let banco: Record<string, Linha[]>;
let falhas: Record<string, { message: string; code?: string } | undefined>;
let fila: Linha[];
let pedidosDaFila: Linha[];
let autor: { role: string; papeis: string[]; full_name: string };
/** Roda logo antes de a rota gravar em `leads`: é onde o lead muda de dono no meio. */
let aoGravarOLead: (() => void) | null;

function consulta(tabela: string) {
  const filtros: Array<(l: Linha) => boolean> = [];
  let atualizacao: Linha | null = null;
  const executar = async () => {
    const falha = falhas[tabela];
    if (falha) return { data: null, error: falha };
    if (!(tabela in banco)) return { data: null, error: { message: `sem ${tabela}`, code: "42P01" } };
    if (atualizacao && tabela === "leads" && aoGravarOLead) {
      const gancho = aoGravarOLead;
      aoGravarOLead = null;
      gancho();
    }
    const alcancadas = banco[tabela].filter((l) => filtros.every((f) => f(l)));
    if (atualizacao) {
      for (const l of alcancadas) Object.assign(l, atualizacao);
      return { data: alcancadas, error: null };
    }
    return { data: alcancadas.map((l) => ({ ...l })), error: null };
  };
  const q = {
    select: () => q,
    order: () => q,
    limit: () => q,
    eq: (coluna: string, valor: unknown) => (filtros.push((l) => l[coluna] === valor), q),
    neq: (coluna: string, valor: unknown) => (filtros.push((l) => l[coluna] !== valor), q),
    not: (coluna: string, _operador: string, valor: unknown) => (filtros.push((l) => (l[coluna] ?? null) !== valor), q),
    is: (coluna: string, valor: unknown) => (filtros.push((l) => (l[coluna] ?? null) === valor), q),
    in: (coluna: string, valores: unknown[]) => (filtros.push((l) => valores.includes(l[coluna])), q),
    contains: (coluna: string, valores: unknown[]) => (
      filtros.push((l) => valores.every((v) => (l[coluna] as unknown[] | undefined)?.includes(v))),
      q
    ),
    update: (campos: Linha) => ((atualizacao = campos), q),
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
  auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  from: (tabela: string) => {
    // O perfil de quem chama (`eq("id")`) é o do teste; a equipe é a do banco.
    if (tabela === "profiles") {
      const q = consulta(tabela);
      const single = q.single;
      let deQuemChama = false;
      const eq = q.eq;
      q.eq = (coluna: string, valor: unknown) => {
        if (coluna === "id") {
          deQuemChama = true;
          return q;
        }
        return eq(coluna, valor);
      };
      q.single = async () => (deQuemChama ? { data: { is_active: true, ...autor }, error: null } : single());
      return q;
    }
    return consulta(tabela);
  },
  rpc: async (funcao: string, args: Linha) => {
    if (funcao === "montar_fila_do_funil") {
      pedidosDaFila.push(args);
      return { data: fila, error: null };
    }
    return { data: null, error: null };
  },
};
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => CLIENTE,
  createAdminSupabaseClient: () => CLIENTE,
}));
vi.mock("../src/lib/autorizacaoDoFunil", () => ({ autorizarFunil: async () => ({ erro: null }) }));
vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: { name: "Motors Store" } }),
}));

const { PATCH } = await import("../src/app/api/leads/gerenciar/route");
const alertas = await import("../src/app/api/funil/alertas/route");

// ----------------------------------------------------------------------------
// O Chatwoot falso
// ----------------------------------------------------------------------------

interface Chamada {
  url: string;
  metodo: string;
  token: string | null;
  corpo: Linha;
}
let chamadas: Chamada[];
/** Responde este status a tudo. */
let statusDoChatwoot: number | null;
/** Responde este status só às atribuições. */
let statusAoAtribuir: number | null;
let agentes: Linha[];

const DYONES = { id: 1, name: "Dyones Oliveira", available_name: "Dyones", role: "administrator" };
const RODRIGO = { id: 7, name: "Rodrigo Naumowicz", available_name: "Rodrigo", role: "agent" };
const BIA = { id: 8, name: "Bia Souza", available_name: "Bia", role: "agent" };

async function chatwootFalso(url: string, init?: RequestInit): Promise<Response> {
  chamadas.push({
    url,
    metodo: init?.method ?? "GET",
    token: new Headers(init?.headers).get("api_access_token"),
    corpo: init?.body ? (JSON.parse(String(init.body)) as Linha) : {},
  });
  if (statusDoChatwoot) return new Response("{}", { status: statusDoChatwoot });
  if (url.endsWith("/agents")) return Response.json(agentes);
  const atribuir = /\/conversations\/(\d+)\/assignments$/.exec(url);
  if (atribuir) {
    if (statusAoAtribuir) return new Response("{}", { status: statusAoAtribuir });
    const corpo = JSON.parse(String(init?.body)) as { assignee_id: number };
    return Response.json(agentes.find((a) => a.id === corpo.assignee_id) ?? {});
  }
  return new Response("{}", { status: 404 });
}

const RAIZ = "https://chat.exemplo.com.br/api/v1/accounts/3";
const atribuicoes = () =>
  chamadas
    .filter((c) => c.url.endsWith("/assignments"))
    .map((c) => ({ conversa: Number(c.url.split("/").at(-2)), agente: c.corpo.assignee_id }))
    .sort((a, b) => a.conversa - b.conversa);
const leiturasDosAgentes = () => chamadas.filter((c) => c.url === `${RAIZ}/agents`);

const ANA = { role: "comercial", papeis: ["comercial"], full_name: "Ana Lima" };

beforeEach(() => {
  falhas = {};
  chamadas = [];
  pedidosDaFila = [];
  statusDoChatwoot = null;
  statusAoAtribuir = null;
  aoGravarOLead = null;
  autor = ANA;
  agentes = [DYONES, RODRIGO, BIA];
  fila = [];
  banco = {
    profiles: [
      { full_name: "Ana Lima", role: "comercial", papeis: ["comercial"], is_active: true },
      { full_name: "Bia Souza", role: "comercial", papeis: ["comercial"], is_active: true },
      { full_name: "Rodrigo Naumowicz", role: "comercial", papeis: ["comercial"], is_active: true },
    ],
    funil_etapas: ETAPAS_PADRAO.map((e) => ({ ...e })),
    funil_motivos: [],
    leads: [
      {
        id: "lead-1",
        nome: "Fulano",
        telefone: "5541999990000",
        situacao: "proposta",
        canal: "WhatsApp",
        desfecho: null,
        responsavel: "Ana Lima",
      },
    ],
    atendimentos: [{ id: "at-1", lead_id: "lead-1", chatwoot_conversation_id: 412, status_conversa: "open" }],
    leads_eventos: [],
  };
  vi.stubGlobal("fetch", vi.fn(chatwootFalso));
  vi.stubEnv("NEXT_PUBLIC_CHATWOOT_URL", "https://chat.exemplo.com.br");
  vi.stubEnv("NEXT_PUBLIC_CHATWOOT_CONTA_ID", "3");
  vi.stubEnv("CHATWOOT_API_TOKEN", "tok-123");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function gravar(corpo: Linha, id = "lead-1") {
  const r = await PATCH(
    new Request("http://x/api/leads/gerenciar", {
      method: "PATCH",
      body: JSON.stringify({ id, ...corpo }),
      headers: { "content-type": "application/json" },
    }) as never,
  );
  return { status: r.status, corpo: (await r.json()) as Linha };
}

async function pedirAFila(reservar: boolean) {
  const r = await alertas.POST(
    new Request("https://motorsstore.com.br/api/funil/alertas", {
      method: "POST",
      body: JSON.stringify({ reservar }),
      headers: { "content-type": "application/json" },
    }),
  );
  return (await r.json()) as {
    fila: Array<{ lead_id: string; para: string }>;
    conversas_no_chatwoot?: { atribuidas: number; falhas: string[] };
  };
}

const lead = (id = "lead-1") => banco.leads.find((l) => l.id === id)!;

// ----------------------------------------------------------------------------

describe("quem é o agente do responsável", () => {
  it("é o de nome igual, pelo nome completo ou pelo nome de exibição", () => {
    expect(agenteDoResponsavel("Rodrigo Naumowicz", [DYONES, RODRIGO])).toEqual({ ok: true, valor: 7 });
    expect(agenteDoResponsavel("Rodrigo", [DYONES, RODRIGO])).toEqual({ ok: true, valor: 7 });
  });

  it("não liga para acento, caixa e espaço sobrando", () => {
    const joao = { id: 9, name: "João Antônio" };
    expect(agenteDoResponsavel("  joao antonio ", [joao])).toEqual({ ok: true, valor: 9 });
  });

  it("sem agente com esse nome: diz qual nome faltou", () => {
    expect(agenteDoResponsavel("Rodrigo Naumowicz", [DYONES])).toEqual({
      ok: false,
      motivo: 'nenhum agente do Chatwoot se chama "Rodrigo Naumowicz"',
    });
  });

  it("dois agentes com o mesmo nome não se desempatam: atribuir ao errado esconde a conversa", () => {
    const outro = { id: 12, name: "Rodrigo Naumowicz" };
    const r = agenteDoResponsavel("Rodrigo Naumowicz", [RODRIGO, outro]);
    expect(r.ok).toBe(false);
  });

  it("lead sem responsável e agente sem id não viram atribuição", () => {
    expect(agenteDoResponsavel("  ", [RODRIGO]).ok).toBe(false);
    expect(agenteDoResponsavel(null, [RODRIGO]).ok).toBe(false);
    expect(agenteDoResponsavel("Rodrigo Naumowicz", [{ name: "Rodrigo Naumowicz" }])).toEqual({
      ok: false,
      motivo: "o agente do Chatwoot veio sem id",
    });
  });
});

describe("as conversas abertas de cada lead", () => {
  it("deixam de fora a resolvida, a sem id e a repetida", () => {
    const mapa = conversasAbertasPorLead([
      { lead_id: "a", chatwoot_conversation_id: 460, status_conversa: "open" },
      { lead_id: "a", chatwoot_conversation_id: 460, status_conversa: "open" },
      { lead_id: "a", chatwoot_conversation_id: 300, status_conversa: "resolved" },
      { lead_id: "a", chatwoot_conversation_id: null, status_conversa: "open" },
      { lead_id: "a", chatwoot_conversation_id: 461, status_conversa: null },
      { lead_id: "b", chatwoot_conversation_id: "472", status_conversa: "pending" },
    ]);
    expect(Object.fromEntries(mapa)).toEqual({ a: [460, 461], b: [472] });
  });
});

describe("PATCH /api/leads/gerenciar: trocar o dono atribui a conversa", () => {
  it("passa a conversa aberta ao agente do novo dono, com o token do site", async () => {
    const { status, corpo } = await gravar({ responsavel: "Bia Souza" });
    expect(status).toBe(200);
    expect(corpo).toEqual({ ok: true });
    expect(lead().responsavel).toBe("Bia Souza");
    expect(atribuicoes()).toEqual([{ conversa: 412, agente: 8 }]);
    expect(chamadas.every((c) => c.token === "tok-123")).toBe(true);
    expect(chamadas.find((c) => c.url.endsWith("/assignments"))).toMatchObject({
      url: `${RAIZ}/conversations/412/assignments`,
      metodo: "POST",
    });
  });

  it("todas as abertas do lead; a resolvida e a de outro lead ficam como estão", async () => {
    banco.atendimentos.push(
      { id: "at-2", lead_id: "lead-1", chatwoot_conversation_id: 413, status_conversa: "open" },
      { id: "at-3", lead_id: "lead-1", chatwoot_conversation_id: 300, status_conversa: "resolved" },
      { id: "at-4", lead_id: "lead-2", chatwoot_conversation_id: 500, status_conversa: "open" },
    );
    await gravar({ responsavel: "Rodrigo Naumowicz" });
    expect(atribuicoes()).toEqual([
      { conversa: 412, agente: 7 },
      { conversa: 413, agente: 7 },
    ]);
  });

  it("dono sem agente no Chatwoot: a troca vale, e a tela diz por que a conversa não foi", async () => {
    agentes = [DYONES, RODRIGO];
    const { status, corpo } = await gravar({ responsavel: "Bia Souza" });
    expect(status).toBe(200);
    expect(lead().responsavel).toBe("Bia Souza");
    expect(atribuicoes()).toEqual([]);
    expect(corpo.aviso).toBe(
      `${AVISO_DE_CONVERSA_COM_O_DONO_ANTIGO}: nenhum agente do Chatwoot se chama "Bia Souza".`,
    );
  });

  it("token recusado: a troca vale, e o aviso diz que foi o token", async () => {
    statusDoChatwoot = 401;
    const { status, corpo } = await gravar({ responsavel: "Bia Souza" });
    expect(status).toBe(200);
    expect(lead().responsavel).toBe("Bia Souza");
    expect(String(corpo.aviso)).toContain("CHATWOOT_API_TOKEN");
  });

  it("a atribuição recusada também vira aviso, com a conversa que não foi", async () => {
    statusAoAtribuir = 500;
    const { corpo } = await gravar({ responsavel: "Bia Souza" });
    expect(lead().responsavel).toBe("Bia Souza");
    expect(String(corpo.aviso)).toMatch(/^O lead mudou de dono.*conversa 412/);
  });

  it("lead sem conversa aberta: nenhuma chamada, nenhum aviso", async () => {
    banco.atendimentos[0].status_conversa = "resolved";
    const { corpo } = await gravar({ responsavel: "Bia Souza" });
    expect(corpo).toEqual({ ok: true });
    expect(chamadas).toEqual([]);
  });

  it("sem token do Chatwoot: a troca vale, e a tela sabe que a conversa ficou", async () => {
    vi.stubEnv("CHATWOOT_API_TOKEN", "");
    const { corpo } = await gravar({ responsavel: "Bia Souza" });
    expect(lead().responsavel).toBe("Bia Souza");
    expect(chamadas).toEqual([]);
    expect(String(corpo.aviso)).toContain("Chatwoot não configurado no site");
  });

  it("mexer em outra coisa que não o dono não fala com o Chatwoot", async () => {
    const { corpo } = await gravar({ observacoes: "ligar amanhã" });
    expect(corpo).toEqual({ ok: true });
    expect(chamadas).toEqual([]);
  });

  it("a gravação que não alcança o lead não atribui nada", async () => {
    // O lead muda de dono entre a guarda do escopo e o `update`.
    aoGravarOLead = () => {
      lead().responsavel = "Rodrigo Naumowicz";
    };
    const { status } = await gravar({ responsavel: "Bia Souza" });
    expect(status).toBe(200);
    expect(lead().responsavel).toBe("Rodrigo Naumowicz");
    expect(chamadas).toEqual([]);
  });

  it("dono recusado pela régua do Comercial: nada gravado, nenhuma chamada", async () => {
    const { status } = await gravar({ responsavel: "Fulano Que Não Existe" });
    expect(status).toBe(422);
    expect(lead().responsavel).toBe("Ana Lima");
    expect(chamadas).toEqual([]);
  });
});

// ----------------------------------------------------------------------------

function linhaDaFila(extra: Linha = {}): Linha {
  return {
    lead_id: "lead-1",
    nome: "Fulano",
    telefone: "5541999990000",
    interesse: "Hyundai Tucson",
    canal: "WhatsApp",
    situacao: "em_contato",
    etapa: "Em contato",
    minutos_parado: 6048,
    aviso: "transferencia",
    responsavel: "Ana Lima",
    responsavel_whatsapp: "5541999990001",
    novo_responsavel: "Rodrigo Naumowicz",
    novo_whatsapp: "5541999990002",
    suprimido_por: null,
    ...extra,
  };
}

describe("a fila do funil: o lead que o rodízio passa leva a conversa junto", () => {
  it("transferência no modo reservado: a conversa vai para o agente do novo dono", async () => {
    fila = [linhaDaFila()];
    const corpo = await pedirAFila(true);
    expect(pedidosDaFila).toEqual([{ p_reservar: true }]);
    expect(atribuicoes()).toEqual([{ conversa: 412, agente: 7 }]);
    expect(corpo.conversas_no_chatwoot).toEqual({ atribuidas: 1, falhas: [] });
    expect(corpo.fila.map((i) => i.para)).toEqual(["vendedor"]);
  });

  it("atribuição (lead que chegou sem dono) também", async () => {
    fila = [linhaDaFila({ aviso: "atribuicao", responsavel: null, responsavel_whatsapp: null })];
    await pedirAFila(true);
    expect(atribuicoes()).toEqual([{ conversa: 412, agente: 7 }]);
  });

  it("a prévia não transfere ninguém, então não fala com o Chatwoot", async () => {
    fila = [linhaDaFila()];
    const corpo = await pedirAFila(false);
    expect(chamadas).toEqual([]);
    expect(corpo.conversas_no_chatwoot).toBeUndefined();
  });

  it("estagnação e lead suprimido não mudaram de mão: nenhuma atribuição", async () => {
    banco.atendimentos.push({ id: "at-2", lead_id: "lead-2", chatwoot_conversation_id: 500, status_conversa: "open" });
    fila = [
      linhaDaFila({ aviso: "estagnacao", novo_responsavel: null, novo_whatsapp: null }),
      linhaDaFila({ lead_id: "lead-2", suprimido_por: "quiet_hours" }),
    ];
    const corpo = await pedirAFila(true);
    expect(chamadas).toEqual([]);
    expect(corpo.conversas_no_chatwoot).toBeUndefined();
  });

  it("vários leads na mesma rodada: a lista de agentes é lida uma vez só", async () => {
    banco.atendimentos.push(
      { id: "at-2", lead_id: "lead-2", chatwoot_conversation_id: 500, status_conversa: "open" },
      { id: "at-3", lead_id: "lead-3", chatwoot_conversation_id: 600, status_conversa: "resolved" },
    );
    fila = [
      linhaDaFila(),
      linhaDaFila({ lead_id: "lead-2", novo_responsavel: "Bia Souza" }),
      linhaDaFila({ lead_id: "lead-3", novo_responsavel: "Bia Souza" }),
    ];
    const corpo = await pedirAFila(true);
    expect(leiturasDosAgentes()).toHaveLength(1);
    expect(atribuicoes()).toEqual([
      { conversa: 412, agente: 7 },
      { conversa: 500, agente: 8 },
    ]);
    expect(corpo.conversas_no_chatwoot).toEqual({ atribuidas: 2, falhas: [] });
  });

  it("o Chatwoot fora do ar não segura o aviso: a fila sai, e a falha vem na resposta", async () => {
    statusDoChatwoot = 503;
    fila = [linhaDaFila()];
    const corpo = await pedirAFila(true);
    expect(corpo.fila).toHaveLength(1);
    expect(corpo.conversas_no_chatwoot?.atribuidas).toBe(0);
    expect(corpo.conversas_no_chatwoot?.falhas).toHaveLength(1);
  });

  it("o vendedor que não é agente aparece na falha, com o lead; os outros vão", async () => {
    agentes = [DYONES, BIA];
    banco.atendimentos.push({ id: "at-2", lead_id: "lead-2", chatwoot_conversation_id: 500, status_conversa: "open" });
    fila = [linhaDaFila(), linhaDaFila({ lead_id: "lead-2", novo_responsavel: "Bia Souza" })];
    const corpo = await pedirAFila(true);
    expect(atribuicoes()).toEqual([{ conversa: 500, agente: 8 }]);
    expect(corpo.conversas_no_chatwoot).toEqual({
      atribuidas: 1,
      falhas: ['lead lead-1: nenhum agente do Chatwoot se chama "Rodrigo Naumowicz"'],
    });
  });
});

describe("atribuirConversasDaFila, por fora das rotas", () => {
  it("sem conversa nenhuma não lê nem os agentes", async () => {
    const buscar = vi.fn(chatwootFalso);
    const r = await atribuirConversasDaFila(
      [{ leadId: "x", responsavel: "Bia Souza" }],
      new Map(),
      { base: "https://chat.exemplo.com.br", conta: "3", token: "t" },
      buscar,
    );
    expect(r).toEqual({ atribuidas: 0, falhas: [] });
    expect(buscar).not.toHaveBeenCalled();
  });

  it("o `fetch` que lança vira falha, nunca exceção", async () => {
    const r = await atribuirConversasDaFila(
      [{ leadId: "x", responsavel: "Bia Souza" }],
      new Map([["x", [1]]]),
      { base: "https://chat.exemplo.com.br", conta: "3", token: "t" },
      async () => {
        throw new Error("rede caiu");
      },
    );
    expect(r.atribuidas).toBe(0);
    expect(r.falhas).toEqual(["sem conexão com o Chatwoot"]);
  });
});
