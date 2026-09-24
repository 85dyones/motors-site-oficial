import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIPE_V2,
  consultarFipeNoServidor,
  lerPedidoFipe,
  paraFormatoV1,
  urlNaV2,
  type BuscarNaFipe,
} from "../src/lib/fipeNoServidor";

/**
 * A porta da loja para a FIPE (`/api/fipe/[...caminho]`).
 *
 * Fala v1 para fora — é a língua da cascata — e v2 por dentro, porque o token
 * da loja vale na v2. As respostas da v2 aqui são as reais, de 24/09/2026
 * (Fiat 500 Abarth, marca 21, modelo 7097, ano "2014-1").
 */

afterEach(() => vi.restoreAllMocks());

describe("o caminho aceito", () => {
  it("só os quatro degraus da cascata", () => {
    expect(lerPedidoFipe(["carros", "marcas"])).toEqual({ nivel: "marcas", tipo: "carros" });
    expect(lerPedidoFipe(["motos", "marcas", "60", "modelos"])).toEqual({ nivel: "modelos", tipo: "motos", marca: "60" });
    expect(lerPedidoFipe(["caminhoes", "marcas", "102", "modelos", "5", "anos"])).toEqual({
      nivel: "anos",
      tipo: "caminhoes",
      marca: "102",
      modelo: "5",
    });
    expect(lerPedidoFipe(["carros", "marcas", "21", "modelos", "7097", "anos", "2014-1"])).toEqual({
      nivel: "valor",
      tipo: "carros",
      marca: "21",
      modelo: "7097",
      ano: "2014-1",
    });
    // O zero-km da FIPE também é um código de ano válido.
    expect(lerPedidoFipe(["carros", "marcas", "21", "modelos", "7097", "anos", "32000-1"])?.nivel).toBe("valor");
  });

  it("recusa o que a /avaliacao não pede — a rota não é proxy genérico", () => {
    for (const caminho of [
      [],
      ["carros"],
      ["avioes", "marcas"],
      ["carros", "brands"],
      ["carros", "marcas", "abc", "modelos"],
      ["carros", "marcas", "21", "models"],
      ["carros", "marcas", "21", "modelos", "7097", "anos", "2014"],
      ["carros", "marcas", "21", "modelos", "7097", "anos", "2014-1", "history"],
      ["carros", "marcas", "..", "modelos"],
      ["carros", "marcas", "1234567", "modelos"],
    ]) {
      expect(lerPedidoFipe(caminho), caminho.join("/")).toBeNull();
    }
  });

  it("vira a URL da v2 com o tipo em inglês", () => {
    expect(urlNaV2({ nivel: "marcas", tipo: "motos" })).toBe(`${FIPE_V2}/motorcycles/brands`);
    expect(urlNaV2({ nivel: "valor", tipo: "carros", marca: "21", modelo: "7097", ano: "2014-1" })).toBe(
      `${FIPE_V2}/cars/brands/21/models/7097/years/2014-1`,
    );
    expect(urlNaV2({ nivel: "anos", tipo: "caminhoes", marca: "102", modelo: "5" })).toBe(
      `${FIPE_V2}/trucks/brands/102/models/5/years`,
    );
  });
});

describe("a resposta da v2 no formato da v1", () => {
  it("marcas e anos: {code, name} → {codigo, nome}", () => {
    expect(paraFormatoV1("marcas", [{ code: "21", name: "Fiat" }])).toEqual([{ codigo: "21", nome: "Fiat" }]);
    expect(paraFormatoV1("anos", [{ code: "2014-1", name: "2014 Gasolina" }])).toEqual([
      { codigo: "2014-1", nome: "2014 Gasolina" },
    ]);
  });

  it("modelos: dentro de {modelos, anos}, com o código em número, como a v1", () => {
    expect(paraFormatoV1("modelos", [{ code: "7097", name: "500 ABARTH MULTIAIR 1.4 TB 16V 3p" }])).toEqual({
      modelos: [{ codigo: 7097, nome: "500 ABARTH MULTIAIR 1.4 TB 16V 3p" }],
      anos: [],
    });
  });

  it("valor: os campos que a cascata lê", () => {
    const v2 = {
      vehicleType: 1,
      price: "R$ 105.415,00",
      brand: "Fiat",
      model: "500 ABARTH MULTIAIR 1.4 TB 16V 3p",
      modelYear: 2014,
      fuel: "Gasolina",
      codeFipe: "001429-0",
      referenceMonth: "setembro de 2026",
      fuelAcronym: "G",
    };
    expect(paraFormatoV1("valor", v2)).toMatchObject({
      Valor: "R$ 105.415,00",
      CodigoFipe: "001429-0",
      MesReferencia: "setembro de 2026",
      Marca: "Fiat",
      AnoModelo: 2014,
    });
  });

  it("forma errada é null — e null não vai para o cache", () => {
    const ERRO = { error: "limite de taxa excedido" };
    expect(paraFormatoV1("marcas", ERRO)).toBeNull();
    expect(paraFormatoV1("marcas", []), "lista vazia de marcas é FIPE quebrada").toBeNull();
    expect(paraFormatoV1("modelos", ERRO)).toBeNull();
    expect(paraFormatoV1("valor", ERRO)).toBeNull();
    expect(paraFormatoV1("valor", { price: "" })).toBeNull();
    expect(paraFormatoV1("valor", [])).toBeNull();
  });
});

