import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import FaixasDePreco from "../src/components/modernist/FaixasDePreco";
import { FAIXAS_DE_PRECO } from "../src/lib/faixasDePreco";
import { AREAS_DA_HOME, normalizarAreas, areasVisiveis } from "../src/lib/areasDoSite";
import type { Veiculo } from "../src/types";

/**
 * As três faixas de preço como NAVEGAÇÃO — renderizadas, não lidas do fonte.
 *
 * A primeira versão deste arquivo casava regex sobre `src/app/page.tsx`, e a
 * revisão de 05/09 mostrou o limite disso: renomear a chave `faixas_de_preco:`
 * derrubava um caso, mas trocar o gate `disponiveis.length > 0` por `false &&`
 * deixava a home sem desenhar nada com os 2087 **verdes**. Teste de fonte pega
 * a chave sumindo; não pega a condição mentindo.
 *
 * Por isso o bloco virou `components/modernist/FaixasDePreco`: dá para
 * renderizar sem subir Supabase, e a condição passa a estar sob teste.
 */

function veiculo(id: string, preco: number): Veiculo {
  return {
    id,
    marca: "Fiat",
    modelo: "Argo",
    versao: "Drive 1.0",
    ano: 2022,
    preco_original: preco,
    preco_promocional: 0,
    quilometragem: 30000,
    tipo: "Hatch",
    vendido: false,
  } as unknown as Veiculo;
}

const PATIO = [veiculo("1", 45000), veiculo("2", 85000), veiculo("3", 150000)];

function bloco(disponiveis: Veiculo[]): string {
  return renderToStaticMarkup(
    createElement(FaixasDePreco, {
      disponiveis,
      cabecalho: createElement("h2", null, "Por faixa de preço"),
    }),
  );
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);
}

describe("o bloco de faixas leva às três páginas", () => {
  it("um link por faixa, e todos apontam para o hub certo", () => {
    const saida = hrefs(bloco(PATIO));

    expect(saida).toHaveLength(FAIXAS_DE_PRECO.length);
    for (const faixa of FAIXAS_DE_PRECO) {
      expect(saida, `sem link para ${faixa.slug}`).toContain(`/estoque/${faixa.slug}`);
    }
  });

  it("as três aparecem mesmo quando uma está zerada — são hubs perenes", () => {
    // Só um carro barato: as outras duas faixas ficam em zero e continuam ali,
    // porque a página existe e responde.
    const saida = hrefs(bloco([veiculo("1", 45000)]));

    expect(saida).toHaveLength(3);
  });

  it("com o pátio vazio, o bloco inteiro some", () => {
    // Três zeros enfileirados comunicam loja fechada, não recorte. É a
    // condição que a mutação `false &&` fingia respeitar.
    expect(bloco([])).toBe("");
  });

  it("a contagem de cada faixa é a real", () => {
    const html = bloco(PATIO);

    // Um carro em cada faixa: nenhuma contagem pode sair diferente de 1.
    expect([...html.matchAll(/>(\d+)<\/span>/g)].map((m) => m[1])).toEqual(["1", "1", "1"]);
  });
});

describe("a home e a vitrine montam o bloco", () => {
  const fonte = (p: string) => readFileSync(p, "utf8");

  it("a área está no catálogo da tela A3", () => {
    expect(AREAS_DA_HOME.map((a) => a.id)).toContain("faixas_de_preco");
  });

  it("a área chega a areasVisiveis mesmo com a config de produção", () => {
    const config = normalizarAreas({
      ordem: ["hero", "busca", "destaques_rapidos", "estoque_selecionado", "consultoria",
              "venda_troca", "reputacao", "instagram", "contato"],
      ocultas: [],
    });

    expect(areasVisiveis(config).map((a) => a.id)).toContain("faixas_de_preco");
  });

  it("os dois lugares que montam o bloco continuam montando", () => {
    // A fiação: o componente existe e é testado acima, mas quem o chama não é
    // renderizado aqui (a home puxa Supabase, reputação e Instagram).
    expect(fonte("src/app/page.tsx")).toMatch(/faixas_de_preco:\s*\(\s*<FaixasDePreco/);
    expect(fonte("src/app/estoque/page.tsx")).toMatch(/<FaixasDePreco/);
  });
});
