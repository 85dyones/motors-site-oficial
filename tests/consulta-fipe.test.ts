import { describe, it, expect } from "vitest";
import {
  FIPE_BASE,
  valorFipeEmNumero,
  listarMarcas,
  listarModelos,
  listarAnos,
  consultarValor,
  type Buscar,
} from "../src/lib/consultaFipe";

function buscarFalso(respostas: Record<string, unknown>, pedidos: string[] = []): Buscar {
  return async (url) => {
    pedidos.push(url);
    if (!(url in respostas)) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => respostas[url] };
  };
}

describe("valorFipeEmNumero", () => {
  it("lê o valor como a API devolve", () => {
    expect(valorFipeEmNumero("R$ 42.100,00")).toBe(42100);
    expect(valorFipeEmNumero("R$ 1.234.567,89")).toBe(1234567.89);
  });
  it("o que não é valor vira null", () => {
    expect(valorFipeEmNumero("")).toBeNull();
    expect(valorFipeEmNumero(undefined)).toBeNull();
    expect(valorFipeEmNumero("R$ 0,00")).toBeNull();
  });
});

describe("a cascata", () => {
  it("marcas, modelos e anos viram opções com código em texto", async () => {
    const pedidos: string[] = [];
    const buscar = buscarFalso(
      {
        [`${FIPE_BASE}/carros/marcas`]: [{ codigo: "48", nome: "Renault" }],
        [`${FIPE_BASE}/carros/marcas/48/modelos`]: { modelos: [{ codigo: 8452, nome: "KWID Zen 1.0" }], anos: [] },
        [`${FIPE_BASE}/carros/marcas/48/modelos/8452/anos`]: [{ codigo: "2021-1", nome: "2021 Gasolina" }],
      },
      pedidos,
    );
    expect(await listarMarcas("carros", buscar)).toEqual([{ codigo: "48", nome: "Renault" }]);
    expect(await listarModelos("carros", "48", buscar)).toEqual([{ codigo: "8452", nome: "KWID Zen 1.0" }]);
    expect(await listarAnos("carros", "48", "8452", buscar)).toEqual([{ codigo: "2021-1", nome: "2021 Gasolina" }]);
    expect(pedidos).toHaveLength(3);
  });

  it("o valor chega com código e mês, sem o espaço que a API deixa no fim", async () => {
    const buscar = buscarFalso({
      [`${FIPE_BASE}/carros/marcas/48/modelos/8452/anos/2021-1`]: {
        Valor: "R$ 42.100,00",
        CodigoFipe: "025258-0",
        MesReferencia: "setembro de 2026 ",
      },
    });
    expect(await consultarValor("carros", "48", "8452", "2021-1", buscar)).toEqual({
      valor: 42100,
      codigo: "025258-0",
      mesReferencia: "setembro de 2026",
    });
  });

  it("resposta sem valor devolve null; erro HTTP lança", async () => {
    const semValor = buscarFalso({ [`${FIPE_BASE}/carros/marcas/1/modelos/2/anos/3`]: { Valor: "" } });
    expect(await consultarValor("carros", "1", "2", "3", semValor)).toBeNull();
    await expect(listarMarcas("carros", buscarFalso({}))).rejects.toThrow(/FIPE/);
  });

  it("código com caractere estranho vai escapado na URL", async () => {
    const pedidos: string[] = [];
    await listarModelos("carros", "4/8", buscarFalso({}, pedidos)).catch(() => undefined);
    expect(pedidos[0]).toBe(`${FIPE_BASE}/carros/marcas/4%2F8/modelos`);
  });
});
