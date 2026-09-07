import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { carregarPainel } from "../src/lib/carregarPainelDeGuias";
import { podeSalvarCabecalho, podeVoltarAoPadrao } from "../src/lib/salvarCabecalho";

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

/**
 * O que `lerCabecalhoGravado` devolve nesta rodada.
 *
 * A forma tem os dois desfechos separados de propósito: `lido: false` é "não
 * consegui ler", e é DIFERENTE de `lido: true` com os campos nulos, que é "não
 * há override". Enquanto os dois colapsavam num valor só, existia um caminho
 * em que a tela concluía ter lido e o Salvar apagava o texto do dono.
 */
let leitura: { lido: true; cabecalho: { tituloSeo: string | null; resumo: string | null } } | { lido: false; motivo: string } = {
  lido: true,
  cabecalho: { tituloSeo: null, resumo: null },
};

vi.mock("../src/lib/secaoDeGuias", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return { ...real, lerCabecalhoGravado: async () => leitura };
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
    respondendo({
      guias: [],
      regua: [],
      cabecalhoLido: true,
      error: "A tabela de guias ainda não existe",
    });
    const r = await carregarPainel();

    expect(r.ok).toBe(true);
    expect(r.ok && r.aviso).toContain("ainda não existe");
    // Tabela ausente é o estado do ambiente antes da migração, e ali "não há
    // override" é a VERDADE — então a leitura deu certo e o painel não trava.
    expect(r.ok && r.cabecalhoLido).toBe(true);
  });

  it("propaga que o cabeçalho NÃO foi lido, com a listagem intacta", async () => {
    respondendo({ guias: [{ slug: "x" }], regua: ["r"], cabecalho: null, cabecalhoLido: false });
    const r = await carregarPainel();

    expect(r.ok).toBe(true);
    expect(r.ok && r.cabecalhoLido).toBe(false);
    expect(r.ok && r.guias).toHaveLength(1);
  });

  it("resposta SEM o campo trava o salvamento, em vez de assumir que leu", async () => {
    // Servidor antigo, deploy pela metade, proxy que corta o corpo: `undefined`
    // tem de significar "não sei se li". Coagir para `true` no otimismo é
    // exatamente o erro que este campo existe para desfazer.
    respondendo({ guias: [], regua: [] });
    const r = await carregarPainel();

    expect(r.ok && r.cabecalhoLido).toBe(false);
  });
});

describe("o GET de /api/guias entrega o cabeçalho", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leitura = { lido: true, cabecalho: { tituloSeo: null, resumo: null } };
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
    leitura = { lido: true, cabecalho: { tituloSeo: "Gravado", resumo: null } };
    const corpo = await get();

    expect(corpo.cabecalho).toEqual({ tituloSeo: "Gravado", resumo: null });
    expect(corpo.cabecalhoLido).toBe(true);
    // O padrão viaja junto porque a tela não tem outra forma de saber qual é o
    // texto que o site publica quando o campo está vazio.
    expect(corpo.padrao?.tituloSeo).toBeTruthy();
    expect(corpo.padrao?.resumo).toBeTruthy();
  });

  it("leitura do cabeçalho falhando NÃO vira 'sem override'", async () => {
    // O caminho que a revisão reproduziu, e o mais caro do branch. A resposta
    // tem duas metades com clientes DIFERENTES — os guias pela sessão, o
    // cabeçalho pelo `anon`. Um timeout só na segunda devolvia 200 com os
    // campos nulos, indistinguível de "não há override": a tela concluía que
    // tinha lido, liberava o Salvar, e o clique gravava "" nos dois campos,
    // apagando o texto do dono e indo ao ar no mesmo request.
    leitura = { lido: false, motivo: "canceling statement due to statement timeout" };
    const corpo = await get();

    expect(corpo.cabecalhoLido).toBe(false);
    expect(corpo.cabecalho).toBeNull();
    // A listagem continua servida: uma metade caiu, não a tela inteira.
    expect(corpo.guias).toEqual([]);
    expect(corpo.regua.length).toBeGreaterThan(0);
  });
});

describe("a decisão de habilitar o salvamento", () => {
  // Mora numa função pura porque `disabled` não aparece em markup estático:
  // a revisão apagou as DUAS guardas de `cabecalhoLido` do JSX e a suíte
  // inteira ficou verde — e essas guardas são a correção do defeito que
  // apagava texto.
  it("não salva enquanto o cabeçalho não foi lido", () => {
    expect(
      podeSalvarCabecalho({ salvando: false, carregando: false, cabecalhoLido: false }),
    ).toBe(false);
  });

  it.each([
    ["carregando", { salvando: false, carregando: true, cabecalhoLido: true }],
    ["salvando", { salvando: true, carregando: false, cabecalhoLido: true }],
  ])("não salva enquanto está %s", (_caso, estado) => {
    expect(podeSalvarCabecalho(estado)).toBe(false);
  });

  it("salva quando leu e está parada", () => {
    expect(podeSalvarCabecalho({ salvando: false, carregando: false, cabecalhoLido: true })).toBe(
      true,
    );
  });

  it("voltar ao padrão herda a mesma trava, e só age se houver o que limpar", () => {
    const base = { salvando: false, carregando: false };

    // Sem leitura, nem limpar. O botão não grava sozinho — ele esvazia a tela,
    // e quem grava é o Salvar em seguida. Ele herda a trava porque limpar um
    // campo cujo conteúdo real eu não consegui ler faz a tela AFIRMAR "está no
    // automático" sobre uma seção que pode ter texto.
    expect(
      podeVoltarAoPadrao({
        ...base,
        cabecalhoLido: false,
        cabecalho: { tituloSeo: "tem texto", resumo: "" },
      }),
    ).toBe(false);

    expect(
      podeVoltarAoPadrao({
        ...base,
        cabecalhoLido: true,
        cabecalho: { tituloSeo: "", resumo: "" },
      }),
    ).toBe(false);

    expect(
      podeVoltarAoPadrao({
        ...base,
        cabecalhoLido: true,
        cabecalho: { tituloSeo: "", resumo: "tem texto" },
      }),
    ).toBe(true);
  });
});
