import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O PATCH de `/api/leads/gerenciar` e o lead sem responsável, EXECUTADO.
 *
 * Decisão do dono em 03/10/2026: só o Administrador deixa um lead sem
 * responsável. Vendedor (Comercial), SDR e Gestor não tiram o dono; passar o
 * lead a outra pessoa do Comercial e mexer no resto do card segue como era.
 *
 * O que se trava aqui:
 *   - nulo, vazio e só espaços são a mesma retirada, e os três recusam;
 *   - a recusa é 403 com a frase combinada, e NADA é escrito: nem o `update`,
 *     nem o registro de contato que venha no mesmo pedido;
 *   - o lead fora do escopo continua 404, e não 403;
 *   - o Admin tira o dono, e o que vai para o banco é nulo.
 *
 * Mesmo dublê de banco de `leads-gerenciar-desfecho.test.ts`, reduzido.
 */

const CLIENTE = { auth: { getUser: vi.fn() }, from: vi.fn(), rpc: vi.fn() };
vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => CLIENTE }));

const { PATCH } = await import("../src/app/api/leads/gerenciar/route");

const AVISO = "Só um administrador pode deixar o lead sem responsável.";

const ANA = { role: "comercial", papeis: ["comercial"], full_name: "Ana" };
const SDR = { role: "sdr", papeis: ["sdr"], full_name: "Felipe" };
const GESTOR = { role: "gestor", papeis: ["gestor"], full_name: "Gil" };
const DUPLO = { role: "comercial", papeis: ["comercial", "sdr"], full_name: "Ana" };
const ADMIN = { role: "admin", papeis: ["admin"], full_name: "Dono" };
const NAO_ADMINS = [ANA, SDR, GESTOR, DUPLO];

const EQUIPE = [
  { full_name: "Ana", role: "comercial", papeis: ["comercial"], is_active: true },
  { full_name: "Bia", role: "comercial", papeis: ["comercial"], is_active: true },
];

let autor: { role: string; papeis: string[]; full_name: string };
/** O responsável do lead no banco. */
let responsavelDoLead: string | null;
let gravacoes: Record<string, unknown>[];

type Resposta = Record<string, unknown>;

interface Consulta {
  select: () => Consulta;
  eq: (coluna: string, valor: unknown) => Consulta;
  neq: () => Consulta;
  not: () => Consulta;
  single: () => Promise<Resposta>;
  maybeSingle: () => Promise<Resposta>;
  then: (ok: (r: Resposta) => unknown, falha?: (e: unknown) => unknown) => Promise<unknown>;
}

/** Uma consulta que encadeia qualquer filtro e resolve com `resposta`. */
function consulta(resposta: (filtros: Record<string, unknown>) => Resposta): Consulta {
  const filtros: Record<string, unknown> = {};
  const q: Consulta = {
    select: () => q,
    eq: (coluna, valor) => {
      filtros[coluna] = valor;
      return q;
    },
    neq: () => q,
    not: () => q,
    single: async () => resposta(filtros),
    maybeSingle: async () => resposta(filtros),
    then: (ok, falha) => Promise.resolve(resposta(filtros)).then(ok, falha),
  };
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  autor = ANA;
  responsavelDoLead = "Ana";
  gravacoes = [];
  CLIENTE.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  CLIENTE.rpc.mockResolvedValue({ error: null });
  CLIENTE.from.mockImplementation((tabela: string) => {
    if (tabela === "profiles") {
      return consulta((f) => ({ data: f.id !== undefined ? autor : EQUIPE, error: null }));
    }
    if (tabela === "funil_etapas") {
      return consulta((f) => ({ data: { chave: f.chave, rotulo: String(f.chave), tipo: "andamento" }, error: null }));
    }
    // O rastro da passagem do SDR: ilegível aqui, a rota grava e só avisa.
    if (tabela === "leads_eventos") return consulta(() => ({ count: null, error: null }));
    if (tabela === "leads") {
      return {
        select: () => consulta(() => ({ data: { responsavel: responsavelDoLead }, error: null })),
        update: (campos: Record<string, unknown>) => {
          gravacoes.push(campos);
          return consulta(() => ({ error: null }));
        },
      };
    }
    throw new Error(`tabela inesperada: ${tabela}`);
  });
});

