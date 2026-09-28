// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import TabelaDeEstoque from "../src/components/admin/TabelaDeEstoque";
import { anoFabricacaoModelo, type LinhaDeEstoque } from "../src/lib/estoqueTabela";

/**
 * Placa e ano de fabricação/modelo na tabela de `/admin/estoque` — pedido do
 * dono em 28/09/2026: "é informação que usamos para fazer simulação de
 * financiamentos". A financeira pede os dois anos e a placa; a tabela mostrava
 * só o ano do modelo, e a placa só servia à busca, sem aparecer na linha.
 *
 * Decisão do dono na mesma conversa: SEMPRE os dois anos, "2016/2016" inclusive
 * quando são iguais — ver os dois confirma que a fabricação foi cadastrada.
 *
 * A regra de não inventar vem do plano do ano de fabricação
 * (`docs/superpowers/plans/2026-09-21-ano-de-fabricacao.md`): o feed grava `0`
 * quando a origem vem vazia, e `0` que vaza para a tela vira "0/2025".
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("o par fabricação/modelo", () => {
  it("anos diferentes: fabricação antes, modelo depois", () => {
    expect(anoFabricacaoModelo(2015, 2016)).toBe("2015/2016");
  });

  it("anos iguais aparecem os dois — decisão do dono", () => {
    expect(anoFabricacaoModelo(2016, 2016)).toBe("2016/2016");
  });

  it("sem fabricação cadastrada, só o modelo — nunca repetir o modelo para preencher", () => {
    expect(anoFabricacaoModelo(null, 2016)).toBe("2016");
    expect(anoFabricacaoModelo(undefined, 2016)).toBe("2016");
  });

  it("o `0` do feed não vaza como ano", () => {
    expect(anoFabricacaoModelo(0, 2025)).toBe("2025");
  });

  it("sem ano nenhum, travessão", () => {
    expect(anoFabricacaoModelo(null, null)).toBe("—");
  });
});

const linha = (id: string, over: Partial<LinhaDeEstoque> = {}): LinhaDeEstoque =>
  ({
    id,
    marca: "Nissan",
    modelo: "March",
    versao: "1.6 Rio",
    placa: "",
    tipo: "Hatch",
    ano: 2016,
    anoFabricacao: null,
    quilometragem: 99562,
    preco: 47900,
    estado: "publicado",
    estadoCadastro: "publicado",
    vendido: false,
    fotos: 15,
    leads: 0,
    visitas: 0,
    diasEmEstoque: 30,
    diasForaDoFeed: null,
    destacado: false,
    naSemana: false,
    naTv: false,
    bloqueios: [],
    quickTags: [],
    perfisUso: [],
    divergente: false,
    foto: "",
    ...over,
  }) as unknown as LinhaDeEstoque;

const props = (linhas: LinhaDeEstoque[]): Parameters<typeof TabelaDeEstoque>[0] =>
  ({
    linhas,
    quickTagsDisponiveis: [],
    destacadosIniciais: [],
    naSemanaIniciais: [],
    naTvIniciais: [],
    overridesIniciais: {},
    visitasDisponiveis: true,
    podeCriar: true,
    podePublicar: true,
    migracaoDoEstadoPendente: false,
  }) as unknown as Parameters<typeof TabelaDeEstoque>[0];

let container: HTMLDivElement;
let root: Root;

async function montar(linhas: LinhaDeEstoque[]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(TabelaDeEstoque, props(linhas)));
  });
}

/** As células da linha de um veículo, achada pelo código na coluna própria. */
function celulasDaLinha(id: string): string[] {
  const tr = [...container.querySelectorAll("tbody tr")].find((l) =>
    [...l.querySelectorAll("td")].some((td) => (td.textContent ?? "").trim().startsWith(id)),
  );
  expect(tr, `a tabela precisa desenhar a linha do veículo ${id}`).toBeDefined();
  // Cada pedaço da célula separado por espaço: a placa e a quilometragem
  // descem de linha por `block`, e o `textContent` cru as colaria no número de
  // cima ("8203724ABC1D23") — o jsdom não desenha quebra de bloco.
  return [...tr!.querySelectorAll("td")].map((td) =>
    [...td.childNodes]
      .map((n) => (n.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" "),
  );
}

function cabecalhos(): string[] {
  return [...container.querySelectorAll("thead th")].map((th) => (th.textContent ?? "").trim());
}

describe("a linha da tabela mostra a placa e os dois anos", () => {
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("a placa aparece na coluna do código, logo abaixo dele", async () => {
    await montar([linha("8203724", { placa: "ABC1D23" })]);
    expect(celulasDaLinha("8203724")).toContain("8203724 ABC1D23");
  });

  it("placa gravada em minúscula sai em maiúscula, como no documento do carro", async () => {
    await montar([linha("8203724", { placa: "abc1d23" })]);
    expect(celulasDaLinha("8203724")).toContain("8203724 ABC1D23");
  });

  it("carro sem placa mostra travessão, e não uma célula que parece quebrada", async () => {
    await montar([linha("8006476", { placa: "" })]);
    expect(celulasDaLinha("8006476")).toContain("8006476 —");
  });

  it("o ano vem como fabricação/modelo, com a quilometragem embaixo", async () => {
    await montar([linha("8203724", { ano: 2016, anoFabricacao: 2015 })]);
    expect(celulasDaLinha("8203724")).toContain("2015/2016 99.562 km");
  });

  it("sem fabricação cadastrada, só o modelo", async () => {
    await montar([linha("8203724", { ano: 2016, anoFabricacao: null })]);
    const celulas = celulasDaLinha("8203724");
    expect(celulas).toContain("2016 99.562 km");
    expect(celulas.join("|")).not.toMatch(/\d{4}\/2016/);
  });

  it("os cabeçalhos dizem o que a coluna passou a ter", async () => {
    await montar([linha("8203724")]);
    expect(cabecalhos()).toEqual(expect.arrayContaining(["Código · placa", "Ano fab/mod · KM"]));
  });
});
