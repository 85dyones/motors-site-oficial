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
 */

const CLIENTE = { auth: { getUser: vi.fn() }, from: vi.fn() };
vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => CLIENTE }));

const { GET } = await import("../src/app/api/funil/relatorio/route");

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

/** Um construtor de consulta do supabase-js: encadeia, e resolve no fim. */
function consulta(ler: (soAbertos: boolean) => unknown) {
  let soAbertos = false;
  const resposta = () => ({ data: ler(soAbertos), error: null });
  const q = {
    select: () => q,
    eq: () => q,
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
  CLIENTE.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  CLIENTE.from.mockImplementation((tabela: string) => {
    if (tabela === "profiles") return consulta(() => autor);
    if (tabela === "leads") return consulta((soAbertos) => (soAbertos ? ABERTOS : FECHADOS));
    if (tabela === "funil_etapas" || tabela === "funil_motivos") return consulta(() => []);
    throw new Error(`tabela inesperada: ${tabela}`);
  });
});

interface Relatorio {
  total: number;
  ganhos: number;
  perdidos: number;
  descartados: number;
  valor_ganho: number;
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
