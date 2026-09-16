import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import EncomendaDaFichaPerdida from "../src/components/EncomendaDaFichaPerdida";
import { contextoDaFichaPerdida, type MarcaConhecida } from "../src/lib/fichaPerdida";

/**
 * O caminho lido nos níveis de marca e de modelo.
 *
 * `/carros/volkswagen/modeloinexistente` cai no não encontrado do hub de
 * modelo, e `/carros/marcainexistente` no da marca — nenhum dos dois recebe
 * params, como a ficha. O contexto só existe no caminho, e a regra que o lê é
 * a de `contextoDaFichaPerdida`, com um nível a mais em cada extremo:
 *
 *   · no nível do MODELO (três segmentos): marca com carro hoje → link para a
 *     marca, e o formulário sem contexto (não se promete avisar sobre o que
 *     está na tela); marca zerada → a marca vai ao formulário, sem link;
 *     marca desconhecida → nada, e nenhum slug vira nome; o MODELO digitado
 *     nunca é usado — o hub dele acabou de responder 404, e o índice pode ter
 *     até uma hora de atraso contra a página;
 *   · no nível da MARCA (14/09): a regra não olha além do primeiro segmento.
 *     Sai sempre o `vazio` — `segmento` do primeiro segmento, `caminho`
 *     inteiro, `marca` vazia. A marca É o que o endereço não tem; não existe
 *     "marca digitada" para checar.
 *
 * O nível viaja como string, e não como função: é prop de client component.
 */

const navegacao = vi.hoisted(() => ({ caminho: "/carros/volkswagen/foo" }));

vi.mock("next/navigation", () => ({ usePathname: () => navegacao.caminho }));

/* Dublê que ECOA as props do formulário — é a fiação que está sob teste. */
vi.mock("../src/components/EncomendaDeCarro", () => ({
  default: ({
    marca,
    modelo,
    caminho: onde,
  }: {
    marca: string;
    modelo?: string | null;
    caminho: string;
  }) =>
    createElement(
      "form",
      { "data-encomenda": "1", "data-marca": marca, "data-modelo": modelo ?? "", "data-caminho": onde },
      "Encomende seu carro",
    ),
}));

const marcas: MarcaConhecida[] = [
  {
    slug: "volkswagen",
    nome: "Volkswagen",
    segmento: "carros",
    total: 2,
    modelos: [
      { slug: "nivus", nome: "Nivus", total: 2 },
      { slug: "saveiro", nome: "Saveiro", total: 0 },
    ],
  },
  {
    slug: "kia",
    nome: "Kia",
    segmento: "carros",
    total: 0,
    modelos: [{ slug: "picanto", nome: "Picanto", total: 0 }],
  },
  {
    slug: "honda",
    nome: "Honda",
    segmento: "motos",
    total: 1,
    modelos: [{ slug: "cg-160", nome: "CG 160", total: 1 }],
  },
];

beforeEach(() => {
  navegacao.caminho = "/carros/volkswagen/foo";
});

describe("o caminho de três segmentos, no nível do modelo", () => {
  it("marca com carro vira link para a marca, e o formulário vai sem contexto", () => {
    const perdida = contextoDaFichaPerdida("/carros/volkswagen/foo", marcas, "modelo");

    expect(perdida.hubComEstoque).toEqual({
      rotulo: "Volkswagen",
      href: "/carros/volkswagen",
      total: 2,
    });
    expect(perdida.encomenda).toEqual({
      marca: "",
      modelo: null,
      caminho: "/carros/volkswagen/foo",
      segmento: "carros",
    });
  });

  it("marca zerada leva só a marca ao formulário, sem link", () => {
    const perdida = contextoDaFichaPerdida("/carros/kia/foo", marcas, "modelo");

    expect(perdida.hubComEstoque).toBeNull();
    expect(perdida.encomenda).toEqual({
      marca: "Kia",
      modelo: null,
      caminho: "/carros/kia/foo",
      segmento: "carros",
    });
  });

  /**
   * O discriminador do nível. No nível da ficha, `nivus` com carro viraria o
   * link "Volkswagen Nivus", e `picanto` zerado iria ao formulário como
   * modelo. No nível do modelo, os dois ficam de fora.
   */
  it("o modelo digitado nunca é usado — nem quando o índice o conhece", () => {
    expect(contextoDaFichaPerdida("/carros/volkswagen/nivus", marcas, "modelo").hubComEstoque).toEqual({
      rotulo: "Volkswagen",
      href: "/carros/volkswagen",
      total: 2,
    });
    expect(contextoDaFichaPerdida("/carros/kia/picanto", marcas, "modelo").encomenda.modelo).toBeNull();
  });

  it("marca desconhecida não vira marca", () => {
    const perdida = contextoDaFichaPerdida("/carros/foo/bar", marcas, "modelo");

    expect(perdida.encomenda.marca).toBe("");
    expect(perdida.hubComEstoque).toBeNull();
  });

  it("categoria que não serve hub devolve vazio", () => {
    const perdida = contextoDaFichaPerdida("/foo/volkswagen/nivus", marcas, "modelo");

    expect(perdida.encomenda).toEqual({
      marca: "",
      modelo: null,
      caminho: "/foo/volkswagen/nivus",
      segmento: "carros",
    });
    expect(perdida.hubComEstoque).toBeNull();
  });

  it("moto leva para o segmento de moto", () => {
    expect(contextoDaFichaPerdida("/motos/honda/foo", marcas, "modelo").hubComEstoque).toEqual({
      rotulo: "Honda",
      href: "/motos/honda",
      total: 1,
    });
  });

  it("não casa marca de outro segmento", () => {
    // `honda` existe no índice, mas em `motos`. Sob `/carros/` não é ela.
    const perdida = contextoDaFichaPerdida("/carros/honda/foo", marcas, "modelo");

    expect(perdida.encomenda.marca).toBe("");
    expect(perdida.hubComEstoque).toBeNull();
  });

  it("caminho de ficha não é lido no nível do modelo", () => {
    const perdida = contextoDaFichaPerdida("/carros/volkswagen/nivus/vw-nivus-1", marcas, "modelo");

    expect(perdida.hubComEstoque).toBeNull();
    expect(perdida.encomenda.marca).toBe("");
  });

  it("o nível da ficha continua exigindo quatro segmentos — e é o padrão", () => {
    expect(contextoDaFichaPerdida("/carros/volkswagen/foo", marcas, "ficha").hubComEstoque).toBeNull();
    expect(contextoDaFichaPerdida("/carros/volkswagen/foo", marcas).hubComEstoque).toBeNull();
  });
});