const chamar = (corpo: Record<string, unknown>) =>
  PATCH(
    new Request("http://x/api/leads/gerenciar", {
      method: "PATCH",
      body: JSON.stringify({ id: "lead-1", ...corpo }),
      headers: { "content-type": "application/json" },
    }) as never,
  );

describe("PATCH — só o Administrador deixa o lead sem responsável (03/10)", () => {
  it("vendedor, SDR e Gestor tirando o dono: 403 com a frase, e nada é gravado", async () => {
    for (const quem of NAO_ADMINS) {
      for (const vazio of [null, "", "   "]) {
        autor = quem;
        const caso = `${quem.papeis.join("+")} com ${JSON.stringify(vazio)}`;
        const r = await chamar({ responsavel: vazio });
        expect(r.status, caso).toBe(403);
        expect(await r.json(), caso).toEqual({ error: AVISO });
      }
    }
    expect(gravacoes).toEqual([]);
    expect(CLIENTE.rpc).not.toHaveBeenCalled();
  });

  it("a recusa derruba o pedido inteiro: nem o resto dos campos nem o contato são gravados", async () => {
    for (const quem of NAO_ADMINS) {
      autor = quem;
      const r = await chamar({
        responsavel: null,
        situacao: "em_contato",
        observacoes: "devolvo à fila",
        contato: "whatsapp",
      });
      expect(r.status, quem.role).toBe(403);
    }
    expect(gravacoes).toEqual([]);
    expect(CLIENTE.rpc).not.toHaveBeenCalled();
  });

  it("valor que nem texto é não passa pela trava", async () => {
    for (const estranho of [0, false, []]) {
      const r = await chamar({ responsavel: estranho });
      expect(r.status, JSON.stringify(estranho)).toBe(403);
    }
    expect(gravacoes).toEqual([]);
  });

  it("lead fora do escopo continua 404, e não 403: a resposta não confirma que ele existe", async () => {
    responsavelDoLead = "Bia";
    const r = await chamar({ responsavel: null });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "Lead não encontrado" });
    expect(gravacoes).toEqual([]);
  });

  it("o Admin tira o dono: 200, e o banco recebe nulo", async () => {
    autor = ADMIN;
    for (const vazio of [null, "", "   "]) {
      gravacoes = [];
      const r = await chamar({ responsavel: vazio });
      expect(r.status, JSON.stringify(vazio)).toBe(200);
      expect(gravacoes).toHaveLength(1);
      expect(gravacoes[0].responsavel).toBeNull();
    }
  });

  it("Admin em segundo papel também tira", async () => {
    autor = { role: "comercial", papeis: ["comercial", "admin"], full_name: "Ana" };
    const r = await chamar({ responsavel: null });
    expect(r.status).toBe(200);
    expect(gravacoes[0].responsavel).toBeNull();
  });
});

describe("PATCH — o que quem não é Admin continua fazendo", () => {
  it("passar o lead a outra pessoa do Comercial: vendedor, SDR e Gestor", async () => {
    for (const quem of NAO_ADMINS) {
      autor = quem;
      gravacoes = [];
      const r = await chamar({ responsavel: "Bia" });
      expect(r.status, quem.role).toBe(200);
      expect(gravacoes, quem.role).toHaveLength(1);
      expect(gravacoes[0].responsavel, quem.role).toBe("Bia");
    }
  });

  it("mover, anotar e registrar contato sem tocar no responsável", async () => {
    for (const quem of NAO_ADMINS) {
      autor = quem;
      gravacoes = [];
      CLIENTE.rpc.mockClear();
      const r = await chamar({ situacao: "em_contato", observacoes: "cobrar retorno", contato: "whatsapp" });
      expect(r.status, quem.role).toBe(200);
      expect(gravacoes, quem.role).toHaveLength(1);
      expect(gravacoes[0], quem.role).toMatchObject({ situacao: "em_contato", observacoes: "cobrar retorno" });
      expect(gravacoes[0], quem.role).not.toHaveProperty("responsavel");
      expect(CLIENTE.rpc, quem.role).toHaveBeenCalledTimes(1);
    }
  });
});
