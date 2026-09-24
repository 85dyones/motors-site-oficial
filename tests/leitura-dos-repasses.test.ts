import { describe, it, expect, beforeEach, vi } from "vitest";
import { repasseDaLinha, COLUNAS_PUBLICAS_DO_REPASSE, lerRepassesPublicos, lerRepassePorSlug } from "../src/lib/leituraDosRepasses";
import { repasseDeTeste } from "./repasseDeTeste";

/** A linha como o PostgREST entrega: numeric pode vir em texto, jsonb como array. */
function linhaDoBanco(parcial: Record<string, unknown> = {}): Record<string, unknown> {
  // `arquivado_em` não é coluna pública: a linha anônima nunca a traz.
  const publico: Record<string, unknown> = { ...repasseDeTeste() };
  delete publico.arquivado_em;
  return { ...publico, preco: "36900.00", fipe_valor: "42100.00", ...parcial };
}

describe("repasseDaLinha", () => {
  it("converte a linha pública no Repasse do código", () => {
    const r = repasseDaLinha(linhaDoBanco());
    expect(r).not.toBeNull();
    expect(r!.preco).toBe(36900);
    expect(r!.fipe_valor).toBe(42100);
    expect(r!.itens_de_estado).toHaveLength(3);
    expect(r!.arquivado_em).toBeNull();
  });

  it("valor fora da lista fechada vira null, nunca passa adiante", () => {
    const r = repasseDaLinha(linhaDoBanco({ laudo: "reprovado", carroceria: "conversivel" }));
    expect(r!.laudo).toBeNull();
    expect(r!.carroceria).toBeNull();
  });

  it("item da ficha sem descrição é descartado; orçamento em texto vira número", () => {
    const r = repasseDaLinha(
      linhaDoBanco({
        itens_de_estado: [
          { descricao: "", local: "x" },
          { descricao: "Embreagem", local: "Câmbio", foto: "f", orcamento: "1400", estetico: false },
        ],
      }),
    );
    expect(r!.itens_de_estado).toEqual([
      { descricao: "Embreagem", local: "Câmbio", foto: "f", orcamento: 1400, estetico: false },
    ]);
  });

  it("linha sem o essencial não vira carro", () => {
    expect(repasseDaLinha(linhaDoBanco({ slug: null }))).toBeNull();
    expect(repasseDaLinha(linhaDoBanco({ preco: null }))).toBeNull();
    expect(repasseDaLinha(linhaDoBanco({ situacao: "sumiu" }))).toBeNull();
  });
});

describe("COLUNAS_PUBLICAS_DO_REPASSE", () => {
  it("nunca inclui quem cadastrou, quem validou ou a org", () => {
    for (const interna of ["criado_por", "validado_por", "enviado_em", "validado_em", "devolvido_com", "org_id", "updated_at"]) {
      expect(COLUNAS_PUBLICAS_DO_REPASSE as readonly string[]).not.toContain(interna);
    }
  });
});

// Mock do supabase com estado compartilhado
interface FakeQueryState {
  tabelaSelecionada: string | null;
  selecao: string | null;
  filtroIn: { coluna: string; valores: string[] } | null;
  filtroEq: { coluna: string; valor: string } | null;
  ordem: { coluna: string; ascending: boolean } | null;
}

const estado = vi.hoisted(() => ({
  cliente: null as unknown,
  estado: {
    tabelaSelecionada: null,
    selecao: null,
    filtroIn: null,
    filtroEq: null,
    ordem: null,
  } as FakeQueryState,
  resultado: { data: null as unknown, error: null as unknown },
  chamadas: [] as string[],
}));

vi.mock("../src/lib/supabase", () => ({
  get supabase() {
    return estado.cliente;
  },
}));

