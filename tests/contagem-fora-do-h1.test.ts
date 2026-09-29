import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PaginaDeEstoque, { semQuebraNoHifen } from "../src/components/modernist/PaginaDeEstoque";
import { mapVeiculoDbToVeiculo } from "../src/lib/supabase";
import { lerCodigo } from "./fonte";

/**
 * A contagem saiu do `<h1>` e foi para o topo da coluna da direita
 * (2026-09-21, opção B da simulação, decisão do dono).
 *
 * Antes: "Volkswagen Saveiro seminova em Curitiba 2", com o "2" caindo sozinho
 * numa linha em 18 dos 46 hubs num celular de 390 px. Agora o `<h1>` é só o
 * assunto; "2 à venda", no mesmo tamanho, fica acima da linha do preço; as
 * colunas se alinham pelo topo quando há contagem. E palavra com hífen não se
 * parte ("T-" / "Cross" em 360 px).
 */

const carro = (id: number, modelo: string) =>
  mapVeiculoDbToVeiculo({ id, marca: "volkswagen", modelo, versao: "1.6", tipo: "Picape", preco: 69900, ano: 2021, quilometragem: 58000 } as never);

function pagina(props: { titulo?: string; n?: number; contagem?: boolean }) {
  const n = props.n ?? 2;
  return renderToStaticMarkup(
    createElement(PaginaDeEstoque, {
      trilha: [{ rotulo: "Home", href: "/" }],
      titulo: props.titulo ?? "Volkswagen Saveiro seminova em Curitiba",
      introducao: ["Texto."],
      veiculos: Array.from({ length: n }, (_, i) => carro(8000 + i, "saveiro")),
      contagem: props.contagem ?? true,
    }),
  );
}

const semTags = (html: string) => html.replace(/<[^>]+>/g, "");
const h1De = (html: string) => html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)![1];
const cabecalho = (html: string) => html.match(/<div class="flex flex-col gap-8 border-b-2[^"]*"/)![0];

describe("o <h1> é só o assunto", () => {
  it("sem número dentro, com ou sem contagem", () => {
    expect(semTags(h1De(pagina({})))).toBe("Volkswagen Saveiro seminova em Curitiba");
    expect(semTags(h1De(pagina({ n: 12 })))).not.toMatch(/\d/);
  });

  it("\"N à venda\" no tamanho do <h1>, acima da linha do preço", () => {
    const html = pagina({});
    const contagem = html.indexOf('<span class="text-mt-cobre">2</span> à venda');
    expect(contagem).toBeGreaterThan(html.indexOf("</h1>"));
    expect(contagem).toBeLessThan(html.indexOf("NESTA SELEÇÃO"));
    // O mesmo tamanho e o mesmo peso do título.
    expect(html).toMatch(/<p class="mt-titulo m-0 mb-4 text-\[34px\] lg:text-\[56px\] lg:leading-\[\.95\]"><span class="text-mt-cobre">2<\/span> à venda<\/p>/);
    // Parágrafo, não título: o <h1> continua sendo um só.
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("com contagem, as colunas se alinham pelo topo (opção B)", () => {
    expect(cabecalho(pagina({}))).toContain("lg:items-start");
    expect(cabecalho(pagina({}))).not.toContain("lg:items-end");
  });

  it("sem contagem (Garantia, Financiamento), nada muda: sem número e alinhado por baixo", () => {
    const html = pagina({ contagem: false });
    expect(html).not.toContain("à venda");
    expect(cabecalho(html)).toContain("lg:items-end");
  });

  it("zero não é impresso", () => {
    const html = pagina({ n: 0 });
    expect(html).not.toMatch(/\d+<\/span> à venda/);
    expect(semTags(h1De(html))).toBe("Volkswagen Saveiro seminova em Curitiba");
  });
});

describe("palavra com hífen não se parte", () => {
  it("T-Cross vai inteiro, e o texto do <h1> fica idêntico", () => {
    const titulo = "Volkswagen T-Cross seminovo em Curitiba";
    const h1 = h1De(pagina({ titulo }));
    expect(h1).toContain('<span class="whitespace-nowrap">T-Cross</span>');
    expect(semTags(h1)).toBe(titulo);
  });

  it("vale para qualquer palavra com hífen, e só para elas", () => {
    const html = renderToStaticMarkup(createElement("h1", null, semQuebraNoHifen("Mercedes-Benz Classe C e Honda HR-V")));
    expect(html.match(/whitespace-nowrap/g)).toHaveLength(2);
    expect(semTags(html)).toBe("Mercedes-Benz Classe C e Honda HR-V");
  });
});

describe("/estoque segue a mesma regra", () => {
  it("o <h1> de /estoque não carrega a contagem", () => {
    const fonte = lerCodigo("src/app/estoque/page.tsx");
    const h1 = fonte.slice(fonte.indexOf("<h1"), fonte.indexOf("</h1>"));
    expect(h1).toContain("Carros seminovos em Curitiba");
    expect(h1).not.toContain("disponiveis.length");
  });
});

describe("nenhum <title> de listagem leva contagem", () => {
  // O `<title>` é o que o Google mais guarda em cache: o número ali é o do dia
  // do rastreamento. Saiu de /estoque ("— 37 Ofertas") e dos recortes de
  // carroceria e de perfil ("— 12 no estoque", e "— 0 no estoque" quando
  // esvaziava) em 2026-09-21. A contagem segue na description.
  it("/estoque tem um título só, fixo", () => {
    const fonte = lerCodigo("src/app/estoque/page.tsx");
    const meta = fonte.slice(fonte.indexOf("generateMetadata"), fonte.indexOf("description:"));
    expect(meta).toMatch(/title: "Carros Seminovos em Curitiba \| Motors Store"/);
    expect(meta).not.toMatch(/Ofertas|\$\{total\}/);
  });

  it("os recortes de /estoque: nenhum `tituloSeo` conta carro", () => {
    const fonte = lerCodigo("src/app/estoque/[recorte]/page.tsx");
    const titulos = [...fonte.matchAll(/tituloSeo: `([^`]*)`/g)].map((m) => m[1]);
    expect(titulos).toHaveLength(3);
    for (const t of titulos) {
      expect(t).not.toMatch(/\.length|no estoque/);
      expect(t).toMatch(/\| Motors Store$/);
    }
  });
});
