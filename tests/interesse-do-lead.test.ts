import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";
import { interesseDoLead } from "../src/lib/interesseDoLead";

/**
 * O `interesse` do lead nomeia o carro como a ficha nomeia.
 *
 * Até 17/09/2026 `/api/leads` montava `[marca, modelo, versao].join(" ")` à mão,
 * e o RevendaMais embute a versão no `modelo` na maior parte do cadastro: 106
 * das 110 linhas medidas em 08/09 gravavam a versão duas vezes. É o texto do
 * card do kanban, do modal de desfecho e do alerta do funil.
 */

/** O caso medido: a versão já está no modelo, em outra caixa. */
const FIT = {
  marca: "Honda",
  modelo: "Fit 1.5 Ex 16v Flex 4p Automatico",
  versao: "1.5 ex 16v flex 4p automatico",
};

/** A versão fora do modelo: é ela que distingue os três Ka do pátio. */
const KA = { marca: "Ford", modelo: "Ka", versao: "Sedan 1.0 SE Flex 4p" };

describe("o interesse do lead", () => {
  it("não repete a versão que já está no modelo", () => {
    expect(interesseDoLead({ veiculo: FIT })).toBe("Honda Fit 1.5 Ex 16v Flex 4p Automatico");
  });

  it("continua com a versão quando ela não está no modelo", () => {
    expect(interesseDoLead({ veiculo: KA })).toBe("Ford Ka Sedan 1.0 SE Flex 4p");
  });

  it("veículo com campo faltando não deixa espaço sobrando", () => {
    expect(interesseDoLead({ veiculo: { modelo: "Ka", versao: "Sedan 1.0 SE Flex 4p" } })).toBe(
      "Ka Sedan 1.0 SE Flex 4p",
    );
    expect(interesseDoLead({ veiculo: { versao: "Sedan 1.0 SE Flex 4p" } })).toBe(
      "Sedan 1.0 SE Flex 4p",
    );
  });

  it("sem veículo, vale a mensagem; sem mensagem, a busca; sem nada, null", () => {
    // A campanha e a encomenda dependem desta ordem: elas não mandam `veiculo`,
    // e a frase delas chega em `mensagem`.
    expect(interesseDoLead({ veiculo: null, mensagem: "Quero um SUV até 90 mil" })).toBe(
      "Quero um SUV até 90 mil",
    );
    expect(
      interesseDoLead({ mensagem: "", intencaoBusca: { marca: "Jeep", modelo: "Compass", ano: "" } }),
    ).toBe("Jeep · Compass");
    expect(interesseDoLead({})).toBeNull();
  });

  it("veículo vazio cai para a mensagem, como antes", () => {
    expect(interesseDoLead({ veiculo: { marca: "", modelo: "" }, mensagem: "Oi" })).toBe("Oi");
  });

  it("corpo malformado não derruba a gravação do lead", () => {
    // O corpo chega do navegador sem tipo. Campo que não é texto vira vazio, e
    // a função não lança: a gravação do lead não pode travar o contato.
    expect(
      interesseDoLead({ veiculo: { marca: 7, modelo: null }, mensagem: { texto: "x" } }),
    ).toBeNull();
  });
});

describe("a rota usa a função, e não monta o nome à mão", () => {
  it("/api/leads grava o interesse por interesseDoLead", () => {
    const rota = lerCodigo("src/app/api/leads/route.ts");
    expect(rota).toContain("interesseDoLead(");
    expect(rota, "a rota voltou a montar marca + modelo + versão à mão").not.toMatch(
      /\[\s*veiculo\.marca\s*,\s*veiculo\.modelo\s*,\s*veiculo\.versao\s*\]/,
    );
  });
});
