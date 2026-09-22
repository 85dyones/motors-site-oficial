import { describe, it, expect } from "vitest";
import { POR_PAGINA } from "../src/components/modernist/VitrineTV";
import { lerCodigo } from "./fonte";

/**
 * A faixa "A SEGUIR" divide a largura da TV entre as células. A conta, com a
 * célula fixa do rótulo comendo ~10vw e o respiro lateral de HOJE (2,4vw por
 * célula, que é `px-[1.2vw]` dos dois lados):
 *
 *   4 células -> 90/4 − 2,4 = ~20,1vw   folgado
 *   6 células -> 90/6 − 2,4 = ~12,6vw   cabe "Volkswagen Saveiro" (18 caracteres)
 *   8 células -> 90/8 − 2,4 = ~8,9vw    trunca a maioria dos nomes
 *
 * 6 é o teto real desta faixa sem redesenhá-la. Acima disso a TV vira uma
 * fileira de reticências — que num aparelho visto de longe é pior do que
 * mostrar menos carro.
 *
 * Correção de 2026-09-22: esta tabela dizia ~19vw / ~11,4vw / ~7,7vw. Os três
 * vinham do respiro ANTIGO (1,77vw por lado, 3,54vw no total) e a mesma
 * mudança que subiu a faixa para 6 apertou o respiro para 1,2vw — a conta não
 * foi refeita. A conclusão continua a mesma (6 cabe, 8 não); o que estava
 * errado era só o número, e número errado em comentário faz o próximo leitor
 * decidir com a régua errada. O mesmo par vivia no docblock de `POR_PAGINA`,
 * em `VitrineTV.tsx`, e foi corrigido junto.
 */
describe("a faixa da TV mostra seis carros por página", () => {
  it("POR_PAGINA é seis", () => {
    expect(POR_PAGINA).toBe(6);
  });

  const tv = lerCodigo("src/components/modernist/VitrineTV.tsx");

  it("a célula aperta o respiro lateral para caber", () => {
    expect(tv).toMatch(/px-\[1\.2vw\]/);
    expect(tv).not.toMatch(/px-\[1\.77vw\]/);
  });

  it("o nome do carro encolhe junto", () => {
    expect(tv).toMatch(/text-\[1vw\]/);
    expect(tv).not.toMatch(/text-\[1\.15vw\]/);
  });

  it("seis células ainda cabem na largura útil da faixa", () => {
    const UTIL_VW = 90;      // 100vw menos a célula fixa "A SEGUIR"
    const RESPIRO_VW = 1.2 * 2;
    const conteudo = UTIL_VW / POR_PAGINA - RESPIRO_VW;
    // "Volkswagen Saveiro" tem 18 caracteres; a ~0,5em por caractere e com a
    // fonte em 1vw, ela ocupa ~9vw.
    expect(conteudo).toBeGreaterThanOrEqual(9);
  });
});
