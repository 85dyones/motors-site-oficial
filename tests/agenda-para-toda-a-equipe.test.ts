import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";

/**
 * A agenda é de toda a equipe; o lead, não (05/10/2026).
 *
 * Decisão do dono: *"A agenda precisa ser vista por todos, o lead não. São
 * coisas diferentes."*
 *
 * O que se trava aqui, com as rotas e o proxy EXECUTADOS:
 *   - os seis perfis de painel leem a agenda (tela, lista e conferência de
 *     duplicatas); perfil desativado, cliente da Garagem, investidor e pedido
 *     sem sessão, não;
 *   - a escrita não alargou: admin, gestor, comercial e financeiro chegam ao
 *     banco como antes; Marketing e SDR são recusados no proxy e na rota, e o
 *     pedido recusado não grava nem lê tabela nenhuma;
 *   - na pessoa que veio de um lead, etapa e anotações só viajam para quem
 *     enxerga AQUELE lead, e o link só existe para essa pessoa. Vale com a RLS
 *     de `leads` aberta (produção hoje) e fechada por escopo (20261003130000);
 *   - o menu mostra a agenda aos seis, e o SDR não ganha de carona Leads nem a
 *     Visão geral.
 *
 * Banco em memória. A view `agenda_de_pessoas` é imitada como a migração
 * 20261005150000 a escreve: o diretório do lead (nome, telefone, e-mail) para
 * toda a equipe, e as colunas comerciais só quando a RLS de `leads` entrega a
 * linha a quem pergunta.
 */

type Linha = Record<string, unknown>;

let banco: Record<string, Linha[]>;
let usuario: string | null;
/** A RLS de `leads` fechada por escopo (20261003130000) já foi aplicada? */
let rlsPorEscopo: boolean;
/** Tudo o que tocou o banco, na ordem: `select leads`, `insert parceiros`… */
let linhaDoTempo: string[];

const { leadNoEscopo, visaoDeLeads, escopoDeLeads } = await import("../src/lib/escopoDeLeads");

const quemPede = () => (banco.profiles ?? []).find((p) => p.id === usuario);

function leadsPelaRls(): Linha[] {
  if (!rlsPorEscopo) return banco.leads;
  const perfil = quemPede();
  const visao = visaoDeLeads(perfil?.is_active === true ? (perfil.papeis as string[]) : [], perfil?.full_name as string);
  return banco.leads.filter((l) => leadNoEscopo(visao, l.responsavel as string | null));
}

/** A view, na pele de quem pergunta. */
function agendaDeQuemPergunta(): Linha[] {
  const visiveis = new Set(leadsPelaRls().map((l) => l.id));
  const dosLeads = banco.leads.map((l) => ({
    origem: "lead",
    id: l.id,
    nome: l.nome,
    papel: "lead",
    especialidade: visiveis.has(l.id) ? l.situacao : null,
    documento: null,
    telefone: l.telefone,
    email: l.email,
    cidade: null,
    observacoes: visiveis.has(l.id) ? l.observacoes : null,
    ativo: true,
    created_at: "2026-10-01T12:00:00Z",
  }));
  return [...banco.cadastros, ...dosLeads];
}

