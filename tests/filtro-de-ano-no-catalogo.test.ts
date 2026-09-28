// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Veiculo } from "../src/types";

/**
 * O filtro de ANO no `/estoque`.
 *
 * Histórico:
 *
 * - 16/09: o dono pediu "o filtro de ano de fabricação aqui também, não apenas
 *   na primeira página", e depois "ano-modelo, igual à home". O `?ano=` da home
 *   já filtrava, mas não havia grupo no painel para mostrar nem desmarcar — a
 *   vitrine saía recortada sem a pessoa saber por quê (regra 6 do CLAUDE.md,
 *   "vitrine ordena, nunca esconde"). Entrou como caixas, em ordem numérica
 *   decrescente e sem o corte em 8 dos outros grupos.
 *
 * - 28/09: com 12 anos-modelo no ar, as caixas viraram a parte mais comprida
 *   do painel, e o dono pediu ano em lista, com faixa, "para diminuir espaço e
 *   otimizar o menu". Agora são duas listas, DE e ATÉ. Calendário ficou de
 *   fora: ele escolhe dia, e aqui se escolhe ano — no celular, a lista abre a
 *   roleta do próprio aparelho.
 *
 * O que continua valendo de 16/09, e este arquivo prova executando o
 * componente:
 *   1. o grupo ANO existe, logo depois de MARCA;
 *   2. os anos vêm em ordem NUMÉRICA decrescente, todos, sem corte;
 *   3. a contagem ao lado de cada ano respeita os outros filtros;
 *   4. o `?ano=` da home chega marcado, e o chip desfaz.
 *
 * O filtro é por `ano`, o ano-MODELO — o plano do ano de fabricação
 * (`docs/superpowers/plans/2026-09-21-ano-de-fabricacao.md`) manda não mexer
 * nesta régua sem ordem: quem busca "2025" espera o modelo.
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
 * Sete anos distintos, fora da ordem alfabética E da ordem de popularidade:
 * 2021 é o mais comum (3 carros) mas não é o mais novo. É o que faz um sort
 * errado — por contagem ou por texto — devolver uma sequência diferente da
 * numérica decrescente.
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

/** A sequência medida em produção em 16/09 — 15 anos-modelo distintos. */
const ANOS_MEDIDOS_EM_PRODUCAO = [
  2025, 2024, 2023, 2022, 2021, 2020, 2018, 2016, 2015, 2014, 2013, 2012, 2010, 2009, 1976,
];
const ESTOQUE_MUITOS_ANOS: Veiculo[] = ANOS_MEDIDOS_EM_PRODUCAO.map((ano, i) =>
  veiculo({ id: `m${i}`, ano, marca: `Marca ${i}`, modelo: `Modelo ${i}` }),
);

let container: HTMLDivElement;
let root: Root;

async function montar(query = "", estoque: Veiculo[] = ESTOQUE) {
  queryAtual.valor = new URLSearchParams(query);
  window.history.replaceState(null, "", query ? `/estoque?${query}` : "/estoque");
  const { default: Catalogo } = await import("../src/components/modernist/Catalogo");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(Catalogo, { estoque, quickTags: [], stockOverrides: {} }));
  });
}

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.history.replaceState(null, "", "/");
});

/** A lista pelo rótulo que o leitor de tela ouve. */
function lista(nome: "Ano mínimo" | "Ano máximo"): HTMLSelectElement {
  const rotulo = [...container.querySelectorAll("label")].find(
    (l) => l.querySelector(".sr-only")?.textContent === nome,
  );
  const select = rotulo?.querySelector("select");
  expect(select, `o painel precisa ter a lista "${nome}"`).toBeTruthy();
  return select as HTMLSelectElement;
}

/** Os anos oferecidos, sem a opção vazia do começo ("Mais antigo" / "Mais novo"). */
function anosDaLista(select: HTMLSelectElement): string[] {
  return [...select.options].filter((o) => o.value !== "").map((o) => o.textContent ?? "");
}

