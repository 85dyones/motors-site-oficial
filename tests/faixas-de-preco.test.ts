import { describe, it, expect } from "vitest";
import type { Veiculo } from "../src/types";
import {
  acharHubDeFaixa,
  caminhosDosHubs,
  FAIXAS_DE_PRECO,
  hubsDeFaixa,
} from "../src/lib/hubsDeEstoque";

/**
 * `/estoque/ate-60-mil` e as outras duas faixas.
 *
 * Os cortes não são os do plano de aquisição (até 100 / 100–200 / acima de 200),
 * e a diferença é medida, não gosto: sobre os 39 veículos do feed de produção
 * em 2026-08-25 — de R$ 23.900 a R$ 318.900, mediana R$ 65.900 — aqueles cortes
 * jogariam 32 numa página só. Os daqui dividem em 17 / 15 / 7.
 *
 * Se o mix subir de patamar, é aqui que se mexe. E o `slug` está na URL: mudar
 * um corte é renomear página indexada.
 */

function veiculo(preco: number, promocional = 0): Veiculo {
  return {
    id: String(preco),
    marca: "Marca",
    modelo: "Modelo",
    versao: "",
    ano: 2022,
    quilometragem: 0,
    cambio: "",
    combustivel: "",
    cor: "",
    fipe: "",
    preco_original: preco,
    preco_promocional: promocional,
    pericia: "",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
  } as Veiculo;
}

describe("os limites da faixa", () => {
  it("o corte é inclusivo embaixo e exclusivo em cima", () => {
    // Sem isso um carro de exatamente R$ 60.000 aparece nas duas páginas — ou
    // em nenhuma, que é pior.
    const estoque = [veiculo(59999), veiculo(60000), veiculo(99999), veiculo(100000)];
    const faixas = hubsDeFaixa(estoque);

    expect(faixas[0].veiculos.map((v) => v.preco_original)).toEqual([59999]);
    expect(faixas[1].veiculos.map((v) => v.preco_original)).toEqual([60000, 99999]);
    expect(faixas[2].veiculos.map((v) => v.preco_original)).toEqual([100000]);
  });

  it("todo veículo com preço cai em exatamente uma faixa", () => {
    const estoque = [23900, 45000, 60000, 65900, 99999, 105900, 318900].map((p) => veiculo(p));
    const total = hubsDeFaixa(estoque).reduce((n, f) => n + f.veiculos.length, 0);

    expect(total).toBe(estoque.length);
  });

  it("usa o preço promocional quando ele é menor", () => {
    // Um carro de R$ 105.900 por R$ 58.000 é um carro "até 60 mil" para quem
    // procura — a página tem de concordar com a etiqueta da vitrine.
    const estoque = [veiculo(105900, 58000)];
    expect(hubsDeFaixa(estoque)[0].veiculos).toHaveLength(1);
  });

  it("veículo sem preço não entra em faixa nenhuma", () => {
    expect(hubsDeFaixa([veiculo(0)]).every((f) => f.veiculos.length === 0)).toBe(true);
  });
});

describe("a página existe mesmo vazia", () => {
  it("faixa sem estoque continua resolvendo", () => {
    // Diferente de marca: a lista é fechada e pequena, não há espaço de URL
    // infinito a proteger. E página de faixa que some quando o estoque vira é
    // exatamente o comportamento efêmero que os hubs existem para acabar.
    const hub = acharHubDeFaixa([], "ate-60-mil");

    expect(hub).not.toBeNull();
    expect(hub!.veiculos).toHaveLength(0);
  });

  it("slug fora da lista fechada é 404", () => {
    expect(acharHubDeFaixa([veiculo(50000)], "ate-500-mil")).toBeNull();
    expect(acharHubDeFaixa([veiculo(50000)], "barato")).toBeNull();
  });

  it("todas as faixas entram no sitemap, com ou sem estoque", () => {
    const caminhos = caminhosDosHubs([], []);
    for (const faixa of FAIXAS_DE_PRECO) {
      expect(caminhos).toContain(`/estoque/${faixa.slug}`);
    }
  });
});