describe("lerRepassesPublicos", () => {
  beforeEach(() => {
    estado.estado = {
      tabelaSelecionada: null,
      selecao: null,
      filtroIn: null,
      filtroEq: null,
      ordem: null,
    };
    estado.resultado = { data: null, error: null };
    estado.chamadas = [];
    estado.cliente = null;
  });

  it("com cliente null, devolve lista vazia", async () => {
    estado.cliente = null;
    const resultado = await lerRepassesPublicos();
    expect(resultado).toEqual([]);
  });

  it("consulta a tabela 'repasses' com as colunas públicas", async () => {
    estado.cliente = criarFakeSupabase();
    estado.resultado = { data: [], error: null };

    await lerRepassesPublicos();

    expect(estado.estado.tabelaSelecionada).toBe("repasses");
    expect(estado.estado.selecao).toBe(COLUNAS_PUBLICAS_DO_REPASSE.join(","));
    expect(estado.estado.filtroIn?.coluna).toBe("situacao");
    expect(estado.estado.filtroIn?.valores).toEqual(["publicado", "reservado", "vendido"]);
    expect(estado.estado.ordem?.coluna).toBe("created_at");
    expect(estado.estado.ordem?.ascending).toBe(false);
  });

  it("filtra por carência: descarta vendido 100 dias atrás, mantém vendido 10 dias atrás", async () => {
    estado.cliente = criarFakeSupabase();
    const agora = new Date("2026-09-24");
    const vendidoVelhoEmMs = new Date(agora.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const vendidoNovoEmMs = new Date(agora.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();

    estado.resultado = {
      data: [
        linhaDoBanco({ slug: "velho", situacao: "vendido", vendido_em: vendidoVelhoEmMs, preco: "36900.00" }),
        linhaDoBanco({ slug: "novo", situacao: "vendido", vendido_em: vendidoNovoEmMs, preco: "36900.00" }),
        linhaDoBanco({ slug: "publicado", situacao: "publicado", preco: "36900.00" }),
      ],
      error: null,
    };

    const resultado = await lerRepassesPublicos(agora);

    expect(resultado).toHaveLength(2);
    const slugs = resultado.map((r) => r.slug);
    expect(slugs).toContain("novo");
    expect(slugs).toContain("publicado");
    expect(slugs).not.toContain("velho");
  });

  it("descarta linhas malformadas (preco null)", async () => {
    estado.cliente = criarFakeSupabase();
    const base = linhaDoBanco();
    // Create linha boa with all required fields explicitly set and situacao: publicado
    const linhaComPreco: Record<string, unknown> = {
      ...base,
      slug: "bom",
      situacao: "publicado",
      preco: "36900.00",
      quilometragem: "71200",
      ano_modelo: "2021",
    };
    const linhaSemPreco: Record<string, unknown> = {
      ...base,
      slug: "ruim",
      situacao: "publicado",
      preco: null,
      quilometragem: "71200",
      ano_modelo: "2021",
    };
    estado.resultado = {
      data: [linhaComPreco, linhaSemPreco],
      error: null,
    };

    const resultado = await lerRepassesPublicos();

    expect(resultado).toHaveLength(1);
    expect(resultado[0].slug).toBe("bom");
  });

  it("rejeita com erro quando o banco retorna erro", async () => {
    estado.cliente = criarFakeSupabase();
    estado.resultado = { data: null, error: { message: "boom de teste" } };

    await expect(lerRepassesPublicos()).rejects.toThrow(/boom de teste/);
  });
});

describe("lerRepassePorSlug", () => {
  beforeEach(() => {
    estado.estado = {
      tabelaSelecionada: null,
      selecao: null,
      filtroIn: null,
      filtroEq: null,
      ordem: null,
    };
    estado.resultado = { data: null, error: null };
    estado.chamadas = [];
    estado.cliente = null;
  });

  it("com slug inválido (../x), não chama from()", async () => {
    estado.cliente = criarFakeSupabase();
    const resultado = await lerRepassePorSlug("../x");

    expect(resultado).toBeNull();
    expect(estado.estado.tabelaSelecionada).toBeNull();
  });

  it("com slug válido, consulta com eq() e retorna o carro", async () => {
    estado.cliente = criarFakeSupabase();
    const slug = "renault-kwid-zen-1-0-2021-3f9a1c";
    const linha = linhaDoBanco({ slug });
    estado.resultado = { data: linha, error: null };

    const resultado = await lerRepassePorSlug(slug);

    expect(estado.estado.tabelaSelecionada).toBe("repasses");
    expect(estado.estado.selecao).toBe(COLUNAS_PUBLICAS_DO_REPASSE.join(","));
    expect(estado.estado.filtroEq?.coluna).toBe("slug");
    expect(estado.estado.filtroEq?.valor).toBe(slug);
    expect(resultado?.slug).toBe(slug);
  });

  it("com data null, retorna null", async () => {
    estado.cliente = criarFakeSupabase();
    estado.resultado = { data: null, error: null };

    const resultado = await lerRepassePorSlug("qualquer-slug");

    expect(resultado).toBeNull();
  });

  it("com erro, rejeita", async () => {
    estado.cliente = criarFakeSupabase();
    estado.resultado = { data: null, error: { message: "erro slug" } };

    await expect(lerRepassePorSlug("slug")).rejects.toThrow(/erro slug/);
  });
});

// Fake supabase builder
function criarFakeSupabase() {
  return {
    from: (tabela: string) => {
      estado.estado.tabelaSelecionada = tabela;
      return {
        select: (sel: string) => {
          estado.estado.selecao = sel;
          return {
            in: (coluna: string, valores: string[]) => {
              estado.estado.filtroIn = { coluna, valores };
              return {
                order: (coluna: string, opts?: { ascending?: boolean }) => {
                  estado.estado.ordem = { coluna, ascending: opts?.ascending ?? true };
                  return Promise.resolve(estado.resultado);
                },
              };
            },
            eq: (coluna: string, valor: string) => {
              estado.estado.filtroEq = { coluna, valor };
              return {
                maybeSingle: () => Promise.resolve(estado.resultado),
              };
            },
          };
        },
      };
    },
  };
}
