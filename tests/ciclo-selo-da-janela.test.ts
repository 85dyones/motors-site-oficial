import { describe, it, expect } from "vitest";
import { seloDaJanela } from "../src/lib/ciclo/selo";

/**
 * `null` em `dentro_da_janela` significa "não havia janela", não "atrasou".
 * Antes do plano vitalício, a quarta revisão de qualquer carro caía aqui e a
 * loja lia FORA DA JANELA em vermelho para quem tinha revisado no prazo.
 */
describe("o selo da janela tem três estados", () => {
  it("true é a janela cumprida", () => {
    expect(seloDaJanela(true)).toEqual({ texto: "NA JANELA", tom: "na" });
  });

  it("false é atraso de verdade — havia janela e o serviço não a cumpriu", () => {
    expect(seloDaJanela(false)).toEqual({ texto: "FORA DA JANELA", tom: "fora" });
  });

  it("null não acusa ninguém: não havia janela", () => {
    expect(seloDaJanela(null)).toEqual({ texto: "SEM JANELA", tom: "sem" });
  });

  it("null nunca é lido como fora da janela", () => {
    expect(seloDaJanela(null).tom).not.toBe("fora");
  });
});
