import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A fileira de miniaturas da galeria não encolhe (`shrink-0`): com muitas
 * fotos, a largura mínima dela passava da coluna. Coluna em `fr` puro tem
 * mínimo `auto`, então a galeria tomava a tela inteira e empurrava a conta do
 * preço para fora dela, à direita (medido em produção em 06/10/2026: colunas
 * de 1312px e 157px numa tela de 1366px). As colunas precisam de mínimo zero.
 */
describe("ficha do repasse: a conta do preço fica na tela", () => {
  const pagina = readFileSync("src/app/repasse/[carro]/page.tsx", "utf8");
  const galeria = readFileSync("src/components/repasse/GaleriaDoRepasse.tsx", "utf8");

  it("as duas colunas têm mínimo zero, no celular e no desktop", () => {
    expect(pagina).toContain("grid grid-cols-1 gap-8 pt-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]");
    expect(pagina).not.toMatch(/grid-cols-\[1\.35fr_1fr\]/);
  });

  it("galeria e coluna da conta podem encolher", () => {
    expect(galeria).toMatch(/return \(\s*<div className="min-w-0">/);
    expect(pagina).toMatch(/<GaleriaDoRepasse[^\n]*\/>\s*<div className="min-w-0">/);
  });

  it("as miniaturas continuam rolando dentro da galeria", () => {
    expect(galeria).toContain("overflow-x-auto");
  });
});
