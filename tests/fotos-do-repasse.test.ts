import { describe, it, expect } from "vitest";
import {
  caminhoDaFotoDoRepasse,
  EXTENSAO_DA_VARIANTE,
  PREFIXO_PUBLICO,
  ehFotoPropria,
} from "../src/lib/fotosDoVeiculo";

const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";

describe("caminhoDaFotoDoRepasse", () => {
  it("pasta própria do repasse, mesmo formato de lote e variante do estoque", () => {
    expect(caminhoDaFotoDoRepasse(ID, "m1abc-x9y8z7", "web")).toBe(
      `repasse/${ID}/m1abc-x9y8z7-web.${EXTENSAO_DA_VARIANTE.web}`,
    );
    expect(caminhoDaFotoDoRepasse(ID, "m1abc-x9y8z7", "zap")).toBe(
      `repasse/${ID}/m1abc-x9y8z7-zap.${EXTENSAO_DA_VARIANTE.zap}`,
    );
  });

  it("uuid em maiúsculas vira minúsculas — a pasta é uma só", () => {
    expect(caminhoDaFotoDoRepasse(ID.toUpperCase(), "l1", "web")).toBe(`repasse/${ID}/l1-web.webp`);
  });

  it("recusa id que não é uuid — nada de '../' dentro do bucket", () => {
    expect(() => caminhoDaFotoDoRepasse("../8123456", "l1", "web")).toThrow();
    expect(() => caminhoDaFotoDoRepasse("8123456", "l1", "web")).toThrow();
  });

  it("recusa lote fora do formato", () => {
    expect(() => caminhoDaFotoDoRepasse(ID, "../x", "web")).toThrow();
  });

  it("a URL pública da foto do repasse é reconhecida como foto própria", () => {
    const url = `https://abc.supabase.co${PREFIXO_PUBLICO}${caminhoDaFotoDoRepasse(ID, "l1", "web")}`;
    expect(ehFotoPropria(url)).toBe(true);
  });
});
