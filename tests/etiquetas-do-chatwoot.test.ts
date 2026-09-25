import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  ETIQUETAS_DA_PASSAGEM,
  aplicarMudanca,
  ehEtiquetaDaPassagem,
  lerMudanca,
  limparEtiquetas,
  mesmasEtiquetas,
  normalizarEtiqueta,
  normalizarEtiquetas,
} from "../src/lib/etiquetas";
import {
  configDoChatwoot,
  garantirEtiquetas,
  lerEtiquetasDaConta,
  lerEtiquetasDaConversa,
  mudarEtiquetas,
  type ConfigDoChatwoot,
} from "../src/lib/etiquetasDoChatwoot";

/**
 * As etiquetas da conversa, lidas e gravadas no Chatwoot (2026-09-25).
 *
 * O que estes testes seguram é o pedido do dono: *"quando o sdr atribuir um
 * contato para um vendedor do comercial, precisamos manter a tag de resgate e
 * reaquecido, para mensurar o trabalho dele"*. "Manter" tem três metades:
 *   - as duas etiquetas CHEGAM à conversa;
 *   - nenhuma das que já estavam SAI — o POST do Chatwoot substitui a lista
 *     inteira, e toda escrita aqui é uma mudança sobre o que foi lido na hora;
 *   - nenhuma etiqueta fora do formato do site é "consertada" e perdida no
 *     caminho ("Lead Quente" volta como "Lead Quente").
 *
 * O Chatwoot aqui é falso: um `fetch` injetado que guarda as etiquetas da
 * conversa e registra cada chamada.
 */

const CFG: ConfigDoChatwoot = { base: "https://chat.exemplo.com.br", conta: "3", token: "tok-123" };
const URL_DA_CONVERSA = "https://chat.exemplo.com.br/api/v1/accounts/3/conversations/4821/labels";

interface Chamada {
  url: string;
  metodo: string;
  corpo: unknown;
  token: string | undefined;
}

/** Um Chatwoot de mentira, com as etiquetas de uma conversa. */
function chatwootFalso(
  iniciais: string[],
  opcoes: {
    status?: number;
    semPayloadNoPost?: boolean;
    /** Roda depois de cada POST — é o "outro alguém" gravando no meio. */
    depoisDoPost?: (etiquetas: string[], n: number) => string[];
  } = {},
) {
  let etiquetas = [...iniciais];
  let posts = 0;
  const chamadas: Chamada[] = [];
  const buscar = async (url: string, init?: RequestInit): Promise<Response> => {
    const metodo = init?.method ?? "GET";
    const corpo = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    chamadas.push({ url, metodo, corpo, token: headers.api_access_token });
    if (opcoes.status) return new Response("{}", { status: opcoes.status });
    if (metodo === "POST") {
      etiquetas = [...(corpo as { labels: string[] }).labels];
      const resposta = opcoes.semPayloadNoPost ? {} : { payload: etiquetas };
      posts += 1;
      if (opcoes.depoisDoPost) etiquetas = opcoes.depoisDoPost(etiquetas, posts);
      return Response.json(resposta);
    }
    return Response.json({ payload: etiquetas });
  };
  return { buscar, chamadas, etiquetas: () => etiquetas, metodos: () => chamadas.map((c) => c.metodo) };
}

describe("as duas réguas: o que o site PÕE e o que a conversa TEM", () => {
  it("pôr: minúscula, sem espaço sobrando", () => {
    expect(normalizarEtiqueta("  Resgate ")).toBe("resgate");
  });

  it("pôr: aceita hífen, sublinhado, número e acento", () => {
    for (const boa of ["quer-comprar", "origem_site", "fase2", "reaquecido", "negociação"]) {
      expect(normalizarEtiqueta(boa), boa).toBe(boa);
    }
  });

  it("pôr: recusa espaço no meio, pontuação, vazio, mais de 50 e o que não é texto", () => {
    for (const ruim of ["quer comprar", "resgate!", "a/b", "", "   ", null, undefined, 7, {}, "a".repeat(51)]) {
      expect(normalizarEtiqueta(ruim), String(ruim)).toBeNull();
    }
    expect(normalizarEtiquetas(["Resgate", "resgate", "x y", "reaquecido"])).toEqual(["resgate", "reaquecido"]);
  });

  it("ter: o que a conversa tem volta como está — nada é 'consertado' e perdido", () => {
    // A revisão de 25/09 mostrou "Lead Quente" e "campanha.setembro" sumindo
    // na primeira gravação, porque a leitura normalizava.
    expect(limparEtiquetas(["origem-site", "Lead Quente", "campanha.setembro", "Resgate"])).toEqual([
      "origem-site",
      "Lead Quente",
      "campanha.setembro",
      "Resgate",
    ]);
  });

  it("ter: só sai o lixo — não-texto, vazio e repetido (sem distinguir caixa)", () => {
    expect(limparEtiquetas(["a", "", "  ", 3, null, "A", "b ", "b"])).toEqual(["a", "b"]);
    expect(limparEtiquetas("resgate")).toEqual([]);
  });
});

