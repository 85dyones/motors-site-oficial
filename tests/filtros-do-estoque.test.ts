import { describe, it, expect } from "vitest";
import type { Veiculo } from "../src/types";
import {
  SEM_FAIXA,
  ajustarFaixa,
  catalogoDeOpcionais,
  dentroDaFaixa,
  estadoDaUrl,
  lerValorDigitado,
  limitesDaRegua,
  opcionaisDoVeiculo,
  rotuloDaFaixa,
  sugestoesDeOpcionais,
  temTodosOsOpcionais,
  urlDoEstado,
  type EstadoDoFiltro,
} from "../src/lib/filtrosDoEstoque";

/**
 * As regras puras do painel de filtro do `/estoque` — pedido do dono em
 * 28/09/2026: digitar mínimo e máximo embaixo da régua, buscar por opcional,
 * ano em lista, e (escolhidos por ele na mesma conversa) marca completa,
 * filtro que sobrevive ao voltar da ficha e filtro de KM.
 *
 * Os números dos casos vêm da vitrine no ar em 28/09: preços de R$ 26.900 a
 * R$ 318.900, a régua antiga de R$ 50 mil a R$ 1 milhão, e opcionais gravados
 * como lista separada por vírgula ("Freios ABS, Airbag, Alarme, …").
 */

function veiculo(parcial: Partial<Veiculo>): Veiculo {
  return {
    id: "1",
    marca: "Fiat",
    modelo: "Argo",
    versao: "1.0 Drive",
    ano: 2021,
    quilometragem: 30000,
    cambio: "Manual",
    combustivel: "Flex",
    cor: "Branco",
    fipe: "",
    preco_original: 70000,
    preco_promocional: 0,
    pericia: "",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
    tipo: "Hatch",
    ...parcial,
  } as Veiculo;
}

describe("os limites da régua saem do estoque, não de um número fixo", () => {
  it("arredonda para fora no passo: o carro mais barato e o mais caro ficam dentro", () => {
    // A régua antiga ia de 50 mil a 1 milhão: os 7 carros abaixo de 50 mil
    // não tinham como ser separados, e 70% do trilho passava do mais caro.
    expect(limitesDaRegua([26900, 45000, 318900], 5000)).toEqual({ min: 25000, max: 320000 });
  });

  it("valor exato no passo não ganha um passo a mais", () => {
    expect(limitesDaRegua([30000, 80000], 5000)).toEqual({ min: 30000, max: 80000 });
  });

  it("estoque de um carro só ainda dá uma régua com as duas pontas separadas", () => {
    const limites = limitesDaRegua([45000], 5000)!;
    expect(limites.max).toBeGreaterThan(limites.min);
  });

  it("sem valor válido não há régua", () => {
    expect(limitesDaRegua([], 5000)).toBeNull();
    expect(limitesDaRegua([Number.NaN], 5000)).toBeNull();
  });
});

describe("o que a pessoa digita na caixa", () => {
  it("aceita o número com ou sem máscara", () => {
    expect(lerValorDigitado("45000")).toBe(45000);
    expect(lerValorDigitado("45.000")).toBe(45000);
    expect(lerValorDigitado("R$ 45.000")).toBe(45000);
    expect(lerValorDigitado("R$ 45.000")).toBe(45000);
    expect(lerValorDigitado("80.000 km")).toBe(80000);
  });

  it("aceita \"mil\", que é como se fala preço de carro", () => {
    expect(lerValorDigitado("45 mil")).toBe(45000);
    expect(lerValorDigitado("45mil")).toBe(45000);
  });

  it("caixa vazia é \"sem limite\", não zero", () => {
    // Zero no máximo zeraria a vitrine inteira — o defeito clássico de campo
    // de faixa que trata vazio como número.
    expect(lerValorDigitado("")).toBeNull();
    expect(lerValorDigitado("   ")).toBeNull();
    expect(lerValorDigitado("abc")).toBeNull();
  });
});

describe("ajustar a faixa depois de digitar ou arrastar", () => {
  const limites = { min: 25000, max: 320000 };

  it("mínimo maior que o máximo troca as pontas, em vez de zerar a vitrine", () => {
    expect(ajustarFaixa({ min: 80000, max: 40000 }, limites)).toEqual({ min: 40000, max: 80000 });
  });

  it("ponta encostada na borda da régua vira \"sem limite\"", () => {
    // Sem isso o chip diria "ATÉ R$ 320.000" para quem só arrastou e soltou
    // no fim — um filtro que não filtra nada ocupando a régua de chips.
    expect(ajustarFaixa({ min: 25000, max: 320000 }, limites)).toEqual(SEM_FAIXA);
    expect(ajustarFaixa({ min: 10000, max: 999999 }, limites)).toEqual(SEM_FAIXA);
  });

  it("valor dentro da régua fica como foi digitado, sem arredondar para o passo", () => {
    expect(ajustarFaixa({ min: null, max: 37500 }, limites)).toEqual({ min: null, max: 37500 });
  });

  it("sem limites (o ano, que é lista), só troca as pontas", () => {
    expect(ajustarFaixa({ min: 2022, max: 2018 }, null)).toEqual({ min: 2018, max: 2022 });
    expect(ajustarFaixa({ min: 1976, max: null }, null)).toEqual({ min: 1976, max: null });
  });
});

