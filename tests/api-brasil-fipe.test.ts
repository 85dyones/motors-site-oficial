import { describe, it, expect, vi } from "vitest";
import {
  PRODUTO_TABELA_FIPE,
  corpoDaTabelaPaga,
  lerMesNaTabelaPaga,
  lerRespostaDaTabelaPaga,
  precoDaTabelaPaga,
} from "../src/lib/apiBrasilFipe";
import { APIBRASIL_CONSULTA_DE_VEICULOS } from "../src/lib/apiBrasil";

/**
 * A Tabela FIPE paga da APIBrasil (08/10/2026), R$ 0,06 por mês. O que estes
 * testes seguram: o corpo sai com os códigos da FIPE no formato da doc; erro
 * que chega com HTTP 200 não vira valor; "não tinha o carro" é diferente de
 * falha; e nenhuma chamada se repete sozinha.
 */

const PEDIDO = { tipo: "carros" as const, marca: "59", modelo: "5940", ano: "2022-1", referencia: 320 };

describe("o corpo do pedido", () => {
  it("leva os códigos da FIPE como números, o ano em texto e o modo de teste", () => {
    expect(corpoDaTabelaPaga(PEDIDO, false)).toEqual({
      tipo: PRODUTO_TABELA_FIPE,
      codigoTabelaReferencia: 320,
      codigoTipoVeiculo: 1,
      codigoMarca: 59,
      codigoModelo: 5940,
      ano: "2022-1",
      anoModelo: 2022,
      codigoTipoCombustivel: 1,
      homolog: false,
    });
    expect(corpoDaTabelaPaga({ ...PEDIDO, tipo: "motos", ano: "2019-3" }, true)).toMatchObject({ codigoTipoVeiculo: 2, anoModelo: 2019, codigoTipoCombustivel: 3, homolog: true });
  });

  it("pedido torto não vira corpo (seria uma chamada cobrada para nada)", () => {
    expect(corpoDaTabelaPaga({ ...PEDIDO, marca: "x" }, false)).toBeNull();
    expect(corpoDaTabelaPaga({ ...PEDIDO, ano: "2022" }, false)).toBeNull();
    expect(corpoDaTabelaPaga({ ...PEDIDO, referencia: 0 }, false)).toBeNull();
  });
});

describe("a resposta", () => {
  it("lê o valor em reais e centavos e os dados do carro", () => {
    expect(
      lerRespostaDaTabelaPaga({
        error: false,
        message: "ok",
        data: { Valor: "R$ 123.456,78", Marca: "VW", Modelo: "T-Cross", AnoModelo: 2022, Combustivel: "Flex", CodigoFipe: "005510-1", MesReferencia: "abril de 2025" },
      }),
    ).toEqual({ tipo: "valor", valor: { valor: 123456.78, marca: "VW", modelo: "T-Cross", anoModelo: 2022, combustivel: "Flex", codigoFipe: "005510-1" } });
  });

  it("erro com HTTP 200 não é valor; 'não tinha o carro' é resposta; saldo é saldo", () => {
    expect(lerRespostaDaTabelaPaga({ error: true, message: "Parâmetros inválidos" })).toEqual({ tipo: "sem_valor" });
    expect(lerRespostaDaTabelaPaga({ error: false, data: { codigo: "2", erro: "Parâmetros inválidos" } })).toEqual({ tipo: "sem_valor" });
    expect(lerRespostaDaTabelaPaga({ error: true, message: "Saldo insuficiente" }).tipo).toBe("sem_saldo");
    expect(lerRespostaDaTabelaPaga({ error: true, message: "Serviço indisponível" })).toMatchObject({ tipo: "falha" });
    expect(lerRespostaDaTabelaPaga({ error: false, data: { Valor: "R$ 0,00" } })).toMatchObject({ tipo: "falha" });
    expect(lerRespostaDaTabelaPaga(null)).toMatchObject({ tipo: "falha" });
    expect(lerRespostaDaTabelaPaga({ error: false, data: [] })).toMatchObject({ tipo: "falha" });
  });

  it("'não encontrado' que não fala do carro é falha, e não 'não tinha'", () => {
    expect(lerRespostaDaTabelaPaga({ error: true, message: "Token não encontrado" })).toMatchObject({ tipo: "falha" });
    expect(lerRespostaDaTabelaPaga({ error: true, message: "Serviço não encontrado" })).toMatchObject({ tipo: "falha" });
    expect(lerRespostaDaTabelaPaga({ error: true, message: "Veículo não encontrado" })).toEqual({ tipo: "sem_valor" });
  });

  it("fora da homologação, o carro de exemplo ou outro ano-modelo não vira tabela", () => {
    const exemplo = { error: false, data: { Valor: "R$ 123.456,78", Marca: "MARCA HOMOLOG", Modelo: "MODELO HOMOLOG", AnoModelo: 2024, CodigoFipe: "999999-9" } };
    expect(lerRespostaDaTabelaPaga(exemplo, { anoModelo: 2024, homologacao: false })).toMatchObject({ tipo: "falha" });
    expect(lerRespostaDaTabelaPaga(exemplo, { anoModelo: 2022, homologacao: true })).toMatchObject({ tipo: "valor" });
    const outroAno = { error: false, data: { Valor: "R$ 90.000,00", Marca: "VW", AnoModelo: 2021 } };
    expect(lerRespostaDaTabelaPaga(outroAno, { anoModelo: 2022, homologacao: false })).toMatchObject({ tipo: "falha" });
    expect(lerRespostaDaTabelaPaga(outroAno, { anoModelo: 2021, homologacao: false })).toMatchObject({ tipo: "valor" });
  });
});

