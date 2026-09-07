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

/**
 * `revalidatePath` é ESPIONADO, e não silenciado.
 *
 * A primeira versão deste arquivo mockava com `() => {}` "porque fora de uma
 * requisição do Next isso estoura". Verdade — e a revisão mostrou o preço:
 * esvaziando o corpo de `revalidarCluster` a suíte inteira (2229 testes)
 * ficava verde, e a função serve DUAS rotas desde a extração. Um no-op sem
 * cobertura silenciava as duas pontas de uma vez.
 *
 * O custo está escrito no docblock de `portaDeGuias.ts`: guia recém-publicado
 * espera até uma hora no sitemap, e quem acabou de salvar vê a página velha e
 * conclui que não salvou.
 */
const revalidados: string[] = [];
vi.mock("next/cache", () => ({
  revalidatePath: (caminho: string) => {
    revalidados.push(caminho);
  },
}));

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
/**
 * As COLUNAS que a rota pede de volta ao gravar.
 *
 * O dublê devolve o mesmo objeto qualquer que seja o `select`, então trocar
 * `resumo` por `resumo as texto` na rota não mudava nada aqui — e em produção
 * mudaria tudo: `dados.cabecalho.resumo` viria `undefined`, e desde o conserto
 * do 200-ilegível isso faz a tela travar e exigir recarga a cada gravação.
 * Guardar o argumento é o que torna essa troca visível.
 */
let colunasPedidas: string | null = null;

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
          select: (colunas: string) => {
            colunasPedidas = colunas;
            return {
              single: async () => ({
                data: { titulo_seo: linha.titulo_seo || null, resumo: linha.resumo || null },
                error: null,
              }),
            };
          },
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
  colunasPedidas = null;
  revalidados.length = 0;
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

  /**
   * Staff DE VERDADE, mas sem a linha da A17 que governa cópia de site.
   *
   * Sem este caso, metade da régua não tem mutante: reduzir a condição a
   * `if (!ehStaff(profile))` deixava a suíte inteira verde e abria a escrita
   * para GESTOR e FINANCEIRO, nas duas rotas. Os dois casos acima não pegam
   * porque em ambos `perfisDe` devolve `[]` — `podeFazer` já responderia
   * `nao_ve` sozinho, e a segunda metade nunca é exercitada.
   */
  it.each([["gestor"], ["financeiro"]])(
    "%s é staff, mas não escreve cópia de site",
    async (papel) => {
      CLIENTE.auth.getUser.mockResolvedValue({ data: { user: { id: "u2" } } });
      CLIENTE.from.mockReturnValue({
        select: () => ({
          eq: () => ({ single: async () => ({ data: { role: papel, papeis: [papel] } }) }),
        }),
      });

      expect((await put({ resumo: "fora da alçada" })).status).toBe(403);
      expect(gravado, "nada pode ter sido gravado").toBeNull();
    },
  );
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

describe("a rota e o cliente falam a mesma língua", () => {
  /**
   * O contrato ficou NU justamente quando passou a importar.
   *
   * O conserto do 200-ilegível (B13) tornou `dados.cabecalho` obrigatório no
   * corpo da resposta — sem ele, `salvarCabecalho` devolve `exigeRecarga` e a
   * tela trava. Mas nada guardava quem PRODUZ esse campo: renomear a chave na
   * rota, ou trocar o `select`, deixava a suíte inteira verde e matava a
   * feature em produção — toda gravação passaria a exigir recarga, com o texto
   * já no banco.
   *
   * Os dois lados tinham teste e nenhum olhava o outro: a porta afirmava
   * `status` e o que foi gravado; o cliente afirmava contra um dublê escrito
   * por mim, que só provava que eu sou consistente comigo mesmo.
   *
   * Aqui a resposta REAL da rota alimenta o cliente REAL.
   */
  it("o corpo que a rota devolve é o que o cliente sabe ler", async () => {
    comoEditor();
    const resposta = await put({ tituloSeo: "Título gravado", resumo: "Resumo gravado." });
    const corpo = await resposta.json();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: true, json: async () => corpo })) as never;
    try {
      const { salvarCabecalho } = await import("../src/lib/salvarCabecalho");
      const r = await salvarCabecalho({ tituloSeo: "Título gravado", resumo: "Resumo gravado." });

      // Se a rota renomear a chave ou o `select` mudar o nome da coluna, isto
      // vira `exigeRecarga` e o teste cai — que é exatamente o sintoma que o
      // operador veria.
      expect(r.ok, "o cliente precisa entender o corpo da rota").toBe(true);
      expect(r.ok && r.cabecalho).toEqual({
        tituloSeo: "Título gravado",
        resumo: "Resumo gravado.",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("a rota pede de volta as colunas que o cliente sabe ler", async () => {
    comoEditor();
    await put({ tituloSeo: "x", resumo: "y" });

    // Nomes EXATOS: o cliente lê `titulo_seo` e `resumo` do corpo. Um alias no
    // `select` renomearia a chave e a tela passaria a exigir recarga a cada
    // gravação, com o texto já no banco.
    expect(colunasPedidas).toContain("titulo_seo");
    expect(colunasPedidas).toContain("resumo");
    expect(colunasPedidas, "alias muda o nome da chave no corpo").not.toContain(" as ");
  });

  it("e o caminho de limpar também: nulo no banco vira vazio na tela", async () => {
    comoEditor();
    const resposta = await put({ tituloSeo: "", resumo: "" });
    const corpo = await resposta.json();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: true, json: async () => corpo })) as never;
    try {
      const { salvarCabecalho } = await import("../src/lib/salvarCabecalho");
      const r = await salvarCabecalho({ tituloSeo: "", resumo: "" });

      expect(r.ok).toBe(true);
      expect(r.ok && r.cabecalho).toEqual({ tituloSeo: "", resumo: "" });
      expect(r.ok && r.texto).toContain("de volta ao texto padrão");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("gravar tira o índice do cache", () => {
  it("o índice e o sitemap saem, e a ficha de guia não é tocada", async () => {
    comoEditor();
    await put({ resumo: "Texto novo." });

    // `/guias` porque é onde o texto aparece; `/sitemap.xml` porque ele declara
    // `revalidate = 3600` e é a única rota do repositório que precisa disso.
    // A ficha de um guia NÃO entra: o cabeçalho da seção não muda o conteúdo
    // de guia nenhum, e revalidar 1..N fichas por uma edição de cabeçalho seria
    // descartar cache que ninguém pediu.
    expect(revalidados).toEqual(["/guias", "/sitemap.xml"]);
  });

  it("quem não passou pela porta não descarta cache nenhum", async () => {
    semSessao();
    await put({ resumo: "invadido" });

    expect(revalidados).toEqual([]);
  });
});
