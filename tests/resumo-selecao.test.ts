import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resumirSelecao } from "../src/lib/destaquesRapidos";
import type { Veiculo } from "../src/types";

/**
 * A landing de destaque não conta a regra do jogo.
 *
 * O box da direita mostrava "Seleção manual feita no painel", o endereço da
 * própria página e "atualizada automaticamente pela regra" — operação da loja
 * numa tela que vai receber tráfego pago de Google e Meta. No lugar entra o
 * resumo da seleção, feito com número do estoque real da própria página.
 *
 * O que estes testes seguram: o vazamento não volta, e nenhum número do
 * resumo é inventado quando o dado falta.
 */

const landing = readFileSync(
  join(__dirname, "..", "src", "components", "modernist", "LandingDestaque.tsx"),
  "utf-8"
);

function veiculo(campos: Partial<Veiculo>): Veiculo {
  return {
    id: "x",
    marca: "BMW",
    modelo: "320i",
    versao: "",
    ano: 2022,
    quilometragem: 30000,
    cambio: "Automático",
    combustivel: "Gasolina",
    cor: "Preto",
    fipe: "",
    preco_original: 200000,
    preco_promocional: 0,
    pericia: "",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
    ...campos,
  } as Veiculo;
}

describe("landing de destaque — o que não pode aparecer", () => {
  it("não expõe a regra nem a operação do painel", () => {
    for (const vazamento of [
      "REGRA DESTA PÁGINA",
      "Seleção manual feita no painel",
      "ATUALIZADA AUTOMATICAMENTE PELA REGRA",
      "descreverRegra",
    ]) {
      expect(landing).not.toContain(vazamento);
    }
  });

  it("não imprime o próprio endereço na tela", () => {
    // O box repetia "motorsstore.com.br/destaques/<slug>" — ruído numa
    // landing de campanha, e o domínio ainda está em validação.
    expect(landing).not.toContain("motorsstore.com.br");
  });

  it("não promete laudo pronto, só o processo", () => {
    // Todo carro vai para a perícia, mas parte do estoque está sempre com o
    // laudo em análise — a régua da home diz "passam pela cautelar".
    expect(landing).toContain("TODOS PASSAM PELA PERÍCIA CAUTELAR");
    expect(landing).not.toMatch(/TODOS COM LAUDO/i);
  });
});

describe("resumirSelecao", () => {
  it("tira os números do estoque da própria página", () => {
    const r = resumirSelecao([
      veiculo({ marca: "BMW", ano: 2022, quilometragem: 30000, preco_original: 200000 }),
      veiculo({ marca: "AUDI", ano: 2019, quilometragem: 12000, preco_original: 150000 }),
      veiculo({ marca: "BMW", ano: 2024, quilometragem: 45000, preco_original: 300000 }),
    ]);
    expect(r.precoMinimo).toBe(150000);
    expect(r.kmMinimo).toBe(12000);
    expect(r.anoMaisAntigo).toBe(2019);
    expect(r.anoMaisNovo).toBe(2024);
    expect(r.marcas).toEqual(["BMW", "AUDI"]);
  });

  it("ordena as marcas pelo peso na seleção", () => {
    // A tela corta em 6. Numa categoria de 56 carros, a marca que aparece
    // uma vez só não é o que descreve a página.
    const r = resumirSelecao([
      veiculo({ marca: "FIAT" }),
      veiculo({ marca: "BMW" }),
      veiculo({ marca: "BMW" }),
      veiculo({ marca: "BMW" }),
      veiculo({ marca: "AUDI" }),
      veiculo({ marca: "AUDI" }),
    ]);
    expect(r.marcas).toEqual(["BMW", "AUDI", "FIAT"]);
  });

  it("usa o preço vigente, não o de tabela", () => {
    // Promoção no painel é o preço que o visitante vê no card logo abaixo.
    const r = resumirSelecao([
      veiculo({ preco_original: 200000, preco_promocional: 179000 }),
    ]);
    expect(r.precoMinimo).toBe(179000);
  });

  it("devolve null em vez de zero quando o dado falta", () => {
    // Zero viraria "A partir de R$ 0" e "a partir de 0 km" na tela — número
    // inventado é pior que campo ausente.
    const r = resumirSelecao([
      veiculo({ ano: 0, quilometragem: 0, preco_original: 0, preco_promocional: 0, marca: "" }),
    ]);
    expect(r.precoMinimo).toBeNull();
    expect(r.kmMinimo).toBeNull();
    expect(r.anoMaisNovo).toBeNull();
    expect(r.marcas).toEqual([]);
  });

  it("aguenta seleção vazia", () => {
    const r = resumirSelecao([]);
    expect(r).toEqual({
      precoMinimo: null,
      kmMinimo: null,
      anoMaisNovo: null,
      anoMaisAntigo: null,
      marcas: [],
    });
  });

  it("a tela corta a lista de marcas", () => {
    expect(landing).toContain("const MAX_MARCAS = 6;");
    expect(landing).toContain("resumo.marcas.slice(0, MAX_MARCAS)");
    expect(landing).toContain("e mais ${marcasOcultas}");
  });

  it("não repete o ano quando a seleção tem um só", () => {
    const r = resumirSelecao([veiculo({ ano: 2023 }), veiculo({ ano: 2023 })]);
    expect(r.anoMaisAntigo).toBe(r.anoMaisNovo);
    // A tela colapsa para "Ano: 2023" em vez de "2023 a 2023".
    expect(landing).toContain("resumo.anoMaisAntigo === resumo.anoMaisNovo");
  });
});
