import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * As etiquetas do lead nas rotas, EXECUTADAS (2026-09-25).
 *
 * Pedido do dono: *"ele [o SDR] tem que ter acesso às etiquetas"* e *"quando o
 * sdr atribuir um contato para um vendedor do comercial, precisamos manter a
 * tag de resgate e reaquecido, para mensurar o trabalho dele, isso tem que ser
 * feito automático"*.
 *
 * O que se trava aqui:
 *   - a passagem do SDR põe as duas etiquetas na conversa SEM tirar as outras,
 *     e só DEPOIS de a passagem estar gravada — o Chatwoot fora do ar não
 *     segura o lead com o SDR;
 *   - o Comercial passando entre si, e o SDR tirando o dono, não mexem no
 *     Chatwoot;
 *   - o card manda MUDANÇA (esta entra, esta sai), e o servidor a aplica sobre
 *     o que a conversa tem AGORA — a lista do card vem do espelho e pode estar
 *     atrás; gravada por cima, apagaria resgate e reaquecido que ele não via
 *     (revisão de 25/09);
 *   - resgate e reaquecido não saem pelo card;
 *   - quem não move lead não mexe em etiqueta.
 *
 * O crédito do SDR no rastro NÃO está aqui: é gatilho de banco, e se prova no
 * aceite da migração 20260925180000 (`migracoes-executam.test.ts`).
 *
 * Banco em memória e Chatwoot falso (o `fetch` global): a rota é chamada de
 * verdade, com as funções de `lib/` que ela usa.
 */

// ----------------------------------------------------------------------------
// O banco em memória
// ----------------------------------------------------------------------------

type Linha = Record<string, unknown>;
interface Erro {
  message: string;
  code?: string;
}

let banco: Record<string, Linha[]>;
let falhas: Record<string, Erro | undefined>;
/** Tudo o que acontece, na ordem: gravação no banco, chamada ao Chatwoot, rpc. */
let linhaDoTempo: string[];
let usuario: string | null;
let rpcs: Array<{ nome: string; args: Record<string, unknown> }>;
let erroDoRpc: Erro | null;

function consulta(tabela: string) {
  const filtros: Array<(l: Linha) => boolean> = [];
  let atualizacao: Linha | null = null;
  const linhas = () => (banco[tabela] ?? []).filter((l) => filtros.every((f) => f(l)));
  const executar = async () => {
    const falha = falhas[tabela];
    if (falha) return { data: null, error: falha };
    if (atualizacao) {
      for (const l of linhas()) Object.assign(l, atualizacao);
      linhaDoTempo.push(`update ${tabela}`);
      return { data: null, error: null };
    }
    return { data: linhas(), error: null };
  };
  const q = {
    select: () => q,
    order: () => q,
    limit: () => q,
    ilike: () => q,
    eq: (coluna: string, valor: unknown) => {
      // `detalhe->>origem`, como o PostgREST lê um campo de jsonb.
      const [raiz, campo] = coluna.split("->>");
      filtros.push((l) =>
        campo === undefined ? l[coluna] === valor : (l[raiz] as Linha | undefined)?.[campo] === valor,
      );
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
  auth: { getUser: async () => ({ data: { user: usuario ? { id: usuario } : null } }) },
  from: (tabela: string) => consulta(tabela),
  rpc: async (nome: string, args: Record<string, unknown>) => {
    rpcs.push({ nome, args });
    linhaDoTempo.push(`rpc ${nome}`);
    return { data: null, error: erroDoRpc };
  },
};
vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => CLIENTE }));

const gerenciar = await import("../src/app/api/leads/gerenciar/route");
const etiquetas = await import("../src/app/api/leads/etiquetas/route");

// ----------------------------------------------------------------------------
// O Chatwoot falso
// ----------------------------------------------------------------------------

/** As etiquetas de cada conversa, e as da conta. */
let conversas: Record<number, string[]>;
let etiquetasDaConta: string[];
let statusDoChatwoot: number | null;
const chamadasAoChatwoot: Array<{ metodo: string; url: string; corpo?: unknown }> = [];

