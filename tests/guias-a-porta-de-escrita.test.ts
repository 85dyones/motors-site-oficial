import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A porta de escrita dos guias, e o módulo que os lê.
 *
 * Nasce porque a revisão provou, com a suíte cheia, que os dois estavam nus:
 *
 *  · apagou o 401 e o 403 de `autorizar()` — POST, PUT e DELETE abertos a
 *    qualquer um — e 126 arquivos / 2183 testes ficaram VERDES;
 *  · substituiu toda a distinção de erro de `guiasDoBanco` por `return []` e
 *    `return null`, que é exatamente o argumento do commit ("falha ESTOURA e a
 *    página não é servida"), e ficou verde de novo.
 *
 * É a terceira vez na mesma entrega que o padrão aparece: trava para o que
 * renderiza, nenhuma para a porta nova. (A RLS contém a primeira mutação de
 * verdade — `anon` não tem GRANT de escrita —, mas cobertura que depende de
 * outra camada não é cobertura: é sorte documentada.)
 */

const CLIENTE = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => CLIENTE,
}));

/** Uma sessão sem permissão, para provar o 403. */
function comoVisitante() {
  CLIENTE.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  CLIENTE.from.mockReturnValue({
    select: () => ({ eq: () => ({ single: async () => ({ data: { role: "cliente", papeis: [] } }) }) }),
  });
}

function semSessao() {
  CLIENTE.auth.getUser.mockResolvedValue({ data: { user: null } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("nenhum verbo de escrita responde sem autorização", () => {
  const corpo = { slug: "x", titulo: "T", descricao: "D", corpo: [], faq: [], saida: null };

  it("POST sem sessão devolve 401", async () => {
    semSessao();
    const { POST } = await import("../src/app/api/guias/route");
    const r = await POST(
      new Request("http://localhost/api/guias", { method: "POST", body: JSON.stringify(corpo) }) as never,
    );
    expect(r.status).toBe(401);
  });

  it("PUT sem sessão devolve 401", async () => {
    semSessao();
    const { PUT } = await import("../src/app/api/guias/route");
    const r = await PUT(
      new Request("http://localhost/api/guias", { method: "PUT", body: JSON.stringify(corpo) }) as never,
    );
    expect(r.status).toBe(401);
  });

  it("DELETE sem sessão devolve 401", async () => {
    semSessao();
    const { DELETE } = await import("../src/app/api/guias/route");
    const r = await DELETE(new Request("http://localhost/api/guias?slug=x") as never);
    expect(r.status).toBe(401);
  });

  it("GET sem sessão devolve 401 — rascunho não vaza nem pela listagem", async () => {
    semSessao();
    const { GET } = await import("../src/app/api/guias/route");
    expect((await GET()).status).toBe(401);
  });

  it("quem tem sessão mas não tem o papel leva 403", async () => {
    comoVisitante();
    const { POST } = await import("../src/app/api/guias/route");
    const r = await POST(
      new Request("http://localhost/api/guias", { method: "POST", body: JSON.stringify(corpo) }) as never,
    );
    expect(r.status).toBe(403);
  });
});

describe("guiasDoBanco distingue ausência de falha", () => {
  /**
   * A distinção é o motivo de o módulo existir:
   *
   *  · tabela AUSENTE é ambiente atrasado → lista vazia, e o build passa;
   *  · qualquer outra falha ESTOURA → a rota não serve 404 de página viva.
   */
  function comSupabase(resposta: { data?: unknown; error?: unknown }) {
    vi.doMock("../src/lib/supabase", () => ({
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({
              order: async () => resposta,
              eq: () => ({ maybeSingle: async () => resposta }),
            }),
          }),
        }),
      },
    }));
  }

  beforeEach(() => {
    vi.resetModules();
  });

  it("tabela ausente devolve lista vazia — o build não pode quebrar", async () => {
    comSupabase({ error: { code: "PGRST205", message: "Could not find the table" } });
    const { listarGuiasPublicados } = await import("../src/lib/guiasDoBanco");

    await expect(listarGuiasPublicados()).resolves.toEqual([]);
  });

  it("qualquer outra falha ESTOURA — 404 falso em página indexada custa semanas", async () => {
    comSupabase({ error: { code: "57014", message: "canceling statement due to timeout" } });
    const { listarGuiasPublicados, GuiasIndisponiveisError } = await import(
      "../src/lib/guiasDoBanco"
    );

    await expect(listarGuiasPublicados()).rejects.toBeInstanceOf(GuiasIndisponiveisError);
  });

  it("na busca por slug, tabela ausente vira 404 e falha vira erro", async () => {
    comSupabase({ error: { code: "PGRST205", message: "Could not find the table" } });
    const semTabela = await import("../src/lib/guiasDoBanco");
    await expect(semTabela.buscarGuiaPublicado("x")).resolves.toBeNull();

    vi.resetModules();
    comSupabase({ error: { code: "57014", message: "timeout" } });
    const comFalha = await import("../src/lib/guiasDoBanco");
    await expect(comFalha.buscarGuiaPublicado("x")).rejects.toThrow();
  });
});

