import { describe, it, expect } from "vitest";
import { escolherSimilares, parecidosDoRepasse, vizinhosPorPreco } from "../src/lib/similares";
import type { Veiculo } from "../src/types";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * Os três carros do estoque com garantia na ficha do repasse (spec §7.2). A
 * régua é a de `escolherSimilares`, extraída para aceitar uma referência que
 * não é carro do estoque; o preço de referência é a FIPE, porque o carro com
 * garantia do mesmo porte custa perto dela (decisão 22 do plano do PR 3).
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

const ESTOQUE: Veiculo[] = [
  veiculo({ id: "kwid-intense", preco_original: 54900, tipo: "Hatch" }),
  veiculo({ id: "mobi", preco_original: 51900, tipo: "Hatch" }),
  veiculo({ id: "up", preco_original: 49900, tipo: "Hatch" }),
  veiculo({ id: "onix-sedan", preco_original: 48200, tipo: "Sedan" }),
  veiculo({ id: "hb20-vendido", preco_original: 43900, tipo: "Hatch", vendido: true }),
  veiculo({ id: "moto", preco_original: 42000, tipo: "Motocicleta" }),
  veiculo({ id: "caro", preco_original: 89900, tipo: "Hatch" }),
  veiculo({ id: "gol", preco_original: 47000, tipo: "Hatch" }),
];

describe("parecidosDoRepasse", () => {
  it("mede pela FIPE, e não pelo preço à vista", () => {
    // Kwid de teste: R$ 36.900 à vista, FIPE R$ 42.100 → banda 29.470–58.940.
    // Pelo preço à vista (25.830–51.660) o Kwid Intense de R$ 54.900 cairia fora.
    expect(parecidosDoRepasse(repasseDeTeste(), ESTOQUE, 10).map((v) => v.id)).toContain("kwid-intense");
    expect(parecidosDoRepasse(repasseDeTeste(), ESTOQUE)).toHaveLength(3);
  });

  it("não traz vendido, moto nem o que está fora da banda", () => {
    const ids = parecidosDoRepasse(repasseDeTeste(), ESTOQUE, 10).map((v) => v.id);
    expect(ids).not.toContain("hb20-vendido");
    expect(ids).not.toContain("moto");
    expect(ids).not.toContain("caro");
  });

  it("sem FIPE, mede pelo que você gasta", () => {
    const semFipe = repasseDeTeste({ fipe_valor: null });
    // Você gasta = 36.900 + 2.020 = 38.920 → banda 27.244–54.488: o Kwid Intense sai.
    expect(parecidosDoRepasse(semFipe, ESTOQUE, 10).map((v) => v.id)).not.toContain("kwid-intense");
  });

  it("a mesma carroceria pesa, no vocabulário do feed", () => {
    // Gol (Hatch, R$ 47.000) fica 11,6% da FIPE; Onix (Sedan, R$ 48.200), 14,5% —
    // MAIS longe que o Gol. Por distância pura o Gol venceria os dois casos, e é
    // só o bônus de 8% que muda o resultado: põe o Gol na frente para o hatch
    // (ele já venceria de qualquer jeito) e o Onix na frente para o sedã (sem o
    // bônus, o Gol venceria — é o caso que prova que a etiqueta decide). Sem
    // bônus para ninguém ("outro"), quem vence é o mais perto por distância: o
    // Gol.
    expect(parecidosDoRepasse(repasseDeTeste(), ESTOQUE, 1).map((v) => v.id)).toEqual(["gol"]);
    expect(parecidosDoRepasse(repasseDeTeste({ carroceria: "seda" }), ESTOQUE, 1).map((v) => v.id)).toEqual(["onix-sedan"]);
    expect(parecidosDoRepasse(repasseDeTeste({ carroceria: "outro" }), ESTOQUE, 1).map((v) => v.id)).toEqual(["gol"]);
  });
});

describe("o núcleo extraído não mudou a ficha do estoque", () => {
  it("escolherSimilares é vizinhosPorPreco com o próprio carro de referência", () => {
    const atual = ESTOQUE[1];
    expect(escolherSimilares(atual, ESTOQUE)).toEqual(
      vizinhosPorPreco({ id: atual.id, preco: 51900, tipo: "Hatch", moto: false }, ESTOQUE),
    );
    expect(escolherSimilares(atual, ESTOQUE).map((v) => v.id)).not.toContain(atual.id);
  });
});
