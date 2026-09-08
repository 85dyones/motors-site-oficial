import { describe, it, expect } from "vitest";
import { montarDossie, temRotulo, dossieEmTexto, ROTULOS } from "../src/lib/descritivo/dossie";

/**
 * O dossiê é a peça que impede o texto de inventar. O que não está aqui não
 * pode aparecer no anúncio — então campo vazio tem que ficar de FORA, e não
 * entrar como string vazia ou "null".
 */

const X1 = {
  marca: "bmw",
  modelo: "x1 sdrive 20i m sport 2.0 tb flex aut.",
  ano: 2022,
  ano_fabricacao: 2022,
  preco: "179900.00",
  quilometragem: 70700,
  cambio: "automatico",
  combustivel: "flex",
  cor: "cinza",
  tipo: "SUV",
  motor: null,
  portas: null,
  donos_anteriores: null,
  garantia_fabrica: null,
  pericia: "Em análise",
  laudo_pericia: "Laudo cautelar completo — estrutura e chassi auditados",
  opcionais: null,
};

describe("montarDossie", () => {
  it("deixa de fora todo campo vazio", () => {
    const d = montarDossie(X1);
    expect(temRotulo(d, ROTULOS.motorizacao)).toBe(false);
    expect(temRotulo(d, ROTULOS.portas)).toBe(false);
    expect(temRotulo(d, ROTULOS.donos)).toBe(false);
    expect(temRotulo(d, ROTULOS.garantia)).toBe(false);
    expect(temRotulo(d, ROTULOS.opcionais)).toBe(false);
  });

  it("mantém o que o banco confirma", () => {
    const d = montarDossie(X1);
    expect(temRotulo(d, ROTULOS.cor)).toBe(true);
    expect(temRotulo(d, ROTULOS.cambio)).toBe(true);
    expect(temRotulo(d, ROTULOS.km)).toBe(true);
  });

  // O valor real no banco é "Aprovado", nunca "PERÍCIA APROVADA". Comparar a
  // coluna crua liberaria a afirmação para ZERO veículos.
  it("libera a afirmação de perícia com o valor real do banco", () => {
    expect(montarDossie({ ...X1, pericia: "Aprovado" }).periciaAprovada).toBe(true);
  });

  it("trata 'Aprovado com observação' como aprovado (decisão do dono, 08/09/2026)", () => {
    expect(montarDossie({ ...X1, pericia: "Aprovado com observação" }).periciaAprovada).toBe(true);
  });

  it("não libera a afirmação com a perícia em análise", () => {
    expect(montarDossie(X1).periciaAprovada).toBe(false);
  });

  /**
   * O X1 7803195 é o caso real: `pericia` está "Em análise", mas
   * `laudo_pericia` descreve um exame completo. Passar esse texto ao modelo é
   * convidar a afirmação que a régua acabou de negar.
   */
  it("não passa o laudo ao dossiê enquanto a perícia não estiver aprovada", () => {
    const texto = dossieEmTexto(montarDossie(X1));
    expect(texto).not.toContain("Laudo cautelar completo");
  });

  it("passa o laudo quando a perícia está aprovada", () => {
    const texto = dossieEmTexto(montarDossie({ ...X1, pericia: "Aprovado" }));
    expect(texto).toContain("Laudo cautelar completo");
  });

  it("quebra os opcionais em lista", () => {
    const d = montarDossie({ ...X1, opcionais: "airbag, abs, ar-condicionado" });
    expect(d.opcionais).toEqual(["airbag", "abs", "ar-condicionado"]);
  });

  /**
   * O formato é `Rótulo: valor`, nunca JSON. Medido em 08/09/2026: com JSON,
   * gpt-4.1-mini escreveu "motor manual e carroceria branca" — leu
   * {cambio, cor, tipo} como um saco de valores e trocou os campos de lugar.
   */
  it("serializa em linhas rotuladas, não em JSON", () => {
    const texto = dossieEmTexto(montarDossie(X1));
    expect(texto).toContain("Tipo de câmbio: automatico");
    expect(texto).toContain("Cor da pintura: cinza");
    expect(texto).not.toContain("{");
  });
});