describe("consultarFipeNoServidor", () => {
  const MARCAS_V2 = [{ code: "21", name: "Fiat" }];

  function buscarQueResponde(status: number, corpo: unknown, pedidos: { url: string; headers: Record<string, string> }[] = []) {
    const buscar: BuscarNaFipe = async (url, init) => {
      pedidos.push({ url, headers: init.headers });
      return { ok: status >= 200 && status < 300, status, json: async () => corpo };
    };
    return buscar;
  }

  it("com token, o cabeçalho da v2 vai junto", async () => {
    const pedidos: { url: string; headers: Record<string, string> }[] = [];
    const r = await consultarFipeNoServidor(["carros", "marcas"], {
      token: " tok-123 ",
      buscar: buscarQueResponde(200, MARCAS_V2, pedidos),
    });
    expect(r).toEqual({ status: 200, corpo: [{ codigo: "21", nome: "Fiat" }], guardar: true });
    expect(pedidos[0].url).toBe(`${FIPE_V2}/cars/brands`);
    expect(pedidos[0].headers["X-Subscription-Token"]).toBe("tok-123");
  });

  it("sem token, nenhum cabeçalho vazio", async () => {
    const pedidos: { url: string; headers: Record<string, string> }[] = [];
    await consultarFipeNoServidor(["carros", "marcas"], { buscar: buscarQueResponde(200, MARCAS_V2, pedidos) });
    expect(pedidos[0].headers).not.toHaveProperty("X-Subscription-Token");
  });

  it("429 da FIPE vira 502 sem cache — para o navegador tentar a pública", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await consultarFipeNoServidor(["carros", "marcas"], {
      buscar: buscarQueResponde(429, { error: "limite de taxa excedido" }),
    });
    expect(r.status).toBe(502);
    expect(r.guardar).toBe(false);
  });

  it("200 com forma errada também é 502 sem cache", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await consultarFipeNoServidor(["carros", "marcas"], {
      buscar: buscarQueResponde(200, { error: "x" }),
    });
    expect(r).toMatchObject({ status: 502, guardar: false });
  });

  it("rede caindo é 502, sem lançar para a rota", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await consultarFipeNoServidor(["carros", "marcas"], {
      buscar: async () => {
        throw new TypeError("fetch failed");
      },
    });
    expect(r).toMatchObject({ status: 502, guardar: false });
  });

  it("caminho inválido é 400 e nem chega à FIPE", async () => {
    const pedidos: { url: string; headers: Record<string, string> }[] = [];
    const r = await consultarFipeNoServidor(["carros", "brands"], { buscar: buscarQueResponde(200, [], pedidos) });
    expect(r).toMatchObject({ status: 400, guardar: false });
    expect(pedidos).toHaveLength(0);
  });
});

describe("a rota", () => {
  const rota = readFileSync(join(__dirname, "..", "src", "app", "api", "fipe", "[...caminho]", "route.ts"), "utf-8");

  it("só guarda na borda a resposta boa", () => {
    expect(rota).toContain("resposta.guardar");
    expect(rota).toMatch(/s-maxage=43200/);
    expect(rota).toMatch(/"Cache-Control": "no-store"/);
  });

  it("tem limite de taxa por IP e global, e cortar responde 429 (a reserva do navegador assume)", () => {
    expect(rota).toContain("limiteIp.limit(ip)");
    expect(rota).toContain('limiteGlobal.limit("fipe:global")');
    expect(rota).toMatch(/status: 429/);
  });

  it("lê o token da env, nunca de site_settings", () => {
    expect(rota).toContain("process.env.FIPE_API_TOKEN");
    expect(rota).not.toContain("getCachedSettings");
  });
});
