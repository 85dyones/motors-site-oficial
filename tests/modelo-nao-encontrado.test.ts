import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Veiculo } from "../src/types";

/**
 * O modelo que não existe deixa de responder em inglês.
 *
 * `/carros/volkswagen/modeloinexistente` caía no 404 de fábrica do Next. O
 * `dados` nulo de `[modelo]/page.tsx` é modelo fora do histórico daquela marca
 * — e também marca desconhecida e categoria inválida, que passam pelo mesmo
 * `resolver`. Modelo conhecido e zerado não cai aqui: responde 200 com o hub
 * vazio.
 *
 * O bloco do cliente lê o caminho no nível do modelo: marca com carro vira o
 * link "Ver … no estoque", marca zerada vai ao formulário, e o modelo digitado
 * nunca é usado. Como na ficha, esse bloco mede FIAÇÃO, com `usePathname`
 * dublado. No servidor de verdade nada desta página sai no HTML de um
 * `notFound()` — a resposta é a casca de erro do Next, e o navegador desenha a
 * página pelo payload (a nota longa está no docblock de `not-found.tsx` da
 * ficha) —, e o que segura a R5 (título, texto, amostra, blocos e catálogo)
 * não depende do bloco.
 */

const navegacao = vi.hoisted(() => ({ caminho: "/carros/volkswagen/foo" }));

vi.mock("next/navigation", () => ({ usePathname: () => navegacao.caminho }));

const veiculo = (id: string, marca: string, modelo: string, tipo: string, preco: number): Veiculo => ({
  id,
  marca,
  modelo,
  versao: "",
  ano: 2022,
  quilometragem: 40000,
  cambio: "Automático",
  combustivel: "Flex",
  cor: "Prata",
  fipe: "",
  tipo,
  preco_original: preco,
  preco_promocional: 0,
  pericia: "",
  opcionais: "",
  laudo_pericia: "",
  whatsapp_images: [],
  web_full_images: [],
});

/**
 * Volkswagen com dois carros, Honda com um carro e uma moto, Kia só no
 * histórico: os três ramos do bloco (link, formulário, nada) e o singular da
 * âncora.
 */
const DISPONIVEIS = [
  veiculo("101", "Volkswagen", "Nivus", "SUV", 120000),
  veiculo("102", "Volkswagen", "Polo", "Hatch", 80000),
  veiculo("103", "Honda", "City", "Sedan", 100000),
  veiculo("104", "Honda", "CG 160", "Motocicleta", 20000),
];

const HISTORICO = [
  ...DISPONIVEIS,
  { ...veiculo("900", "Kia", "Picanto", "Hatch", 50000), vendido: true },
];

/* A regra de verdade, com a ida e volta por JSON do cache de dados. */
vi.mock("../src/lib/hubsDeEstoque", async (original) => {
  const real = await original<typeof import("../src/lib/hubsDeEstoque")>();
  return {
    ...real,
    recorteDoNaoEncontrado: async () =>
      JSON.parse(JSON.stringify(real.montarRecorteDoNaoEncontrado(HISTORICO, DISPONIVEIS))),
  };
});

/* Dublê que ECOA as props: o que está sob teste é o que chega ao formulário. */
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

async function paginaRenderizada(caminho: string): Promise<string> {
  navegacao.caminho = caminho;
  const { default: ModeloNaoEncontrado } = await import(
    "../src/app/[categoria]/[marca]/[modelo]/not-found"
  );
  return renderToStaticMarkup(await ModeloNaoEncontrado());
}

/** As fichas linkadas — só o card linka para uma. O mesmo recorte de `ficha-sem-veiculo`. */
function fichasLinkadas(html: string): string[] {
  return [...html.matchAll(/href="\/(?:carros|motos)\/[^/"]+\/([^/"]+)\/[^"]+"/g)].map(
    (m) => m[1]!,
  );
}

beforeEach(() => {
  navegacao.caminho = "/carros/volkswagen/foo";
});

describe("o modelo que não existe", () => {
  it("responde em português, com o título e a frase inteiros", async () => {
    const html = await paginaRenderizada("/carros/volkswagen/modeloinexistente");

    expect(html).not.toContain("This page could not be found");
    expect(html).toContain("Não encontramos este modelo");
    expect(html).toContain("Este endereço não abre nenhuma página de modelo.");
  });

  it("não afirma venda nem posse", async () => {
    const html = await paginaRenderizada("/carros/volkswagen/modeloinexistente");

    expect(html).not.toMatch(/vendid|saiu|não está mais/i);
  });

  it("dá saída pelo catálogo depois do texto, e não só pela trilha (R5)", async () => {
    const html = await paginaRenderizada("/carros/volkswagen/modeloinexistente");
    const inicio = html.indexOf("Este endereço não abre nenhuma página de modelo.");

    expect(inicio).toBeGreaterThan(-1);
    expect(html.slice(inicio)).toContain('href="/estoque"');
    expect(html).toContain("VER TODO O ESTOQUE");
  });

  it("mostra a amostra do pátio e os três blocos", async () => {
    const html = await paginaRenderizada("/carros/volkswagen/modeloinexistente");
    const fichas = fichasLinkadas(html);

    expect(html).toContain("Do pátio de hoje, em todas as faixas");
    expect(fichas.length).toBeGreaterThan(0);
    expect(new Set(fichas).size).toBeLessThanOrEqual(6);
    expect(html).toContain("Por faixa de preço");
    expect(html).toContain("Por carroceria");
    expect(html).toContain("Marcas em estoque");
  });
});

describe("o bloco do cliente, no nível do modelo", () => {
  it("/carros/volkswagen/foo linka a Volkswagen e não imprime Foo", async () => {
    const html = await paginaRenderizada("/carros/volkswagen/foo");

    // A âncora, e não só o href: "Marcas em estoque" também linka
    // `/carros/volkswagen`, e o href sozinho passaria sem o bloco.
    expect(html).toContain("Ver 2 Volkswagen no estoque");
    expect(html).toContain('href="/carros/volkswagen"');
    expect(html).not.toContain("Foo");
    expect(html).toContain('data-marca=""');
    expect(html).toContain('data-modelo=""');
  });

  it("marca zerada vai ao formulário, sem link e sem o modelo digitado", async () => {
    const html = await paginaRenderizada("/carros/kia/foo");

    expect(html).toContain('data-marca="Kia"');
    expect(html).toContain('data-modelo=""');
    expect(html).not.toContain("no estoque</a>");
  });

  it("marca desconhecida não vira marca", async () => {
    const html = await paginaRenderizada("/carros/foo/bar");

    expect(html).toContain('data-marca=""');
    expect(html).not.toContain("Foo");
  });

  it("moto leva para o segmento de moto, no singular", async () => {
    const html = await paginaRenderizada("/motos/honda/foo");

    expect(html).toContain("Ver Honda no estoque");
    expect(html).toContain('href="/motos/honda"');
  });

  it("grava no lead o endereço que a pessoa abriu", async () => {
    expect(await paginaRenderizada("/carros/kia/foo")).toContain('data-caminho="/carros/kia/foo"');
  });
});

describe("cada não encontrado no seu segmento", () => {
  it.each([
    ["marca", "src/app/[categoria]/[marca]/not-found.tsx"],
    ["modelo", "src/app/[categoria]/[marca]/[modelo]/not-found.tsx"],
    ["ficha", "src/app/[categoria]/[marca]/[modelo]/[ficha]/not-found.tsx"],
  ])("%s: %s existe", (_nivel, arquivo) => {
    expect(existsSync(join(__dirname, "..", arquivo))).toBe(true);
  });
});
