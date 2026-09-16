// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Veiculo } from "../src/types";

/**
 * O filtro de ANO no `/estoque` — pedido do dono em 16/09: "precisamos do
 * filtro de ano de fabricação aqui também, não apenas na primeira página",
 * e depois "ano-modelo, igual à home".
 *
 * O `?ano=` que a home manda já chegava até aqui ANTES desta entrega: o
 * `Catalogo` já lia `searchParams.get("ano")` como estado inicial
 * (`selecionados.ano`) e já filtrava por ele em `passaNosFiltros` /
 * `valorDoCampo` — só não existia grupo nenhum no painel para MOSTRAR a
 * caixa marcada ou para desmarcar. Era um filtro invisível: a vitrine saía
 * recortada e não havia como a pessoa perceber por quê, nem caminho de
 * volta pelo próprio painel — o que a regra 6 do CLAUDE.md proíbe
 * ("vitrine ordena, nunca esconde").
 *
 * Este arquivo prova, executando o componente de verdade (não por
 * inspeção de código):
 *   1. o grupo ANO existe no painel, logo depois de MARCA;
 *   2. as opções vêm em ordem NUMÉRICA decrescente, com contagem que
 *      respeita os outros filtros marcados (a mesma função `contar` dos
 *      outros grupos, só reordenada);
 *   3. o `?ano=` da home nasce com a caixa certa marcada, e desmarcar —
 *      pelo grupo ou pelo chip — funciona de ponta a ponta.
 *
 * Ajuste de 16/09, depois da primeira entrega: o painel cortava TODO grupo
 * em 8 opções (`.slice(0, 8)`), e a medição de produção mostrou `/estoque`
 * com 46 carros em 15 anos-modelo distintos — o corte escondia 2014 para
 * trás, os carros mais em conta, que é o que a pessoa mais busca por ano.
 *   4. com 15 anos distintos, o grupo ANO mostra os 15 (sem corte), e — no
 *      MESMO estoque — MARCA continua cortada em 8: o limite dos outros
 *      grupos não mudou, só o do ANO.
 *
 * `next/image` e `next/link` são dublês: quem este arquivo examina é o
 * painel de filtro, não a foto nem a navegação do `CardVeiculo` que a
 * grade desenha ao lado.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const queryAtual = { valor: new URLSearchParams() };
vi.mock("next/navigation", () => ({
  useSearchParams: () => queryAtual.valor,
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, sizes: _sizes, priority: _priority, unoptimized: _uo, ...resto } = props;
    return createElement("img", resto as never);
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

function veiculo(parcial: Partial<Veiculo> & { id: string; ano: number }): Veiculo {
  return {
    marca: "Fiat",
    modelo: "Argo",
    versao: "1.0 Drive",
    quilometragem: 30000,
    cambio: "Manual",
    combustivel: "Flex",
    cor: "Branco",
    fipe: "R$ 70.000",
    preco_original: 70000,
    preco_promocional: 0,
    pericia: "aprovada",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
    tipo: "Hatch",
    ...parcial,
  };
}

/**
 * Sete anos distintos, de propósito fora da ordem alfabética E fora da
 * ordem de popularidade: 2021 é o mais comum (3 carros) mas não é o mais
 * novo, e 2023 (2 carros) fica entre 2021 e os seis anos de um carro só.
 * É o que faz um sort errado — por contagem (o padrão de `contar`, que os
 * outros grupos usam) ou por texto — devolver uma sequência DIFERENTE da
 * numérica decrescente que este filtro exige.
 */
const ESTOQUE: Veiculo[] = [
  veiculo({ id: "1", marca: "Fiat", modelo: "Argo", ano: 2021 }),
  veiculo({ id: "2", marca: "Fiat", modelo: "Argo", ano: 2021 }),
  veiculo({ id: "3", marca: "Fiat", modelo: "Toro", ano: 2019 }),
  veiculo({ id: "4", marca: "Chevrolet", modelo: "Onix", ano: 2021 }),
  veiculo({ id: "5", marca: "Chevrolet", modelo: "Onix", ano: 2020 }),
  veiculo({ id: "6", marca: "Chevrolet", modelo: "Tracker", ano: 2023 }),
  veiculo({ id: "7", marca: "Toyota", modelo: "Corolla", ano: 2018 }),
  veiculo({ id: "8", marca: "Toyota", modelo: "Hilux", ano: 2022 }),
  veiculo({ id: "9", marca: "Honda", modelo: "Civic", ano: 2023 }),
  veiculo({ id: "10", marca: "Honda", modelo: "HR-V", ano: 2016 }),
];