describe("um valor dentro da faixa", () => {
  it("as pontas são inclusivas", () => {
    const faixa = { min: 40000, max: 80000 };
    expect(dentroDaFaixa(40000, faixa)).toBe(true);
    expect(dentroDaFaixa(80000, faixa)).toBe(true);
    expect(dentroDaFaixa(39999, faixa)).toBe(false);
    expect(dentroDaFaixa(80001, faixa)).toBe(false);
  });

  it("ponta nula não limita", () => {
    expect(dentroDaFaixa(1, { min: null, max: 80000 })).toBe(true);
    expect(dentroDaFaixa(10_000_000, { min: 40000, max: null })).toBe(true);
    expect(dentroDaFaixa(5, SEM_FAIXA)).toBe(true);
  });
});

describe("o rótulo do chip da faixa", () => {
  const ano = (n: number) => String(n);

  it("as quatro formas", () => {
    expect(rotuloDaFaixa(SEM_FAIXA, ano)).toBeNull();
    expect(rotuloDaFaixa({ min: 2018, max: 2022 }, ano)).toBe("2018 A 2022");
    expect(rotuloDaFaixa({ min: null, max: 2015 }, ano)).toBe("ATÉ 2015");
    expect(rotuloDaFaixa({ min: 2018, max: null }, ano)).toBe("A PARTIR DE 2018");
  });

  it("pontas iguais viram um valor só — o ?ano=2021 da home continua lendo \"2021\"", () => {
    expect(rotuloDaFaixa({ min: 2021, max: 2021 }, ano)).toBe("2021");
  });
});

describe("os opcionais de um carro", () => {
  it("separa a lista do feed, um item por vírgula", () => {
    expect(
      opcionaisDoVeiculo(veiculo({ opcionais: "Freios ABS, Airbag, Alarme, Teto solar" })),
    ).toEqual(["Freios ABS", "Airbag", "Alarme", "Teto solar"]);
  });

  it("não repete o mesmo item escrito de outro jeito", () => {
    expect(opcionaisDoVeiculo(veiculo({ opcionais: "Câmera de ré, camera de re, CÂMERA DE RÉ" }))).toEqual([
      "Câmera de ré",
    ]);
  });

  it("deixa de fora o que já tem filtro próprio no painel — o câmbio", () => {
    // "Câmbio automático" como opcional repetiria o grupo CÂMBIO, e os dois
    // poderiam discordar: o opcional está preenchido em 3 de cada 4 carros.
    expect(
      opcionaisDoVeiculo(veiculo({ opcionais: "Airbag, Câmbio automático, Câmbio manual" })),
    ).toEqual(["Airbag"]);
  });

  it("aceita ponto e vírgula, quebra de linha e ponto final no último item", () => {
    expect(opcionaisDoVeiculo(veiculo({ opcionais: "Airbag;Alarme\nTeto solar." }))).toEqual([
      "Airbag",
      "Alarme",
      "Teto solar",
    ]);
  });

  it("carro sem opcional cadastrado devolve lista vazia", () => {
    expect(opcionaisDoVeiculo(veiculo({ opcionais: "" }))).toEqual([]);
    expect(opcionaisDoVeiculo(veiculo({ opcionais: undefined as unknown as string }))).toEqual([]);
  });
});

const ESTOQUE_COM_OPCIONAIS: Veiculo[] = [
  veiculo({ id: "a", opcionais: "Ar-condicionado, Teto solar, Câmera de ré, Bancos em couro" }),
  veiculo({ id: "b", opcionais: "Ar-condicionado, Teto solar, Farol de milha" }),
  veiculo({ id: "c", opcionais: "Ar-condicionado, Ar quente, Faróis de neblina" }),
  veiculo({ id: "d", opcionais: "" }),
];

