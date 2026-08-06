import { describe, it, expect } from "vitest";
import { escolherSimilares } from "../src/lib/similares";
import type { Veiculo } from "../src/types";

/**
 * O caso que originou a regra: na PDP do Camaro SS (R$ 229.900) apareciam um
 * Kia Bongo, uma Strada Ranch e um Polo. Os três estão cadastrados como
 * "Hatch", o Camaro também, e carroceria igual era a chave primária de
 * ordenação — etiqueta errada mandava na vitrine inteira.
 *
 * Os veículos abaixo são o estoque real de 2026-08-06, com o `tipo` como está
 * no banco (errado, de propósito): o teste tem que provar que a regra aguenta
 * cadastro furado, não que ela funciona depois de alguém arrumar o cadastro.
 */

function veiculo(parcial: Partial<Veiculo> & { id: string; preco_original: number }): Veiculo {
  return {
    marca: "",
    modelo: "",
    versao: "",
    ano: 2020,
    quilometragem: 0,
    cambio: "",
    combustivel: "",
    cor: "",
    placa: "",
    fipe: "",
    preco_promocional: 0,
    pericia: "",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
    ...parcial,
  } as Veiculo;
}

const CAMARO = veiculo({ id: "camaro", modelo: "camaro", preco_original: 229900, tipo: "Hatch" });

const ESTOQUE: Veiculo[] = [
  CAMARO,
  veiculo({ id: "x4", modelo: "x4 m40i", preco_original: 318900, tipo: "SUV" }),
  veiculo({ id: "x1", modelo: "x1 sdrive", preco_original: 179900, tipo: "SUV" }),
  veiculo({ id: "corolla-cross", modelo: "corolla cross", preco_original: 175900, tipo: "SUV" }),
  veiculo({ id: "tiguan", modelo: "tiguan allspace", preco_original: 175900, tipo: "SUV" }),
  veiculo({ id: "titano", modelo: "titano", preco_original: 173900, tipo: "SUV" }),
  veiculo({ id: "bongo", modelo: "bongo k-2500", preco_original: 146900, tipo: "Hatch" }),
  veiculo({ id: "corolla", modelo: "corolla gr-sport", preco_original: 140900, tipo: "Sedan" }),
  veiculo({ id: "strada-ranch", modelo: "strada ranch", preco_original: 125900, tipo: "Hatch" }),
  veiculo({ id: "polo", modelo: "polo highline", preco_original: 107900, tipo: "Hatch" }),
  veiculo({ id: "gsxr", modelo: "gsx-r 750", preco_original: 54900, tipo: "Motocicleta" }),
];

