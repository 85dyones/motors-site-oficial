import { describe, it, expect } from "vitest";
import { classificarJanela } from "../src/lib/ciclo/janela";

/**
 * `classificarJanela` é a fonte única dos três estados de
 * `manutencoes.dentro_da_janela` (achado da revisão da Task 5, ronda 1: a
 * tricotomia estava reimplementada em quatro lugares — `selo.ts`,
 * `FilaDeVerificacao.tsx` (duas mensagens) e `motor.ts`).
 *
 * `sem` não é atraso e não é cumprimento — é "não havia janela para casar
 * com este serviço". Todo consumidor que colapsar os três estados em dois
 * passa a mentir para um dos lados (ou acusa quem não devia, ou elogia o
 * que não aconteceu).
 */
describe("classificarJanela — os três estados de dentro_da_janela", () => {
  it("true classifica como 'na'", () => {
    expect(classificarJanela(true)).toBe("na");
  });

  it("false classifica como 'fora' — havia janela e o serviço não a cumpriu", () => {
    expect(classificarJanela(false)).toBe("fora");
  });

  it("null classifica como 'sem' — não havia janela para casar", () => {
    expect(classificarJanela(null)).toBe("sem");
  });

  it("undefined também classifica como 'sem' — campo ausente não afirma nada", () => {
    expect(classificarJanela(undefined)).toBe("sem");
  });
});
