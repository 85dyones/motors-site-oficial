import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O GET de `/api/funil/relatorio`, EXECUTADO — o recorte por vendedor e as
 * observações seguem o escopo de leads (regra do dono, 03/10/2026).
 *
 * O vendedor lê as notas e o desempenho DELE, e não os dos colegas; Gestor e
 * SDR, os dos leads que têm responsável; o Admin, os de todos. Os números do
 * topo (total, ganhos, perdidos, taxa) continuam sendo da loja para qualquer
 * um: é o que se trava aqui junto, para o recorte não vazar para o agregado.
 *
 * O banco é um dublê em memória: os leads fechados, os abertos e as tabelas do
 * funil. A leitura dos abertos é a que traz `is("desfecho", null)`.
 *
 * São DOIS clientes, como na rota. O da sessão (`CLIENTE`) lê `leads` já com a
 * RLS da migração 20261003130000: só o escopo de quem pede. O da chave de
 * serviço (`SERVICO`) lê a loja inteira, e devolve só as colunas pedidas, que
 * é como um nome de cliente apareceria aqui se a rota o pedisse.
 */

const CLIENTE = { auth: { getUser: vi.fn() }, from: vi.fn() };
const SERVICO = { from: vi.fn() };
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => CLIENTE,
  createAdminSupabaseClient: () => SERVICO,
}));

const { GET } = await import("../src/app/api/funil/relatorio/route");
const { leadNoEscopo, visaoDeLeads } = await import("../src/lib/escopoDeLeads");
const { COLUNAS_DE_AGREGADO } = await import("../src/lib/leadsDaLoja");

/** Os `select` que cada cliente recebeu em `leads`. */
let pedidosDaSessao: string[];
let pedidosDoServico: string[];

type Linha = Record<string, unknown>;

/** O perfil de quem chama. */
let autor: { role: string; papeis: string[]; full_name: string };

const fechado = (
  id: string,
  responsavel: string | null,
  desfecho: "ganho" | "perdido" | "descartado",
  nota: string | null,
  valor: number | null = null,
): Linha => ({
  id,
  nome: `Cliente ${id}`,
  situacao: desfecho,
  responsavel,
  created_at: "2026-09-01T12:00:00.000Z",
  desfecho,
  desfecho_motivo: null,
  desfecho_valor: valor,
  desfecho_nota: nota,
  desfecho_em: "2026-09-20T12:00:00.000Z",
});

const FECHADOS: Linha[] = [
  fechado("a-1", "Ana", "ganho", "fechou à vista", 60000),
  fechado("a-2", "Ana", "perdido", "queria prata"),
  fechado("b-1", "Bia", "ganho", "trocou pelo sedã", 80000),
  fechado("b-2", "Bia", "perdido", "achou caro"),
  fechado("b-3", "Bia", "perdido", null),
  fechado("s-1", null, "perdido", "ninguém atendeu"),
  fechado("x-1", "Ana", "descartado", "robô"),
];

const ABERTOS: Linha[] = [
  { situacao: "novo", responsavel: "Ana" },
  { situacao: "novo", responsavel: "Bia" },
  { situacao: "proposta", responsavel: "Bia" },
  { situacao: "novo", responsavel: null },
];

/** Só as colunas pedidas: o que o `select` não trouxe não existe na resposta. */
function recortar(linhas: unknown, colunas: string): unknown {
  if (!Array.isArray(linhas) || colunas === "*") return linhas;
  const quais = colunas.split(",").map((c) => c.trim());
  return linhas.map((l: Linha) => Object.fromEntries(quais.map((c) => [c, l[c]])));
}

/** Um construtor de consulta do supabase-js: encadeia, e resolve no fim. */
function consulta(ler: (soAbertos: boolean) => unknown, anotar: (colunas: string) => void = () => {}) {
  let soAbertos = false;
  let colunas = "*";
  const resposta = () => ({ data: recortar(ler(soAbertos), colunas), error: null });
  const q = {
    select: (pedidas = "*") => {
      colunas = pedidas;
      anotar(pedidas);
      return q;
    },
    eq: () => q,
    neq: () => q,
    not: () => q,
    gte: () => q,
    lt: () => q,
    order: () => q,
    limit: () => q,
    is: (coluna: string, valor: unknown) => {
      if (coluna === "desfecho" && valor === null) soAbertos = true;
      return q;
    },
    single: async () => resposta(),
    then: (ok: (r: { data: unknown; error: null }) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve(resposta()).then(ok, falha),
  };
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  autor = { role: "comercial", papeis: ["comercial"], full_name: "Ana" };
  pedidosDaSessao = [];
  pedidosDoServico = [];
  CLIENTE.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  CLIENTE.from.mockImplementation((tabela: string) => {
    if (tabela === "profiles") return consulta(() => autor);
    if (tabela === "leads") {
      // A RLS por escopo: a sessão só lê o que o escopo de quem pede alcança.
      const visao = visaoDeLeads(autor.papeis, autor.full_name);
      return consulta(
        (soAbertos) => (soAbertos ? ABERTOS : FECHADOS).filter((l) => leadNoEscopo(visao, l.responsavel as string | null)),
        (colunas) => pedidosDaSessao.push(colunas),
      );
    }
    if (tabela === "funil_etapas") return consulta(() => ETAPAS);
    if (tabela === "funil_motivos") return consulta(() => []);
    throw new Error(`a sessão não lê: ${tabela}`);
  });
  SERVICO.from.mockImplementation((tabela: string) => {
    // A chave de serviço só serve ao agregado de leads.
    if (tabela !== "leads") throw new Error(`a chave de serviço não lê: ${tabela}`);
    return consulta(
      (soAbertos) => (soAbertos ? ABERTOS : FECHADOS),
      (colunas) => pedidosDoServico.push(colunas),
    );
  });
});