function consulta(tabela: string) {
  const filtros: Array<(l: Linha) => boolean> = [];
  let gesto: "select" | "insert" | "update" | "delete" = "select";
  let valores: Linha | null = null;
  let colunas = "*";
  let faixa: [number, number] | null = null;

  const base = () =>
    tabela === "agenda_de_pessoas" ? agendaDeQuemPergunta() : tabela === "leads" ? leadsPelaRls() : (banco[tabela] ??= []);
  const recortar = (l: Linha): Linha =>
    colunas === "*" ? { ...l } : Object.fromEntries(colunas.split(",").map((c) => [c.trim(), l[c.trim()] ?? null]));

  const executar = async () => {
    linhaDoTempo.push(`${gesto} ${tabela}`);
    if (gesto === "insert") {
      const nova = { id: `novo-${banco[tabela]?.length ?? 0}`, ...valores };
      (banco[tabela] ??= []).push(nova);
      return { data: [nova], error: null, count: 1 };
    }
    const achadas = base().filter((l) => filtros.every((f) => f(l)));
    if (gesto === "update") achadas.forEach((l) => Object.assign(l, valores));
    if (gesto === "delete") banco[tabela] = banco[tabela].filter((l) => !achadas.includes(l));
    const ordenadas = [...achadas].sort((a, b) => String(a.nome ?? a.id).localeCompare(String(b.nome ?? b.id)));
    const pagina = faixa ? ordenadas.slice(faixa[0], faixa[1] + 1) : ordenadas;
    return { data: pagina.map(recortar), error: null, count: achadas.length };
  };

  const q = {
    select: (pedidas = "*") => {
      colunas = pedidas;
      return q;
    },
    insert: (linha: Linha) => {
      gesto = "insert";
      valores = linha;
      return q;
    },
    update: (campos: Linha) => {
      gesto = "update";
      valores = campos;
      return q;
    },
    delete: () => {
      gesto = "delete";
      return q;
    },
    order: () => q,
    range: (de: number, ate: number) => {
      faixa = [de, ate];
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
    not: (coluna: string) => {
      filtros.push((l) => l[coluna] !== null && l[coluna] !== undefined);
      return q;
    },
    in: (coluna: string, lista: unknown[]) => {
      filtros.push((l) => lista.includes(l[coluna]));
      return q;
    },
    or: () => q,
    single: async () => {
      const r = await executar();
      return { data: r.data[0] ?? null, error: null };
    },
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => executar().then(ok, erro),
  };
  return q;
}

const CLIENTE = {
  auth: { getUser: async () => ({ data: { user: usuario ? { id: usuario, email: `${usuario}@loja.com` } : null } }) },
  from: (tabela: string) => consulta(tabela),
};
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => CLIENTE,
  createAdminSupabaseClient: () => {
    throw new Error("a agenda não usa a chave de serviço");
  },
}));
// O proxy monta o próprio cliente a partir dos cookies: o mesmo banco.
vi.mock("@supabase/ssr", () => ({ createServerClient: () => CLIENTE }));

