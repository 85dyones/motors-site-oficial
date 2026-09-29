// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Veiculo } from "../src/types";
import { formatarPreco } from "../src/components/modernist/primitivos";

/**
 * O painel de filtro do `/estoque`, montado de verdade — pedido do dono em
 * 28/09/2026.
 *
 * Cada `describe` abaixo reprova no painel que estava no ar naquele dia:
 *
 *   - PREÇO só tinha teto, numa régua fixa de R$ 50 mil a R$ 1 milhão, e
 *     nenhuma caixa para digitar. "Até R$ 30 mil" não existia.
 *   - QUILOMETRAGEM não existia.
 *   - OPCIONAIS não existia, e a busca do topo era o único caminho — sem que
 *     ninguém soubesse.
 *   - MARCA cortava em 8 sem "ver mais": 6 das 14 marcas no ar não tinham
 *     caixa.
 *   - O filtro vivia só no estado do componente: abrir uma ficha e voltar
 *     devolvia o estoque inteiro.
 *
 * O ANO em lista tem arquivo próprio, `filtro-de-ano-no-catalogo.test.ts`.
 *
 * `next/image` e `next/link` são dublês, como lá: quem este arquivo examina é o
 * painel, não a foto nem a navegação do card.
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

function veiculo(parcial: Partial<Veiculo> & { id: string }): Veiculo {
  return {
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
    pericia: "aprovada",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
    tipo: "Hatch",
    ...parcial,
  } as Veiculo;
}

/** Preço e KM nas duas pontas do que estava no ar em 28/09. */
const ESTOQUE: Veiculo[] = [
  veiculo({
    id: "1",
    preco_original: 26900,
    quilometragem: 14600,
    opcionais: "Ar-condicionado, Teto solar, Câmera de ré",
  }),
  veiculo({ id: "2", preco_original: 45000, quilometragem: 50000, opcionais: "Ar-condicionado, Teto solar" }),
  veiculo({ id: "3", preco_original: 70000, quilometragem: 120000, opcionais: "Ar-condicionado, Ar quente" }),
  veiculo({ id: "4", preco_original: 318900, quilometragem: 269766, opcionais: "" }),
];

const MARCAS = [
  "Fiat", "Chevrolet", "Toyota", "Honda", "Volkswagen", "Ford", "Hyundai", "Renault",
  "Nissan", "Jeep", "Peugeot", "Citroen", "Kia", "Mitsubishi", "BMW",
];
/** Uma marca por carro, e a Fiat com dois: 15 marcas, a mais comum primeiro. */
const ESTOQUE_DE_MARCAS: Veiculo[] = [
  ...MARCAS.map((marca, i) => veiculo({ id: `m${i}`, marca })),
  veiculo({ id: "m-extra", marca: "Fiat" }),
];

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

function totalNaTela(): string | null {
  return container.querySelector(".mt-titulo")?.textContent ?? null;
}

/** O controle pelo nome que um leitor de tela ouve: `aria-label` ou `<label>` que o embrulha. */
function controle<T extends HTMLElement = HTMLInputElement>(nome: string): T {
  const porAria = container.querySelector(`[aria-label="${nome}"]`);
  if (porAria) return porAria as T;
  const rotulo = [...container.querySelectorAll("label")].find(
    (l) => (l.textContent ?? "").trim() === nome || l.querySelector(".sr-only")?.textContent === nome,
  );
  // O rótulo aponta pelo `for` (como o da busca do topo) ou embrulha o campo.
  const campo = rotulo?.htmlFor
    ? container.querySelector(`#${rotulo.htmlFor}`)
    : rotulo?.querySelector("input, select");
  expect(campo, `o painel precisa ter um controle chamado "${nome}"`).toBeTruthy();
  return campo as T;
}

function botao(texto: RegExp): HTMLButtonElement {
  const achado = [...container.querySelectorAll("button")].find((b) =>
    texto.test((b.textContent ?? "").trim()),
  );
  expect(achado, `precisa existir um botão ${texto}`).toBeDefined();
  return achado as HTMLButtonElement;
}

