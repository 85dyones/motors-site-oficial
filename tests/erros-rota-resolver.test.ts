import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A porta da triagem: `POST /api/erros/[hash]/resolver`.
 *
 * ---------------------------------------------------------------------------
 * Por que a rota tem teste PRÓPRIO, e não "cobertura por vizinhança"
 * ---------------------------------------------------------------------------
 * `resolverGrupoDeErros` já é provado em `fila-de-erros.test.ts`, com dublê de
 * PostgREST. O que só aparece aqui é a costura: quem manda o `uid`.
 *
 * O `comment on column` de `erros.resolvido_por` é explícito — *"nada no banco
 * amarra este valor a `auth.uid()` hoje"*. O grant por coluna impede reescrever
 * a MENSAGEM do erro; ele não impede atribuir a resolução a um colega. Quem
 * amarra é esta rota, lendo o id da SESSÃO e ignorando o corpo. Um teste que
 * chamasse a função direto passaria verde com a rota aceitando
 * `resolvido_por` do cliente.
 *
 * Por isso o corpo de todas as requisições abaixo vai contaminado de propósito:
 * `resolvido_por` de outra pessoa, `mensagem` reescrita, `resolvido_em` no
 * futuro. Nada disso pode chegar ao banco.
 */

const UID = "11111111-2222-3333-4444-555555555555";
const OUTRO = "99999999-9999-9999-9999-999999999999";
const HASH = "0badc0de";

interface Passo {
  metodo: string;
  args: unknown[];
}
const CONSULTAS: { tabela: string; passos: Passo[] }[] = [];

let PAPEIS: string[] | null = ["admin"];
let CONTAGEM = 3;
let ERRO_DO_UPDATE: { message: string; code?: string } | null = null;

/**
 * Dublê do cliente de sessão.
 *
 * Todos os verbos existem em toda tabela: um método ausente estouraria
 * `TypeError` dentro do `try` da rota, viraria 500 e a escrita indevida ficaria
 * invisível — que é o oposto do que este arquivo existe para ver.
 */
const CLIENTE = {
  auth: {
    getUser: async () => ({
      data: { user: PAPEIS === null ? null : { id: UID, email: "dono@motorsstore.com.br" } },
    }),
  },
  from(tabela: string) {
    const registro = { tabela, passos: [] as Passo[] };
    CONSULTAS.push(registro);

    const builder: Record<string, unknown> = {
      then(aoResolver: (v: unknown) => unknown, aoFalhar?: (e: unknown) => unknown) {
        return Promise.resolve({
          data: null,
          error: ERRO_DO_UPDATE,
          count: ERRO_DO_UPDATE ? null : CONTAGEM,
        }).then(aoResolver, aoFalhar);
      },
      single: async () => ({
        data: { role: PAPEIS?.[0] ?? null, papeis: PAPEIS },
        error: null,
      }),
    };
    for (const metodo of ["select", "eq", "is", "not", "order", "range", "update", "limit"]) {
      builder[metodo] = (...args: unknown[]) => {
        registro.passos.push({ metodo, args });
        return builder;
      };
    }
    return builder;
  },
};

vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => CLIENTE,
}));

const { POST } = await import("../src/app/api/erros/[hash]/resolver/route");