let caminho = "/admin/clientes";
vi.mock("next/navigation", () => ({
  usePathname: () => caminho,
  useSearchParams: () => ({ get: () => null }),
  redirect: (para: string) => {
    throw new Error(`redirect:${para}`);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

const lista = await import("../src/app/api/pessoas/route");
const duplicatas = await import("../src/app/api/pessoas/duplicatas/route");
const umaPessoa = await import("../src/app/api/pessoas/[id]/route");
const { proxy } = await import("../src/proxy");
const { default: ClientesPage } = await import("../src/app/admin/clientes/page");
const { ligacaoDoLead, leadAVista, paraQuemPergunta, podeGerenciarAgenda, podeVerAgenda } = await import("../src/lib/agenda");
const { ACAO_GERENCIAR_AGENDA, ACAO_VER_AGENDA, MATRIZ_DE_PERMISSOES, PERFIS, podeFazer } = await import(
  "../src/lib/permissoes"
);

// ----------------------------------------------------------------------------
// A fixture
// ----------------------------------------------------------------------------

const L_DA_ANA = "11111111-1111-4111-8111-111111111111";
const L_DO_BETO = "22222222-2222-4222-8222-222222222222";
const L_SEM_DONO = "33333333-3333-4333-8333-333333333333";

const QUEM_GERENCIA = ["admin", "gestor", "comercial", "financeiro"] as const;
const SO_LEEM = ["marketing", "sdr"] as const;

beforeEach(() => {
  usuario = null;
  rlsPorEscopo = false;
  linhaDoTempo = [];
  caminho = "/admin/clientes";
  banco = {
    profiles: [
      { id: "admin", role: "admin", papeis: ["admin"], full_name: "Dona", is_active: true },
      { id: "gestor", role: "gestor", papeis: ["gestor"], full_name: "Gil", is_active: true },
      { id: "marketing", role: "marketing", papeis: ["marketing"], full_name: "Mara", is_active: true },
      { id: "comercial", role: "comercial", papeis: ["comercial"], full_name: "Ana", is_active: true },
      { id: "financeiro", role: "financeiro", papeis: ["financeiro"], full_name: "Fabi", is_active: true },
      { id: "sdr", role: "sdr", papeis: ["sdr"], full_name: "Sol", is_active: true },
      { id: "saiu", role: "comercial", papeis: ["comercial"], full_name: "Ex", is_active: false },
      { id: "garagem", role: "cliente", papeis: ["cliente"], full_name: "Cliente", is_active: true },
      { id: "socio", role: "investidor", papeis: ["investidor"], full_name: "Sócio", is_active: true },
    ],
    cadastros: [
      {
        origem: "financeiro",
        id: "p-1",
        nome: "AutoPeças Curitiba",
        papel: "fornecedor",
        especialidade: null,
        documento: "12345678000190",
        telefone: "4130000000",
        email: null,
        cidade: "Curitiba",
        observacoes: "Paga em 28 dias",
        ativo: true,
        created_at: "2026-08-24T12:00:00Z",
      },
    ],
    parceiros: [{ id: "p-1", nome: "AutoPeças Curitiba", tipo: "fornecedor", ativo: true }],
    leads: [
      { id: L_DA_ANA, nome: "Carla", telefone: "41911110000", email: "carla@x.com", situacao: "Em negociação", observacoes: "Onix — quer parcelar", responsavel: "Ana" },
      { id: L_DO_BETO, nome: "Davi", telefone: "41922220000", email: null, situacao: "Visita marcada", observacoes: "HB20 — volta sábado", responsavel: "Beto" },
      { id: L_SEM_DONO, nome: "Eva", telefone: "41933330000", email: null, situacao: "Novo", observacoes: "Kwid — pediu contato", responsavel: null },
    ],
  };
});

const pedido = (url: string, method = "GET", corpo?: unknown) =>
  new NextRequest(`http://loja.test${url}`, {
    method,
    ...(corpo ? { body: JSON.stringify(corpo), headers: { "content-type": "application/json" } } : {}),
  });

async function lerAgenda(quem: string | null) {
  usuario = quem;
  const res = await lista.GET(pedido("/api/pessoas?ativo=todos"));
  const corpo = (await res.json()) as { pessoas?: Linha[]; total?: number; error?: string };
  return { status: res.status, corpo, porId: (id: string) => corpo.pessoas?.find((p) => p.id === id) };
}

const gravacoes = () => linhaDoTempo.filter((l) => !l.startsWith("select"));
const foraDePerfis = () => linhaDoTempo.filter((l) => l !== "select profiles");

// ----------------------------------------------------------------------------
// A matriz
// ----------------------------------------------------------------------------

describe("a matriz separa ver de gerenciar", () => {
  it("ver a agenda é dos seis perfis de painel", () => {
    expect(MATRIZ_DE_PERMISSOES.map((l) => l.acao)).toContain(ACAO_VER_AGENDA);
    for (const p of PERFIS) {
      expect(podeFazer(p, ACAO_VER_AGENDA), p).toBe("faz");
      expect(podeVerAgenda([p]), p).toBe(true);
    }
    expect(podeVerAgenda([])).toBe(false);
  });

  it("gerenciar continua com os quatro de antes", () => {
    for (const p of QUEM_GERENCIA) expect(podeGerenciarAgenda([p]), p).toBe(true);
    for (const p of SO_LEEM) {
      expect(podeFazer(p, ACAO_GERENCIAR_AGENDA), p).toBe("nao_ve");
      expect(podeGerenciarAgenda([p]), p).toBe(false);
    }
    // Multi-papel soma: quem é Marketing E Comercial gerencia.
    expect(podeGerenciarAgenda(["marketing", "comercial"])).toBe(true);
  });

  it("abrir a agenda não abriu o lead: Marketing e Financeiro seguem sem escopo", () => {
    expect(podeFazer("marketing", "Ver e mover leads no kanban")).toBe("nao_ve");
    expect(podeFazer("financeiro", "Ver e mover leads no kanban")).toBe("nao_ve");
    expect(escopoDeLeads(["marketing"])).toBe("nenhum");
    expect(escopoDeLeads(["financeiro"])).toBe("nenhum");
  });
});

// ----------------------------------------------------------------------------
// Ler
// ----------------------------------------------------------------------------

describe("ler a agenda", () => {
  it("cada um dos seis perfis recebe as pessoas, com contato", async () => {
    for (const quem of PERFIS) {
      const { status, corpo, porId } = await lerAgenda(quem);
      expect(status, quem).toBe(200);
      expect(corpo.total, quem).toBe(4);
      expect(porId("p-1")?.nome, quem).toBe("AutoPeças Curitiba");
      // A pessoa do lead é da agenda de todos: nome, telefone e e-mail.
      expect(porId(L_DA_ANA), quem).toMatchObject({ nome: "Carla", telefone: "41911110000", email: "carla@x.com", papel: "lead" });
    }
  });

  it("a conferência de duplicatas também é leitura, e é dos seis", async () => {
    for (const quem of PERFIS) {
      usuario = quem;
      const res = await duplicatas.GET();
      expect(res.status, quem).toBe(200);
      expect((await res.json()).analisadas, quem).toBe(4);
    }
  });

  it("o proxy deixa os seis passarem na tela e nos GET", async () => {
    for (const quem of PERFIS) {
      usuario = quem;
      for (const url of ["/admin/clientes", "/api/pessoas", "/api/pessoas/duplicatas"]) {
        const res = await proxy(pedido(url));
        expect(res.status, `${quem} ${url}`).toBe(200);
        expect(res.headers.get("location"), `${quem} ${url}`).toBeNull();
      }
    }
  });

  it("a página entrega à tela quem gerencia e o escopo de leads de cada perfil", async () => {
    const esperado: Record<string, [boolean, string]> = {
      admin: [true, "todos"],
      gestor: [true, "designados"],
      marketing: [false, "nenhum"],
      comercial: [true, "meus"],
      financeiro: [true, "nenhum"],
      sdr: [false, "designados"],
    };
    for (const quem of PERFIS) {
      usuario = quem;
      const elemento = (await ClientesPage()) as { props: { podeGerenciar: boolean; escopoDeLeads: string } };
      expect([elemento.props.podeGerenciar, elemento.props.escopoDeLeads], quem).toEqual(esperado[quem]);
    }
  });
});

describe("quem não é da equipe ativa não lê", () => {
  it("perfil desativado: 403 nas rotas, sem tocar na agenda, e fora da página", async () => {
    const { status, corpo } = await lerAgenda("saiu");
    expect(status).toBe(403);
    expect(corpo.pessoas).toBeUndefined();
    expect((await duplicatas.GET()).status).toBe(403);
    expect((await lista.POST(pedido("/api/pessoas", "POST", { nome: "X", papel: "cliente" }))).status).toBe(403);
    expect(foraDePerfis()).toEqual([]);
    await expect(ClientesPage()).rejects.toThrow("redirect:/admin");
  });

  it("cliente da Garagem e investidor: 403 na rota e no proxy", async () => {
    for (const quem of ["garagem", "socio"]) {
      expect((await lerAgenda(quem)).status, quem).toBe(403);
      expect((await proxy(pedido("/api/pessoas"))).status, quem).toBe(403);
      await expect(ClientesPage(), quem).rejects.toThrow("redirect:/admin");
    }
    expect(foraDePerfis()).toEqual([]);
  });

  it("sem sessão: 401", async () => {
    expect((await lerAgenda(null)).status).toBe(401);
    expect((await duplicatas.GET()).status).toBe(401);
    expect((await proxy(pedido("/api/pessoas"))).status).toBe(401);
  });
});

// ----------------------------------------------------------------------------
// Escrever
// ----------------------------------------------------------------------------

const ESCRITAS: Array<[string, () => Promise<Response>]> = [
  ["POST /api/pessoas", () => lista.POST(pedido("/api/pessoas", "POST", { nome: "Nova Oficina", papel: "fornecedor" }))],
  [
    "PATCH /api/pessoas/p-1",
    () => umaPessoa.PATCH(pedido("/api/pessoas/p-1", "PATCH", { origem: "financeiro", telefone: "4199" }), { params: Promise.resolve({ id: "p-1" }) }),
  ],
  [
    "DELETE /api/pessoas/p-1",
    () => umaPessoa.DELETE(pedido("/api/pessoas/p-1?origem=financeiro", "DELETE"), { params: Promise.resolve({ id: "p-1" }) }),
  ],
];

describe("a escrita não alargou", () => {
  it("Marketing e SDR: a rota recusa com 403 e nada chega ao banco", async () => {
    for (const quem of SO_LEEM) {
      usuario = quem;
      for (const [nome, escrever] of ESCRITAS) {
        const res = await escrever();
        expect(res.status, `${quem} ${nome}`).toBe(403);
        expect((await res.json()).error, `${quem} ${nome}`).toMatch(/consulta a agenda/);
      }
    }
    expect(foraDePerfis()).toEqual([]);
    expect(banco.parceiros).toEqual([{ id: "p-1", nome: "AutoPeças Curitiba", tipo: "fornecedor", ativo: true }]);
  });

  it("Marketing e SDR: o proxy recusa POST, PATCH e DELETE, como recusava", async () => {
    for (const quem of SO_LEEM) {
      usuario = quem;
      for (const [url, metodo] of [
        ["/api/pessoas", "POST"],
        ["/api/pessoas/p-1", "PATCH"],
        ["/api/pessoas/p-1?origem=financeiro", "DELETE"],
      ]) {
        const res = await proxy(pedido(url, metodo, metodo === "DELETE" ? undefined : { nome: "X" }));
        expect(res.status, `${quem} ${metodo}`).toBe(403);
      }
    }
  });

  it("admin, gestor, comercial e financeiro passam pelo proxy e chegam ao banco, como antes", async () => {
    for (const quem of QUEM_GERENCIA) {
      usuario = quem;
      linhaDoTempo = [];
      expect((await proxy(pedido("/api/pessoas", "POST", { nome: "X" }))).status, quem).toBe(200);
      for (const [nome, escrever] of ESCRITAS) expect((await escrever()).status, `${quem} ${nome}`).toBe(200);
      // O que cada cadastro aceita de cada perfil é regra do banco, e não mudou.
      expect(gravacoes(), quem).toEqual(["insert parceiros", "update parceiros", "delete parceiros"]);
      banco.parceiros = [{ id: "p-1", nome: "AutoPeças Curitiba", tipo: "fornecedor", ativo: true }];
    }
  });
});

// ----------------------------------------------------------------------------
// O lead dentro da agenda
// ----------------------------------------------------------------------------

describe("o registro do lead só acompanha a pessoa para quem enxerga o lead", () => {
  const semRegistro = { especialidade: null, observacoes: null };

  for (const fechada of [false, true]) {
    describe(fechada ? "com a RLS de leads por escopo" : "com a RLS de leads aberta (produção hoje)", () => {
      beforeEach(() => {
        rlsPorEscopo = fechada;
      });

      it("Marketing e Financeiro (escopo nenhum): a pessoa vem, a etapa e a nota não", async () => {
        for (const quem of ["marketing", "financeiro"]) {
          const { porId, corpo } = await lerAgenda(quem);
          for (const id of [L_DA_ANA, L_DO_BETO, L_SEM_DONO]) {
            expect(porId(id), `${quem} ${id}`).toMatchObject({ papel: "lead", ...semRegistro });
            expect(ligacaoDoLead(porId(id) as never, escopoDeLeads([quem])), `${quem} ${id}`).toBeNull();
          }
          expect(JSON.stringify(corpo), quem).not.toMatch(/quer parcelar|volta sábado|pediu contato|Em negociação/);
          // Escopo "nenhum" nem pergunta ao módulo de leads.
          expect(linhaDoTempo, quem).not.toContain("select leads");
          // O que não é lead segue inteiro.
          expect(porId("p-1")?.observacoes, quem).toBe("Paga em 28 dias");
        }
      });

      it("Comercial: o lead dele inteiro e com link; o do colega e o sem dono, só o contato", async () => {
        const { porId } = await lerAgenda("comercial");
        expect(porId(L_DA_ANA)).toMatchObject({ especialidade: "Em negociação", observacoes: "Onix — quer parcelar" });
        expect(ligacaoDoLead(porId(L_DA_ANA) as never, "meus")).toBe(`/admin/leads/${L_DA_ANA}`);
        for (const id of [L_DO_BETO, L_SEM_DONO]) {
          expect(porId(id), id).toMatchObject({ telefone: expect.any(String), ...semRegistro });
          expect(ligacaoDoLead(porId(id) as never, "meus"), id).toBeNull();
        }
      });

      it("Gestor e SDR: os que têm responsável; o sem responsável, só o contato", async () => {
        for (const quem of ["gestor", "sdr"]) {
          const { porId } = await lerAgenda(quem);
          expect(ligacaoDoLead(porId(L_DA_ANA) as never, "designados"), quem).toBe(`/admin/leads/${L_DA_ANA}`);
          expect(ligacaoDoLead(porId(L_DO_BETO) as never, "designados"), quem).toBe(`/admin/leads/${L_DO_BETO}`);
          expect(porId(L_SEM_DONO), quem).toMatchObject({ nome: "Eva", ...semRegistro });
          expect(ligacaoDoLead(porId(L_SEM_DONO) as never, "designados"), quem).toBeNull();
        }
      });

      it("Admin: todos, com link", async () => {
        const { porId } = await lerAgenda("admin");
        for (const id of [L_DA_ANA, L_DO_BETO, L_SEM_DONO]) {
          expect(porId(id)?.especialidade, id).toEqual(expect.any(String));
          expect(ligacaoDoLead(porId(id) as never, "todos"), id).toBe(`/admin/leads/${id}`);
        }
      });
    });
  }

  it("o link nunca sai para o escopo nenhum, mesmo que a etapa chegue por engano", () => {
    const comEtapa = { origem: "lead" as const, id: L_DA_ANA, especialidade: "Novo" };
    expect(leadAVista(comEtapa, "nenhum")).toBe(false);
    expect(ligacaoDoLead(comEtapa, "nenhum")).toBeNull();
    expect(ligacaoDoLead(comEtapa, "meus")).toBe(`/admin/leads/${L_DA_ANA}`);
    // Etapa vazia é o sinal de "fora do alcance" em qualquer escopo.
    for (const vazio of [null, undefined, "", "  "]) {
      expect(ligacaoDoLead({ ...comEtapa, especialidade: vazio }, "todos"), String(vazio)).toBeNull();
    }
    // Prestador tem `especialidade` (oficina, seguradora) e não é lead.
    expect(ligacaoDoLead({ origem: "rede", id: "r-1", especialidade: "Oficina" }, "todos")).toBeNull();
  });

  it("o corte só mexe na pessoa de origem lead", () => {
    const prestador = { origem: "rede" as const, id: "r-1", nome: "Oficina", papel: "prestador" as const, especialidade: "Funilaria", observacoes: "Boa", ativo: true };
    const lead = { origem: "lead" as const, id: L_DA_ANA, nome: "Carla", papel: "lead" as const, especialidade: "Novo", observacoes: "Onix", telefone: "41", ativo: true };
    expect(paraQuemPergunta([prestador, lead], "nenhum", new Set([L_DA_ANA]))).toEqual([
      prestador,
      { ...lead, especialidade: null, observacoes: null },
    ]);
    expect(paraQuemPergunta([lead], "meus", new Set([L_DA_ANA]))).toEqual([lead]);
    expect(paraQuemPergunta([lead], "meus", new Set())[0]).toMatchObject({ telefone: "41", especialidade: null, observacoes: null });
  });
});

// ----------------------------------------------------------------------------
// O menu
// ----------------------------------------------------------------------------

describe("o menu", () => {
  async function menu(perfis: string[]) {
    const { default: SidebarNav } = await import("../src/components/admin/SidebarNav");
    return renderToStaticMarkup(createElement(SidebarNav, { perfis }));
  }

  it("mostra Clientes e fornecedores aos seis perfis", async () => {
    for (const p of PERFIS) expect(await menu([p]), p).toContain('href="/admin/clientes"');
    expect(await menu(["cliente"])).not.toContain('href="/admin/clientes"');
  });

  it("o SDR ganhou a agenda, e não Leads, Ganhos e perdas nem a Visão geral", async () => {
    const html = await menu(["sdr"]);
    expect(html).not.toContain('href="/admin/leads"');
    expect(html).not.toContain('href="/admin/leads/relatorio"');
    expect(html).not.toContain(">Visão geral<");
    // E o Marketing continua vendo o que via.
    const mkt = await menu(["marketing"]);
    expect(mkt).toContain('href="/admin/leads"');
    expect(mkt).toContain(">Visão geral<");
  });
});