/**
 * O nível da marca (14/09): a regra não olha além do primeiro segmento — nem
 * para achar a marca, nem para achar o modelo. Um caminho de três segmentos
 * com marca conhecida E com estoque é o teste que separa este nível dos
 * outros dois: no nível do modelo ou da ficha ele acharia a marca (e, na
 * ficha, o modelo); no nível da marca sai sempre o `vazio`.
 */
describe("o caminho lido no nível da marca", () => {
  it("não olha além do primeiro segmento, nem com marca e modelo conhecidos", () => {
    const perdida = contextoDaFichaPerdida("/carros/volkswagen/nivus", marcas, "marca");

    expect(perdida.hubComEstoque).toBeNull();
    expect(perdida.encomenda).toEqual({
      marca: "",
      modelo: null,
      caminho: "/carros/volkswagen/nivus",
      segmento: "carros",
    });
  });

  it("moto leva o segmento de moto", () => {
    expect(contextoDaFichaPerdida("/motos/foo", marcas, "marca").encomenda.segmento).toBe("motos");
  });

  it("categoria inválida cai no segmento padrão", () => {
    expect(contextoDaFichaPerdida("/foo/volkswagen", marcas, "marca").encomenda.segmento).toBe("carros");
  });
});

/**
 * A fiação: o nível tem de chegar à regra. Um bloco que esquecesse de
 * repassá-lo leria `/carros/volkswagen/foo` no nível da ficha — curto demais —,
 * e a página do modelo perderia o link sem erro nenhum.
 *
 * Mede fiação, não HTML servido: `usePathname` está dublado. No servidor de
 * verdade nada da página sai no HTML de um `notFound()` — é a casca de erro do
 * Next (ver o docblock de `not-found.tsx` da ficha).
 */
describe("o bloco do cliente repassa o nível", () => {
  it("no nível do modelo, o caminho de três segmentos vira o link da marca", () => {
    const html = renderToStaticMarkup(
      createElement(EncomendaDaFichaPerdida, { marcas, nivel: "modelo" }),
    );

    expect(html).toContain('href="/carros/volkswagen"');
    expect(html).toContain("Ver 2 Volkswagen no estoque");
    expect(html).not.toContain("Foo");
  });

  it("no nível da ficha, o mesmo caminho não abre nada", () => {
    const html = renderToStaticMarkup(
      createElement(EncomendaDaFichaPerdida, { marcas, nivel: "ficha" }),
    );

    expect(html).not.toContain("no estoque</a>");
    expect(html).toContain('data-marca=""');
  });

  it("no nível da marca, nenhum link sai e a marca digitada não aparece", () => {
    navegacao.caminho = "/carros/volkswagen/foo";
    const html = renderToStaticMarkup(
      createElement(EncomendaDaFichaPerdida, { marcas, nivel: "marca" }),
    );

    expect(html).not.toContain("no estoque</a>");
    expect(html).toContain('data-marca=""');
    expect(html).toContain('data-caminho="/carros/volkswagen/foo"');
  });
});