const ETAPAS = [
  { chave: "novo", rotulo: "Novo", tipo: "aberta", ordem: 1 },
  { chave: "proposta", rotulo: "Proposta", tipo: "aberta", ordem: 2 },
];

interface Relatorio {
  total: number;
  ganhos: number;
  perdidos: number;
  descartados: number;
  valor_ganho: number;
  funil_atual: Array<{ chave: string; quantidade: number }>;
  observacoes?: Array<{ nota: string; responsavel: string | null }>;
  por_vendedor?: Array<{ nome: string; ganhos: number; perdidos: number; valor: number; abertos: number }>;
}

async function relatorio(quem: typeof autor): Promise<Relatorio> {
  autor = quem;
  // `request.nextUrl`: a rota lê a janela dali, e um `Request` puro não tem.
  const r = await GET({ nextUrl: new URL("http://x/api/funil/relatorio?de=2026-09-01&ate=2026-10-01") } as never);
  expect(r.status).toBe(200);
  return r.json();
}

const notas = (d: Relatorio) => (d.observacoes ?? []).map((o) => o.nota).sort();
const vendedores = (d: Relatorio) => (d.por_vendedor ?? []).map((v) => v.nome).sort();

/** O topo do relatório: da loja inteira, para quem quer que peça. */
const DA_LOJA = { total: 7, ganhos: 2, perdidos: 4, descartados: 1, valor_ganho: 140000 };

describe("GET /api/funil/relatorio — observações e recorte por vendedor, pelo escopo (03/10)", () => {
  it("o vendedor recebe as observações e o desempenho só dele", async () => {
    const d = await relatorio({ role: "comercial", papeis: ["comercial"], full_name: "Ana" });

    expect(notas(d)).toEqual(["fechou à vista", "queria prata"]);
    expect(d.observacoes?.every((o) => o.responsavel === "Ana")).toBe(true);
    expect(d.por_vendedor).toHaveLength(1);
    expect(d.por_vendedor?.[0]).toMatchObject({ nome: "Ana", ganhos: 1, perdidos: 1, valor: 60000, abertos: 1 });
    // Nada da colega em lugar nenhum da resposta.
    expect(JSON.stringify(d)).not.toContain("Bia");
    expect(JSON.stringify(d)).not.toContain("achou caro");
    // E o agregado continua sendo o da loja.
    expect(d).toMatchObject(DA_LOJA);
  });

  it("cada vendedor, o seu: a Bia não lê as notas da Ana", async () => {
    const d = await relatorio({ role: "comercial", papeis: ["comercial"], full_name: "Bia" });
    expect(notas(d)).toEqual(["achou caro", "trocou pelo sedã"]);
    expect(d.por_vendedor).toHaveLength(1);
    expect(d.por_vendedor?.[0]).toMatchObject({ nome: "Bia", ganhos: 1, perdidos: 2, valor: 80000, abertos: 2 });
  });

  it("o Admin recebe de todos, inclusive do lead sem responsável", async () => {
    const d = await relatorio({ role: "admin", papeis: ["admin"], full_name: "Dono" });

    expect(notas(d)).toEqual(["achou caro", "fechou à vista", "ninguém atendeu", "queria prata", "trocou pelo sedã"]);
    expect(vendedores(d)).toEqual(["Ana", "Bia", "Sem responsável"]);
    expect(d.por_vendedor?.find((v) => v.nome === "Sem responsável")).toMatchObject({ ganhos: 0, perdidos: 1, abertos: 1 });
    expect(d).toMatchObject(DA_LOJA);
    // O descarte segue fora das observações e do recorte, para qualquer um.
    expect(notas(d)).not.toContain("robô");
  });

  it.each([
    ["Gestor", { role: "gestor", papeis: ["gestor"], full_name: "Gil" }],
    ["SDR", { role: "sdr", papeis: ["sdr"], full_name: "Felipe" }],
  ])("%s recebe os dos leads que têm responsável, e não o sem responsável", async (_caso, quem) => {
    const d = await relatorio(quem);
    expect(notas(d)).toEqual(["achou caro", "fechou à vista", "queria prata", "trocou pelo sedã"]);
    expect(vendedores(d)).toEqual(["Ana", "Bia"]);
    expect(d).toMatchObject(DA_LOJA);
  });

  it.each([
    ["Marketing", { role: "marketing", papeis: ["marketing"], full_name: "Mari" }],
    ["Financeiro", { role: "financeiro", papeis: ["financeiro"], full_name: "Fabi" }],
  ])("%s segue sem observações e sem recorte por vendedor, só com o agregado", async (_caso, quem) => {
    const d = await relatorio(quem);
    expect(d).not.toHaveProperty("observacoes");
    expect(d).not.toHaveProperty("por_vendedor");
    expect(d).toMatchObject(DA_LOJA);
  });
});

