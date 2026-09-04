import { describe, it, expect } from "vitest";
import type { Veiculo } from "../src/types";
import { getVeiculoPdpUrl } from "../src/lib/supabase";
import { nomeComAno } from "../src/lib/nomeDoVeiculo";
import { schemaDeListagem } from "../src/lib/schemaListagem";
import { indiceDaVitrine, painelDeFiltro } from "../src/lib/vitrine";
import { lerCodigo } from "./fonte";

/**
 * A vitrine de `/estoque`: o que o servidor entrega e o que o celular vê.
 *
 * Medido contra a produção em 2026-09-04: o HTML servido de `/estoque` trazia
 * 9 links de ficha (`<a href="/carros/...">` com quatro segmentos) e 34 URLs
 * no `ItemList`. A grade vive dentro de um `<Suspense>` cujo fallback mostra a
 * primeira leva; as outras 25 fichas só existiam no JSON-LD.
 *
 * Os testes abaixo são de comportamento porque a versão por `grep` deste
 * mesmo invariante passaria intacta se alguém trocasse `disponiveis` por
 * `disponiveis.slice(0, 9)` — as palavras continuam no arquivo.
 */

function veiculo(parcial: Partial<Veiculo> & Pick<Veiculo, "id" | "marca" | "modelo">): Veiculo {
  return {
    versao: "",
    ano: 2022,
    quilometragem: 40000,
    cambio: "Automático",
    combustivel: "Flex",
    cor: "Prata",
    fipe: "",
    preco_original: 100000,
    preco_promocional: 0,
    pericia: "",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
    ...parcial,
  } as Veiculo;
}

/** Um pátio maior que a primeira leva de 9 — é onde o defeito aparecia. */
const PATIO: Veiculo[] = Array.from({ length: 34 }, (_, i) =>
  veiculo({
    id: String(8000000 + i),
    marca: ["Jeep", "Fiat", "BMW", "Honda"][i % 4],
    modelo: `Modelo ${i}`,
    versao: `1.${i % 9} Turbo Automático`,
    ano: 2018 + (i % 6),
  }),
);

describe("o índice da vitrine cobre o estoque inteiro", () => {
  it("publica uma entrada por veículo disponível, não só a primeira leva", () => {
    // A primeira leva servida são 9 cards. O índice existe justamente para as
    // outras 25: recortar aqui devolve o defeito medido em produção.
    expect(indiceDaVitrine(PATIO)).toHaveLength(PATIO.length);
  });

  it("cobre exatamente as mesmas fichas que o `ItemList` anuncia", () => {
    // O invariante que interessa: o que o JSON-LD promete ao rastreador, o
    // HTML entrega como link. Um dos dois recortando é a divergência.
    const doIndice = indiceDaVitrine(PATIO).map((f) => f.href);
    const doItemList = schemaDeListagem("x", PATIO).itemListElement.map((item) =>
      new URL(item.url).pathname,
    );

    expect(new Set(doIndice)).toEqual(new Set(doItemList));
  });

  it("usa o mesmo caminho de ficha que a grade — não um montado à mão", () => {
    const primeiro = indiceDaVitrine(PATIO)[0];
    expect(primeiro.href).toBe(getVeiculoPdpUrl(PATIO[0]));
    // Quatro segmentos: o quinto repetia os outros três e saiu em 2026-09-01.
    expect(primeiro.href.split("/").filter(Boolean)).toHaveLength(4);
  });

  it("cada ficha entra uma vez só", () => {
    const hrefs = indiceDaVitrine(PATIO).map((f) => f.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("o rótulo não repete a versão dentro do modelo", () => {
    // Mesmo defeito nº 2 que `nomeDoVeiculo` existe para eliminar: o índice
    // não pode reintroduzi-lo montando o nome por conta própria.
    const bmw = veiculo({
      id: "7947766",
      marca: "BMW",
      modelo: "X4 M40i 3.0 M Sport Edit V6 Turbo Aut",
      versao: "m40i 3.0 m sport edit v6 turbo aut",
      ano: 2023,
    });
    const [entrada] = indiceDaVitrine([bmw]);

    expect(entrada.rotulo).toBe(nomeComAno(bmw));
    expect(entrada.rotulo).toBe("BMW X4 M40i 3.0 M Sport Edit V6 Turbo Aut 2023");
  });

  it("pátio vazio devolve lista vazia — o bloco some junto", () => {
    // Cabeçalho seguido de nada é ruído para quem lê e landmark vazio para
    // quem usa leitor de tela.
    expect(indiceDaVitrine([])).toEqual([]);
  });
});

describe("recolher o filtro no mobile não recolhe no desktop", () => {
  it("fechado: some no celular", () => {
    expect(painelDeFiltro(false).classe).toMatch(/(^|\s)hidden(\s|$)/);
  });

  it("aberto: aparece no celular", () => {
    expect(painelDeFiltro(true).classe).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it("nos DOIS estados o desktop continua com a coluna de filtro", () => {
    // É o par que não pode se separar. No desktop o filtro é a coluna da
    // esquerda da tela 02 do design doc e não recolhe nunca — um `hidden` sem
    // o `lg:block` ao lado apaga o filtro do desktop sem erro nenhum.
    for (const aberto of [true, false]) {
      expect(painelDeFiltro(aberto).classe).toContain("lg:block");
    }
  });

  it("o botão diz o que vai acontecer, não onde ele está", () => {
    expect(painelDeFiltro(false).rotulo).toBe("FILTROS");
    expect(painelDeFiltro(true).rotulo).toBe("FECHAR FILTROS");
  });
});

describe("o painel recolhido continua na árvore", () => {
  it("`Catalogo` não remove o `<aside>` por condição", () => {
    // Decidir isso em JavaScript exige medir a janela no cliente: divergência
    // de hidratação e piscar de campos na primeira pintura — a armadilha que
    // `BuscaRegua.tsx` já documenta no `soDesktop`. Some por CSS.
    const fonte = lerCodigo("src/components/modernist/Catalogo.tsx");
    expect(fonte).not.toMatch(/\{\s*\w+\s*&&\s*\(?\s*<aside/);
    expect(fonte).toMatch(/painelDeFiltro\(/);
  });
});
