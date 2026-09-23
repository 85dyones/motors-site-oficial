import { describe, it, expect } from "vitest";
import { VAGAS } from "../src/lib/destaquesDoPainel";
import { lerCodigo } from "./fonte";

/**
 * Dois pares de botões de nome vizinho na mesma barra — "Destacar na home" e
 * "Pôr nos destaques da semana" — sem nada dizendo que são listas diferentes,
 * com destinos diferentes e tetos diferentes.
 *
 * O resultado, medido em 21/09: o dono usou o primeiro par durante meses e a
 * lista do segundo nunca foi criada. E o par que ele usava era justamente o
 * único SEM aviso de lotação — a grade tinha aviso desde o início, o banner
 * não tinha nenhum.
 */
describe("a barra diz o destino e o teto de cada lista", () => {
  const tabela = lerCodigo("src/components/admin/TabelaDeEstoque.tsx");

  it("o botão do banner declara a vitrine e as vagas", () => {
    expect(tabela).toMatch(/banner · \{VAGAS\.banner\} vagas/);
  });

  it("o botão da grade declara a vitrine e as vagas", () => {
    expect(tabela).toMatch(/grade · \{VAGAS\.grade\} vagas/);
  });

  it("o banner ganhou o aviso de lotação que só a grade tinha", () => {
    expect(tabela).toMatch(/destacados\.length > VAGAS\.banner/);
  });

  it("o aviso leva para a tela que resolve", () => {
    expect(tabela).toMatch(/\/admin\/site\/destaques/);
  });
});

describe("o teto do aviso é o mesmo que a home corta", () => {
  it("quatro no banner, seis na grade", () => {
    expect(VAGAS.banner).toBe(4);
    expect(VAGAS.grade).toBe(6);
  });
});