/**
 * Medição de produção de 16/09: `/estoque` tem 46 carros em 15 anos-modelo
 * distintos, e o `.slice(0, 8)` que o painel usava para TODO grupo escondia
 * 2014 para trás — os carros mais em conta, que é o que a pessoa mais busca
 * por ano. A lista abaixo é a mesma sequência medida (já decrescente).
 */
const ANOS_MEDIDOS_EM_PRODUCAO = [
  2025, 2024, 2023, 2022, 2021, 2020, 2018, 2016, 2015, 2014, 2013, 2012, 2010, 2009, 1976,
];

/**
 * 15 carros, cada um com ano E marca distintos. Serve aos dois cenários do
 * ajuste: prova que ANO (sem corte) mostra os 15, e — no MESMO estoque —
 * que MARCA (corte em 8) continua mostrando só 8, o controle de que o
 * limite dos outros grupos não mudou.
 */
const MARCAS_DISTINTAS = [
  "Fiat",
  "Chevrolet",
  "Toyota",
  "Honda",
  "Volkswagen",
  "Ford",
  "Hyundai",
  "Renault",
  "Nissan",
  "Jeep",
  "Peugeot",
  "Citroen",
  "Kia",
  "Mitsubishi",
  "BMW",
];
const ESTOQUE_MUITOS_ANOS: Veiculo[] = ANOS_MEDIDOS_EM_PRODUCAO.map((ano, i) =>
  veiculo({ id: `m${i}`, ano, marca: MARCAS_DISTINTAS[i], modelo: `Modelo ${i}` }),
);

let container: HTMLDivElement;
let root: Root;

async function montar(query = "", estoque: Veiculo[] = ESTOQUE) {
  queryAtual.valor = new URLSearchParams(query);
  const { default: Catalogo } = await import("../src/components/modernist/Catalogo");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(Catalogo, {
        estoque,
        quickTags: [],
        stockOverrides: {},
      }),
    );
  });
}

/** O `<fieldset>` de um grupo do painel, pelo texto do `<legend>`. */
function grupo(titulo: string): HTMLFieldSetElement {
  const legenda = [...container.querySelectorAll("legend")].find(
    (l) => (l.textContent ?? "").trim() === titulo,
  );
  expect(legenda, `o painel precisa ter o grupo ${titulo}`).toBeDefined();
  return legenda!.closest("fieldset") as HTMLFieldSetElement;
}

/** As opções renderizadas dentro de um grupo: rótulo, contagem, marcado e o input. */
function opcoesDoGrupo(fieldset: HTMLFieldSetElement) {
  return [...fieldset.querySelectorAll("label")].map((label) => {
    const spans = label.querySelectorAll("span");
    const input = label.querySelector("input") as HTMLInputElement;
    return {
      rotulo: (spans[1]?.textContent ?? "").trim(),
      total: (spans[2]?.textContent ?? "").trim(),
      marcado: input.checked,
      input,
    };
  });
}

function checkboxDoGrupo(fieldset: HTMLFieldSetElement, rotulo: string): HTMLInputElement {
  const opcao = opcoesDoGrupo(fieldset).find((o) => o.rotulo === rotulo);
  expect(opcao, `a opção "${rotulo}" precisa existir no grupo`).toBeDefined();
  return opcao!.input;
}

/** A contagem total do topo — `<span className="mt-titulo …">`. */
function totalNaTela(): string | null {
  return container.querySelector(".mt-titulo")?.textContent ?? null;
}

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("o grupo ANO existe no painel do /estoque, logo depois de MARCA", () => {
  it("aparece como fieldset próprio, no mesmo padrão dos outros grupos", async () => {
    await montar();
    expect(() => grupo("ANO")).not.toThrow();
  });

  it("vem imediatamente depois de MARCA na régua de grupos", async () => {
    await montar();
    const legendas = [...container.querySelectorAll("legend")].map((l) => l.textContent?.trim());
    const iMarca = legendas.indexOf("MARCA");
    const iAno = legendas.indexOf("ANO");
    expect(iMarca).toBeGreaterThanOrEqual(0);
    expect(iAno).toBe(iMarca + 1);
  });
});