async function chatwootFalso(url: string, init?: RequestInit): Promise<Response> {
  const metodo = init?.method ?? "GET";
  const corpo = init?.body ? JSON.parse(String(init.body)) : undefined;
  chamadasAoChatwoot.push({ metodo, url, corpo });
  linhaDoTempo.push(`chatwoot ${metodo}`);
  if (statusDoChatwoot) return new Response("{}", { status: statusDoChatwoot });
  if (url.endsWith("/accounts/3/labels")) {
    return Response.json({ payload: etiquetasDaConta.map((title, id) => ({ id, title })) });
  }
  const m = /\/conversations\/(\d+)\/labels$/.exec(url);
  if (!m) return new Response("{}", { status: 404 });
  const id = Number(m[1]);
  if (!(id in conversas)) return new Response("{}", { status: 404 });
  if (metodo === "POST") conversas[id] = [...(corpo as { labels: string[] }).labels];
  return Response.json({ payload: conversas[id] });
}

const ENV_DO_CHATWOOT = {
  NEXT_PUBLIC_CHATWOOT_URL: "https://chat.exemplo.com.br",
  NEXT_PUBLIC_CHATWOOT_CONTA_ID: "3",
  CHATWOOT_API_TOKEN: "tok-123",
};

beforeEach(() => {
  usuario = "u-sdr";
  falhas = {};
  linhaDoTempo = [];
  rpcs = [];
  erroDoRpc = null;
  statusDoChatwoot = null;
  chamadasAoChatwoot.length = 0;
  conversas = { 4821: ["origem-site", "quer-comprar"], 100: ["antiga"] };
  etiquetasDaConta = ["quer-comprar", "origem-site", "negociando"];
  banco = {
    profiles: [
      { id: "u-sdr", full_name: "Felipe", role: "sdr", papeis: ["sdr"], is_active: true },
      { id: "u-ana", full_name: "Ana", role: "comercial", papeis: ["comercial"], is_active: true },
      { id: "u-bia", full_name: "Bia", role: "comercial", papeis: ["comercial"], is_active: true },
      { id: "u-duplo", full_name: "Caio", role: "comercial", papeis: ["comercial", "sdr"], is_active: true },
      { id: "u-mkt", full_name: "Mari", role: "marketing", papeis: ["marketing"], is_active: true },
      { id: "u-cliente", full_name: "Cliente", role: "cliente", papeis: [], is_active: true },
    ],
    leads: [
      { id: "lead-1", nome: "Joana", situacao: "novo", responsavel: null, created_at: "2026-09-20T10:00:00Z" },
      { id: "lead-sem-conversa", nome: "Pedro", situacao: "novo", responsavel: null, created_at: "2026-09-21T10:00:00Z" },
    ],
    atendimentos: [
      // Duas conversas do mesmo lead: a mais recente (4821) é a do card.
      { lead_id: "lead-1", chatwoot_conversation_id: 100, iniciado_em: "2026-06-01T10:00:00", created_at: "2026-06-01T10:00:00", tags: ["antiga"] },
      { lead_id: "lead-1", chatwoot_conversation_id: 4821, iniciado_em: "2026-09-20T10:00:00", created_at: "2026-09-20T10:00:00", tags: ["origem-site", "Quer-Comprar"] },
    ],
    funil_etapas: [],
    funil_motivos: [],
    leads_eventos: [],
  };
  vi.stubGlobal("fetch", vi.fn(chatwootFalso));
  for (const [k, v] of Object.entries(ENV_DO_CHATWOOT)) vi.stubEnv(k, v);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const patch = (corpo: Linha) =>
  gerenciar.PATCH(
    new Request("http://x/api/leads/gerenciar", {
      method: "PATCH",
      body: JSON.stringify({ id: "lead-1", ...corpo }),
      headers: { "content-type": "application/json" },
    }) as never,
  );

const postEtiquetas = (corpo: unknown) =>
  etiquetas.POST(
    new Request("http://x/api/leads/etiquetas", {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }) as never,
  );

// ----------------------------------------------------------------------------

describe("a passagem do SDR para o Comercial", () => {
  it("põe resgate e reaquecido na conversa, sem tirar as que ela tinha", async () => {
    const r = await patch({ responsavel: "Ana" });
    const d = await r.json();

    expect(r.status).toBe(200);
    expect(conversas[4821]).toEqual(["origem-site", "quer-comprar", "resgate", "reaquecido"]);
    expect(d).toEqual({ ok: true, etiquetas: ["origem-site", "quer-comprar", "resgate", "reaquecido"] });
    // Na conversa MAIS RECENTE — a do link do card —, não na antiga.
    expect(conversas[100]).toEqual(["antiga"]);
  });

  it("o Chatwoot só é chamado DEPOIS de a passagem estar gravada — e é conferido no fim", async () => {
    await patch({ responsavel: "Ana" });
    expect(banco.leads[0].responsavel).toBe("Ana");
    expect(linhaDoTempo).toEqual(["update leads", "chatwoot GET", "chatwoot POST", "chatwoot GET"]);
  });

  it("etiqueta fora do formato do site sobrevive à passagem", async () => {
    conversas[4821] = ["Lead Quente", "campanha.setembro"];
    await patch({ responsavel: "Ana" });
    expect(conversas[4821]).toEqual(["Lead Quente", "campanha.setembro", "resgate", "reaquecido"]);
  });

  it("vale para quem tem SDR como segundo papel", async () => {
    usuario = "u-duplo";
    await patch({ responsavel: "Ana" });
    expect(conversas[4821]).toContain("reaquecido");
  });

  it("o Comercial passando entre si não mexe no Chatwoot", async () => {
    usuario = "u-ana";
    const r = await patch({ responsavel: "Bia" });
    expect(await r.json()).toEqual({ ok: true });
    expect(chamadasAoChatwoot).toHaveLength(0);
    expect(banco.leads[0].responsavel).toBe("Bia");
  });

  it("o SDR tirando o dono não é passagem", async () => {
    banco.leads[0].responsavel = "Ana";
    const r = await patch({ responsavel: null });
    expect(await r.json()).toEqual({ ok: true });
    expect(chamadasAoChatwoot).toHaveLength(0);
  });

  it("o SDR mexendo em outra coisa do lead não etiqueta", async () => {
    await patch({ observacoes: "ligar amanhã" });
    expect(chamadasAoChatwoot).toHaveLength(0);
  });

  it("passagem recusada (não é do Comercial) não chega ao Chatwoot", async () => {
    const r = await patch({ responsavel: "Mari" });
    expect(r.status).toBe(422);
    expect(chamadasAoChatwoot).toHaveLength(0);
    expect(banco.leads[0].responsavel).toBeNull();
  });

  it("gravação da passagem falhou: nada vai ao Chatwoot", async () => {
    falhas.leads = { message: "sem permissão" };
    const r = await patch({ responsavel: "Ana" });
    expect(r.status).toBe(500);
    expect(chamadasAoChatwoot).toHaveLength(0);
  });

  it("Chatwoot fora do ar: a passagem vale e a resposta avisa", async () => {
    statusDoChatwoot = 502;
    const r = await patch({ responsavel: "Ana" });
    const d = await r.json();

    expect(r.status).toBe(200);
    expect(banco.leads[0].responsavel).toBe("Ana");
    expect(d.ok).toBe(true);
    expect(d.etiquetas).toBeUndefined();
    expect(d.aviso).toContain("o Chatwoot respondeu 502");
    expect(d.aviso).toContain("Ponha as duas à mão na conversa.");
    // O aviso não afirma o que não conferiu: o crédito é do gatilho do banco.
    expect(d.aviso).not.toMatch(/crédito/i);
  });

  it("leitura da conversa falhou: não grava às cegas", async () => {
    // Um POST sem o GET antes substituiria a lista inteira pelas duas.
    statusDoChatwoot = 500;
    await patch({ responsavel: "Ana" });
    expect(chamadasAoChatwoot.map((c) => c.metodo)).toEqual(["GET"]);
  });

  it("sem token: a passagem vale e o aviso diz o que falta", async () => {
    vi.stubEnv("CHATWOOT_API_TOKEN", "");
    const d = await (await patch({ responsavel: "Ana" })).json();
    expect(banco.leads[0].responsavel).toBe("Ana");
    expect(d.aviso).toContain("falta configurar CHATWOOT_API_TOKEN");
    expect(chamadasAoChatwoot).toHaveLength(0);
  });

  it("lead sem conversa: a passagem vale e o aviso diz por quê", async () => {
    const r = await gerenciar.PATCH(
      new Request("http://x/api/leads/gerenciar", {
        method: "PATCH",
        body: JSON.stringify({ id: "lead-sem-conversa", responsavel: "Ana" }),
      }) as never,
    );
    const d = await r.json();
    expect(banco.leads[1].responsavel).toBe("Ana");
    expect(d.aviso).toContain("o lead ainda não tem conversa no Chatwoot");
  });

  it("passar de novo para quem já tem as duas não grava no Chatwoot", async () => {
    conversas[4821] = ["reaquecido", "resgate"];
    const d = await (await patch({ responsavel: "Ana" })).json();
    expect(d.etiquetas).toEqual(["reaquecido", "resgate"]);
    expect(chamadasAoChatwoot.map((c) => c.metodo)).toEqual(["GET"]);
  });
});

describe("o GET da fila traz as etiquetas", () => {
  it("as da conversa mais recente, limpas, e a lista do que dá para pôr", async () => {
    const d = await (await gerenciar.GET(new Request("http://x/api/leads/gerenciar") as never)).json();
    const joana = d.leads.find((l: Linha) => l.id === "lead-1");
    const pedro = d.leads.find((l: Linha) => l.id === "lead-sem-conversa");

    // Como o espelho as tem — a grafia não é "consertada".
    expect(joana.etiquetas).toEqual(["origem-site", "Quer-Comprar"]);
    expect(pedro.etiquetas).toEqual([]);
    // Todas as vistas, em ordem alfabética — menos as duas da passagem, que
    // não entram à mão.
    expect(d.etiquetasDisponiveis).toEqual(["antiga", "origem-site", "quer-comprar"]);
    expect(d.etiquetasEditaveis).toBe(true);
  });

  it("sem token, a tela sabe que não dá para editar", async () => {
    vi.stubEnv("CHATWOOT_API_TOKEN", "");
    const d = await (await gerenciar.GET(new Request("http://x/api/leads/gerenciar") as never)).json();
    expect(d.etiquetasEditaveis).toBe(false);
  });

  it("não chama o Chatwoot — a fila não espera a API", async () => {
    await gerenciar.GET(new Request("http://x/api/leads/gerenciar") as never);
    expect(chamadasAoChatwoot).toHaveLength(0);
  });
});

describe("POST /api/leads/etiquetas — a edição no card", () => {
  it("põe a pedida sobre o que a conversa tem, e deixa o rastro do que entrou", async () => {
    const r = await postEtiquetas({ id: "lead-1", incluir: ["negociando"] });
    const d = await r.json();

    expect(r.status).toBe(200);
    expect(d).toEqual({ ok: true, etiquetas: ["origem-site", "quer-comprar", "negociando"] });
    expect(conversas[4821]).toEqual(["origem-site", "quer-comprar", "negociando"]);
    expect(rpcs).toEqual([
      {
        nome: "registrar_etiquetas_do_lead",
        args: {
          p_lead: "lead-1",
          p_antes: ["origem-site", "quer-comprar"],
          p_depois: ["origem-site", "quer-comprar", "negociando"],
        },
      },
    ]);
    // Leu o que a conversa tinha ANTES de gravar, e conferiu DEPOIS.
    expect(linhaDoTempo).toEqual([
      "chatwoot GET",
      "chatwoot POST",
      "chatwoot GET",
      "rpc registrar_etiquetas_do_lead",
    ]);
  });

  it("lead que o SDR já passou: toda edição garante resgate e reaquecido de novo", async () => {
    // A passagem falhou no Chatwoot (ou outra aba gravou por cima dela), mas o
    // crédito está no rastro. A primeira edição seguinte cura a conversa.
    banco.leads_eventos.push({
      lead_id: "lead-1",
      tipo: "etiqueta",
      detalhe: { origem: "passagem_do_sdr" },
    });
    usuario = "u-ana";
    const d = await (await postEtiquetas({ id: "lead-1", incluir: ["negociando"] })).json();
    expect(conversas[4821]).toEqual(["origem-site", "quer-comprar", "negociando", "resgate", "reaquecido"]);
    expect(d.etiquetas).toEqual(conversas[4821]);
  });

  it("lead que o SDR não passou: a edição não inventa resgate", async () => {
    banco.leads_eventos.push({ lead_id: "lead-1", tipo: "etiqueta", detalhe: { origem: "card" } });
    banco.leads_eventos.push({ lead_id: "outro", tipo: "etiqueta", detalhe: { origem: "passagem_do_sdr" } });
    await postEtiquetas({ id: "lead-1", incluir: ["negociando"] });
    expect(conversas[4821]).toEqual(["origem-site", "quer-comprar", "negociando"]);
  });

  it("resgate e reaquecido não entram à mão", async () => {
    for (const incluir of [["resgate"], ["Reaquecido"], ["negociando", "resgate"]]) {
      const r = await postEtiquetas({ id: "lead-1", incluir });
      expect(r.status, JSON.stringify(incluir)).toBe(422);
      expect((await r.json()).error).toContain("entram sozinhas");
    }
    expect(chamadasAoChatwoot).toHaveLength(0);
  });

  it("tira só a pedida", async () => {
    const d = await (await postEtiquetas({ id: "lead-1", retirar: ["origem-site"] })).json();
    expect(d.etiquetas).toEqual(["quer-comprar"]);
    expect(conversas[4821]).toEqual(["quer-comprar"]);
  });

  it("o card atrás da conversa NÃO apaga o que ele não via (o defeito da revisão de 25/09)", async () => {
    // O SDR passou o lead: a conversa tem resgate e reaquecido, mas o espelho
    // que o card desenha (`atendimentos.tags`) ainda não.
    conversas[4821] = ["origem-site", "quer-comprar", "resgate", "reaquecido"];
    usuario = "u-ana";
    const d = await (await postEtiquetas({ id: "lead-1", incluir: ["negociando"] })).json();

    expect(conversas[4821]).toEqual(["origem-site", "quer-comprar", "resgate", "reaquecido", "negociando"]);
    expect(d.etiquetas).toEqual(conversas[4821]);
    // E o rastro não acusa o Comercial de ter tirado o que ele nunca viu.
    expect(rpcs[0].args.p_antes).toEqual(["origem-site", "quer-comprar", "resgate", "reaquecido"]);
  });

  it("etiqueta fora do formato do site sobrevive à edição", async () => {
    conversas[4821] = ["Lead Quente", "origem-site"];
    await postEtiquetas({ id: "lead-1", retirar: ["origem-site"] });
    expect(conversas[4821]).toEqual(["Lead Quente"]);
  });

  it("resgate e reaquecido não saem pelo card", async () => {
    conversas[4821] = ["origem-site", "resgate", "reaquecido"];
    for (const retirar of [["resgate"], ["Reaquecido"], ["origem-site", "resgate"]]) {
      const r = await postEtiquetas({ id: "lead-1", retirar });
      expect(r.status, JSON.stringify(retirar)).toBe(422);
      expect((await r.json()).error).toContain("tire no Chatwoot");
    }
    expect(chamadasAoChatwoot).toHaveLength(0);
    expect(conversas[4821]).toEqual(["origem-site", "resgate", "reaquecido"]);
  });

  it("mudança que não muda nada não vira evento no rastro", async () => {
    await postEtiquetas({ id: "lead-1", incluir: ["quer-comprar"] });
    expect(rpcs).toHaveLength(0);
    expect(chamadasAoChatwoot.map((c) => c.metodo)).toEqual(["GET"]);
  });

  it("etiqueta fora do formato do Chatwoot não entra, antes de qualquer chamada", async () => {
    const r = await postEtiquetas({ id: "lead-1", incluir: ["quer comprar"] });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain('"quer comprar"');
    expect(chamadasAoChatwoot).toHaveLength(0);
  });

  it("pedido sem id, sem mudança, ou com a lista inteira no formato antigo é recusado", async () => {
    expect((await postEtiquetas({ incluir: ["a"] })).status).toBe(400);
    expect((await postEtiquetas({ id: "lead-1" })).status).toBe(400);
    // A lista inteira (`etiquetas`) era o contrato que apagava etiqueta: não
    // pode ser aceita por engano como "sem mudança nenhuma" que grava algo.
    expect((await postEtiquetas({ id: "lead-1", etiquetas: ["resgate"] })).status).toBe(400);
    expect(chamadasAoChatwoot).toHaveLength(0);
  });

  it("mais de 20 de uma vez é recusado", async () => {
    const muitas = Array.from({ length: 21 }, (_, i) => `e${i}`);
    expect((await postEtiquetas({ id: "lead-1", incluir: muitas })).status).toBe(400);
  });

  it("sem token: 503, e nenhuma chamada", async () => {
    vi.stubEnv("CHATWOOT_API_TOKEN", "");
    const r = await postEtiquetas({ id: "lead-1", incluir: ["negociando"] });
    expect(r.status).toBe(503);
    expect((await r.json()).error).toContain("CHATWOOT_API_TOKEN");
    expect(chamadasAoChatwoot).toHaveLength(0);
  });

  it("endereço em http: o 503 diz isso, e não que falta o token", async () => {
    vi.stubEnv("NEXT_PUBLIC_CHATWOOT_URL", "http://chat.exemplo.com.br");
    const r = await postEtiquetas({ id: "lead-1", incluir: ["negociando"] });
    expect(r.status).toBe(503);
    const erro = (await r.json()).error;
    expect(erro).toContain("precisa ser https");
    expect(erro).not.toContain("CHATWOOT_API_TOKEN");
  });

  it("lead sem conversa: 409", async () => {
    const r = await postEtiquetas({ id: "lead-sem-conversa", incluir: ["negociando"] });
    expect(r.status).toBe(409);
    expect(chamadasAoChatwoot).toHaveLength(0);
  });

  it("leitura falhou: 502 e NÃO grava — gravar às cegas apagaria o que não se viu", async () => {
    statusDoChatwoot = 500;
    const r = await postEtiquetas({ id: "lead-1", incluir: ["negociando"] });
    expect(r.status).toBe(502);
    expect(chamadasAoChatwoot.map((c) => c.metodo)).toEqual(["GET"]);
    expect(rpcs).toHaveLength(0);
  });

  it("antes da migração (função ausente) grava no Chatwoot e segue sem aviso", async () => {
    erroDoRpc = { message: "Could not find the function", code: "PGRST202" };
    const d = await (await postEtiquetas({ id: "lead-1", incluir: ["negociando"] })).json();
    expect(d).toEqual({ ok: true, etiquetas: ["origem-site", "quer-comprar", "negociando"] });
  });

  it("rastro falhou por outro motivo: a etiqueta vale e a resposta avisa", async () => {
    erroDoRpc = { message: "boom", code: "XX000" };
    const r = await postEtiquetas({ id: "lead-1", incluir: ["negociando"] });
    const d = await r.json();
    expect(r.status).toBe(200);
    expect(d.etiquetas).toContain("negociando");
    expect(d.aviso).toContain("histórico do lead");
  });

  it("o SDR edita", async () => {
    usuario = "u-sdr";
    expect((await postEtiquetas({ id: "lead-1", incluir: ["negociando"] })).status).toBe(200);
  });

  it("o Comercial edita", async () => {
    usuario = "u-ana";
    expect((await postEtiquetas({ id: "lead-1", incluir: ["negociando"] })).status).toBe(200);
  });

  it.each([
    ["sem sessão", null, 401],
    ["cliente da Garagem", "u-cliente", 403],
    ["Marketing (vê só o volume)", "u-mkt", 403],
  ])("%s não edita", async (_caso, quem, status) => {
    usuario = quem;
    const r = await postEtiquetas({ id: "lead-1", incluir: ["negociando"] });
    expect(r.status).toBe(status);
    expect(chamadasAoChatwoot).toHaveLength(0);
  });
});

describe("GET /api/leads/etiquetas — o que o card oferece", () => {
  it("as criadas na conta do Chatwoot, em ordem", async () => {
    const d = await (await etiquetas.GET()).json();
    expect(d).toEqual({
      // As da conta, em ordem — sem as duas da passagem, que não entram à mão.
      etiquetas: ["negociando", "origem-site", "quer-comprar"],
      daConta: true,
      // Nenhuma das duas foi criada na conta deste Chatwoot falso.
      faltamNaConta: ["resgate", "reaquecido"],
    });
  });

  it("diz qual das duas da passagem falta criar na conta — e nenhuma quando as duas existem", async () => {
    etiquetasDaConta = ["resgate", "negociando"];
    expect((await (await etiquetas.GET()).json()).faltamNaConta).toEqual(["reaquecido"]);
    etiquetasDaConta = ["Resgate", "reaquecido"];
    expect((await (await etiquetas.GET()).json()).faltamNaConta).toEqual([]);
  });

  it("mesmo criadas na conta, resgate e reaquecido não são oferecidas para pôr à mão", async () => {
    etiquetasDaConta = ["resgate", "negociando", "Reaquecido"];
    expect((await (await etiquetas.GET()).json()).etiquetas).toEqual(["negociando"]);
  });

  it("sem token, lista vazia — sem chamar a API", async () => {
    vi.stubEnv("CHATWOOT_API_TOKEN", "");
    const d = await (await etiquetas.GET()).json();
    expect(d).toEqual({ etiquetas: [], daConta: false });
    expect(chamadasAoChatwoot).toHaveLength(0);
  });

  it("Chatwoot falhou: lista vazia e o motivo", async () => {
    statusDoChatwoot = 401;
    const d = await (await etiquetas.GET()).json();
    expect(d.etiquetas).toEqual([]);
    expect(d.aviso).toContain("token");
  });

  it("Marketing não lê", async () => {
    usuario = "u-mkt";
    expect((await etiquetas.GET()).status).toBe(403);
  });
});
