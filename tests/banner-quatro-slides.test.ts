import { describe, it, expect } from "vitest";
import { VAGAS } from "../src/lib/destaquesDoPainel";
import { lerCodigo } from "./fonte";

/**
 * O banner mostrava 3 slides com um `.slice(0, 3)` digitado à mão. Medido em
 * 21/09, isso descartava em silêncio o 4º carro vivo da curadoria — o carro
 * marcado por último, que é justamente o que o dono acabou de escolher.
 *
 * Teste de FONTE, e não de render: o defeito não é visual, é um número solto.
 * Enquanto ele estiver digitado no lugar da constante, nada impede que volte a
 * divergir do painel — e foi assim que o corte ficou invisível por meses.
 */
describe("o banner da home tem uma casa só para o seu teto", () => {
  const home = lerCodigo("src/app/page.tsx");

  it("não corta com número digitado à mão", () => {
    expect(home).not.toMatch(/slidesHero[\s\S]{0,80}?slice\(0,\s*3\)/);
  });

  it("corta pela constante compartilhada com o painel", () => {
    expect(home).toMatch(/VAGAS\.banner/);
  });

  it("a constante é quatro", () => {
    expect(VAGAS.banner).toBe(4);
  });
});

/**
 * A régua de indicadores do hero é uma linha flex de botões de largura FIXA.
 * A conta, com `gap-4` (16px) no mobile:
 *
 *   3 slides -> 3x76 + 2x16 = 260px   cabe
 *   4 slides -> 4x76 + 3x16 = 352px   NÃO cabe em 343px (celular de 375px)
 *   4 slides -> 4x64 + 3x16 = 304px   cabe, com folga
 *
 * Subir o número sem encolher o botão no mobile estoura a régua por 9px — e o
 * próprio código já registrava o aperto com 3 ("no mobile a linha não cabe").
 * O código agora usa w-[64px] sm:w-[76px], confirmado pelos testes de fonte abaixo.
 */
describe("a régua de indicadores cabe no celular com quatro slides", () => {
  const hero = lerCodigo("src/components/modernist/HeroHome.tsx");

  it("o botão encolhe abaixo de sm e volta ao tamanho cheio a partir dele", () => {
    expect(hero).toMatch(/w-\[64px\]/);
    expect(hero).toMatch(/sm:w-\[76px\]/);
  });

  it("a largura fixa de 76px não sobra solta, sem o prefixo responsivo", () => {
    expect(hero).not.toMatch(/(?<!sm:)w-\[76px\]/);
  });
});
