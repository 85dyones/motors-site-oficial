import { describe, it, expect } from "vitest";
import { checklistDoRepasse } from "../src/lib/checklistDoRepasse";
import { ANO_MINIMO, anoMaximo } from "../src/lib/cadastroDeVeiculo";
import { ANO_MINIMO as ANO_MINIMO_PURO, anoMaximo as anoMaximoPuro } from "../src/lib/anoDoVeiculo";
import { PISO_DO_ANO_NO_BANCO, type Repasse } from "../src/lib/repasse";
import { fotoDeTeste, repasseDeTeste } from "./repasseDeTeste";

/**
 * O que o PR 2 acrescenta ao checklist, antes de o editor gravar (revisão
 * final do PR 1): a régua de ano da casa (M2), o espaço invisível que passava
 * por texto (M8) e os buracos nas fotos (M9).
 */
const HOJE = new Date("2026-09-24T12:00:00Z");
const campos = (r: Repasse) => checklistDoRepasse(r, HOJE).map((f) => f.campo);

describe("a régua do ano é a da casa (M2)", () => {
  it("cadastroDeVeiculo reexporta os mesmos valores do módulo puro", () => {
    expect(ANO_MINIMO).toBe(ANO_MINIMO_PURO);
    expect(anoMaximo(HOJE)).toBe(anoMaximoPuro(HOJE));
  });

  it("o teto é o ano que vem", () => {
    expect(campos(repasseDeTeste({ ano_modelo: 2027, ano_fabricacao: 2026 }))).not.toContain("ano_modelo");
    expect(campos(repasseDeTeste({ ano_modelo: 2028, ano_fabricacao: 2027 }))).toContain("ano_modelo");
    expect(campos(repasseDeTeste({ ano_modelo: 2062, ano_fabricacao: null }))).toContain("ano_modelo");
  });

  it("o piso é o do banco", () => {
    expect(campos(repasseDeTeste({ ano_modelo: PISO_DO_ANO_NO_BANCO, ano_fabricacao: null }))).not.toContain("ano_modelo");
    expect(campos(repasseDeTeste({ ano_modelo: PISO_DO_ANO_NO_BANCO - 1, ano_fabricacao: null }))).toContain("ano_modelo");
  });

  it("a fabricação vem no ano do modelo ou antes", () => {
    expect(campos(repasseDeTeste({ ano_modelo: 2021, ano_fabricacao: 2021 }))).not.toContain("ano_fabricacao");
    expect(campos(repasseDeTeste({ ano_modelo: 2021, ano_fabricacao: 2020 }))).not.toContain("ano_fabricacao");
    expect(campos(repasseDeTeste({ ano_modelo: 2020, ano_fabricacao: 2021 }))).toContain("ano_fabricacao");
    expect(campos(repasseDeTeste({ ano_fabricacao: null }))).not.toContain("ano_fabricacao");
  });
});

describe("texto invisível não é texto (M8)", () => {
  it("espaço de largura zero não preenche marca, resumo nem apontamento", () => {
    expect(campos(repasseDeTeste({ marca: "\u200B" }))).toContain("marca");
    expect(campos(repasseDeTeste({ resumo: "\u200B \u2060" }))).toContain("resumo");
    expect(
      campos(repasseDeTeste({ laudo: "aprovado_com_apontamento", laudo_apontamento: "\uFEFF" })),
    ).toContain("laudo_apontamento");
  });
});

describe("as fotos (M9)", () => {
  it("o carro de teste passa inteiro", () => {
    expect(checklistDoRepasse(repasseDeTeste(), HOJE)).toEqual([]);
  });

  it("URL vazia não conta para o mínimo", () => {
    const web = [fotoDeTeste("l1"), fotoDeTeste("l2"), fotoDeTeste("l3"), ""];
    expect(campos(repasseDeTeste({ web_full_images: web }))).toContain("web_full_images");
  });

  it("cada foto tem as duas versões", () => {
    const r = repasseDeTeste();
    expect(campos({ ...r, whatsapp_images: r.whatsapp_images.slice(0, 3) })).toContain("whatsapp_images");
  });

  it("foto de fora do bucket não vale", () => {
    const r = repasseDeTeste();
    const web = [...r.web_full_images.slice(0, 3), "https://carro57.com.br/f.jpg"];
    expect(campos({ ...r, web_full_images: web })).toContain("web_full_images");
  });

  it("a foto do defeito precisa ser nossa", () => {
    const r = repasseDeTeste();
    const itens = r.itens_de_estado.map((item, i) => (i === 0 ? { ...item, foto: "https://imgur.com/x.jpg" } : item));
    expect(checklistDoRepasse({ ...r, itens_de_estado: itens }, HOJE)).toContainEqual({
      campo: "itens_de_estado[0].foto",
      mensagem: "A foto do defeito precisa ser enviada pelo painel.",
    });
  });
});
