import { describe, it, expect } from "vitest";
import {
  FIPE_BASE,
  FIPE_NA_LOJA,
  criarBuscaComReserva,
  formatarValorFipe,
  valorFipeEmNumero,
  listarMarcas,
  listarModelos,
  listarAnos,
  consultarValor,
  type Buscar,
} from "../src/lib/consultaFipe";
import { fipeParaNumero } from "../src/lib/avaliacaoRecomendacao";

/**
 * A cascata da FIPE como lib. Os quatro primeiros blocos são os que o plano
 * do Repasse (Task 5 de `docs/superpowers/plans/2026-09-24-repasse-pr1-dados.md`)
 * escreveu para esta interface; o resto é o que a /avaliacao pediu em 24/09:
 * a reserva entre a porta da loja e a pública, e o valor de volta em texto.
 */

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

describe("o objeto de erro da FIPE nunca vira lista", () => {
  // O 429 real da API, de 24/09/2026. Com status 200 por engano de algum
  // intermediário, ele ainda não pode chegar ao `.map` da tela.
  const ERRO = { error: "limite de taxa excedido. Por favor, visite https://fipe.api.br para obter um token" };

  it("marcas e anos viram lista vazia", async () => {
    const buscar = buscarFalso({
      [`${FIPE_BASE}/carros/marcas`]: ERRO,
      [`${FIPE_BASE}/carros/marcas/1/modelos/2/anos`]: ERRO,
    });
    expect(await listarMarcas("carros", buscar)).toEqual([]);
    expect(await listarAnos("carros", "1", "2", buscar)).toEqual([]);
  });

  it("modelos e valor também", async () => {
    const buscar = buscarFalso({
      [`${FIPE_BASE}/carros/marcas/1/modelos`]: ERRO,
      [`${FIPE_BASE}/carros/marcas/1/modelos/2/anos/3`]: ERRO,
    });
    expect(await listarModelos("carros", "1", buscar)).toEqual([]);
    expect(await consultarValor("carros", "1", "2", "3", buscar)).toBeNull();
  });
});

describe("a reserva entre as portas", () => {
  const URL_PUBLICA = `${FIPE_BASE}/carros/marcas`;
  const URL_DA_LOJA = `${FIPE_NA_LOJA}/carros/marcas`;

  it("a da loja serve: a pública nem é chamada", async () => {
    const pedidos: string[] = [];
    const buscar = criarBuscaComReserva(buscarFalso({ [URL_DA_LOJA]: [{ codigo: "21", nome: "Fiat" }] }, pedidos));
    expect(await listarMarcas("carros", buscar)).toEqual([{ codigo: "21", nome: "Fiat" }]);
    expect(pedidos).toEqual([URL_DA_LOJA]);
  });

  it("a da loja responde erro: cai na pública", async () => {
    const pedidos: string[] = [];
    const buscar = criarBuscaComReserva(buscarFalso({ [URL_PUBLICA]: [{ codigo: "21", nome: "Fiat" }] }, pedidos));
    expect(await listarMarcas("carros", buscar)).toEqual([{ codigo: "21", nome: "Fiat" }]);
    expect(pedidos).toEqual([URL_DA_LOJA, URL_PUBLICA]);
  });

  it("a da loja lança (rede, rota ausente): cai na pública", async () => {
    const pedidos: string[] = [];
    const rede: Buscar = async (url) => {
      pedidos.push(url);
      if (url.startsWith(FIPE_NA_LOJA)) throw new TypeError("Failed to fetch");
      return { ok: true, json: async () => [{ codigo: "21", nome: "Fiat" }] };
    };
    expect(await listarMarcas("carros", criarBuscaComReserva(rede))).toHaveLength(1);
    expect(pedidos).toEqual([URL_DA_LOJA, URL_PUBLICA]);
  });

  it("as duas falhando, a cascata lança — quem chama decide", async () => {
    await expect(listarMarcas("carros", criarBuscaComReserva(buscarFalso({})))).rejects.toThrow(/FIPE/);
  });

  it("URL que não é da FIPE vai direto, sem desvio", async () => {
    const pedidos: string[] = [];
    await criarBuscaComReserva(buscarFalso({}, pedidos))("https://exemplo.com/x");
    expect(pedidos).toEqual(["https://exemplo.com/x"]);
  });
});

describe("formatarValorFipe", () => {
  it("devolve o texto no formato da API", () => {
    expect(formatarValorFipe(42100)).toBe("R$ 42.100,00");
    expect(formatarValorFipe(1234567.89)).toBe("R$ 1.234.567,89");
  });

  it("é o inverso de quem lê o texto — a /avaliacao e o servidor", () => {
    for (const valor of [42100, 105415, 1234567.89]) {
      expect(valorFipeEmNumero(formatarValorFipe(valor))).toBe(valor);
    }
    // `fipeParaNumero` é quem o servidor usa para a recomendação.
    expect(fipeParaNumero(formatarValorFipe(105415))).toBe(105415);
  });
});
