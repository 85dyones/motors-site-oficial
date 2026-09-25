import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";

/**
 * O Safari do iPhone não pode reescrever o HTML antes de o React hidratar.
 *
 * Sem a meta `format-detection`, o Safari transforma em link, sozinho, todo
 * número que parece telefone ou endereço — e faz isso no DOM antes da
 * hidratação. O DOM deixa de bater com o HTML do servidor e a página cai no
 * erro #418 ("Hydration failed… HTML").
 *
 * Medido em 25/09 na tabela `erros`: 63 dos 79 #418 dos últimos 30 dias vieram
 * do Safari de iPhone, quase todos em fichas de carro. A ficha mostra o código
 * do carro em texto puro ("COD. 8497421", sete dígitos) e, desde a folha A4
 * (21/09), também o telefone e o CEP da loja.
 *
 * Lido do código porque `generateMetadata` do layout consulta o banco; o que
 * se trava aqui é a decisão, e o efeito se confere na fila de erros.
 */
describe("o layout desliga a detecção automática do Safari", () => {
  it("telefone, endereço, e-mail e data não viram link sozinhos", () => {
    const codigo = lerCodigo("src/app/layout.tsx");
    const regra = /formatDetection:\s*\{([^}]*)\}/.exec(codigo);

    expect(regra, "o layout não declara formatDetection").not.toBeNull();
    for (const formato of ["telephone", "address", "email", "date"]) {
      expect(regra![1], formato).toMatch(new RegExp(`\\b${formato}:\\s*false\\b`));
    }
  });
});
