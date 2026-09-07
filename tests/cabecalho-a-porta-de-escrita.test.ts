import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A porta de escrita do cabeçalho da seção.
 *
 * Existe porque a rota é NOVA e a régua de permissão dela é compartilhada:
 * `lib/portaDeGuias.ts` serve `/api/guias` e `/api/guias/secao`. O teste da
 * porta dos guias já cobre a primeira, e cobertura por vizinhança não é
 * cobertura — o docblock daquele arquivo chama isso de "sorte documentada",
 * depois de a revisão apagar o 401 e o 403 e a suíte inteira ficar verde.
 *
 * Aqui a régua é a MESMA de propósito: quem escreve cópia de site escreve nas
 * duas rotas. O que este arquivo guarda é que a rota nova de fato passa por
 * ela, e não que exista uma segunda régua.
 */

const CLIENTE = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => CLIENTE,
}));

// A rota revalida o índice ao gravar. Fora de uma requisição do Next isso
// estoura, e não é o assunto deste arquivo.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

function semSessao() {
  CLIENTE.auth.getUser.mockResolvedValue({ data: { user: null } });
}

/** Uma sessão autenticada SEM papel de staff — o cliente da Garagem. */
function comoVisitante() {
  CLIENTE.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  CLIENTE.from.mockReturnValue({
    select: () => ({
      eq: () => ({ single: async () => ({ data: { role: "cliente", papeis: [] } }) }),
    }),
  });
}

/** Staff com a linha da A17 que governa cópia de site. Guarda o que foi gravado. */
let gravado: Record<string, unknown> | null = null;

function comoEditor() {
  CLIENTE.auth.getUser.mockResolvedValue({ data: { user: { id: "staff-1" } } });
  CLIENTE.from.mockImplementation((tabela: string) => {
    if (tabela === "profiles") {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { role: "admin", papeis: ["admin"] } }) }),
        }),
      };
    }
    return {
      upsert: (linha: Record<string, unknown>) => {
        gravado = linha;
        return {
          select: () => ({
            single: async () => ({
              data: { titulo_seo: linha.titulo_seo || null, resumo: linha.resumo || null },
              error: null,
            }),
          }),
        };
      },
    };
  });
}

function pedido(corpo: unknown) {
  return new Request("http://localhost/api/guias/secao", {
    method: "PUT",
    body: JSON.stringify(corpo),
  }) as never;
}

async function put(corpo: unknown) {
  const { PUT } = await import("../src/app/api/guias/secao/route");
  return PUT(pedido(corpo));
}

beforeEach(() => {
  vi.clearAllMocks();
  gravado = null;
});

describe("a rota do cabeçalho não escreve sem autorização", () => {
  it("sem sessão devolve 401", async () => {
    semSessao();
    expect((await put({ resumo: "invadido" })).status).toBe(401);
    expect(gravado, "nada pode ter sido gravado").toBeNull();
  });

  it("autenticado sem papel de staff devolve 403", async () => {
    // Cliente da Garagem autentica no MESMO pool `auth.users` do painel. A
    // régua é `ehStaff()` antes de `normalizarPerfil`, que promoveria um
    // cliente a "comercial" — CLAUDE.md.
    comoVisitante();
    expect((await put({ resumo: "invadido" })).status).toBe(403);
    expect(gravado, "nada pode ter sido gravado").toBeNull();
  });
});

describe("o editor grava, e limpar volta ao automático", () => {
  it("o texto chega ao banco com o autor junto", async () => {
    comoEditor();
    const r = await put({ tituloSeo: "Guias de compra", resumo: "Um resumo novo." });

    expect(r.status).toBe(200);
    expect(gravado).toMatchObject({
      secao: "guias",
      titulo_seo: "Guias de compra",
      resumo: "Um resumo novo.",
      atualizado_por: "staff-1",
    });
  });

  it("campo vazio é ACEITO — é como o painel devolve a seção ao padrão", async () => {
    // O publicador de guia recusa descrição vazia; esta rota não pode. Lá o
    // banco é fonte e vazio significa página pela metade; aqui é override e
    // vazio significa "use o texto do código".
    comoEditor();
    const r = await put({ tituloSeo: "", resumo: "" });

    expect(r.status).toBe(200);
    expect(gravado).toMatchObject({ titulo_seo: "", resumo: "" });
  });

  it("corta no teto do banco em vez de deixar o Postgres recusar", async () => {
    comoEditor();
    await put({ resumo: "x".repeat(500) });

    expect(String(gravado?.resumo)).toHaveLength(300);
  });

  it("avisa quando o resumo passa da régua da busca, sem recusar", async () => {
    comoEditor();
    const longo = "x".repeat(200);
    const r = await put({ resumo: longo });
    const dados = await r.json();

    // Aviso, não trava: quem decide o texto é quem escreve. Recusar por três
    // caracteres seria pior que uma description cortada no SERP.
    expect(r.status).toBe(200);
    expect(dados.avisos?.join(" ")).toContain("155");
  });

  it("resumo dentro da régua não gera aviso nenhum", async () => {
    comoEditor();
    const r = await put({ resumo: "Curto e dentro do limite." });
    const dados = await r.json();

    expect(dados.avisos ?? []).toHaveLength(0);
  });
});
