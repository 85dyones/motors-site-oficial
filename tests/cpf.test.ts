import { describe, it, expect } from "vitest";
import { cpfValido, formatarCpf, mascararCpf, soDigitosDoCpf } from "../src/lib/cpf";

/**
 * O CPF da consulta paga (18/10/2026). Cada consulta custa dinheiro: CPF com
 * dígito errado não pode sair da tela, e o histórico mostra o CPF mascarado.
 */

describe("o CPF que a consulta aceita", () => {
  it("só os dígitos: tira ponto, traço, espaço e qualquer outra coisa", () => {
    expect(soDigitosDoCpf("123.456.789-09")).toBe("12345678909");
    expect(soDigitosDoCpf(" 529 982 247/25 ")).toBe("52998224725");
    expect(soDigitosDoCpf("")).toBe("");
  });

  it("aceita CPF com os dois verificadores do módulo 11, com ou sem máscara", () => {
    for (const cpf of ["123.456.789-09", "12345678909", "529.982.247-25", "52998224725", "111.444.777-35"]) {
      expect(cpfValido(cpf), cpf).toBe(true);
    }
  });

  it("recusa CPF com o primeiro ou o segundo verificador trocado", () => {
    expect(cpfValido("123.456.789-19")).toBe(false);
    expect(cpfValido("123.456.789-08")).toBe(false);
    expect(cpfValido("529.982.247-24")).toBe(false);
  });

  it("recusa os dez CPFs de dígitos todos iguais, que fecham no módulo 11 mas não são CPF", () => {
    for (let d = 0; d <= 9; d++) {
      const cpf = String(d).repeat(11);
      expect(cpfValido(cpf), cpf).toBe(false);
    }
  });

  it("recusa o que não tem exatamente 11 dígitos, e letra no meio não vira dígito", () => {
    expect(cpfValido("1234567890")).toBe(false);
    expect(cpfValido("123456789091")).toBe(false);
    expect(cpfValido("")).toBe(false);
    // As letras somem e sobram dez dígitos: não é CPF.
    expect(cpfValido("12345678A09")).toBe(false);
  });

  it("formata em 000.000.000-00 e devolve aparado o que não tem 11 dígitos", () => {
    expect(formatarCpf("12345678909")).toBe("123.456.789-09");
    expect(formatarCpf("123.456.789-09")).toBe("123.456.789-09");
    expect(formatarCpf("  1234  ")).toBe("1234");
  });

  it("mascara para a lista: só os seis do meio aparecem, e o que não é CPF vira só asteriscos", () => {
    expect(mascararCpf("12345678909")).toBe("***.456.789-**");
    expect(mascararCpf("123.456.789-09")).toBe("***.456.789-**");
    expect(mascararCpf("123")).toBe("***");
    expect(mascararCpf("12345678909")).not.toContain("123.");
  });
});