describe("a chamada", () => {
  const resposta = (status: number, corpo: unknown) => vi.fn(async () => ({ status, json: async () => corpo }));

  it("POST no endereço da APIBrasil, com o token no cabeçalho e o corpo da doc, uma vez só", async () => {
    const buscar = resposta(200, { error: false, data: { Valor: "R$ 99.000,00" } });
    const r = await lerMesNaTabelaPaga(PEDIDO, { token: "tok", homologacao: false, buscar });
    expect(r).toMatchObject({ tipo: "valor", valor: { valor: 99000 } });
    expect(buscar).toHaveBeenCalledTimes(1);
    const [url, init] = buscar.mock.calls[0] as unknown as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(url).toBe(APIBRASIL_CONSULTA_DE_VEICULOS);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual(corpoDaTabelaPaga(PEDIDO, false));
  });

  it("402 é sem saldo, 401/403 é token, 5xx é falha; nada se repete", async () => {
    for (const [status, tipo] of [
      [402, "sem_saldo"],
      [401, "sem_acesso"],
      [403, "sem_acesso"],
      [503, "falha"],
    ] as const) {
      const buscar = resposta(status, {});
      expect((await lerMesNaTabelaPaga(PEDIDO, { token: "tok", homologacao: false, buscar })).tipo).toBe(tipo);
      expect(buscar).toHaveBeenCalledTimes(1);
    }
  });

  it("pedido torto não sai da loja", async () => {
    const buscar = resposta(200, {});
    expect((await lerMesNaTabelaPaga({ ...PEDIDO, modelo: "" }, { token: "tok", homologacao: false, buscar })).tipo).toBe("falha");
    expect(buscar).not.toHaveBeenCalled();
  });

  it("rede caída é falha, sem exceção escapando", async () => {
    const buscar = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    expect(await lerMesNaTabelaPaga(PEDIDO, { token: "tok", homologacao: false, buscar })).toEqual({ tipo: "falha", porque: "não respondeu" });
  });
});

describe("o preço", () => {
  it("vem da variável, com vírgula ou ponto; sem ela, ninguém inventa", () => {
    expect(precoDaTabelaPaga({ APIBRASIL_FIPE_PRECO: "0,06" })).toBe(0.06);
    expect(precoDaTabelaPaga({ APIBRASIL_FIPE_PRECO: "0.06" })).toBe(0.06);
    expect(precoDaTabelaPaga({})).toBeNull();
    expect(precoDaTabelaPaga({ APIBRASIL_FIPE_PRECO: "abc" })).toBeNull();
  });
});
