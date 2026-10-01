import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A lista e a ficha interna do estoque são da equipe — 2026-10-01.
 *
 * Achado no mapeamento dos dados do estoque: `GET /api/estoque` e
 * `GET /api/estoque/[id]` conferiam só que havia sessão. Cliente da Garagem e
 * investidor com login são `authenticated` sem ser equipe, e recebiam a placa
 * de todo o pátio (a lista) ou a linha INTEIRA de um carro (a ficha: placa,
 * chassi, renavam e custo de compra).
 *
 * Quem consome cada uma: a lista alimenta o seletor de veículo do painel de
 * investidores (`/admin/investidores` — Admin, Gestor e Financeiro); a ficha
 * não tem consumidor na tela, que só faz PATCH nela. As duas são porta de
 * painel, e a régua é a mesma das rotas irmãs (`lote`, `descritivo`, o PATCH):
 * `ehStaff` ANTES de qualquer leitura.
 *
 * O corpo do 403 é conferido, e não só o status: é o que distingue o gate de
 * equipe de qualquer outra recusa que viesse a existir depois dele.
 */

const CLIENTE = { auth: { getUser: vi.fn() }, from: vi.fn() };
vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => CLIENTE }));

const getEstoque = vi.fn();
vi.mock("../src/lib/supabase", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  getEstoque: (...a: unknown[]) => getEstoque(...a),
}));

const lista = await import("../src/app/api/estoque/route");
const ficha = await import("../src/app/api/estoque/[id]/route");

const LINHA_DO_BANCO = {
  id: 8009174,
  marca: "VOLKSWAGEN",
  modelo: "UP",
  placa: "ABC1D23",
  chassi: "9BWAG45U0KT000001",
  renavam: "01234567890",
  preco_compra: 41000,
};

/** O que foi lido de `estoque_motors` — a recusa tem de vir ANTES disso. */
const leiturasDoEstoque: string[] = [];

function comPerfil(papeis: string[] | null) {
  CLIENTE.auth.getUser.mockResolvedValue(
    papeis === null ? { data: { user: null } } : { data: { user: { id: "u1", email: "a@b.c" } } },
  );
  CLIENTE.from.mockImplementation((tabela: string) => {
    if (tabela === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { role: papeis?.[0] ?? null, papeis, full_name: "Teste" } }),
          }),
        }),
      };
    }
    leiturasDoEstoque.push(tabela);
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: LINHA_DO_BANCO, error: null }) }) }),
    };
  });
}

const pedirLista = () => lista.GET();
const pedirFicha = () =>
  ficha.GET(new Request("http://x/api/estoque/8009174") as never, { params: Promise.resolve({ id: "8009174" }) });

beforeEach(() => {
  vi.clearAllMocks();
  leiturasDoEstoque.length = 0;
  getEstoque.mockResolvedValue([
    { id: "8009174", marca: "VOLKSWAGEN", modelo: "UP", versao: "", ano: 2019, quilometragem: 52000, preco_original: 54900, vendido: false, placa: "ABC1D23" },
  ]);
});

describe("GET /api/estoque — o seletor de veículo do painel", () => {
  it("recusa quem não tem sessão", async () => {
    comPerfil(null);
    expect((await pedirLista()).status).toBe(401);
  });

  for (const papel of ["cliente", "investidor"]) {
    it(`recusa ${papel}, que é authenticated sem ser equipe — e não lê o estoque`, async () => {
      comPerfil([papel]);
      const r = await pedirLista();
      expect(r.status).toBe(403);
      expect((await r.json()).error).toBe("Acesso restrito à equipe");
      expect(getEstoque).not.toHaveBeenCalled();
    });
  }

  it("o sócio que também é da equipe entra pelo papel de equipe", async () => {
    comPerfil(["investidor", "financeiro"]);
    expect((await pedirLista()).status).toBe(200);
  });

  for (const papel of ["admin", "gestor", "financeiro", "comercial"]) {
    it(`entrega a lista com placa a ${papel}`, async () => {
      comPerfil([papel]);
      const r = await pedirLista();
      expect(r.status).toBe(200);
      const { veiculos } = await r.json();
      expect(veiculos[0].placa).toBe("ABC1D23");
    });
  }
});

describe("GET /api/estoque/[id] — a linha inteira de um carro", () => {
  it("recusa quem não tem sessão", async () => {
    comPerfil(null);
    expect((await pedirFicha()).status).toBe(401);
  });

  for (const papel of ["cliente", "investidor"]) {
    it(`recusa ${papel} — e não lê o estoque`, async () => {
      comPerfil([papel]);
      const r = await pedirFicha();
      expect(r.status).toBe(403);
      const corpo = await r.json();
      expect(corpo.error).toBe("Acesso restrito à equipe");
      expect(JSON.stringify(corpo)).not.toContain(LINHA_DO_BANCO.chassi);
      expect(leiturasDoEstoque).toEqual([]);
    });
  }

  it("entrega a linha à equipe", async () => {
    comPerfil(["admin"]);
    const r = await pedirFicha();
    expect(r.status).toBe(200);
    expect((await r.json()).veiculo.chassi).toBe(LINHA_DO_BANCO.chassi);
  });
});
