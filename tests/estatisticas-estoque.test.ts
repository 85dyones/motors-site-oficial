import { describe, it, expect } from "vitest";
import { contarMarcas } from "../src/lib/estatisticasEstoque";

/**
 * O número de marcas é afirmado na primeira dobra da home, ao lado do total
 * de estoque. Um erro aqui não quebra build nem aparece em log — vira número
 * errado na vitrine, que é o problema que tirou o "12 ANOS" fixo do hero.
 */

const veiculo = (marca: string) => ({ marca });

describe("contarMarcas", () => {
  it("conta marcas distintas do estoque", () => {
    expect(
      contarMarcas([veiculo("Volkswagen"), veiculo("Fiat"), veiculo("Jeep")]),
    ).toBe(3);
  });

  it("não conta a mesma marca duas vezes por causa de caixa ou espaço", () => {
    expect(
      contarMarcas([veiculo("Volkswagen"), veiculo("VOLKSWAGEN"), veiculo(" volkswagen ")]),
    ).toBe(1);
  });

  it("ignora marca vazia em vez de contá-la como uma marca", () => {
    expect(contarMarcas([veiculo("Fiat"), veiculo(""), veiculo("   ")])).toBe(1);
  });

  it("estoque vazio devolve zero, não quebra", () => {
    expect(contarMarcas([])).toBe(0);
    expect(contarMarcas(null as never)).toBe(0);
    expect(contarMarcas(undefined as never)).toBe(0);
  });

  it("aguenta linha sem o campo marca", () => {
    expect(contarMarcas([veiculo("Fiat"), {} as never, null as never])).toBe(1);
  });
});
