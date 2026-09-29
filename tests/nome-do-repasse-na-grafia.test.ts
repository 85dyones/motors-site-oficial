import { describe, it, expect } from "vitest";
import { grafiaDoCarro } from "../src/lib/grafiaCanonica";
import { nomeComAno } from "../src/lib/nomeDoVeiculo";

/**
 * O nome do carro de repasse na grafia da casa (pedido do dono em 29/09): o
 * cadastro em maiúsculas punha "PALIO 1.0 ECONOMY FIRE FLEX 8V 4P" no `<h1>`
 * da ficha. `grafiaDoCarro` é a composição que a rota de leads já usava no
 * interesse do WhatsApp do repasse (#163): marca, modelo e versão, cada um
 * pela sua função de `grafiaCanonica`. Nenhuma regra de caixa nova.
 */
describe("grafiaDoCarro", () => {
  it("\"PALIO\", \"1.0 ECONOMY FIRE FLEX 8V 4P\", 2010: a caixa de sempre", () => {
    const carro = grafiaDoCarro({ marca: "FIAT", modelo: "PALIO", versao: "1.0 ECONOMY FIRE FLEX 8V 4P" });
    expect(carro).toEqual({ marca: "Fiat", modelo: "Palio", versao: "1.0 Economy Fire Flex 8V 4P" });
    expect(nomeComAno({ ...carro, ano: 2010 })).toBe("Fiat Palio 1.0 Economy Fire Flex 8V 4P 2010");
  });

  it("modelo que é sigla fica inteiro: HB20", () => {
    const carro = grafiaDoCarro({ marca: "HYUNDAI", modelo: "HB20", versao: "1.0 COMFORT PLUS" });
    expect(carro).toEqual({ marca: "Hyundai", modelo: "HB20", versao: "1.0 Comfort Plus" });
  });

  it("o que já vinha na grafia certa não muda", () => {
    const carro = { marca: "Renault", modelo: "Kwid", versao: "Zen 1.0" };
    expect(grafiaDoCarro(carro)).toEqual(carro);
  });

  it("sem versão continua sem versão, e o resto do carro vai junto", () => {
    const carro = grafiaDoCarro({ id: "x", marca: "FIAT", modelo: "UNO", versao: null, preco: 20000 });
    expect(carro).toEqual({ id: "x", marca: "Fiat", modelo: "Uno", versao: null, preco: 20000 });
  });
});
