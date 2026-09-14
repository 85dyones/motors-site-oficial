import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Veiculo } from "../src/types";

/**
 * A marca que não existe deixa de responder em inglês.
 *
 * `/carros/marcainexistente` caía no 404 de fábrica do Next — "404: This page
 * could not be found", sem link, dentro da moldura do site. É a R5 do guia
 * normativo, o mesmo defeito que o #70 fechou para a ficha.
 *
 * Quem cai aqui: marca que nunca passou pelo estoque, e também categoria
 * inválida — `/foo/volkswagen` chega ao mesmo `notFound()` de
 * `[marca]/page.tsx`. Por isso o texto fala do ENDEREÇO, e não da marca:
 * dizer que a Volkswagen nunca passou pela loja seria falso.
 *
 * ---------------------------------------------------------------------------
 * Lê o caminho — mas só o primeiro segmento (14/09)
 * ---------------------------------------------------------------------------
 * A primeira versão desta página não lia o caminho: formulário genérico, com
 * `caminho: ""` e `segmento: "carros"` fixo. Isso perdia o segmento certo em
 * `/motos/…` (o formulário falava em "carro" para quem procurava moto) e não
 * gravava no lead o endereço que a pessoa abriu — os dois pontos que o #70 já
 * resolvia na ficha.
 *
 * A página passou a montar `EncomendaDaFichaPerdida` com `nivel="marca"`, o
 * mesmo bloco da ficha e do modelo. Nesse nível a regra pura
 * (`contextoDaFichaPerdida`, Task 9) não olha além do primeiro segmento: o
 * `segmento` sai dele, o `caminho` é o endereço inteiro, e a marca digitada
 * NUNCA vira `marca` — a marca é, por definição, o que não existe. Por isso
 * `hubComEstoque` é sempre nulo aqui: não há hub de marca conhecida para
 * linkar de volta, diferente do modelo.
 */

const navegacao = vi.hoisted(() => ({ caminho: "/carros/foo" }));

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

/* Dublê que ECOA as props: o formulário real é client component com Turnstile
   e `fetch`, e o que está sob teste é o que a página manda para ele. */
vi.mock("../src/components/EncomendaDeCarro", () => ({
  default: ({
    marca,
    modelo,
    caminho,
    segmento,
  }: {
    marca: string;
    modelo?: string | null;
    caminho: string;
    segmento: string;
  }) =>
    createElement(
      "form",
      {
        "data-encomenda": "1",
        "data-marca": marca,
        "data-modelo": modelo ?? "",
        "data-caminho": caminho,
        "data-segmento": segmento,
      },
      "Encomende seu carro",
    ),
}));

async function paginaRenderizada(caminho: string): Promise<string> {
  navegacao.caminho = caminho;
  const { default: MarcaNaoEncontrada } = await import("../src/app/[categoria]/[marca]/not-found");
  return renderToStaticMarkup(await MarcaNaoEncontrada());
}

/** As fichas linkadas — só o card linka para uma. O mesmo recorte de `ficha-sem-veiculo`. */
function fichasLinkadas(html: string): string[] {
  return [...html.matchAll(/href="\/(?:carros|motos)\/[^/"]+\/([^/"]+)\/[^"]+"/g)].map(
    (m) => m[1]!,
  );
}

beforeEach(() => {
  navegacao.caminho = "/carros/foo";
});

describe("a marca que não existe", () => {
  it("responde em português, com o título e a frase inteiros", async () => {
    const html = await paginaRenderizada("/carros/marcainexistente");

    expect(html).not.toContain("This page could not be found");
    expect(html).toContain("Não encontramos esta marca");
    expect(html).toContain("Este endereço não abre nenhuma página de marca.");
  });

  it("não afirma venda nem posse", async () => {
    const html = await paginaRenderizada("/carros/marcainexistente");

    expect(html).not.toMatch(/vendid|saiu|não está mais/i);
  });

  it("dá saída pelo catálogo depois do texto, e não só pela trilha (R5)", async () => {
    const html = await paginaRenderizada("/carros/marcainexistente");
    const inicio = html.indexOf("Este endereço não abre nenhuma página de marca.");

    // Guarda o -1: sem ela, `slice(-1)` pega o último caractere e a asserção
    // passaria numa página sem o texto.
    expect(inicio).toBeGreaterThan(-1);
    expect(html.slice(inicio)).toContain('href="/estoque"');
    expect(html).toContain("VER TODO O ESTOQUE");
  });

  it("mostra a amostra do pátio, as marcas, as faixas e as carrocerias", async () => {
    const html = await paginaRenderizada("/carros/marcainexistente");
    const fichas = fichasLinkadas(html);

    expect(html).toContain("Do pátio de hoje, em todas as faixas");
    expect(fichas.length).toBeGreaterThan(0);
    expect(new Set(fichas).size).toBeLessThanOrEqual(6);
    expect(html).toContain("Marcas em estoque");
    expect(html).toContain('href="/carros/volkswagen"');
    expect(html).toContain("Por faixa de preço");
    expect(html).toContain("Por carroceria");
  });

  it("monta o formulário sem marca e sem modelo, com o caminho inteiro", async () => {
    const html = await paginaRenderizada("/carros/marcainexistente");

    expect(html).toContain('data-encomenda="1"');
    expect(html).toContain('data-marca=""');
    expect(html).toContain('data-modelo=""');
    expect(html).toContain('data-caminho="/carros/marcainexistente"');
    expect(html).toContain('data-segmento="carros"');
  });

  it("/carros/foo não imprime Foo", async () => {
    expect(await paginaRenderizada("/carros/foo")).not.toContain("Foo");
  });

  it("/motos/foo leva segmento motos ao formulário", async () => {
    const html = await paginaRenderizada("/motos/foo");

    expect(html).toContain('data-segmento="motos"');
    expect(html).not.toContain("Foo");
  });

  it("o slug nunca vira marca, em categoria inválida também", async () => {
    const html = await paginaRenderizada("/foo/volkswagen");

    expect(html).toContain('data-marca=""');
    expect(html).not.toContain("no estoque</a>");
  });
});