describe("aplicar uma mudança", () => {
  it("as que ninguém citou ficam, na mesma ordem e na mesma grafia", () => {
    expect(aplicarMudanca(["Lead Quente", "origem-site"], { incluir: ["resgate"] })).toEqual([
      "Lead Quente",
      "origem-site",
      "resgate",
    ]);
  });

  it("tirar não distingue caixa, e incluir o que já está não duplica", () => {
    expect(aplicarMudanca(["Origem-Site", "resgate"], { retirar: ["origem-site"], incluir: ["RESGATE"] })).toEqual([
      "resgate",
    ]);
  });

  it("mesmas etiquetas em outra ordem são a mesma lista", () => {
    expect(mesmasEtiquetas(["a", "b"], ["B", "a"])).toBe(true);
    expect(mesmasEtiquetas(["a"], ["a", "b"])).toBe(false);
  });
});

describe("o pedido do card", () => {
  it("aceita incluir no formato e retirar na grafia que a conversa tem", () => {
    expect(lerMudanca({ incluir: ["Negociando"], retirar: ["Lead Quente"] })).toEqual({
      ok: true,
      mudanca: { incluir: ["negociando"], retirar: ["Lead Quente"] },
    });
  });

  it("recusa incluir fora do formato, lista que não é lista, e pedido vazio", () => {
    expect(lerMudanca({ incluir: ["quer comprar"] })).toMatchObject({ ok: false, erro: expect.stringContaining('"quer comprar"') });
    expect(lerMudanca({ incluir: "resgate" })).toMatchObject({ ok: false });
    expect(lerMudanca({ retirar: [3] })).toMatchObject({ ok: false });
    expect(lerMudanca({ retirar: ["  "] })).toMatchObject({ ok: false });
    expect(lerMudanca({})).toMatchObject({ ok: false, erro: "Diga o que incluir ou retirar." });
    expect(lerMudanca(null)).toMatchObject({ ok: false });
  });

  it("recusa mais de 20 de uma vez", () => {
    const muitas = Array.from({ length: 21 }, (_, i) => `e${i}`);
    expect(lerMudanca({ incluir: muitas })).toMatchObject({ ok: false });
    expect(lerMudanca({ retirar: muitas })).toMatchObject({ ok: false });
  });

  it("sabe quais são as duas da passagem, em qualquer caixa", () => {
    expect(ehEtiquetaDaPassagem("Resgate")).toBe(true);
    expect(ehEtiquetaDaPassagem("reaquecido")).toBe(true);
    expect(ehEtiquetaDaPassagem("resgatar")).toBe(false);
  });
});

describe("a configuração", () => {
  const ENV = {
    NEXT_PUBLIC_CHATWOOT_URL: "chat.exemplo.com.br/",
    NEXT_PUBLIC_CHATWOOT_CONTA_ID: "3",
    CHATWOOT_API_TOKEN: " tok-123 ",
  };

  it("usa o mesmo host e a mesma conta do link do card", () => {
    expect(configDoChatwoot(ENV)).toEqual(CFG);
  });

  it("sem token, o recurso fica desligado em vez de chamar a API sem credencial", () => {
    expect(configDoChatwoot({ ...ENV, CHATWOOT_API_TOKEN: "" })).toBeNull();
    expect(configDoChatwoot({ ...ENV, CHATWOOT_API_TOKEN: undefined })).toBeNull();
  });

  it("sem host ou sem conta, também", () => {
    expect(configDoChatwoot({ ...ENV, NEXT_PUBLIC_CHATWOOT_URL: "" })).toBeNull();
    expect(configDoChatwoot({ ...ENV, NEXT_PUBLIC_CHATWOOT_CONTA_ID: "abc" })).toBeNull();
  });

  it("em http, desligado — o token iria em texto aberto", () => {
    expect(configDoChatwoot({ ...ENV, NEXT_PUBLIC_CHATWOOT_URL: "http://chat.exemplo.com.br" })).toBeNull();
  });
});

