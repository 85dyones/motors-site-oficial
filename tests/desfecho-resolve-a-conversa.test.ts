import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ETAPAS_PADRAO, ehTipoDeDesfecho, type MotivoDoFunil } from "../src/lib/funil";
import {
  AVISO_DE_CONVERSA_ABERTA,
  ehNotaDoPainel,
  notaDeDesfecho,
  resolverConversasDoLead,
} from "../src/lib/conversaDoDesfecho";
import { interpretarEventoDoChatwoot } from "../src/lib/chatwootEventos";

/**
 * Encerrar o lead no painel resolve a conversa no Chatwoot (2026-10-06).
 *
 * Relato do dono: *"encerrei um lead como perdido no painel e a conversa não
 * foi resolvida automaticamente no chatwoot"*. O que este arquivo segura:
 *   - o PATCH de `/api/leads/gerenciar`, EXECUTADO, resolve toda conversa
 *     aberta do lead, com uma nota PRIVADA antes;
 *   - o Chatwoot fora do ar não desfaz o desfecho: ele fica gravado, e a
 *     resposta leva o aviso que a tela mostra;
 *   - sem conversa, ou com a conversa já resolvida, nenhuma chamada sai;
 *   - quem não enxerga o lead continua recebendo 404, sem chamada nenhuma;
 *   - A VOLTA: a nota e a resolução voltam como eventos em
 *     `/api/chatwoot/eventos`, e a rota de lá, também executada, não reabre,
 *     não duplica, não troca o dono e não reinicia o relógio de lead nenhum.
 *
 * Um banco em memória para as DUAS rotas, e um Chatwoot falso no `fetch`.
 * O gatilho de `leads` (que carimba `desfecho` na etapa terminal e o limpa ao
 * sair dela) é simulado no `update`.
 */

type Linha = Record<string, unknown>;

let banco: Record<string, Linha[]>;
let falhas: Record<string, { message: string; code?: string } | undefined>;
let gravacoes: string[];
let rpcs: Array<{ funcao: string; args: Linha }>;
let autor: { role: string; papeis: string[]; full_name: string };
let proximoId = 1;

function consulta(tabela: string) {
  const filtros: Array<(l: Linha) => boolean> = [];
  let atualizacao: Linha | null = null;
  let insercao: Linha | null = null;
  const executar = async () => {
    const falha = falhas[tabela];
    if (falha) return { data: null, error: falha };
    if (!(tabela in banco)) return { data: null, error: { message: `sem ${tabela}`, code: "42P01" } };
    if (insercao) {
      const nova = { id: `${tabela}-${proximoId++}`, ...insercao };
      banco[tabela].push(nova);
      gravacoes.push(`insert ${tabela}`);
      return { data: [nova], error: null };
    }
    const alcancadas = banco[tabela].filter((l) => filtros.every((f) => f(l)));
    if (atualizacao) {
      for (const l of alcancadas) {
        Object.assign(l, atualizacao);
        // O gatilho de `leads`: etapa terminal carimba o desfecho.
        if (tabela === "leads" && typeof atualizacao.situacao === "string") {
          const tipo = ETAPAS_PADRAO.find((e) => e.chave === atualizacao!.situacao)?.tipo;
          l.desfecho = ehTipoDeDesfecho(tipo) ? tipo : null;
        }
      }
      gravacoes.push(`update ${tabela} ${Object.keys(atualizacao).sort().join(",")}`);
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
    update: (campos: Linha) => ((atualizacao = campos), q),
    insert: (campos: Linha) => ((insercao = campos), q),
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
    rpcs.push({ funcao, args });
    return { data: null, error: null };
  },
};
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => CLIENTE,
  createAdminSupabaseClient: () => CLIENTE,
}));

const { PATCH } = await import("../src/app/api/leads/gerenciar/route");
const webhook = await import("../src/app/api/chatwoot/eventos/route");

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
/** Responde este status só ao pedido de resolver. */
let statusAoResolver: number | null;
/** Não responde: a chamada só termina quando o prazo dela estoura. */
let chatwootMudo: boolean;

