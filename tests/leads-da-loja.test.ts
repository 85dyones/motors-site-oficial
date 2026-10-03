import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Os números da LOJA sobre `leads` com a RLS fechada por escopo
 * (migração 20261003130000) — `src/lib/leadsDaLoja.ts` e quem o usa.
 *
 * O defeito que se trava: as telas de agregado liam `leads` com a sessão de
 * quem abria. Com a RLS por escopo, o Marketing passaria a contar zero e o
 * vendedor só os dele, sem erro nenhum. Cada caminho prova aqui três coisas:
 *
 *   (a) a porta continua na SESSÃO: sem usuário é 401, e a chave de serviço
 *       nem é chamada; quem não é da equipe não ganha a leitura da loja;
 *   (b) o número vem da chave de serviço: o dublê da sessão aplica a RLS por
 *       escopo (para o Marketing, nenhuma linha), e o número segue sendo o da
 *       loja;
 *   (c) nada de pessoa sai por ali: a chave de serviço só pede colunas de
 *       `COLUNAS_DE_AGREGADO`, e o dublê só devolve o que foi pedido.
 *
 * O relatório do funil tem o arquivo dele (`funil-relatorio-rota.test.ts`).
 */

type Linha = Record<string, unknown>;

const SESSAO = { auth: { getUser: vi.fn() }, from: vi.fn() };
const SERVICO = { from: vi.fn() };
/** `false` simula o ambiente sem `SUPABASE_SERVICE_ROLE_KEY`. */
let chaveDeServico = true;

vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => SESSAO,
  createAdminSupabaseClient: () => {
    if (!chaveDeServico) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not defined");
    return SERVICO;
  },
}));

const { COLUNAS_DE_AGREGADO, lerLeadsDaLoja, passeDaEquipe } = await import("../src/lib/leadsDaLoja");
const { leadNoEscopo, visaoDeLeads } = await import("../src/lib/escopoDeLeads");
const { janelaDeDias } = await import("../src/lib/midiaSync");
const { resumoDeMidia } = await import("../src/lib/midiaResumo");
const gerenciar = await import("../src/app/api/leads/gerenciar/route");
const campanhas = await import("../src/app/api/marketing/campanhas/route");
const campanha = await import("../src/app/api/marketing/campanhas/[id]/route");

const PESSOAL = /nome|telefone|email|mensagem|desfecho_nota|responsavel|\*/;

/** Quem está logado; `null` é sem sessão. */
let autor: { role: string; papeis: string[]; full_name: string } | null;
let banco: Record<string, Linha[]>;
/** Os `select` que cada cliente recebeu, por tabela. */
let pedidos: { sessao: Array<[string, string]>; servico: Array<[string, string]> };

const MARKETING = { role: "marketing", papeis: ["marketing"], full_name: "Mari" };
const FINANCEIRO = { role: "financeiro", papeis: ["financeiro"], full_name: "Fabi" };
const ANA = { role: "comercial", papeis: ["comercial"], full_name: "Ana" };
const GESTOR = { role: "gestor", papeis: ["gestor"], full_name: "Gil" };
const ADMIN = { role: "admin", papeis: ["admin"], full_name: "Dono" };
/** Cliente da Garagem: `authenticated`, e não é equipe. */
const CLIENTE_DA_GARAGEM = { role: "cliente", papeis: [], full_name: "Zé" };
const EQUIPE = [ADMIN, GESTOR, ANA, MARKETING, FINANCEIRO];

/**
 * Um construtor de consulta do supabase-js em memória. Os filtros que as rotas
 * usam valem de verdade; o `select` recorta as colunas, e é por isso que um
 * nome de cliente só chegaria à resposta se a rota o pedisse.
 */
