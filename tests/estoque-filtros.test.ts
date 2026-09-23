import { describe, it, expect } from "vitest";
import { filtrarLinhas } from "../src/lib/estoqueTabela";
import type { LinhaDeEstoque } from "../src/lib/estoqueTabela";

/**
 * A tabela filtrava por ESTADO e por TEXTO, e mais nada. Com 119 linhas, a
 * pergunta "quem já está nos destaques?" não tinha resposta na tela: a única
 * pista era uma etiqueta miúda dentro da linha.
 */
const linha = (id: string, over: Partial<LinhaDeEstoque> = {}): LinhaDeEstoque =>
  ({
    id,
    marca: "Fiat",
    modelo: "Toro",
    versao: "",
    placa: "",
    preco: 100000,
    estado: "publicado",
    tipo: "Picape",
    destacado: false,
    naSemana: false,
    naTv: false,
    leads: 0,
    visitas: 0,
    diasEmEstoque: 10,
    ...over,
  }) as unknown as LinhaDeEstoque;

describe("filtrarLinhas — a trava que protege o padrão", () => {
  it("sem nenhuma opção, devolve tudo", () => {
    const linhas = [linha("a"), linha("b", { estado: "vendido" })];
    expect(filtrarLinhas(linhas)).toHaveLength(2);
  });

  it("objeto de opções vazio também devolve tudo", () => {
    const linhas = [linha("a"), linha("b")];
    expect(filtrarLinhas(linhas, {})).toHaveLength(2);
  });
});

describe("filtro por destaque", () => {
  const linhas = [
    linha("banner", { destacado: true }),
    linha("grade", { naSemana: true }),
    linha("tv", { naTv: true }),
    linha("nenhum"),
  ];

  it("banner", () => {
    expect(filtrarLinhas(linhas, { destaque: "banner" }).map((l) => l.id)).toEqual(["banner"]);
  });

  it("grade", () => {
    expect(filtrarLinhas(linhas, { destaque: "grade" }).map((l) => l.id)).toEqual(["grade"]);
  });

  it("tv", () => {
    expect(filtrarLinhas(linhas, { destaque: "tv" }).map((l) => l.id)).toEqual(["tv"]);
  });

  it("qualquer pega os três", () => {
    expect(filtrarLinhas(linhas, { destaque: "qualquer" })).toHaveLength(3);
  });

  it("nenhum é a pergunta inversa — de onde sai o próximo rodízio", () => {
    expect(filtrarLinhas(linhas, { destaque: "nenhum" }).map((l) => l.id)).toEqual(["nenhum"]);
  });
});

describe("filtro por preço", () => {
  const linhas = [
    linha("barato", { preco: 30000 }),
    linha("medio", { preco: 60000 }),
    linha("caro", { preco: 200000 }),
    linha("sem", { preco: null }),
  ];

  it("mínimo", () => {
    expect(filtrarLinhas(linhas, { precoMin: 50000 }).map((l) => l.id)).toEqual(["medio", "caro"]);
  });

  it("máximo", () => {
    expect(filtrarLinhas(linhas, { precoMax: 100000 }).map((l) => l.id)).toEqual(["barato", "medio"]);
  });

  it("faixa", () => {
    expect(filtrarLinhas(linhas, { precoMin: 50000, precoMax: 100000 }).map((l) => l.id)).toEqual(["medio"]);
  });

  it("carro sem preço não entra numa faixa de preço", () => {
    expect(filtrarLinhas(linhas, { precoMin: 1 }).map((l) => l.id)).not.toContain("sem");
  });
});

describe("filtro por marca e carroceria", () => {
  const linhas = [
    linha("f", { marca: "Fiat", tipo: "Picape" }),
    linha("v", { marca: "Volkswagen", tipo: "Hatch" }),
  ];

  it("marca, sem diferenciar caixa", () => {
    expect(filtrarLinhas(linhas, { marca: "fiat" }).map((l) => l.id)).toEqual(["f"]);
  });

  it("carroceria", () => {
    expect(filtrarLinhas(linhas, { tipo: "Hatch" }).map((l) => l.id)).toEqual(["v"]);
  });
});

describe("filtro por tempo e desempenho", () => {
  const linhas = [
    linha("novo", { diasEmEstoque: 5, leads: 3, visitas: 40 }),
    linha("parado", { diasEmEstoque: 120, leads: 0, visitas: 0 }),
    linha("semdado", { diasEmEstoque: null, visitas: null }),
  ];

  it("parado há N dias ou mais", () => {
    expect(filtrarLinhas(linhas, { paradoHaDias: 90 }).map((l) => l.id)).toEqual(["parado"]);
  });

  it("sem lead", () => {
    expect(filtrarLinhas(linhas, { semLead: true }).map((l) => l.id)).toContain("parado");
    expect(filtrarLinhas(linhas, { semLead: true }).map((l) => l.id)).not.toContain("novo");
  });

  it("sem visita", () => {
    expect(filtrarLinhas(linhas, { semVisita: true }).map((l) => l.id)).toContain("parado");
  });

  it("visitas nulas (GA4 mudo) NÃO escondem a linha", () => {
    // Sem credencial, `visitas` é null em toda linha — tratar null como zero
    // faria este filtro esconder o estoque inteiro de uma vez.
    expect(filtrarLinhas(linhas, { semVisita: true }).map((l) => l.id)).not.toContain("semdado");
  });
});

describe("filtros combinados", () => {
  it("estado e preço juntos", () => {
    const linhas = [
      linha("a", { estado: "publicado", preco: 30000 }),
      linha("b", { estado: "publicado", preco: 200000 }),
      linha("c", { estado: "vendido", preco: 30000 }),
    ];
    expect(
      filtrarLinhas(linhas, { estado: "publicado", precoMax: 50000 }).map((l) => l.id),
    ).toEqual(["a"]);
  });

  it("destaque e parado juntos — o carro destacado que não gira", () => {
    const linhas = [
      linha("a", { destacado: true, diasEmEstoque: 200 }),
      linha("b", { destacado: true, diasEmEstoque: 3 }),
    ];
    expect(
      filtrarLinhas(linhas, { destaque: "banner", paradoHaDias: 90 }).map((l) => l.id),
    ).toEqual(["a"]);
  });
});
