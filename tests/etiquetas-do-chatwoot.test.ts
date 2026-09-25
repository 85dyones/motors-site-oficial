import { describe, it, expect } from "vitest";
import {
  ETIQUETAS_DA_PASSAGEM,
  configDoChatwoot,
  garantirEtiquetas,
  gravarEtiquetasDaConversa,
  juntarEtiquetas,
  lerEtiquetasDaConversa,
  normalizarEtiqueta,
  normalizarEtiquetas,
  type ConfigDoChatwoot,
} from "../src/lib/etiquetasDoChatwoot";

/**
 * As etiquetas da conversa, lidas e gravadas no Chatwoot (2026-09-25).
 *
 * O que estes testes seguram é o pedido do dono: *"quando o sdr atribuir um
 * contato para um vendedor do comercial, precisamos manter a tag de resgate e
 * reaquecido, para mensurar o trabalho dele"*. "Manter" tem duas metades:
 *   - as duas etiquetas CHEGAM à conversa;
 *   - nenhuma das que já estavam SAI — o POST do Chatwoot substitui a lista
 *     inteira, e gravar só as duas apagaria "origem-site" e o resto.
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
function chatwootFalso(iniciais: string[], opcoes: { status?: number; semPayloadNoPost?: boolean } = {}) {
  let etiquetas = [...iniciais];
  const chamadas: Chamada[] = [];
  const buscar = async (url: string, init?: RequestInit): Promise<Response> => {
    const metodo = init?.method ?? "GET";
    const corpo = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    chamadas.push({ url, metodo, corpo, token: headers.api_access_token });
    if (opcoes.status) return new Response("{}", { status: opcoes.status });
    if (metodo === "POST") {
      etiquetas = [...(corpo as { labels: string[] }).labels];
      return Response.json(opcoes.semPayloadNoPost ? {} : { payload: etiquetas });
    }
    return Response.json({ payload: etiquetas });
  };
  return { buscar, chamadas, etiquetas: () => etiquetas };
}

describe("uma etiqueta no formato do Chatwoot", () => {
  it("minúscula e sem espaço sobrando", () => {
    expect(normalizarEtiqueta("  Resgate ")).toBe("resgate");
  });

  it("aceita hífen, sublinhado, número e acento", () => {
    for (const boa of ["quer-comprar", "origem_site", "fase2", "reaquecido", "negociação"]) {
      expect(normalizarEtiqueta(boa), boa).toBe(boa);
    }
  });

  it("recusa espaço no meio, pontuação, vazio e o que não é texto", () => {
    for (const ruim of ["quer comprar", "resgate!", "a/b", "", "   ", null, undefined, 7, {}]) {
      expect(normalizarEtiqueta(ruim), String(ruim)).toBeNull();
    }
  });

  it("recusa etiqueta com mais de 50 caracteres", () => {
    expect(normalizarEtiqueta("a".repeat(50))).toBe("a".repeat(50));
    expect(normalizarEtiqueta("a".repeat(51))).toBeNull();
  });

  it("a lista sai sem repetição, na ordem em que veio, e sem as inválidas", () => {
    expect(normalizarEtiquetas(["Resgate", "origem-site", "resgate", "x y", "reaquecido"])).toEqual([
      "resgate",
      "origem-site",
      "reaquecido",
    ]);
    expect(normalizarEtiquetas("resgate")).toEqual([]);
    expect(normalizarEtiquetas(null)).toEqual([]);
  });

  it("juntar nunca tira uma das atuais", () => {
    expect(juntarEtiquetas(["origem-site", "resgate"], ETIQUETAS_DA_PASSAGEM)).toEqual([
      "origem-site",
      "resgate",
      "reaquecido",
    ]);
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
});

describe("ler e gravar", () => {
  it("lê da conversa certa, com o token no cabeçalho", async () => {
    const cw = chatwootFalso(["origem-site", "Quer-Comprar"]);
    const r = await lerEtiquetasDaConversa(4821, CFG, cw.buscar);
    expect(r).toEqual({ ok: true, valor: ["origem-site", "quer-comprar"] });
    expect(cw.chamadas).toEqual([{ url: URL_DA_CONVERSA, metodo: "GET", corpo: undefined, token: "tok-123" }]);
  });

  it("grava a lista inteira, já limpa", async () => {
    const cw = chatwootFalso(["origem-site"]);
    const r = await gravarEtiquetasDaConversa(4821, ["Resgate", "resgate", "x y"], CFG, cw.buscar);
    expect(r).toEqual({ ok: true, valor: ["resgate"] });
    expect(cw.chamadas[0]).toMatchObject({ metodo: "POST", corpo: { labels: ["resgate"] } });
  });

  it("Chatwoot que responde sem a lista: o que foi pedido é o que ficou", async () => {
    const cw = chatwootFalso([], { semPayloadNoPost: true });
    const r = await gravarEtiquetasDaConversa(4821, ["resgate"], CFG, cw.buscar);
    expect(r).toEqual({ ok: true, valor: ["resgate"] });
  });

  it("conversa que não é inteiro positivo não chega a chamar a API", async () => {
    const cw = chatwootFalso([]);
    for (const ruim of [0, -1, 1.5, Number.NaN]) {
      expect(await lerEtiquetasDaConversa(ruim, CFG, cw.buscar)).toEqual({ ok: false, motivo: "conversa inválida" });
      expect(await gravarEtiquetasDaConversa(ruim, ["a"], CFG, cw.buscar)).toMatchObject({ ok: false });
    }
    expect(cw.chamadas).toHaveLength(0);
  });
});

describe("garantir as etiquetas da passagem", () => {
  it("põe resgate e reaquecido SEM tirar as que a conversa já tinha", async () => {
    const cw = chatwootFalso(["origem-site", "quer-comprar"]);
    const r = await garantirEtiquetas(4821, ETIQUETAS_DA_PASSAGEM, CFG, cw.buscar);

    expect(cw.etiquetas()).toEqual(["origem-site", "quer-comprar", "resgate", "reaquecido"]);
    expect(r).toEqual({
      ok: true,
      valor: {
        antes: ["origem-site", "quer-comprar"],
        depois: ["origem-site", "quer-comprar", "resgate", "reaquecido"],
        mudou: true,
      },
    });
  });

  it("completa quando só uma das duas estava lá", async () => {
    const cw = chatwootFalso(["resgate"]);
    await garantirEtiquetas(4821, ETIQUETAS_DA_PASSAGEM, CFG, cw.buscar);
    expect(cw.etiquetas()).toEqual(["resgate", "reaquecido"]);
  });

  it("não grava quando as duas já estão — passagem repetida não vira escrita", async () => {
    const cw = chatwootFalso(["reaquecido", "resgate", "origem-site"]);
    const r = await garantirEtiquetas(4821, ETIQUETAS_DA_PASSAGEM, CFG, cw.buscar);

    expect(r).toMatchObject({ ok: true, valor: { mudou: false } });
    expect(cw.chamadas.map((c) => c.metodo)).toEqual(["GET"]);
  });

  it("se a leitura falha, NÃO grava — gravar às cegas apagaria as etiquetas da conversa", async () => {
    const cw = chatwootFalso(["origem-site"], { status: 500 });
    const r = await garantirEtiquetas(4821, ETIQUETAS_DA_PASSAGEM, CFG, cw.buscar);

    expect(r).toEqual({ ok: false, motivo: "o Chatwoot respondeu 500" });
    expect(cw.chamadas.map((c) => c.metodo)).toEqual(["GET"]);
  });

  it("resposta de leitura sem a lista também não vira gravação", async () => {
    const buscar = async (_url: string, init?: RequestInit) =>
      init?.method === "POST" ? Response.json({ payload: [] }) : Response.json({ algo: 1 });
    const metodos: string[] = [];
    const r = await garantirEtiquetas(4821, ETIQUETAS_DA_PASSAGEM, CFG, async (url, init) => {
      metodos.push(init?.method ?? "GET");
      return buscar(url, init);
    });
    expect(r).toEqual({ ok: false, motivo: "resposta ilegível do Chatwoot" });
    expect(metodos).toEqual(["GET"]);
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