async function escolher(select: HTMLSelectElement, valor: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
    setter.call(select, valor);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function totalNaTela(): string | null {
  return container.querySelector(".mt-titulo")?.textContent ?? null;
}

describe("o grupo ANO existe no painel, logo depois de MARCA", () => {
  it("vem imediatamente depois de MARCA na régua de grupos", async () => {
    await montar();
    const legendas = [...container.querySelectorAll("legend")].map((l) => l.textContent?.trim());
    expect(legendas.indexOf("ANO")).toBe(legendas.indexOf("MARCA") + 1);
  });

  it("são duas listas, DE e ATÉ — não uma coluna de caixas", async () => {
    await montar();
    const legenda = [...container.querySelectorAll("legend")].find((l) => l.textContent?.trim() === "ANO")!;
    const grupo = legenda.closest("fieldset")!;
    expect(grupo.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(grupo.querySelectorAll("select")).toHaveLength(2);
  });

  it("a opção vazia de cada lista diz o que ela significa", async () => {
    await montar();
    expect(lista("Ano mínimo").options[0].textContent).toBe("Mais antigo");
    expect(lista("Ano máximo").options[0].textContent).toBe("Mais novo");
  });
});

describe("os anos vêm em ordem numérica decrescente, com contagem real", () => {
  it("a ordem é NUMÉRICA — não a popularidade nem o texto", async () => {
    await montar();
    const esperado = ["2023 (2)", "2022 (1)", "2021 (3)", "2020 (1)", "2019 (1)", "2018 (1)", "2016 (1)"];
    expect(anosDaLista(lista("Ano mínimo"))).toEqual(esperado);
    expect(anosDaLista(lista("Ano máximo"))).toEqual(esperado);
  });

  it("a contagem respeita os outros filtros marcados", async () => {
    await montar();
    const fiat = [...container.querySelectorAll("label")].find((l) =>
      /^Fiat/.test((l.textContent ?? "").trim()),
    )!;
    await act(async () => fiat.querySelector("input")!.click());
    expect(anosDaLista(lista("Ano mínimo"))).toEqual(["2021 (2)", "2019 (1)"]);
  });

  it("com os 15 anos medidos em produção, a lista traz os 15 — sem corte", async () => {
    await montar("", ESTOQUE_MUITOS_ANOS);
    expect(anosDaLista(lista("Ano mínimo")).map((t) => t.slice(0, 4))).toEqual(
      ANOS_MEDIDOS_EM_PRODUCAO.map(String),
    );
  });
});

describe("escolher a faixa filtra a vitrine", () => {
  it("DE 2021 deixa só 2021 para cima", async () => {
    await montar();
    await escolher(lista("Ano mínimo"), "2021");
    expect(totalNaTela()).toBe("6");
  });

  it("DE 2019 ATÉ 2021", async () => {
    await montar();
    await escolher(lista("Ano mínimo"), "2019");
    await escolher(lista("Ano máximo"), "2021");
    expect(totalNaTela()).toBe("5");
  });

  it("DE maior que ATÉ troca as pontas, em vez de zerar a vitrine", async () => {
    await montar();
    await escolher(lista("Ano máximo"), "2019");
    await escolher(lista("Ano mínimo"), "2021");
    expect(totalNaTela()).toBe("5");
    expect(lista("Ano mínimo").value).toBe("2019");
    expect(lista("Ano máximo").value).toBe("2021");
  });

  it("voltar a lista para a opção vazia tira aquela ponta", async () => {
    await montar("anoMin=2021");
    await escolher(lista("Ano mínimo"), "");
    expect(totalNaTela()).toBe("10");
  });
});

describe("o ?ano= que a home manda chega marcado, e o chip desfaz", () => {
  it("as duas listas nascem no ano da URL", async () => {
    await montar("ano=2021");
    expect(lista("Ano mínimo").value).toBe("2021");
    expect(lista("Ano máximo").value).toBe("2021");
    expect(totalNaTela()).toBe("3");
  });

  it("o chip diz só \"2021\", e clicar nele devolve o estoque inteiro", async () => {
    await montar("ano=2021");
    const chip = [...container.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim() === "2021",
    );
    expect(chip, "precisa existir um chip só com o texto 2021").toBeDefined();
    await act(async () => (chip as HTMLButtonElement).click());
    expect(lista("Ano mínimo").value).toBe("");
    expect(lista("Ano máximo").value).toBe("");
    expect(totalNaTela()).toBe("10");
  });

  it("ano da URL que não está no estoque continua na lista, para a pessoa ver o que filtrou", async () => {
    await montar("ano=1999");
    expect(lista("Ano mínimo").value).toBe("1999");
    expect(totalNaTela()).toBe("0");
  });
});
