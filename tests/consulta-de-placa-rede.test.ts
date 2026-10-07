import { describe, it, expect, vi } from "vitest";
import {
  APIBRASIL_CONSULTA_DE_VEICULOS,
  configuracaoDaApiBrasil,
  consultarVeiculosTotal,
  type BuscarNaApiBrasil,
} from "../src/lib/apiBrasil";
import { CNAE_DE_LOCADORA } from "../src/lib/consultaDePlaca";
import { BRASIL_API, consultarGratuito, lerEmpresa, lerFipeOficial, type BuscarGratuito } from "../src/lib/consultaGratuita";

/**
 * A rede da consulta de placa: a chamada paga (APIBrasil) e as duas sem custo
 * (BrasilAPI). Nenhum teste sai para a internet: o `buscar` é dublado.
 *
 * A regra que mais importa aqui é a do dinheiro: UMA chamada por consulta, sem
 * nova tentativa, porque cada uma custa R$ 30.
 */

const responde = (status: number, corpo: unknown) =>
  vi.fn<BuscarNaApiBrasil>(async () => ({ status, json: async () => corpo }));

describe("a chamada paga", () => {
  it("vai uma vez, com o produto, a placa e o token no lugar certo", async () => {
    const buscar = responde(200, { error: false, data: {} });
    const r = await consultarVeiculosTotal("ABC1D23", { token: "segredo", homologacao: false, buscar });
    expect(r).toEqual({ ok: true, corpo: { error: false, data: {} } });
    expect(buscar).toHaveBeenCalledTimes(1);
    const [url, init] = buscar.mock.calls[0];
    expect(url).toBe(APIBRASIL_CONSULTA_DE_VEICULOS);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer segredo");
    expect(JSON.parse(init.body)).toEqual({ tipo: "veiculos-total", placa: "ABC1D23", homolog: false });
  });

  it("homologação vai no corpo: o fornecedor não cobra", async () => {
    const buscar = responde(200, { error: false, data: {} });
    await consultarVeiculosTotal("ABC1D23", { token: "t", homologacao: true, buscar });
    expect(JSON.parse(buscar.mock.calls[0][1].body).homolog).toBe(true);
  });

  it("402 é falta de saldo: não cobrou, e a mensagem manda recarregar", async () => {
    const r = await consultarVeiculosTotal("ABC1D23", { token: "t", homologacao: false, buscar: responde(402, {}) });
    expect(r).toMatchObject({ ok: false, status: 402, podeTerCobrado: false });
    if (!r.ok) expect(r.motivo).toContain("sem saldo");
  });

  it("token recusado vira 503 com o nome da variável", async () => {
    const r = await consultarVeiculosTotal("ABC1D23", { token: "t", homologacao: false, buscar: responde(401, {}) });
    expect(r).toMatchObject({ ok: false, status: 503, podeTerCobrado: false });
    if (!r.ok) expect(r.motivo).toContain("APIBRASIL_TOKEN");
  });

  it.each([500, 502, 503])("%i do fornecedor: UMA chamada, sem nova tentativa, e avisa que pode ter cobrado", async (status) => {
    const buscar = responde(status, { error: true });
    const r = await consultarVeiculosTotal("ABC1D23", { token: "t", homologacao: false, buscar });
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: false, status: 502, podeTerCobrado: true });
  });

  it("estouro de prazo: UMA chamada, 504, e o aviso de que pode ter cobrado", async () => {
    const buscar = vi.fn<BuscarNaApiBrasil>(async () => {
      throw Object.assign(new Error("abortou"), { name: "AbortError" });
    });
    const r = await consultarVeiculosTotal("ABC1D23", { token: "t", homologacao: false, buscar });
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: false, status: 504, podeTerCobrado: true });
    if (!r.ok) expect(r.motivo).toContain("PODE ter sido cobrada");
  });

  it("erro com HTTP 200 passa adiante: quem lê o `error` é o leitor", async () => {
    const corpo = { error: true, message: "Placa não encontrada" };
    expect(await consultarVeiculosTotal("ABC1D23", { token: "t", homologacao: false, buscar: responde(200, corpo) })).toEqual({ ok: true, corpo });
  });

  it("corpo ilegível não vira retrato", async () => {
    const buscar = vi.fn<BuscarNaApiBrasil>(async () => ({
      status: 200,
      json: async () => {
        throw new Error("não é JSON");
      },
    }));
    expect(await consultarVeiculosTotal("ABC1D23", { token: "t", homologacao: false, buscar })).toMatchObject({ ok: false, status: 502 });
  });

  it("a configuração sai do ambiente: sem token é `null`, e só \"1\" liga a homologação", () => {
    expect(configuracaoDaApiBrasil({})).toEqual({ token: null, homologacao: false });
    expect(configuracaoDaApiBrasil({ APIBRASIL_TOKEN: "  ", APIBRASIL_HOMOLOGACAO: "true" })).toEqual({ token: null, homologacao: false });
    expect(configuracaoDaApiBrasil({ APIBRASIL_TOKEN: " abc ", APIBRASIL_HOMOLOGACAO: "1" })).toEqual({ token: "abc", homologacao: true });
  });
});