describe("os validadores da escrita", () => {
  /**
   * Testados de verdade, e não pelo `startsWith` solto que a primeira versão
   * deste arquivo checava — teatro que passava sem tocar no código de produção.
   *
   * Só deu para fazer isso porque as funções saíram de `app/api/guias/route.ts`
   * para `lib/guiaValidacao.ts`: um route handler do Next não pode exportar
   * nada além dos verbos HTTP.
   */
  it("recusa URL protocolo-relativa disfarçada de caminho interno", async () => {
    const { normalizarSaida } = await import("../src/lib/guiaValidacao");

    // Começa com barra e é EXTERNA. A primeira versão deixava passar, e o CTA
    // do guia saía com `<a href="//exemplo.com/promo">`.
    expect(normalizarSaida({ href: "//exemplo.com/promo", rotulo: "Oferta" })).toBeNull();
    expect(normalizarSaida({ href: "https://exemplo.com", rotulo: "Oferta" })).toBeNull();
    expect(normalizarSaida({ href: "exemplo.com", rotulo: "Oferta" })).toBeNull();
  });

  it("aceita caminho interno de verdade", async () => {
    const { normalizarSaida } = await import("../src/lib/guiaValidacao");

    expect(normalizarSaida({ href: "/garantia", rotulo: "Ver a garantia" })).toMatchObject({
      href: "/garantia",
      rotulo: "Ver a garantia",
    });
  });

  it("o slug nunca termina em hífen, mesmo com título longo", async () => {
    const { normalizarSlug } = await import("../src/lib/guiaValidacao");

    // 90 caracteres cujo corte cai num separador. O CHECK da migração recusa
    // slug terminado em `-`, e o erro apareceria cru na tela de quem escreve.
    const slug = normalizarSlug("ab ".repeat(40));
    expect(slug.endsWith("-")).toBe(false);
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(slug.length).toBeLessThanOrEqual(90);
  });

  it("seção sem parágrafo não entra no corpo", async () => {
    const { normalizarCorpo } = await import("../src/lib/guiaValidacao");

    expect(normalizarCorpo([{ titulo: "Vazia", paragrafos: [] }])).toEqual([]);
    expect(normalizarCorpo([{ titulo: "", paragrafos: ["texto"] }])).toEqual([]);
  });

  it("a régua de publicação lista TUDO que falta, não só o primeiro", async () => {
    const { problemasParaPublicar } = await import("../src/lib/guiaValidacao");

    // A tela mostra a lista; devolver um item por vez faria o operador
    // descobrir os problemas um a um, salvando quatro vezes.
    const problemas = problemasParaPublicar({ titulo: "", descricao: "", corpo: [], saida: null });
    expect(problemas).toHaveLength(4);
  });
});