const PAPEIS = [
  { role: "admin", papeis: ["admin"], full_name: "Dono" },
  { role: "gestor", papeis: ["gestor"], full_name: "Gil" },
  { role: "sdr", papeis: ["sdr"], full_name: "Felipe" },
  { role: "comercial", papeis: ["comercial"], full_name: "Ana" },
  { role: "marketing", papeis: ["marketing"], full_name: "Mari" },
  { role: "financeiro", papeis: ["financeiro"], full_name: "Fabi" },
];

describe("GET /api/funil/relatorio — o agregado é da loja, pela chave de serviço (RLS por escopo)", () => {
  it("o topo e o funil de hoje são os da loja para todo perfil, mesmo com a sessão lendo só o escopo", async () => {
    for (const quem of PAPEIS) {
      const d = await relatorio(quem);
      expect(d, quem.role).toMatchObject(DA_LOJA);
      expect(d.funil_atual, quem.role).toEqual([
        { chave: "novo", rotulo: "Novo", quantidade: 3 },
        { chave: "proposta", rotulo: "Proposta", quantidade: 1 },
      ]);
    }
  });

  it("a chave de serviço só pede colunas sem pessoa: nem nome, nem nota, nem responsável", async () => {
    for (const quem of PAPEIS) {
      pedidosDoServico = [];
      await relatorio(quem);
      expect(pedidosDoServico, quem.role).toHaveLength(2);
      for (const pedido of pedidosDoServico) {
        for (const coluna of pedido.split(",").map((c) => c.trim())) {
          expect(COLUNAS_DE_AGREGADO as readonly string[], `${quem.role}: ${coluna}`).toContain(coluna);
        }
        expect(pedido).not.toMatch(/nome|telefone|email|mensagem|desfecho_nota|responsavel|\*/);
      }
      expect(SERVICO.from.mock.calls.every(([tabela]) => tabela === "leads"), quem.role).toBe(true);
    }
  });

  it("o que é por lead (nota, responsável) vem da SESSÃO; quem não vê pessoas nem a consulta", async () => {
    await relatorio({ role: "comercial", papeis: ["comercial"], full_name: "Ana" });
    expect(pedidosDaSessao).toHaveLength(2);
    expect(pedidosDaSessao[0]).toContain("desfecho_nota");
    expect(pedidosDaSessao[0]).not.toMatch(/nome|telefone|email|mensagem/);

    pedidosDaSessao = [];
    const d = await relatorio({ role: "marketing", papeis: ["marketing"], full_name: "Mari" });
    expect(pedidosDaSessao).toEqual([]);
    // Nenhum nome de quem atende, nenhuma nota, em lugar nenhum da resposta.
    expect(JSON.stringify(d)).not.toMatch(/Ana|Bia|Cliente|queria prata|achou caro/);
  });

  it("sem sessão é 401, e quem não é da equipe é 403: a chave de serviço nem é chamada", async () => {
    const pedir = () => GET({ nextUrl: new URL("http://x/api/funil/relatorio") } as never);

    CLIENTE.auth.getUser.mockResolvedValue({ data: { user: null } });
    expect((await pedir()).status).toBe(401);

    CLIENTE.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    for (const fora of ["cliente", "investidor"]) {
      autor = { role: fora, papeis: [], full_name: "Fulano" };
      expect((await pedir()).status, fora).toBe(403);
    }
    expect(SERVICO.from).not.toHaveBeenCalled();
  });

  it("a porta é a da sessão: o perfil é lido pelo cliente de quem pede", async () => {
    await relatorio({ role: "marketing", papeis: ["marketing"], full_name: "Mari" });
    expect(CLIENTE.auth.getUser).toHaveBeenCalledTimes(1);
    expect(CLIENTE.from.mock.calls.map(([tabela]) => tabela)).toContain("profiles");
  });

  it("chave de serviço que falha é 500, e não um relatório zerado", async () => {
    SERVICO.from.mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not defined");
    });
    const r = await GET({ nextUrl: new URL("http://x/api/funil/relatorio") } as never);
    expect(r.status).toBe(500);
  });
});
