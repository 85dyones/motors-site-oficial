import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { carregarPainel } from "../src/lib/carregarPainelDeGuias";

/**
 * A LEITURA da tela de guias — a metade que apagava texto.
 *
 * O caminho de salvar já tinha trava; o de carregar não tinha nenhuma, e a
 * revisão de 07/09 mostrou que era ele o perigoso. Duas mutações passavam
 * verdes na suíte cheia: apagar as quatro linhas que preenchem o cabeçalho em
 * `carregar()`, e remover `cabecalho`/`padrao` da resposta do GET.
 *
 * E não era só cobertura ausente. Com o código de então, um GET que falhasse
 * deixava os campos vazios, liberava a tela e MANTINHA o botão Salvar
 * habilitado — e como o PUT substitui a linha inteira, um clique apagava o
 * cabeçalho que estava no ar. A tela não tinha como distinguir "está vazio" de
 * "não consegui ler".
 *
 * O conserto tem duas peças. A trava (`cabecalhoLido` no componente) e esta
 * função, que diz explicitamente se deu certo em vez de comunicar por exceção.
 */

const CLIENTE = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => CLIENTE,
}));

/** O que `lerCabecalhoGravado` devolve nesta rodada. */
let gravado = { tituloSeo: null as string | null, resumo: null as string | null };

vi.mock("../src/lib/secaoDeGuias", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return { ...real, lerCabecalhoGravado: async () => gravado };
});

describe("carregarPainel lê o cabeçalho junto da lista", () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  function respondendo(corpo: unknown, ok = true) {
    globalThis.fetch = (async () => ({ ok, json: async () => corpo })) as never;
  }

  it("traz o gravado e o padrão, separados", async () => {
    // São coisas diferentes de propósito: o gravado vai para o campo, o padrão
    // vira `placeholder`. Sem o segundo, o campo em branco parece página sem
    // texto — quando ela está no automático.
    respondendo({
      guias: [],
      regua: [],
      cabecalho: { tituloSeo: "Do painel", resumo: "" },
      padrao: { tituloSeo: "Do código", resumo: "Resumo do código" },
    });
    const r = await carregarPainel();

    expect(r.ok).toBe(true);
    expect(r.ok && r.cabecalho).toEqual({ tituloSeo: "Do painel", resumo: "" });
    expect(r.ok && r.padrao).toEqual({ tituloSeo: "Do código", resumo: "Resumo do código" });
  });

  it("cabeçalho ausente vira os dois campos vazios, e não `undefined`", async () => {
    // Vazio é o estado "automático" em toda a cadeia. `undefined` num `value`
    // de input transforma o campo em não-controlado no meio da digitação.
    respondendo({ guias: [], regua: [] });
    const r = await carregarPainel();

    expect(r.ok && r.cabecalho).toEqual({ tituloSeo: "", resumo: "" });
    expect(r.ok && r.padrao).toEqual({ tituloSeo: "", resumo: "" });
  });

  it("erro do servidor NÃO vira carga bem-sucedida vazia", async () => {
    // Este é o teste que a entrega não tinha. Devolver `ok: true` com campos
    // vazios aqui é exatamente o caminho que apagava o texto do dono.
    respondendo({ error: "Falha no banco" }, false);
    const r = await carregarPainel();

    expect(r.ok).toBe(false);
    expect(!r.ok && r.texto).toBe("Falha no banco");
  });

  it("rede caída também não vira carga vazia", async () => {
    globalThis.fetch = (async () => {
      throw new Error("Failed to fetch");
    }) as never;
    const r = await carregarPainel();

    expect(r.ok).toBe(false);
  });

  it("200 com aviso de tabela ausente carrega e avisa", async () => {
    // A rota devolve 200 com `error` quando a migração ainda não rodou. É carga
    // BOA — a tela precisa funcionar — mas com recado.
    respondendo({ guias: [], regua: [], error: "A tabela de guias ainda não existe" });
    const r = await carregarPainel();

    expect(r.ok).toBe(true);
    expect(r.ok && r.aviso).toContain("ainda não existe");
  });
});

describe("o GET de /api/guias entrega o cabeçalho", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gravado = { tituloSeo: null, resumo: null };
    CLIENTE.auth.getUser.mockResolvedValue({ data: { user: { id: "staff-1" } } });
    CLIENTE.from.mockImplementation((tabela: string) => {
      if (tabela === "profiles") {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { role: "admin", papeis: ["admin"] } }) }),
          }),
        };
      }
      return { select: () => ({ order: async () => ({ data: [], error: null }) }) };
    });
  });

  async function get() {
    const { GET } = await import("../src/app/api/guias/route");
    return (await GET()).json();
  }

  it("devolve o gravado e o padrão do código", async () => {
    gravado = { tituloSeo: "Gravado", resumo: null };
    const corpo = await get();

    expect(corpo.cabecalho).toEqual({ tituloSeo: "Gravado", resumo: null });
    // O padrão viaja junto porque a tela não tem outra forma de saber qual é o
    // texto que o site publica quando o campo está vazio.
    expect(corpo.padrao?.tituloSeo).toBeTruthy();
    expect(corpo.padrao?.resumo).toBeTruthy();
  });
});