function chips(): string[] {
  return [...container.querySelectorAll('button[aria-label^="Remover filtro"]')].map((b) =>
    (b.textContent ?? "").trim(),
  );
}

/** Troca o valor de um campo controlado pelo React, do jeito que o navegador faz. */
async function digitar(campo: HTMLInputElement, valor: string) {
  await act(async () => {
    campo.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(campo, valor);
    campo.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function sair(campo: HTMLElement) {
  await act(async () => campo.blur());
}

async function tecla(campo: HTMLElement, key: string) {
  await act(async () => {
    campo.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

describe("PREÇO: régua de duas pontas, com caixas para digitar embaixo", () => {
  it("a régua começa e termina no estoque, não em R$ 50 mil e R$ 1 milhão", async () => {
    await montar();
    const minimo = controle("Preço mínimo");
    const maximo = controle("Preço máximo");
    expect(minimo.type).toBe("range");
    expect(maximo.type).toBe("range");
    expect([minimo.min, minimo.max]).toEqual(["25000", "320000"]);
    expect([maximo.min, maximo.max]).toEqual(["25000", "320000"]);
  });

  it("digitar o máximo e sair da caixa filtra — \"até R$ 30 mil\" passa a existir", async () => {
    await montar();
    const caixa = controle("Digite o preço máximo");
    await digitar(caixa, "30000");
    // Enquanto digita, nada muda: "3" filtraria a vitrine para zero no meio.
    expect(totalNaTela()).toBe("4");
    await sair(caixa);
    expect(totalNaTela()).toBe("1");
    expect(chips()).toContain(`ATÉ ${formatarPreco(30000)}`);
  });

  it("Enter também confirma, sem tirar o foco da caixa", async () => {
    await montar();
    const caixa = controle("Digite o preço mínimo");
    await digitar(caixa, "40 mil");
    await tecla(caixa, "Enter");
    expect(totalNaTela()).toBe("3");
    expect(document.activeElement).toBe(caixa);
  });

  it("mínimo e máximo juntos viram um chip só, e a régua acompanha a caixa", async () => {
    await montar();
    await digitar(controle("Digite o preço mínimo"), "40000");
    await sair(controle("Digite o preço mínimo"));
    await digitar(controle("Digite o preço máximo"), "80000");
    await sair(controle("Digite o preço máximo"));
    expect(totalNaTela()).toBe("2");
    expect(chips()).toContain(`${formatarPreco(40000)} A ${formatarPreco(80000)}`);
    expect(controle("Preço mínimo").value).toBe("40000");
    expect(controle("Preço máximo").value).toBe("80000");
  });

  it("mínimo digitado maior que o máximo troca as pontas, em vez de zerar a vitrine", async () => {
    await montar();
    await digitar(controle("Digite o preço máximo"), "40000");
    await sair(controle("Digite o preço máximo"));
    await digitar(controle("Digite o preço mínimo"), "80000");
    await sair(controle("Digite o preço mínimo"));
    expect(totalNaTela()).toBe("2");
  });

  it("o ?precoMax= da busca da home continua chegando", async () => {
    await montar("precoMax=50000");
    expect(totalNaTela()).toBe("2");
    expect(controle("Preço máximo").value).toBe("50000");
  });

  it("o chip do preço limpa as duas pontas", async () => {
    await montar("precoMin=40000&precoMax=80000");
    await act(async () => {
      (container.querySelector('button[aria-label^="Remover filtro R$"]') as HTMLButtonElement).click();
    });
    expect(totalNaTela()).toBe("4");
  });
});

describe("QUILOMETRAGEM: a mesma régua, com as mesmas caixas", () => {
  it("existe, com as pontas do estoque", async () => {
    await montar();
    const maximo = controle("Quilometragem máxima");
    expect(maximo.type).toBe("range");
    expect([maximo.min, maximo.max]).toEqual(["10000", "270000"]);
  });

  it("digitar o máximo filtra, e o chip diz o que filtrou", async () => {
    await montar();
    await digitar(controle("Digite a quilometragem máxima"), "60.000");
    await sair(controle("Digite a quilometragem máxima"));
    expect(totalNaTela()).toBe("2");
    expect(chips()).toContain("ATÉ 60.000 KM");
  });
});

describe("OPCIONAIS: uma caixa com sugestões, em vez de 81 caixas de marcar", () => {
  function sugestoes(): string[] {
    return [...container.querySelectorAll('[role="option"]')].map(
      (o) => (o.querySelector("span")?.textContent ?? "").trim(),
    );
  }

  async function escolher(rotulo: string) {
    const opcao = [...container.querySelectorAll('[role="option"]')].find(
      (o) => (o.querySelector("span")?.textContent ?? "").trim() === rotulo,
    );
    expect(opcao, `a lista precisa sugerir "${rotulo}"`).toBeDefined();
    await act(async () => {
      opcao!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
  }

  it("é um combobox de verdade, com rótulo", async () => {
    await montar();
    const campo = controle("Buscar opcional");
    expect(campo.getAttribute("role")).toBe("combobox");
    expect(campo.getAttribute("aria-expanded")).toBe("false");
  });

  it("ao focar, sugere os mais comuns com a contagem", async () => {
    await montar();
    const campo = controle("Buscar opcional");
    await act(async () => campo.focus());
    expect(campo.getAttribute("aria-expanded")).toBe("true");
    expect(sugestoes().slice(0, 2)).toEqual(["Ar-condicionado", "Teto solar"]);
  });

  it("digitar estreita a lista pelo começo da palavra", async () => {
    await montar();
    await digitar(controle("Buscar opcional"), "teto");
    expect(sugestoes()).toEqual(["Teto solar"]);
  });

  it("escolher filtra a vitrine e vira chip", async () => {
    await montar();
    await digitar(controle("Buscar opcional"), "teto");
    await escolher("Teto solar");
    expect(totalNaTela()).toBe("2");
    expect(chips()).toContain("TETO SOLAR");
    // A caixa esvazia para a próxima escolha.
    expect(controle("Buscar opcional").value).toBe("");
  });

  it("dois opcionais: o carro precisa ter os dois", async () => {
    await montar();
    await digitar(controle("Buscar opcional"), "teto");
    await escolher("Teto solar");
    await digitar(controle("Buscar opcional"), "camera");
    await escolher("Câmera de ré");
    expect(totalNaTela()).toBe("1");
  });

  it("pelo teclado: seta para baixo e Enter escolhem", async () => {
    await montar();
    const campo = controle("Buscar opcional");
    await digitar(campo, "ar");
    await tecla(campo, "ArrowDown");
    await tecla(campo, "ArrowDown");
    expect(campo.getAttribute("aria-activedescendant")).toBeTruthy();
    await tecla(campo, "Enter");
    // "ar" sugere Ar-condicionado (3) e Ar quente (1); a segunda seta para em Ar quente.
    expect(totalNaTela()).toBe("1");
  });

  it("remover pelo painel devolve o foco à caixa, e não ao <body>", async () => {
    await montar("opcional=teto solar");
    const remover = container.querySelector(
      'button[aria-label="Remover opcional Teto solar"]',
    ) as HTMLButtonElement;
    expect(remover).toBeTruthy();
    await act(async () => {
      remover.focus();
      remover.click();
    });
    expect(totalNaTela()).toBe("4");
    expect(document.activeElement).toBe(controle("Buscar opcional"));
  });

  it("o câmbio não entra como opcional — já tem grupo próprio", async () => {
    await montar("", [veiculo({ id: "x", opcionais: "Câmbio automático, Airbag" })]);
    await act(async () => controle("Buscar opcional").focus());
    expect(sugestoes()).toEqual(["Airbag"]);
  });
});

describe("MARCA mostra todas — o corte em 8 escondia 6 marcas", () => {
  function marcasNaTela(): string[] {
    const legenda = [...container.querySelectorAll("legend")].find(
      // O primeiro `<span>` é o título; depois dele pode vir a contagem de
      // marcados (`.mt-grupo-conta`), que não faz parte do nome do grupo.
      (l) => (l.querySelector("span")?.textContent ?? l.textContent ?? "").trim() === "MARCA",
    );
    const grupo = legenda!.closest("fieldset")!;
    return [...grupo.querySelectorAll("label")].map((l) => (l.querySelectorAll("span")[1]?.textContent ?? "").trim());
  }

  it("com 15 marcas, mostra 8 e um botão para as outras", async () => {
    await montar("", ESTOQUE_DE_MARCAS);
    expect(marcasNaTela()).toHaveLength(8);
    const ver = botao(/^VER TODAS \(15\)$/);
    expect(ver.getAttribute("aria-expanded")).toBe("false");
  });

  it("o botão abre as 15, e fecha de volta", async () => {
    await montar("", ESTOQUE_DE_MARCAS);
    await act(async () => botao(/^VER TODAS \(15\)$/).click());
    expect(marcasNaTela()).toHaveLength(15);
    expect(botao(/^VER MENOS$/).getAttribute("aria-expanded")).toBe("true");
    await act(async () => botao(/^VER MENOS$/).click());
    expect(marcasNaTela()).toHaveLength(8);
  });

  it("marca marcada fora das 8 primeiras continua à vista, com a lista fechada", async () => {
    await montar("marca=Mitsubishi", ESTOQUE_DE_MARCAS);
    expect(marcasNaTela()).toContain("Mitsubishi");
  });
});

describe("o filtro mora no endereço — voltar da ficha devolve o que a pessoa marcou", () => {
  it("marcar uma caixa escreve no endereço, sem criar entrada nova no histórico", async () => {
    await montar();
    const antes = window.history.length;
    const fiat = [...container.querySelectorAll("label")].find((l) =>
      /^Fiat/.test((l.textContent ?? "").trim()),
    )!;
    await act(async () => fiat.querySelector("input")!.click());
    expect(new URLSearchParams(window.location.search).getAll("marca")).toEqual(["Fiat"]);
    expect(window.location.pathname).toBe("/estoque");
    expect(window.history.length).toBe(antes);
  });

  it("preço digitado e opcional escolhido também vão para o endereço", async () => {
    await montar();
    await digitar(controle("Digite o preço máximo"), "80000");
    await sair(controle("Digite o preço máximo"));
    await digitar(controle("Buscar opcional"), "teto");
    await act(async () => {
      container.querySelector('[role="option"]')!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    const params = new URLSearchParams(window.location.search);
    expect(params.get("precoMax")).toBe("80000");
    expect(params.getAll("opcional")).toEqual(["teto solar"]);
  });

  it("o endereço que ficou para trás monta o mesmo filtro — é o que o voltar abre", async () => {
    await montar("precoMax=80000&opcional=teto solar&kmMax=40000");
    expect(totalNaTela()).toBe("1");
    expect(chips()).toEqual(expect.arrayContaining(["TETO SOLAR", `ATÉ ${formatarPreco(80000)}`]));
  });

  it("a UTM e o fbclid de quem chega pelo anúncio continuam no endereço", async () => {
    // O `IntegrationsTracker` lê os dois do `location.search` depois da
    // hidratação: apagá-los aqui era perder a atribuição do anúncio.
    await montar("utm_source=meta&fbclid=abc&marca=Fiat");
    const fiat = [...container.querySelectorAll("label")].find((l) =>
      /^Fiat/.test((l.textContent ?? "").trim()),
    )!;
    await act(async () => fiat.querySelector("input")!.click());
    const params = new URLSearchParams(window.location.search);
    expect(params.get("utm_source")).toBe("meta");
    expect(params.get("fbclid")).toBe("abc");
    expect(params.getAll("marca")).toEqual([]);
  });

  it("limpar tudo limpa o endereço também", async () => {
    await montar("marca=Fiat&precoMax=80000");
    await act(async () => botao(/^LIMPAR \(\d+\)$/).click());
    expect(window.location.search).toBe("");
  });
});