function pedido(corpo: unknown, hash = HASH) {
  return POST(
    new Request("http://localhost/api/erros/x/resolver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }),
    { params: Promise.resolve({ hash }) },
  );
}

const consultaDe = (tabela: string) => CONSULTAS.filter((c) => c.tabela === tabela);
const passosDe = (c: { passos: Passo[] }, metodo: string) =>
  c.passos.filter((p) => p.metodo === metodo);

beforeEach(() => {
  CONSULTAS.length = 0;
  PAPEIS = ["admin"];
  CONTAGEM = 3;
  ERRO_DO_UPDATE = null;
});

describe("a rota grava a triagem, e só ela", () => {
  it("o UPDATE leva exatamente resolvido_em e resolvido_por", async () => {
    const res = await pedido({
      resolver: true,
      // O corpo contaminado: nada daqui pode passar.
      resolvido_por: OUTRO,
      resolvido_em: "1999-01-01T00:00:00Z",
      mensagem: "reescrito pelo staff",
      stack: "apagado",
      hash_agrupamento: "deadbeef",
    });

    expect(res.status).toBe(200);
    const update = passosDe(consultaDe("erros")[0], "update")[0];
    const carga = update.args[0] as Record<string, unknown>;

    expect(Object.keys(carga).sort()).toEqual(["resolvido_em", "resolvido_por"]);
    // O autor é o da SESSÃO. Este é o ponto inteiro do arquivo.
    expect(carga.resolvido_por).toBe(UID);
    expect(carga.resolvido_por).not.toBe(OUTRO);
    // E a hora é a de agora, não a que veio no corpo.
    expect(carga.resolvido_em).not.toBe("1999-01-01T00:00:00Z");
    expect(Date.parse(String(carga.resolvido_em))).toBeGreaterThan(Date.now() - 60_000);
  });

  it("resolve o grupo do caminho, e não o que o corpo pediu", async () => {
    await pedido({ resolver: true, hash_agrupamento: "deadbeef" });
    const eqs = passosDe(consultaDe("erros")[0], "eq").map((p) => p.args);
    expect(eqs).toContainEqual(["hash_agrupamento", HASH]);
    expect(eqs).not.toContainEqual(["hash_agrupamento", "deadbeef"]);
  });

  it("reabrir zera os dois campos", async () => {
    await pedido({ resolver: false });
    const carga = passosDe(consultaDe("erros")[0], "update")[0].args[0] as Record<
      string,
      unknown
    >;
    expect(carga).toEqual({ resolvido_em: null, resolvido_por: null });
  });

  it("corpo malformado não vira resolução acidental", async () => {
    // `=== true`, não coerção: "1", "sim" e um corpo sem JSON caem no ramo
    // menos destrutivo — reabrir, que só apaga carimbo de triagem.
    await pedido({ resolver: "sim" });
    const carga = passosDe(consultaDe("erros")[0], "update")[0].args[0] as Record<
      string,
      unknown
    >;
    expect(carga.resolvido_em).toBeNull();
  });
});

describe("quem pode", () => {
  it("sem sessão, 401 e nenhuma consulta a erros", async () => {
    PAPEIS = null;
    const res = await pedido({ resolver: true });
    expect(res.status).toBe(401);
    expect(consultaDe("erros")).toHaveLength(0);
  });

  it("staff que não tria leva 403 — a régua da tela e a da rota são a mesma", async () => {
    for (const papel of [["comercial"], ["marketing"], ["gestor"], ["financeiro"]]) {
      CONSULTAS.length = 0;
      PAPEIS = papel;
      const res = await pedido({ resolver: true });
      expect(res.status, `${papel} passou`).toBe(403);
      expect(consultaDe("erros")).toHaveLength(0);
    }
  });

  it("quem não é equipe nenhuma também leva 403", async () => {
    PAPEIS = ["cliente"];
    const res = await pedido({ resolver: true });
    expect(res.status).toBe(403);
  });

  it("hash fora da forma do CHECK nem autentica — 400 antes de tudo", async () => {
    const res = await pedido({ resolver: true }, "'; delete from erros; --");
    expect(res.status).toBe(400);
    expect(CONSULTAS).toHaveLength(0);
  });
});

describe("a resposta não promete o que não aconteceu", () => {
  it("zero linha alterada vira aviso, não 'pronto'", async () => {
    // É o desfecho MUDO da RLS: 200, `error` nulo, nada gravado. Sem este ramo
    // a tela diria "resolvido" sobre um banco intocado, que é a forma de falha
    // que este pacote inteiro existe para acabar.
    CONTAGEM = 0;
    const res = await pedido({ resolver: true });
    const corpo = await res.json();
    expect(res.status).toBe(200);
    expect(corpo.linhas).toBe(0);
    expect(corpo.aviso).toMatch(/nenhuma ocorrência aberta|já estava/i);
  });

  it("erro do banco vira 500 com motivo, não silêncio", async () => {
    ERRO_DO_UPDATE = { message: "permission denied for table erros", code: "42501" };
    const res = await pedido({ resolver: true });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/permission denied/);
  });

  it("tabela ausente vira instrução de migração", async () => {
    ERRO_DO_UPDATE = { message: "Could not find the table", code: "PGRST205" };
    const res = await pedido({ resolver: true });
    expect((await res.json()).error).toMatch(/migração/i);
  });

  it("o caminho feliz devolve quantas linhas mudaram", async () => {
    CONTAGEM = 42;
    const res = await pedido({ resolver: true });
    expect(await res.json()).toEqual({ ok: true, linhas: 42 });
  });
});
