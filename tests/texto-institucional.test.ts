import { describe, it, expect } from "vitest";
import { aplicarTotalEstoque } from "../src/lib/textoInstitucional";

/**
 * O manifesto da página "A Motors" afirma o tamanho do estoque como
 * argumento. O número vem do banco, e um erro aqui não quebra build nem
 * aparece em log — vira uma afirmação falsa na frase que pede confiança.
 */

const MANIFESTO =
  "De cada dez veículos avaliados, aceitamos três. O resto não passa no laudo, " +
  "na procedência ou simplesmente não é bom o bastante para levar nosso nome. " +
  "É por isso que o estoque tem {{total}} unidades e não 300.";

describe("aplicarTotalEstoque", () => {
  it("troca o marcador pelo estoque real", () => {
    const saida = aplicarTotalEstoque(MANIFESTO, 88);
    expect(saida).toContain("o estoque tem 88 unidades e não 300");
    expect(saida).not.toContain("{{total}}");
  });

  it("acompanha o estoque quando ele muda", () => {
    expect(aplicarTotalEstoque(MANIFESTO, 61)).toContain("tem 61 unidades");
    expect(aplicarTotalEstoque(MANIFESTO, 140)).toContain("tem 140 unidades");
  });

  it("nunca deixa o marcador cru chegar na tela", () => {
    for (const total of [null, undefined, 0, -3, NaN]) {
      expect(aplicarTotalEstoque(MANIFESTO, total as number)).not.toContain("{{total}}");
    }
  });

  it("sem total legível, reescreve a frase em vez de inventar número", () => {
    const saida = aplicarTotalEstoque(MANIFESTO, null);
    expect(saida).toContain("o estoque é do tamanho que é, e não três vezes maior");
    expect(saida).not.toMatch(/\d+ unidades/);
  });

  it("não mexe em texto que não usa o marcador", () => {
    const outro = "Cada carro entra com laudo cautelar completo.";
    expect(aplicarTotalEstoque(outro, 88)).toBe(outro);
  });

  it("aceita texto vazio sem quebrar", () => {
    expect(aplicarTotalEstoque("", 88)).toBe("");
    expect(aplicarTotalEstoque(null, 88)).toBe("");
    expect(aplicarTotalEstoque(undefined, 88)).toBe("");
  });

  it("troca todas as ocorrências, não só a primeira", () => {
    const saida = aplicarTotalEstoque("{{total}} carros, {{total}} laudos", 88);
    expect(saida).toBe("88 carros, 88 laudos");
  });
});