async function chatwootFalso(url: string, init?: RequestInit): Promise<Response> {
  chamadas.push({
    url,
    metodo: init?.method ?? "GET",
    token: new Headers(init?.headers).get("api_access_token"),
    corpo: init?.body ? (JSON.parse(String(init.body)) as Linha) : {},
  });
  if (chatwootMudo) {
    return new Promise<Response>((_, recusar) => {
      const sinal = init?.signal;
      sinal?.addEventListener("abort", () => recusar(sinal.reason));
    });
  }
  if (statusDoChatwoot) return new Response("{}", { status: statusDoChatwoot });
  const resolver = /\/conversations\/(\d+)\/toggle_status$/.exec(url);
  if (resolver) {
    if (statusAoResolver) return new Response("{}", { status: statusAoResolver });
    return Response.json({
      meta: {},
      payload: { success: true, conversation_id: Number(resolver[1]), current_status: "resolved" },
    });
  }
  if (/\/conversations\/\d+\/messages$/.test(url)) return Response.json({ id: 9001, private: true });
  return new Response("{}", { status: 404 });
}

const RAIZ = "https://chat.exemplo.com.br/api/v1/accounts/3/conversations";
const notas = () => chamadas.filter((c) => c.url.endsWith("/messages"));
const resolucoes = () => chamadas.filter((c) => c.url.endsWith("/toggle_status"));

const motivo = (chave: string, rotulo: string, tipo: MotivoDoFunil["tipo"]): MotivoDoFunil => ({
  chave,
  rotulo,
  tipo,
  ordem: 1,
  ativo: true,
  escopo: "ambos",
});

const ANA = { role: "comercial", papeis: ["comercial"], full_name: "Ana Lima" };