describe("a empresa do primeiro faturamento", () => {
  it("lê razão social, fantasia e atividade, e reconhece locadora pelo CNAE", () => {
    expect(
      lerEmpresa({
        razao_social: "FROTA LOCADORA SA",
        nome_fantasia: "Frota",
        cnae_fiscal: 7711000,
        cnae_fiscal_descricao: "Locação de automóveis sem condutor",
        qsa: [{ nome_socio: "FULANO" }],
      }),
    ).toEqual({
      razaoSocial: "FROTA LOCADORA SA",
      nomeFantasia: "Frota",
      cnae: CNAE_DE_LOCADORA,
      atividade: "Locação de automóveis sem condutor",
      locadora: true,
    });
  });
  it("o quadro de sócios não é lido: só dado de empresa sai", () => {
    const lida = lerEmpresa({ razao_social: "X LTDA", cnae_fiscal: "4511-1/01", qsa: [{ nome_socio: "FULANO DE TAL" }] });
    expect(JSON.stringify(lida)).not.toContain("FULANO");
    expect(lida?.cnae).toBe("4511101");
    expect(lida?.locadora).toBe(false);
  });
  it("resposta sem empresa é `null`", () => {
    expect(lerEmpresa(null)).toBeNull();
    expect(lerEmpresa({ message: "CNPJ não encontrado" })).toBeNull();
  });
});

describe("a FIPE na tabela pública", () => {
  const tabela = [
    { valor: "R$ 139.900,00", anoModelo: 2023, combustivel: "Gasolina", mesReferencia: "outubro de 2026" },
    { valor: "R$ 128.430,00", anoModelo: 2022, combustivel: "Gasolina", mesReferencia: "outubro de 2026" },
  ];
  it("fica a linha do ano-modelo do carro", () => {
    expect(lerFipeOficial(tabela, 2022)).toEqual({ valor: 128430, mesReferencia: "outubro de 2026" });
  });
  it("duas linhas do mesmo ano (flex e diesel) não se escolhe: sem conferência", () => {
    expect(lerFipeOficial([...tabela, { valor: "R$ 150.000,00", anoModelo: 2022, combustivel: "Diesel" }], 2022)).toBeNull();
  });
  it("ano ausente, valor torto ou resposta que não é lista: `null`", () => {
    expect(lerFipeOficial(tabela, 2019)).toBeNull();
    expect(lerFipeOficial([{ valor: "indisponível", anoModelo: 2022 }], 2022)).toBeNull();
    expect(lerFipeOficial({ message: "erro" }, 2022)).toBeNull();
  });
});

describe("as duas consultas sem custo, juntas", () => {
  // CNPJ com dígitos verificadores válidos (o do exemplo da própria Receita).
  const CNPJ = "11222333000181";
  const entrada = { cnpj: CNPJ, codigoFipe: "005528-0", anoModelo: 2022 };

  it("as duas saem, cada uma para o seu endereço", async () => {
    const buscar = vi.fn<BuscarGratuito>(async (url) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.includes("/cnpj/")
          ? { razao_social: "CONCESSIONARIA SA", cnae_fiscal: 4511101 }
          : [{ valor: "R$ 128.430,00", anoModelo: 2022, mesReferencia: "outubro de 2026" }],
    }));
    const r = await consultarGratuito(entrada, buscar);
    expect(buscar.mock.calls.map((c) => c[0]).sort()).toEqual([`${BRASIL_API}/cnpj/v1/${CNPJ}`, `${BRASIL_API}/fipe/preco/v1/005528-0`]);
    expect(r.empresaDoFaturamento?.razaoSocial).toBe("CONCESSIONARIA SA");
    expect(r.fipeOficial?.valor).toBe(128430);
    expect(r.falhas).toEqual([]);
  });

  it("nunca lança: rede fora vira duas linhas de falha, e a consulta paga segue", async () => {
    const buscar = vi.fn<BuscarGratuito>(async () => {
      throw new Error("sem rede");
    });
    const r = await consultarGratuito(entrada, buscar);
    expect(r.empresaDoFaturamento).toBeNull();
    expect(r.fipeOficial).toBeNull();
    expect(r.falhas).toHaveLength(2);
    expect(r.falhas.join(" ")).toContain("sem rede");
  });

  it("HTTP de erro também é falha dita, e não exceção", async () => {
    const buscar = vi.fn<BuscarGratuito>(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    const r = await consultarGratuito(entrada, buscar);
    expect(r.falhas.join(" ")).toContain("HTTP 429");
  });

  it("sem CNPJ válido e sem código FIPE, nada sai para a rede", async () => {
    const buscar = vi.fn<BuscarGratuito>();
    const r = await consultarGratuito({ cnpj: "00000000000100", codigoFipe: null, anoModelo: 2022 }, buscar);
    expect(buscar).not.toHaveBeenCalled();
    expect(r.falhas).toHaveLength(2);
  });

  it("código FIPE fora do formato não vira pedaço de URL", async () => {
    const buscar = vi.fn<BuscarGratuito>(async () => ({ ok: true, status: 200, json: async () => ({ razao_social: "X", cnae_fiscal: 1 }) }));
    await consultarGratuito({ cnpj: CNPJ, codigoFipe: "../../cnpj/v1/1", anoModelo: 2022 }, buscar);
    expect(buscar.mock.calls.map((c) => c[0])).toEqual([`${BRASIL_API}/cnpj/v1/${CNPJ}`]);
  });
});