describe("ler", () => {
  it("lê da conversa certa, com o token no cabeçalho, sem mexer na grafia", async () => {
    const cw = chatwootFalso(["origem-site", "Lead Quente"]);
    const r = await lerEtiquetasDaConversa(4821, CFG, cw.buscar);
    expect(r).toEqual({ ok: true, valor: ["origem-site", "Lead Quente"] });
    expect(cw.chamadas).toEqual([{ url: URL_DA_CONVERSA, metodo: "GET", corpo: undefined, token: "tok-123" }]);
  });

  it("conversa que não é inteiro positivo não chega a chamar a API", async () => {
    const cw = chatwootFalso([]);
    for (const ruim of [0, -1, 1.5, Number.NaN]) {
      expect(await lerEtiquetasDaConversa(ruim, CFG, cw.buscar)).toEqual({ ok: false, motivo: "conversa inválida" });
      expect(await mudarEtiquetas(ruim, { incluir: ["a"] }, CFG, cw.buscar)).toMatchObject({ ok: false });
    }
    expect(cw.chamadas).toHaveLength(0);
  });

  it("as etiquetas da conta são os títulos", async () => {
    const buscar = async () => Response.json({ payload: [{ id: 1, title: "resgate" }, { id: 2, title: "negociando" }] });
    expect(await lerEtiquetasDaConta(CFG, buscar)).toEqual({ ok: true, valor: ["resgate", "negociando"] });
  });
});

describe("mudar — sempre sobre o que a conversa tem agora", () => {
  it("tira só a pedida e põe só a pedida; o resto fica como estava", async () => {
    const cw = chatwootFalso(["origem-site", "Lead Quente", "resgate"]);
    const r = await mudarEtiquetas(4821, { incluir: ["negociando"], retirar: ["origem-site"] }, CFG, cw.buscar);

    expect(cw.etiquetas()).toEqual(["Lead Quente", "resgate", "negociando"]);
    expect(r).toEqual({
      ok: true,
      valor: {
        antes: ["origem-site", "Lead Quente", "resgate"],
        depois: ["Lead Quente", "resgate", "negociando"],
        mudou: true,
      },
    });
  });

  it("mudança que não muda nada não grava", async () => {
    const cw = chatwootFalso(["resgate"]);
    const r = await mudarEtiquetas(4821, { incluir: ["Resgate"], retirar: ["nao-tem"] }, CFG, cw.buscar);
    expect(r).toMatchObject({ ok: true, valor: { mudou: false } });
    expect(cw.metodos()).toEqual(["GET"]);
  });

  it("leitura que falha não vira gravação — gravar às cegas substituiria a lista inteira", async () => {
    const cw = chatwootFalso(["origem-site"], { status: 500 });
    expect(await mudarEtiquetas(4821, { incluir: ["a"] }, CFG, cw.buscar)).toEqual({
      ok: false,
      motivo: "o Chatwoot respondeu 500",
    });
    expect(cw.metodos()).toEqual(["GET"]);
  });

  it("leitura sem a lista também não vira gravação", async () => {
    const metodos: string[] = [];
    const r = await mudarEtiquetas(4821, { incluir: ["a"] }, CFG, async (_url, init) => {
      metodos.push(init?.method ?? "GET");
      return Response.json({ algo: 1 });
    });
    expect(r).toEqual({ ok: false, motivo: "resposta ilegível do Chatwoot" });
    expect(metodos).toEqual(["GET"]);
  });

  it("Chatwoot que responde ao POST sem a lista: o que foi gravado é o que ficou", async () => {
    const cw = chatwootFalso([], { semPayloadNoPost: true });
    const r = await mudarEtiquetas(4821, { incluir: ["resgate"] }, CFG, cw.buscar);
    expect(r).toMatchObject({ ok: true, valor: { depois: ["resgate"] } });
  });
});