beforeEach(() => {
  falhas = {};
  gravacoes = [];
  rpcs = [];
  chamadas = [];
  statusDoChatwoot = null;
  statusAoResolver = null;
  chatwootMudo = false;
  autor = ANA;
  banco = {
    profiles: [
      { full_name: "Ana Lima", role: "comercial", papeis: ["comercial"], is_active: true },
      { full_name: "Bia Souza", role: "comercial", papeis: ["comercial"], is_active: true },
    ],
    funil_etapas: ETAPAS_PADRAO.map((e) => ({ ...e })),
    funil_motivos: [
      motivo("a_vista", "Pagou à vista", "ganho"),
      motivo("achou_caro", "Achou caro", "perdido"),
      motivo("spam", "Spam", "descartado"),
    ] as unknown as Linha[],
    leads: [
      {
        id: "lead-1",
        nome: "Fulano",
        telefone: "5541999990000",
        situacao: "proposta",
        canal: "WhatsApp",
        desfecho: null,
        responsavel: "Ana Lima",
        ultimo_contato_em: "2026-10-01T10:00:00Z",
        ultimo_movimento_em: "2026-10-01T10:00:00Z",
      },
    ],
    atendimentos: [{ id: "at-1", lead_id: "lead-1", chatwoot_conversation_id: 412, status_conversa: "open" }],
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function encerrar(corpo: Linha, id = "lead-1") {
  const r = await PATCH(
    new Request("http://x/api/leads/gerenciar", {
      method: "PATCH",
      body: JSON.stringify({ id, ...corpo }),
      headers: { "content-type": "application/json" },
    }) as never,
  );
  return { status: r.status, corpo: (await r.json()) as Linha };
}

async function entregar(corpo: Linha) {
  const r = await webhook.POST(
    new Request("http://x/api/chatwoot/eventos", {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json", Authorization: "Bearer segredo-do-webhook" },
    }),
  );
  return { status: r.status, corpo: (await r.json()) as Linha };
}

const lead = (id = "lead-1") => banco.leads.find((l) => l.id === id)!;
const PERDIDO = { situacao: "perdido", desfecho_motivo: "achou_caro" };

// ----------------------------------------------------------------------------

describe("a nota que fica na conversa", () => {
  it("diz o desfecho, o motivo e quem encerrou, sem travessão", () => {
    const nota = notaDeDesfecho({ tipo: "perdido", motivo: "Achou caro", autor: "Ana Lima" });
    expect(nota).toBe("Lead encerrado no painel: Perdido. Motivo: Achou caro. Por Ana Lima.");
    expect(nota).not.toContain("—");
  });

  it("chama cada desfecho como a caixa de desfecho o chama", () => {
    expect(notaDeDesfecho({ tipo: "ganho", motivo: "Pagou à vista", autor: "Ana" })).toContain("painel: Ganho.");
    expect(notaDeDesfecho({ tipo: "descartado", motivo: "Spam", autor: "Ana" })).toContain(
      "painel: Não é oportunidade.",
    );
  });

  it("leva a nota livre só quando é curta", () => {
    const curta = notaDeDesfecho({ tipo: "perdido", motivo: "Achou caro", autor: "Ana", nota: " comprou\noutro. " });
    expect(curta).toBe("Lead encerrado no painel: Perdido. Motivo: Achou caro. Por Ana. Nota: comprou outro.");
    const longa = notaDeDesfecho({ tipo: "perdido", motivo: "Achou caro", autor: "Ana", nota: "x".repeat(201) });
    expect(longa).toBe("Lead encerrado no painel: Perdido. Motivo: Achou caro. Por Ana.");
  });

  it("sem motivo ou sem autor, a frase não fica com buraco", () => {
    expect(notaDeDesfecho({ tipo: "ganho", motivo: null, autor: " " })).toBe("Lead encerrado no painel: Ganho.");
  });

  it("é reconhecida pelo começo do texto, e só por ele", () => {
    expect(ehNotaDoPainel(notaDeDesfecho({ tipo: "ganho", motivo: "x", autor: "y" }))).toBe(true);
    expect(ehNotaDoPainel("Cliente pediu para ligar terça")).toBe(false);
    expect(ehNotaDoPainel(null)).toBe(false);
  });
});

describe("PATCH /api/leads/gerenciar: encerrar resolve a conversa", () => {
  it("resolve a conversa aberta do lead, com a nota PRIVADA antes", async () => {
    const { status, corpo } = await encerrar({ ...PERDIDO, desfecho_nota: "comprou em outra loja" });

    expect(status).toBe(200);
    expect(corpo).toEqual({ ok: true, conversa_resolvida: true });
    expect(lead().situacao).toBe("perdido");

    expect(chamadas.map((c) => `${c.metodo} ${c.url}`)).toEqual([
      `POST ${RAIZ}/412/messages`,
      `POST ${RAIZ}/412/toggle_status`,
    ]);
    expect(chamadas.every((c) => c.token === "tok-123")).toBe(true);

    // Nunca uma mensagem para o cliente: `private: true`, sempre.
    expect(notas()[0].corpo).toEqual({
      content:
        "Lead encerrado no painel: Perdido. Motivo: Achou caro. Por Ana Lima. Nota: comprou em outra loja.",
      message_type: "outgoing",
      private: true,
    });
    expect(resolucoes()[0].corpo).toEqual({ status: "resolved" });
  });

  it("vale para os TRÊS desfechos", async () => {
    const casos = [
      { corpo: { situacao: "fechado", desfecho_motivo: "a_vista" }, diz: "painel: Ganho. Motivo: Pagou à vista." },
      { corpo: PERDIDO, diz: "painel: Perdido. Motivo: Achou caro." },
      { corpo: { situacao: "descartado", desfecho_motivo: "spam" }, diz: "painel: Não é oportunidade. Motivo: Spam." },
    ];
    for (const caso of casos) {
      chamadas = [];
      Object.assign(lead(), { situacao: "proposta", desfecho: null });
      const { corpo } = await encerrar(caso.corpo);
      expect(corpo.conversa_resolvida, JSON.stringify(caso.corpo)).toBe(true);
      expect(String(notas()[0].corpo.content)).toContain(caso.diz);
      expect(notas()[0].corpo.private).toBe(true);
      expect(resolucoes()).toHaveLength(1);
    }
  });

  it("resolve TODAS as abertas do lead, e deixa em paz a resolvida e a de outro lead", async () => {
    banco.atendimentos.push(
      { id: "at-2", lead_id: "lead-1", chatwoot_conversation_id: 500, status_conversa: "pending" },
      { id: "at-3", lead_id: "lead-1", chatwoot_conversation_id: 300, status_conversa: "resolved" },
      { id: "at-4", lead_id: "lead-1", chatwoot_conversation_id: null, status_conversa: null },
      { id: "at-5", lead_id: "lead-2", chatwoot_conversation_id: 777, status_conversa: "open" },
    );
    const { corpo } = await encerrar(PERDIDO);

    expect(corpo.conversa_resolvida).toBe(true);
    expect(resolucoes().map((c) => c.url).sort()).toEqual([`${RAIZ}/412/toggle_status`, `${RAIZ}/500/toggle_status`]);
    expect(notas().map((c) => c.url).sort()).toEqual([`${RAIZ}/412/messages`, `${RAIZ}/500/messages`]);
    expect(notas().every((c) => c.corpo.private === true)).toBe(true);
    // Em cada conversa, a nota vai antes de resolver.
    for (const id of [412, 500]) {
      const dela = chamadas.filter((c) => c.url.includes(`/${id}/`)).map((c) => c.url.split("/").pop());
      expect(dela).toEqual(["messages", "toggle_status"]);
    }
  });

  it("Chatwoot fora do ar: o desfecho fica gravado, e a resposta avisa", async () => {
    statusDoChatwoot = 500;
    const { status, corpo } = await encerrar(PERDIDO);

    expect(status).toBe(200);
    expect(corpo.ok).toBe(true);
    expect(corpo.conversa_resolvida).toBe(false);
    expect(String(corpo.aviso)).toContain(AVISO_DE_CONVERSA_ABERTA);
    expect(String(corpo.aviso)).toContain("o Chatwoot respondeu 500");
    expect(lead()).toMatchObject({ situacao: "perdido", desfecho: "perdido", desfecho_motivo: "achou_caro" });
  });

  it("token recusado: avisa, e diz que foi o token", async () => {
    statusDoChatwoot = 401;
    const { corpo } = await encerrar(PERDIDO);
    expect(corpo.conversa_resolvida).toBe(false);
    expect(String(corpo.aviso)).toContain("CHATWOOT_API_TOKEN");
    expect(lead().desfecho).toBe("perdido");
  });

  it("a nota entrou e resolver falhou: avisa do mesmo jeito", async () => {
    statusAoResolver = 500;
    const { corpo } = await encerrar(PERDIDO);
    expect(notas()).toHaveLength(1);
    expect(corpo.conversa_resolvida).toBe(false);
    expect(String(corpo.aviso)).toContain(AVISO_DE_CONVERSA_ABERTA);
  });

  it("conversa apagada no Chatwoot (404): não há o que resolver nem o que avisar", async () => {
    statusDoChatwoot = 404;
    const { corpo } = await encerrar(PERDIDO);
    expect(corpo).toEqual({ ok: true, conversa_resolvida: true });
  });

  it("lead sem conversa: nenhuma chamada, nenhum aviso", async () => {
    banco.atendimentos = [];
    const { status, corpo } = await encerrar(PERDIDO);
    expect(status).toBe(200);
    expect(corpo).toEqual({ ok: true });
    expect(chamadas).toEqual([]);
  });

  it("conversa já resolvida: nenhuma chamada, nenhum aviso", async () => {
    banco.atendimentos[0].status_conversa = "resolved";
    const { corpo } = await encerrar(PERDIDO);
    expect(corpo).toEqual({ ok: true });
    expect(chamadas).toEqual([]);
  });

  it("sem token do Chatwoot: avisa só quando o lead tem conversa aberta", async () => {
    vi.stubEnv("CHATWOOT_API_TOKEN", "");
    const comConversa = await encerrar(PERDIDO);
    expect(comConversa.corpo.conversa_resolvida).toBe(false);
    expect(String(comConversa.corpo.aviso)).toContain("CHATWOOT_API_TOKEN");
    expect(String(comConversa.corpo.aviso)).toContain("resolva por lá");
    expect(lead().desfecho).toBe("perdido");

    Object.assign(lead(), { situacao: "proposta", desfecho: null });
    banco.atendimentos = [];
    const semConversa = await encerrar(PERDIDO);
    expect(semConversa.corpo).toEqual({ ok: true });
    expect(chamadas).toEqual([]);
  });

  it("atendimentos ilegível: o desfecho fica, e o aviso não afirma o que não leu", async () => {
    falhas.atendimentos = { message: "permission denied" };
    const { status, corpo } = await encerrar(PERDIDO);
    expect(status).toBe(200);
    expect(corpo.conversa_resolvida).toBe(false);
    expect(String(corpo.aviso)).toContain("não deu para conferir");
    expect(chamadas).toEqual([]);
    expect(lead().desfecho).toBe("perdido");
  });

  it("vendedor encerrando o lead de OUTRO vendedor: 404, nada gravado, nenhuma chamada", async () => {
    lead().responsavel = "Bia Souza";
    const { status, corpo } = await encerrar(PERDIDO);
    expect(status).toBe(404);
    expect(corpo).toEqual({ error: "Lead não encontrado" });
    expect(gravacoes).toEqual([]);
    expect(chamadas).toEqual([]);
    expect(lead().situacao).toBe("proposta");
  });

  it("desfecho recusado (sem motivo): nada gravado, nenhuma chamada", async () => {
    const { status } = await encerrar({ situacao: "perdido" });
    expect(status).toBe(400);
    expect(gravacoes).toEqual([]);
    expect(chamadas).toEqual([]);
  });

  it("mover de etapa e reabrir o lead não falam com o Chatwoot", async () => {
    const moveu = await encerrar({ situacao: "em_contato" });
    expect(moveu.corpo).toEqual({ ok: true });

    // Reabrir: o lead fechado volta para uma etapa. A conversa NÃO é reaberta.
    Object.assign(lead(), { situacao: "perdido", desfecho: "perdido" });
    banco.atendimentos[0].status_conversa = "resolved";
    const reabriu = await encerrar({ situacao: "proposta" });
    expect(reabriu.corpo).toEqual({ ok: true });
    expect(lead().desfecho).toBeNull();
    expect(chamadas).toEqual([]);
  });
});

describe("o prazo: o Chatwoot que não responde não segura a resposta do painel", () => {
  it("devolve o aviso dentro do orçamento, sem lançar", async () => {
    chatwootMudo = true;
    const inicio = Date.now();
    const r = await resolverConversasDoLead(
      CLIENTE as never,
      "lead-1",
      { tipo: "perdido", motivo: "Achou caro", autor: "Ana Lima" },
      { base: "https://chat.exemplo.com.br", conta: "3", token: "tok-123" },
      chatwootFalso,
      300,
    );
    expect(Date.now() - inicio).toBeLessThan(1500);
    expect(r.conversa_resolvida).toBe(false);
    expect(r.aviso).toContain(AVISO_DE_CONVERSA_ABERTA);
    expect(r.aviso).toMatch(/não respondeu a tempo|sem tempo/);
  });

  it("o `fetch` que lança vira aviso, nunca exceção", async () => {
    const r = await resolverConversasDoLead(
      CLIENTE as never,
      "lead-1",
      { tipo: "perdido", motivo: "Achou caro", autor: "Ana Lima" },
      { base: "https://chat.exemplo.com.br", conta: "3", token: "tok-123" },
      async () => {
        throw new TypeError("fetch failed");
      },
    );
    expect(r.conversa_resolvida).toBe(false);
    expect(r.aviso).toContain("sem conexão com o Chatwoot");
  });
});

// ----------------------------------------------------------------------------
// A volta pelo webhook
// ----------------------------------------------------------------------------

/** A conversa 412 como o Chatwoot a manda nos eventos. */
const conversa = (status: string) => ({
  id: 412,
  status,
  inbox_id: 11,
  meta: {
    sender: { id: 88, name: "Fulano", phone_number: "+5541999990000" },
    assignee: { id: 6, name: "Ana Lima", email: "ana@chatwoot.com" },
  },
});

/** A nota do painel, de volta como `message_created`: saída, privada, do usuário do token. */
const notaDeVolta = (content: string) => ({
  event: "message_created",
  message_type: "outgoing",
  private: true,
  content,
  conversation: conversa("open"),
  sender: { id: 1, name: "Painel Motors", email: "painel@motors.com", type: "user" },
});

/** Só o que o webhook pode mudar num lead. */
const retrato = (id: string) => {
  const { situacao, desfecho, responsavel, ultimo_contato_em, ultimo_movimento_em, alertado_em } = lead(id);
  return { situacao, desfecho, responsavel, ultimo_contato_em, ultimo_movimento_em, alertado_em };
};

describe("a volta: o que o webhook faz com a nota e com a conversa resolvida", () => {
  it("a nota do painel não é resposta de consultor: `robô não atende`", () => {
    const e = interpretarEventoDoChatwoot(
      notaDeVolta("Lead encerrado no painel: Perdido. Motivo: Achou caro. Por Ana Lima."),
    );
    expect(e.tipo).toBe("ignorado");
    expect(e.motivo).toContain("nota do painel");
    // A nota privada que um consultor escreve continua contando.
    expect(interpretarEventoDoChatwoot(notaDeVolta("Cliente pediu para ligar terça")).tipo).toBe(
      "mensagem_do_consultor",
    );
  });

  it("o laço inteiro: encerra no painel, os eventos voltam, e nenhum lead é tocado", async () => {
    // A mesma pessoa tem OUTRO lead aberto: é para ele que a conversa não pode ir.
    banco.leads.push({
      id: "lead-2",
      nome: "Fulano",
      telefone: "5541999990000",
      situacao: "novo",
      canal: "Site",
      desfecho: null,
      responsavel: "Bia Souza",
      ultimo_contato_em: "2026-10-02T10:00:00Z",
      ultimo_movimento_em: "2026-10-02T10:00:00Z",
    });
    await encerrar(PERDIDO);
    const fechado = retrato("lead-1");
    const outro = retrato("lead-2");
    expect(fechado.desfecho).toBe("perdido");
    gravacoes = [];
    rpcs = [];

    // 1. A nota privada, do jeito que o painel a escreveu.
    const daNota = await entregar(notaDeVolta(String(notas()[0].corpo.content)));
    expect(daNota.corpo).toMatchObject({ ok: true, acao: "ignorado" });
    expect(gravacoes).toEqual([]);

    // 2. A conversa resolvida, pelos dois nomes que o Chatwoot usa.
    for (const event of ["conversation_status_changed", "conversation_resolved"]) {
      const r = await entregar({ event, ...conversa("resolved") });
      expect(r.status).toBe(200);
      expect(r.corpo).toMatchObject({ ok: true, acao: "atendimento_sem_lead", lead: null });
    }

    // Só o espelho da conversa mudou.
    expect(gravacoes.every((g) => g.startsWith("update atendimentos"))).toBe(true);
    expect(banco.atendimentos[0]).toMatchObject({ lead_id: "lead-1", status_conversa: "resolved" });
    expect(banco.atendimentos[0].encerrado_em).toBeTruthy();
    expect(banco.atendimentos).toHaveLength(1);
    // Nenhum lead novo, nenhum reaberto, nenhum dono trocado, nenhum relógio reiniciado.
    expect(banco.leads).toHaveLength(2);
    expect(retrato("lead-1")).toEqual(fechado);
    expect(retrato("lead-2")).toEqual(outro);
    expect(rpcs).toEqual([]);
    expect(banco.leads_eventos).toEqual([]);
    // E a rota não foi ao Chatwoot por causa desses eventos.
    expect(chamadas).toHaveLength(2);
  });

  it("sem a trava, a nota criaria um lead: a mesma nota escrita por gente cria", async () => {
    // O contraste que mostra o que `ehNotaDoPainel` segura.
    await encerrar(PERDIDO);
    await entregar(notaDeVolta("Cliente voltou, quer ver o Onix"));
    expect(banco.leads).toHaveLength(2);
    expect(rpcs.map((r) => r.funcao)).toEqual(["registrar_contato_do_lead"]);
  });

  it("o cliente que volta a escrever na conversa de um lead encerrado continua virando lead novo", async () => {
    await encerrar(PERDIDO);
    const r = await entregar({
      event: "message_created",
      message_type: "incoming",
      content: "Oi, ainda tem o Onix?",
      conversation: conversa("open"),
      sender: { id: 88, name: "Fulano", phone_number: "+5541999990000", type: "contact" },
    });
    expect(r.corpo.acao).toBe("atendimento_vinculado");
    expect(banco.leads).toHaveLength(2);
    expect(banco.atendimentos[0].lead_id).not.toBe("lead-1");
    expect(lead().desfecho).toBe("perdido");
  });
});