describe("as opções vêm ordenadas por ano decrescente, com contagem real", () => {
  it("a ordem é NUMÉRICA — não a popularidade do carro nem o texto do ano", async () => {
    await montar();
    const opcoes = opcoesDoGrupo(grupo("ANO"));
    // Mata tanto "esqueceu de reordenar" (ordem viraria 2021, 2023, … por
    // contagem) quanto "ordenou ao contrário" ou "não ordenou": só a ordem
    // numérica decrescente passa nesta lista exata.
    expect(opcoes.map((o) => o.rotulo)).toEqual([
      "2023",
      "2022",
      "2021",
      "2020",
      "2019",
      "2018",
      "2016",
    ]);
  });

  it("a contagem ao lado de cada ano bate com o estoque", async () => {
    await montar();
    const opcoes = opcoesDoGrupo(grupo("ANO"));
    const porAno = Object.fromEntries(opcoes.map((o) => [o.rotulo, o.total]));
    expect(porAno).toEqual({
      "2023": "2",
      "2022": "1",
      "2021": "3",
      "2020": "1",
      "2019": "1",
      "2018": "1",
      "2016": "1",
    });
  });

  it("a contagem respeita os outros filtros marcados — a mesma régua de MARCA e CÂMBIO", async () => {
    await montar();
    // Marca FIAT: dos 10 carros, só 3 são Fiat (dois 2021 e um 2019) — o
    // resto do estoque precisa sumir da contagem de ANO sem a gente marcar
    // nada no próprio grupo ANO.
    await act(async () => {
      checkboxDoGrupo(grupo("MARCA"), "Fiat").click();
    });

    const opcoes = opcoesDoGrupo(grupo("ANO"));
    expect(opcoes.map((o) => ({ rotulo: o.rotulo, total: o.total }))).toEqual([
      { rotulo: "2021", total: "2" },
      { rotulo: "2019", total: "1" },
    ]);
  });
});

describe("ANO não corta em 8 — só os outros grupos continuam cortados", () => {
  it("com 15 anos distintos (a medição real de produção), o grupo ANO mostra os 15, em ordem decrescente", async () => {
    await montar("", ESTOQUE_MUITOS_ANOS);
    const opcoes = opcoesDoGrupo(grupo("ANO"));
    expect(opcoes.map((o) => o.rotulo)).toEqual(
      [...ANOS_MEDIDOS_EM_PRODUCAO].sort((a, b) => b - a).map(String),
    );
  });

  it("MARCA, no MESMO estoque de 15, continua cortada em 8 — o limite dos outros grupos não mudou", async () => {
    await montar("", ESTOQUE_MUITOS_ANOS);
    expect(opcoesDoGrupo(grupo("MARCA"))).toHaveLength(8);
  });
});

describe("o ?ano= que a home manda nasce marcado, e desmarcar funciona", () => {
  it("o ano da URL chega com a caixa certa marcada — e só ela", async () => {
    await montar("ano=2021");
    const opcoes = opcoesDoGrupo(grupo("ANO"));
    expect(opcoes.filter((o) => o.marcado).map((o) => o.rotulo)).toEqual(["2021"]);
  });

  it("o filtro que antes era invisível agora filtra a vitrine de verdade", async () => {
    await montar("ano=2021");
    // 3 carros são de 2021: os dois Fiat Argo e o Chevrolet Onix.
    expect(totalNaTela()).toBe("3");
  });

  it("desmarcar a caixa no GRUPO limpa o filtro e devolve o estoque inteiro", async () => {
    await montar("ano=2021");
    expect(checkboxDoGrupo(grupo("ANO"), "2021").checked).toBe(true);

    await act(async () => {
      checkboxDoGrupo(grupo("ANO"), "2021").click();
    });

    expect(checkboxDoGrupo(grupo("ANO"), "2021").checked).toBe(false);
    expect(totalNaTela()).toBe("10");
  });

  it("o CHIP do ano também limpa — o segundo caminho de desmarcar", async () => {
    await montar("ano=2021");
    const chip = [...container.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim() === "2021",
    );
    expect(chip, "precisa existir um chip só com o texto 2021").toBeDefined();

    await act(async () => {
      (chip as HTMLButtonElement).click();
    });

    expect(checkboxDoGrupo(grupo("ANO"), "2021").checked).toBe(false);
    expect(totalNaTela()).toBe("10");
  });
});