describe("garantir as etiquetas da passagem", () => {
  it("põe resgate e reaquecido SEM tirar as que a conversa já tinha, nem mudar a grafia delas", async () => {
    const cw = chatwootFalso(["origem-site", "Lead Quente"]);
    const r = await garantirEtiquetas(4821, ETIQUETAS_DA_PASSAGEM, CFG, cw.buscar);

    expect(cw.etiquetas()).toEqual(["origem-site", "Lead Quente", "resgate", "reaquecido"]);
    expect(r).toEqual({
      ok: true,
      valor: {
        antes: ["origem-site", "Lead Quente"],
        depois: ["origem-site", "Lead Quente", "resgate", "reaquecido"],
        mudou: true,
      },
    });
  });

  it("não grava quando as duas já estão — passagem repetida não vira escrita", async () => {
    const cw = chatwootFalso(["reaquecido", "resgate", "origem-site"]);
    const r = await garantirEtiquetas(4821, ETIQUETAS_DA_PASSAGEM, CFG, cw.buscar);
    expect(r).toMatchObject({ ok: true, valor: { mudou: false } });
    expect(cw.metodos()).toEqual(["GET"]);
  });

  it("confere depois de gravar: se alguém gravou por cima no meio, grava de novo", async () => {
    // A corrida da revisão de 25/09: outra escrita da mesma conversa (o card,
    // o próprio Chatwoot) entre a nossa leitura e a nossa gravação.
    const cw = chatwootFalso(["origem-site"], {
      depoisDoPost: (atuais, n) => (n === 1 ? ["origem-site", "quente"] : atuais),
    });
    const r = await garantirEtiquetas(4821, ETIQUETAS_DA_PASSAGEM, CFG, cw.buscar);

    expect(cw.metodos()).toEqual(["GET", "POST", "GET", "GET", "POST"]);
    // A de quem gravou no meio fica, e as duas da passagem voltam.
    expect(cw.etiquetas()).toEqual(["origem-site", "quente", "resgate", "reaquecido"]);
    expect(r).toMatchObject({ ok: true, valor: { depois: ["origem-site", "quente", "resgate", "reaquecido"] } });
  });

  it("confere uma vez só — não entra em laço contra a API", async () => {
    const cw = chatwootFalso(["origem-site"], { depoisDoPost: () => ["origem-site"] });
    await garantirEtiquetas(4821, ETIQUETAS_DA_PASSAGEM, CFG, cw.buscar);
    expect(cw.metodos().filter((m) => m === "POST")).toHaveLength(2);
  });

  it("se a leitura falha, NÃO grava", async () => {
    const cw = chatwootFalso(["origem-site"], { status: 500 });
    const r = await garantirEtiquetas(4821, ETIQUETAS_DA_PASSAGEM, CFG, cw.buscar);
    expect(r).toEqual({ ok: false, motivo: "o Chatwoot respondeu 500" });
    expect(cw.metodos()).toEqual(["GET"]);
  });
});

describe("falha do Chatwoot vira motivo, não exceção", () => {
  const casos: Array<[number, string]> = [
    [401, "o Chatwoot recusou o token (CHATWOOT_API_TOKEN)"],
    [403, "o Chatwoot recusou o token (CHATWOOT_API_TOKEN)"],
    [404, "a conversa não existe mais no Chatwoot"],
    [422, "o Chatwoot respondeu 422"],
  ];
  for (const [status, motivo] of casos) {
    it(`${status} → "${motivo}"`, async () => {
      const cw = chatwootFalso([], { status });
      expect(await lerEtiquetasDaConversa(4821, CFG, cw.buscar)).toEqual({ ok: false, motivo });
    });
  }

  it("prazo estourado", async () => {
    const buscar = async () => {
      throw new DOMException("demorou", "TimeoutError");
    };
    expect(await lerEtiquetasDaConversa(4821, CFG, buscar)).toEqual({
      ok: false,
      motivo: "o Chatwoot não respondeu a tempo",
    });
  });

  it("sem rede", async () => {
    const buscar = async () => {
      throw new TypeError("fetch failed");
    };
    expect(await lerEtiquetasDaConversa(4821, CFG, buscar)).toEqual({
      ok: false,
      motivo: "sem conexão com o Chatwoot",
    });
  });

  it("corpo que não é JSON", async () => {
    const buscar = async () => new Response("<html>", { status: 200 });
    expect(await lerEtiquetasDaConversa(4821, CFG, buscar)).toEqual({
      ok: false,
      motivo: "resposta ilegível do Chatwoot",
    });
  });

  it("toda chamada leva prazo — sem ele, um Chatwoot travado segura a passagem do lead", async () => {
    let sinal: AbortSignal | null | undefined;
    await lerEtiquetasDaConversa(4821, CFG, async (_url, init) => {
      sinal = init?.signal;
      return Response.json({ payload: [] });
    });
    expect(sinal).toBeInstanceOf(AbortSignal);
  });
});

describe("as duas da passagem são as mesmas no site e no banco", () => {
  it("o gatilho da migração grava exatamente ETIQUETAS_DA_PASSAGEM", () => {
    // O SQL não importa o TS. Se alguém trocar o nome de um lado, o crédito do
    // banco e a etiqueta do Chatwoot passam a medir coisas diferentes.
    const sql = readFileSync("supabase/migrations/20260925180000_etiquetas_do_lead.sql", "utf-8");
    const noGatilho = /'etiquetas',\s*jsonb_build_array\(([^)]*)\)/.exec(sql);
    expect(noGatilho, "o gatilho não monta a lista de etiquetas").not.toBeNull();
    const doBanco = [...noGatilho![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(doBanco).toEqual([...ETIQUETAS_DA_PASSAGEM]);
    expect(sql).toContain(`'${ETIQUETAS_DA_PASSAGEM.join(", ")}'`);
  });
});