function consulta(linhasDaTabela: Linha[], anotar: (colunas: string) => void) {
  const filtros: Array<(l: Linha) => boolean> = [];
  let colunas = "*";
  let limite = Infinity;
  const executar = () => {
    const achadas = linhasDaTabela.filter((l) => filtros.every((f) => f(l))).slice(0, limite);
    if (colunas === "*") return achadas;
    const quais = colunas.split(",").map((c) => c.trim());
    return achadas.map((l) => Object.fromEntries(quais.map((c) => [c, l[c]])));
  };
  const q = {
    select: (pedidas = "*") => {
      colunas = pedidas;
      anotar(pedidas);
      return q;
    },
    eq: (coluna: string, valor: unknown) => {
      filtros.push((l) => l[coluna] === valor);
      return q;
    },
    neq: (coluna: string, valor: unknown) => {
      filtros.push((l) => l[coluna] !== valor);
      return q;
    },
    not: (coluna: string, operador: string, valor: unknown) => {
      if (operador !== "is" || valor !== null) throw new Error("o dublê só conhece not(coluna, is, null)");
      filtros.push((l) => l[coluna] !== null && l[coluna] !== undefined);
      return q;
    },
    gte: (coluna: string, valor: string) => {
      filtros.push((l) => new Date(String(l[coluna])).getTime() >= new Date(valor).getTime());
      return q;
    },
    lte: () => q,
    in: (coluna: string, valores: unknown[]) => {
      filtros.push((l) => valores.includes(l[coluna]));
      return q;
    },
    order: () => q,
    limit: (n: number) => {
      limite = n;
      return q;
    },
    single: async () => ({ data: executar()[0] ?? null, error: executar()[0] ? null : { message: "não achou" } }),
    maybeSingle: async () => ({ data: executar()[0] ?? null, error: null }),
    then: (ok: (r: { data: Linha[]; error: null }) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve({ data: executar(), error: null }).then(ok, falha),
  };
  return q;
}

/** Dentro da janela de 7 dias, qualquer que seja o dia em que a suíte roda. */
const RECENTE = `${janelaDeDias(7).ate}T12:00:00-03:00`;
const ANTIGO = "2026-01-10T12:00:00-03:00";

const lead = (id: string, extra: Linha): Linha => ({
  id,
  nome: `Cliente ${id}`,
  telefone: "41999990000",
  email: `${id}@exemplo.com`,
  mensagem: "quero ver o carro",
  situacao: "novo",
  responsavel: null,
  utm_campaign: null,
  veiculo_id: null,
  created_at: RECENTE,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  chaveDeServico = true;
  autor = MARKETING;
  pedidos = { sessao: [], servico: [] };
  banco = {
    leads: [
      lead("l1", { responsavel: "Ana", utm_campaign: "Seminovos Outubro", veiculo_id: 10 }),
      lead("l2", { responsavel: "Bia", utm_campaign: "120001", veiculo_id: 10, situacao: "proposta" }),
      lead("l3", { responsavel: null, utm_campaign: "Seminovos Outubro", veiculo_id: 11 }),
      lead("l4", { responsavel: "Bia", utm_campaign: "campanha que ninguém cadastrou" }),
      lead("l5", { responsavel: "Ana", utm_campaign: "Seminovos Outubro", created_at: ANTIGO }),
      lead("l6", { responsavel: "Bia", utm_campaign: "Busca Google" }),
    ],
    midia_campanhas: [
      { id: "c-meta", plataforma: "meta", situacao: "no_ar", id_externo: "120001", nome: "Seminovos Outubro", criada_em: RECENTE },
      { id: "c-google", plataforma: "google", situacao: "no_ar", id_externo: "g-9", nome: "Busca Google", criada_em: RECENTE },
    ],
    midia_anuncios: [],
    midia_diario: [],
    midia_sincronizacoes: [],
    midia_ajustes: [],
    atendimentos: [],
    funil_etapas: [],
    funil_motivos: [],
  };

  SESSAO.auth.getUser.mockImplementation(async () => ({ data: { user: autor ? { id: "u1" } : null } }));
  SESSAO.from.mockImplementation((tabela: string) => {
    const anotar = (colunas: string) => pedidos.sessao.push([tabela, colunas]);
    if (tabela === "profiles") return consulta(autor ? [{ id: "u1", ...autor }] : [], anotar);
    if (tabela === "leads") {
      // A RLS da migração: a sessão só lê o que o escopo de quem pede alcança.
      const visao = visaoDeLeads(autor?.papeis ?? [], autor?.full_name);
      return consulta(
        banco.leads.filter((l) => leadNoEscopo(visao, l.responsavel as string | null)),
        anotar,
      );
    }
    if (!(tabela in banco)) throw new Error(`a sessão não lê: ${tabela}`);
    return consulta(banco[tabela], anotar);
  });
  SERVICO.from.mockImplementation((tabela: string) => {
    // A chave de serviço só serve ao agregado de leads; a mídia e o perfil
    // seguem na sessão.
    if (tabela !== "leads") throw new Error(`a chave de serviço não lê: ${tabela}`);
    return consulta(banco.leads, (colunas) => pedidos.servico.push([tabela, colunas]));
  });
});

/** (c): tudo o que a chave de serviço pediu é coluna de agregado. */
function esperarSoColunasDeAgregado(caso: string) {
  expect(pedidos.servico.length, caso).toBeGreaterThan(0);
  for (const [tabela, colunas] of pedidos.servico) {
    expect(tabela, caso).toBe("leads");
    expect(colunas, caso).not.toMatch(PESSOAL);
    for (const c of colunas.split(",").map((x) => x.trim())) {
      expect(COLUNAS_DE_AGREGADO as readonly string[], `${caso}: ${c}`).toContain(c);
    }
  }
}

/** (c), na saída: nenhum dado de lead no corpo da resposta. */
function esperarSemPessoa(corpo: unknown, caso: string) {
  const texto = JSON.stringify(corpo);
  expect(texto, caso).not.toMatch(/Cliente l\d|41999990000|@exemplo\.com|quero ver o carro/);
}

describe("lerLeadsDaLoja — a leitura com a chave de serviço", () => {
  it("o passe só sai para quem é da equipe", () => {
    for (const quem of EQUIPE) expect(passeDaEquipe(quem), quem.role).not.toBeNull();
    expect(passeDaEquipe(CLIENTE_DA_GARAGEM)).toBeNull();
    expect(passeDaEquipe({ role: "investidor", papeis: [] })).toBeNull();
    expect(passeDaEquipe(null)).toBeNull();
    expect(passeDaEquipe(undefined)).toBeNull();
  });

  it("a lista de colunas não tem nada que identifique o lead nem quem o atende", () => {
    for (const c of COLUNAS_DE_AGREGADO) expect(c).not.toMatch(PESSOAL);
    expect(COLUNAS_DE_AGREGADO as readonly string[]).not.toContain("id");
    expect(COLUNAS_DE_AGREGADO as readonly string[]).not.toContain("ag_uid");
    expect(COLUNAS_DE_AGREGADO as readonly string[]).not.toContain("interesse");
  });

  it("coluna fora da lista é recusada, e o banco nem é chamado", async () => {
    const passe = passeDaEquipe(MARKETING)!;
    for (const coluna of ["nome", "telefone", "email", "mensagem", "desfecho_nota", "responsavel", "id", "*"]) {
      const r = await lerLeadsDaLoja(passe, ["situacao", coluna] as never);
      expect(r.data, coluna).toBeNull();
      expect(r.error?.message, coluna).toContain(coluna);
    }
    expect((await lerLeadsDaLoja(passe, [])).error).not.toBeNull();
    expect(SERVICO.from).not.toHaveBeenCalled();
  });

  it("sem o passe não há leitura, mesmo que alguém force o tipo", async () => {
    for (const falso of [null, undefined, {}, true]) {
      const r = await lerLeadsDaLoja(falso as never, ["situacao"]);
      expect(r.data).toBeNull();
      expect(r.error?.message).toContain("passe");
    }
    expect(SERVICO.from).not.toHaveBeenCalled();
  });

  it("lê a loja inteira e devolve só o que pediu", async () => {
    const r = await lerLeadsDaLoja<{ situacao: string }>(passeDaEquipe(MARKETING)!, ["situacao"]);
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(banco.leads.length);
    expect(Object.keys(r.data![0])).toEqual(["situacao"]);
  });

  it("sem a chave de serviço devolve erro, e não lança", async () => {
    chaveDeServico = false;
    const r = await lerLeadsDaLoja(passeDaEquipe(MARKETING)!, ["situacao"]);
    expect(r).toEqual({ data: null, error: { message: "SUPABASE_SERVICE_ROLE_KEY is not defined" } });
  });
});

describe("GET /api/leads/gerenciar — a contagem do Marketing", () => {
  const pedir = (busca = "") => gerenciar.GET(new Request(`http://x/api/leads/gerenciar${busca}`) as never);

  it("(b) é a da loja inteira, embora a sessão do Marketing não leia lead nenhum", async () => {
    for (const quem of [MARKETING, FINANCEIRO]) {
      autor = quem;
      const r = await pedir();
      expect(r.status, quem.role).toBe(200);
      expect(await r.json(), quem.role).toEqual({
        somenteAgregado: true,
        total: 6,
        porSituacao: { novo: 5, proposta: 1 },
      });
    }
    // A sessão só leu o perfil: a tabela de leads não passou por ela.
    expect(pedidos.sessao.map(([tabela]) => tabela)).toEqual(["profiles", "profiles"]);
  });

  it("(c) a chave de serviço só pede a etapa, e nada de pessoa sai", async () => {
    const corpo = await (await pedir()).json();
    expect(pedidos.servico).toEqual([["leads", "situacao"]]);
    esperarSoColunasDeAgregado("gerenciar");
    esperarSemPessoa(corpo, "gerenciar");
    expect(corpo).not.toHaveProperty("leads");
  });

  it("(a) sem sessão é 401 e quem não é da equipe é 403, sem tocar na chave de serviço", async () => {
    autor = null;
    expect((await pedir()).status).toBe(401);
    autor = CLIENTE_DA_GARAGEM;
    expect((await pedir()).status).toBe(403);
    expect(SERVICO.from).not.toHaveBeenCalled();
  });

  it("(a) a busca por referência segue recusada ao Marketing, sem leitura nenhuma de leads", async () => {
    const r = await pedir("?ref=0DCB1CDC");
    expect(r.status).toBe(403);
    expect(SERVICO.from).not.toHaveBeenCalled();
    expect(pedidos.sessao.map(([tabela]) => tabela)).not.toContain("leads");
  });

  it("quem VÊ leads segue na sessão, pelo escopo: a chave de serviço não entra na fila", async () => {
    for (const [quem, ids] of [
      [ANA, ["l1", "l5"]],
      [GESTOR, ["l1", "l2", "l4", "l5", "l6"]],
      [ADMIN, ["l1", "l2", "l3", "l4", "l5", "l6"]],
    ] as const) {
      autor = quem;
      const corpo = await (await pedir()).json();
      expect(corpo.leads.map((l: Linha) => l.id).sort(), quem.role).toEqual(ids);
    }
    expect(SERVICO.from).not.toHaveBeenCalled();
  });

  it("chave de serviço fora do ar é 500, e não uma contagem zerada", async () => {
    chaveDeServico = false;
    const r = await pedir();
    expect(r.status).toBe(500);
    expect(await r.json()).not.toHaveProperty("total");
  });
});

describe("GET /api/marketing/campanhas — leads por campanha", () => {
  const pedir = () => campanhas.GET({ nextUrl: new URL("http://x/api/marketing/campanhas?dias=7") } as never);
  const contagem = (corpo: { campanhas: Array<{ id: string; leadsBanco: number | null }>; leadsSemCampanha: number | null }) => ({
    ...Object.fromEntries(corpo.campanhas.map((c) => [c.id, c.leadsBanco])),
    semCampanha: corpo.leadsSemCampanha,
  });
  // l1, l2 e l3 na campanha do Meta (por nome e por id externo), l6 na do
  // Google, l4 sem campanha; l5 é de fora da janela.
  const DA_LOJA = { "c-meta": 3, "c-google": 1, semCampanha: 1 };

  it("(b) é a contagem da loja para todo perfil da equipe", async () => {
    for (const quem of EQUIPE) {
      autor = quem;
      const r = await pedir();
      expect(r.status, quem.role).toBe(200);
      expect(contagem(await r.json()), quem.role).toEqual(DA_LOJA);
    }
  });

  it("(c) a chave de serviço só pede `utm_campaign`, e nada de pessoa sai", async () => {
    const corpo = await (await pedir()).json();
    expect(pedidos.servico).toEqual([["leads", "utm_campaign"]]);
    esperarSoColunasDeAgregado("campanhas");
    esperarSemPessoa(corpo, "campanhas");
    // A mídia e o perfil continuam lidos pela sessão.
    expect(pedidos.sessao.map(([tabela]) => tabela)).toEqual(
      expect.arrayContaining(["profiles", "midia_campanhas", "midia_diario"]),
    );
    expect(pedidos.sessao.map(([tabela]) => tabela)).not.toContain("leads");
  });

  it("(a) sem sessão é 401, sem tocar na chave de serviço", async () => {
    autor = null;
    expect((await pedir()).status).toBe(401);
    expect(SERVICO.from).not.toHaveBeenCalled();
  });

  it("(a) quem não é da equipe não ganha a leitura da loja: fica na sessão, e a RLS decide", async () => {
    autor = CLIENTE_DA_GARAGEM;
    const corpo = await (await pedir()).json();
    expect(SERVICO.from).not.toHaveBeenCalled();
    expect(contagem(corpo)).toEqual({ "c-meta": 0, "c-google": 0, semCampanha: 0 });
  });

  it("sem a chave de serviço a tela segue de pé, com a coluna em branco", async () => {
    chaveDeServico = false;
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(contagem(await r.json())).toEqual({ "c-meta": null, "c-google": null, semCampanha: null });
  });
});

describe("GET /api/marketing/campanhas/[id] — leads na vida da campanha", () => {
  const pedir = (id = "c-meta") => campanha.GET({} as never, { params: Promise.resolve({ id }) });

  it("(b) é a contagem da loja para todo perfil da equipe, sem janela", async () => {
    for (const quem of EQUIPE) {
      autor = quem;
      const r = await pedir();
      expect(r.status, quem.role).toBe(200);
      // l1, l2, l3 e o antigo l5.
      expect((await r.json()).leadsBanco, quem.role).toBe(4);
    }
  });

  it("(c) a chave de serviço só pede `utm_campaign`, e nada de pessoa sai", async () => {
    const corpo = await (await pedir()).json();
    expect(pedidos.servico).toEqual([["leads", "utm_campaign"]]);
    esperarSoColunasDeAgregado("campanha");
    esperarSemPessoa(corpo, "campanha");
    expect(pedidos.sessao.map(([tabela]) => tabela)).not.toContain("leads");
  });

  it("(a) sem sessão é 401; quem não é da equipe fica na sessão", async () => {
    autor = null;
    expect((await pedir()).status).toBe(401);
    autor = CLIENTE_DA_GARAGEM;
    expect((await (await pedir()).json()).leadsBanco).toBe(0);
    expect(SERVICO.from).not.toHaveBeenCalled();
  });

  it("sem a chave de serviço a tela segue de pé, com a contagem em branco", async () => {
    chaveDeServico = false;
    const r = await pedir();
    expect(r.status).toBe(200);
    expect((await r.json()).leadsBanco).toBeNull();
  });
});

describe("resumoDeMidia — o cartão de mídia da Visão geral", () => {
  const resumo = async (quem: typeof ADMIN) => {
    autor = quem;
    const r = await resumoDeMidia(SESSAO as never, passeDaEquipe(quem));
    return r && { meta: r.meta.leadsBanco, google: r.google.leadsBanco };
  };

  it("(b) com o passe, os leads por plataforma são os da loja para todo perfil", async () => {
    for (const quem of EQUIPE) {
      expect(await resumo(quem), quem.role).toEqual({ meta: 3, google: 1 });
    }
  });

  it("(c) a chave de serviço só pede `utm_campaign`; a mídia segue na sessão", async () => {
    const r = await resumoDeMidia(SESSAO as never, passeDaEquipe(MARKETING));
    expect(pedidos.servico).toEqual([["leads", "utm_campaign"]]);
    esperarSoColunasDeAgregado("resumoDeMidia");
    esperarSemPessoa(r, "resumoDeMidia");
    expect(pedidos.sessao.map(([tabela]) => tabela).sort()).toEqual([
      "midia_campanhas",
      "midia_diario",
      "midia_sincronizacoes",
    ]);
  });

  it("(a) sem passe a leitura fica na sessão, e a RLS decide", async () => {
    autor = ANA;
    const r = await resumoDeMidia(SESSAO as never);
    expect(SERVICO.from).not.toHaveBeenCalled();
    // Só o l1 da Ana (o l5 é de fora da janela).
    expect(r?.meta.leadsBanco).toBe(1);
    expect(r?.google.leadsBanco).toBe(0);
  });

  it("sem a chave de serviço o cartão segue de pé, com a contagem em branco", async () => {
    chaveDeServico = false;
    const r = await resumoDeMidia(SESSAO as never, passeDaEquipe(MARKETING));
    expect(r?.meta.leadsBanco).toBeNull();
    expect(r?.google.leadsBanco).toBeNull();
  });
});

describe("as páginas do painel — pela fonte", () => {
  const ler = (...partes: string[]) => readFileSync(join(process.cwd(), ...partes), "utf-8");
  const estoque = ler("src", "app", "admin", "estoque", "page.tsx");
  const visaoGeral = ler("src", "app", "admin", "page.tsx");

  it("o estoque conta leads por veículo pela chave de serviço, só com `veiculo_id`, e com o perfil da sessão", () => {
    // (a) O passe sai do perfil lido com a sessão de quem abriu a tela.
    const perfil = estoque.indexOf('.from("profiles")');
    const passe = estoque.indexOf("const passe = passeDaEquipe(profile);");
    expect(perfil).toBeGreaterThan(-1);
    expect(passe).toBeGreaterThan(perfil);
    expect(estoque.slice(estoque.lastIndexOf("await supabase", perfil), perfil)).toContain("await supabase");
    // (b) e (c) A leitura da loja é só de `veiculo_id`.
    expect(estoque).toContain('await lerLeadsDaLoja<{ veiculo_id: string | number | null }>(passe, ["veiculo_id"])');
    // Sem passe, a sessão: a mesma coluna, e a RLS decide.
    expect(estoque).toContain(': await supabase.from("leads").select("veiculo_id");');
    // Nenhuma outra leitura de leads na página.
    expect(estoque.split('.from("leads")')).toHaveLength(2);
    expect(estoque).not.toContain("createAdminSupabaseClient");
  });

  it("a Visão geral dá ao cartão de mídia o passe do perfil da sessão, e a fila de novos segue no escopo", () => {
    const perfil = visaoGeral.indexOf('await supabase.from("profiles").select("role, papeis, full_name")');
    const midia = visaoGeral.indexOf("await resumoDeMidia(supabase, passeDaEquipe(perfilDeQuemAbriu))");
    expect(perfil).toBeGreaterThan(-1);
    expect(midia).toBeGreaterThan(perfil);
    // O que traz nome de lead continua na sessão, com o escopo.
    expect(visaoGeral).toContain(
      'comEscopoDeLeads(\n    supabase.from("leads").select("id, nome, interesse, canal, created_at").eq("situacao", "novo"),',
    );
    expect(visaoGeral).not.toContain("createAdminSupabaseClient");
    expect(visaoGeral).not.toContain("lerLeadsDaLoja");
  });

  it("a agenda de pessoas NÃO vai para a chave de serviço: é dado pessoal, fica no escopo da sessão", () => {
    for (const rota of [ler("src", "app", "api", "pessoas", "route.ts"), ler("src", "app", "api", "pessoas", "duplicatas", "route.ts")]) {
      expect(rota).toContain('.from("agenda_de_pessoas")');
      expect(rota).not.toContain("createAdminSupabaseClient");
      expect(rota).not.toContain("leadsDaLoja");
    }
  });
});