describe("escolherSimilares", () => {
  it("não repete o caso do Camaro: nada 36% abaixo entra na régua", () => {
    const ids = escolherSimilares(CAMARO, ESTOQUE).map((v) => v.id);
    expect(ids).not.toContain("bongo");
    expect(ids).not.toContain("strada-ranch");
    expect(ids).not.toContain("polo");
  });

  it("na página do Camaro, mostra os vizinhos de preço de verdade", () => {
    const ids = escolherSimilares(CAMARO, ESTOQUE).map((v) => v.id);
    expect(ids).toHaveLength(3);
    // 179.900 (−22%) e 175.900 (−24%) antes de 318.900 (+39%).
    expect(ids[0]).toBe("x1");
    expect(ids.slice(1)).toEqual(expect.arrayContaining(["corolla-cross", "tiguan"]));
  });

  it("carroceria igual desempata, mas não vence distância grande", () => {
    const base = veiculo({ id: "base", preco_original: 100000, tipo: "SUV" });
    const escolhidos = escolherSimilares(
      base,
      [
        base,
        veiculo({ id: "suv-longe", preco_original: 130000, tipo: "SUV" }),
        veiculo({ id: "sedan-perto", preco_original: 102000, tipo: "Sedan" }),
      ],
      1,
    );
    expect(escolhidos[0].id).toBe("sedan-perto");
  });

  it("com distância parecida, carroceria igual passa na frente", () => {
    const base = veiculo({ id: "base", preco_original: 100000, tipo: "SUV" });
    const escolhidos = escolherSimilares(
      base,
      [
        base,
        veiculo({ id: "suv", preco_original: 106000, tipo: "SUV" }),
        veiculo({ id: "sedan", preco_original: 104000, tipo: "Sedan" }),
      ],
      1,
    );
    expect(escolhidos[0].id).toBe("suv");
  });

  it("moto não é vizinha de carro, nem carro de moto", () => {
    const moto = veiculo({ id: "moto-base", preco_original: 55000, tipo: "Motocicleta" });
    const carroBarato = veiculo({ id: "ka", preco_original: 54900, tipo: "Hatch" });

    // O Ka custa quase o mesmo que a GSX-R e mesmo assim não a puxa.
    expect(escolherSimilares(carroBarato, [...ESTOQUE, carroBarato]).map((v) => v.id))
      .not.toContain("gsxr");
    // E a moto só enxerga a outra moto, não o carro de preço igual.
    expect(escolherSimilares(moto, [...ESTOQUE, moto, carroBarato]).map((v) => v.id))
      .toEqual(["gsxr"]);
  });

  it("vendido e o próprio veículo ficam de fora", () => {
    const base = veiculo({ id: "base", preco_original: 100000 });
    const ids = escolherSimilares(base, [
      base,
      veiculo({ id: "vendido", preco_original: 101000, vendido: true }),
      veiculo({ id: "livre", preco_original: 99000 }),
    ]).map((v) => v.id);
    expect(ids).toEqual(["livre"]);
  });

  it("devolve menos de três em vez de completar com vizinho ruim", () => {
    const base = veiculo({ id: "base", preco_original: 100000 });
    const escolhidos = escolherSimilares(base, [
      base,
      veiculo({ id: "dentro", preco_original: 95000 }),
      veiculo({ id: "fora-baixo", preco_original: 60000 }),
      veiculo({ id: "fora-alto", preco_original: 200000 }),
    ]);
    expect(escolhidos.map((v) => v.id)).toEqual(["dentro"]);
  });

  it("sem ninguém na banda, devolve lista vazia e a seção some", () => {
    const base = veiculo({ id: "base", preco_original: 500000 });
    expect(escolherSimilares(base, [base, ...ESTOQUE])).toEqual([]);
  });

  it("a banda é assimétrica: sobe mais do que desce", () => {
    const base = veiculo({ id: "base", preco_original: 100000 });
    const ids = escolherSimilares(base, [
      base,
      veiculo({ id: "teto", preco_original: 140000 }),
      veiculo({ id: "piso", preco_original: 70000 }),
      veiculo({ id: "abaixo-do-piso", preco_original: 69000 }),
      veiculo({ id: "acima-do-teto", preco_original: 141000 }),
    ]).map((v) => v.id);
    expect(ids).toEqual(expect.arrayContaining(["teto", "piso"]));
    expect(ids).not.toContain("abaixo-do-piso");
    expect(ids).not.toContain("acima-do-teto");
  });

  it("usa o preço promocional quando ele vale", () => {
    const base = veiculo({ id: "base", preco_original: 100000 });
    const ids = escolherSimilares(base, [
      base,
      // Fora da banda pelo preço de tabela, dentro pelo que o cliente paga.
      veiculo({ id: "promocional", preco_original: 160000, preco_promocional: 105000 }),
    ]).map((v) => v.id);
    expect(ids).toEqual(["promocional"]);
  });

  it("empate de pontuação sai em ordem estável", () => {
    const base = veiculo({ id: "base", preco_original: 100000 });
    const estoque = [
      base,
      veiculo({ id: "zz", preco_original: 105000 }),
      veiculo({ id: "aa", preco_original: 105000 }),
    ];
    expect(escolherSimilares(base, estoque).map((v) => v.id)).toEqual(["aa", "zz"]);
    expect(escolherSimilares(base, [...estoque].reverse()).map((v) => v.id)).toEqual(["aa", "zz"]);
  });

  it("preço zerado no veículo da página não trava a PDP", () => {
    const semPreco = veiculo({ id: "sem-preco", preco_original: 0 });
    expect(escolherSimilares(semPreco, ESTOQUE)).toEqual([]);
  });
});