describe("o catálogo de opcionais do estoque", () => {
  it("conta quantos carros têm cada item, do mais comum para o menos", () => {
    const catalogo = catalogoDeOpcionais(ESTOQUE_COM_OPCIONAIS);
    expect(catalogo.slice(0, 2)).toEqual([
      { chave: "ar-condicionado", rotulo: "Ar-condicionado", total: 3 },
      { chave: "teto solar", rotulo: "Teto solar", total: 2 },
    ]);
    expect(catalogo.find((o) => o.chave === "camera de re")?.total).toBe(1);
  });
});

describe("sugestões enquanto a pessoa digita", () => {
  const catalogo = catalogoDeOpcionais(ESTOQUE_COM_OPCIONAIS);
  const rotulos = (digitado: string, escolhidos: string[] = []) =>
    sugestoesDeOpcionais(catalogo, digitado, escolhidos).map((o) => o.rotulo);

  it("casa pelo começo da palavra: \"ar\" não traz \"Farol\"", () => {
    expect(rotulos("ar")).toEqual(["Ar-condicionado", "Ar quente"]);
  });

  it("sem acento acha com acento", () => {
    expect(rotulos("camera")).toEqual(["Câmera de ré"]);
  });

  it("duas palavras precisam casar as duas, em qualquer ordem", () => {
    expect(rotulos("couro banco")).toEqual(["Bancos em couro"]);
  });

  it("o que já foi escolhido sai da lista", () => {
    expect(rotulos("ar", ["ar-condicionado"])).toEqual(["Ar quente"]);
  });

  it("caixa vazia mostra os mais comuns — é o que ensina o que existe", () => {
    expect(rotulos("").slice(0, 2)).toEqual(["Ar-condicionado", "Teto solar"]);
  });
});

describe("o carro tem os opcionais escolhidos", () => {
  it("precisa ter TODOS — escolher dois estreita, não alarga", () => {
    const [a, b] = ESTOQUE_COM_OPCIONAIS;
    expect(temTodosOsOpcionais(a, ["teto solar", "camera de re"])).toBe(true);
    expect(temTodosOsOpcionais(b, ["teto solar", "camera de re"])).toBe(false);
  });

  it("nada escolhido não reprova ninguém, nem o carro sem lista", () => {
    expect(temTodosOsOpcionais(ESTOQUE_COM_OPCIONAIS[3], [])).toBe(true);
  });
});

describe("o filtro mora no endereço", () => {
  const vazio: EstadoDoFiltro = estadoDaUrl(new URLSearchParams());

  it("endereço sem nada é filtro nenhum, e filtro nenhum é endereço limpo", () => {
    expect(vazio).toEqual({
      selecionados: {},
      preco: SEM_FAIXA,
      km: SEM_FAIXA,
      ano: SEM_FAIXA,
      opcionais: [],
      busca: "",
      ordem: "recentes",
    });
    expect(urlDoEstado(vazio)).toBe("");
  });

  it("o que a busca da home manda continua valendo", () => {
    // `BuscaRegua` envia `marca`, `modelo`, `ano` (um só) e `precoMax`.
    const estado = estadoDaUrl(new URLSearchParams("marca=Fiat&ano=2021&precoMax=80000"));
    expect(estado.selecionados).toEqual({ marca: ["Fiat"] });
    expect(estado.ano).toEqual({ min: 2021, max: 2021 });
    expect(estado.preco).toEqual({ min: null, max: 80000 });
  });

  it("volta exatamente o que foi escrito — é isso que o botão voltar do navegador usa", () => {
    const cheio: EstadoDoFiltro = {
      selecionados: { marca: ["Fiat", "Ford"], cambio: ["Automático"], destaque: ["baixa-km"] },
      preco: { min: 40000, max: 90000 },
      km: { min: null, max: 80000 },
      ano: { min: 2018, max: null },
      opcionais: ["teto solar", "camera de re"],
      busca: "onix",
      ordem: "menor-preco",
    };
    expect(estadoDaUrl(new URLSearchParams(urlDoEstado(cheio)))).toEqual(cheio);
  });

  it("número que não é número vira \"sem limite\", não NaN", () => {
    const estado = estadoDaUrl(new URLSearchParams("precoMax=abc&kmMin=&anoMin=x"));
    expect(estado.preco).toEqual(SEM_FAIXA);
    expect(estado.km).toEqual(SEM_FAIXA);
    expect(estado.ano).toEqual(SEM_FAIXA);
  });

  it("opcional chega normalizado: link digitado à mão com acento ainda casa", () => {
    expect(estadoDaUrl(new URLSearchParams("opcional=Câmera de Ré")).opcionais).toEqual([
      "camera de re",
    ]);
  });

  it("ordenação desconhecida volta para a padrão", () => {
    expect(estadoDaUrl(new URLSearchParams("ordem=maior-desconto")).ordem).toBe("recentes");
  });
});
