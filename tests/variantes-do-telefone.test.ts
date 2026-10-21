import { describe, expect, it } from "vitest";
import { variantesDoTelefone } from "../src/lib/whatsapp";

/**
 * O nono dígito. O site grava o que a pessoa digitou; o WhatsApp devolve o que
 * a operadora registrou. Sem as duas formas, cada mensagem que chega criaria um
 * lead duplicado em vez de achar o que já existe (a entrada da Evolution e o
 * histórico do WhatsApp casam o lead por aqui).
 */
describe("as formas do mesmo celular", () => {
  it("gera as duas formas do celular brasileiro", () => {
    expect(variantesDoTelefone("5541999990000")).toEqual(expect.arrayContaining(["5541999990000", "554199990000"]));
    expect(variantesDoTelefone("554199990000")).toEqual(expect.arrayContaining(["554199990000", "5541999990000"]));
  });

  it("não inventa variante para número que não é brasileiro, e vazio é lista vazia", () => {
    expect(variantesDoTelefone("12025550100")).toEqual(["12025550100"]);
    expect(variantesDoTelefone("")).toEqual([]);
    expect(variantesDoTelefone(null)).toEqual([]);
  });
});
