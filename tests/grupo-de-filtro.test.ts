// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Veiculo } from "../src/types";
import { ler, lerCodigo } from "./fonte";

/**
 * O rótulo de cada grupo do filtro fica junto do conteúdo que ele nomeia.
 *
 * Revisão de UI de 29/09/2026, medida no navegador em produção: nos nove grupos
 * do `/estoque`, o `<legend>` ficava a 0px da régua do grupo de CIMA e a 32px
 * das próprias opções. "OPCIONAIS" era lido como rodapé de "COMBUSTÍVEL", e
 * "PREÇO" como legenda da caixa de opcionais.
 *
 * A causa é uma regra do HTML: o legend de um fieldset é desenhado em cima da
 * borda superior e ignora o `padding-top`. O `pt-5` que os quatro arquivos
 * usavam empurrava só o conteúdo. A correção é a classe `.mt-grupo`
 * (modernist.css), com o legend flutuado — e ela só funciona se ninguém voltar
 * a pôr classe de espaçamento no legend nem no fieldset.
 *
 * O jsdom não calcula layout, então a medida em pixels não é testável aqui. O
 * que se trava é a estrutura que produz a medida: a classe no CSS e o uso dela
 * em todo grupo.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ARQUIVOS_COM_GRUPO = [
  "src/components/modernist/Catalogo.tsx",
  "src/components/modernist/CampoDeOpcionais.tsx",
  "src/components/modernist/FaixaComCaixas.tsx",
];

describe(".mt-grupo existe e faz o legend respeitar o espaçamento", () => {
  const css = lerCodigo("src/app/modernist.css");

  it("o legend é flutuado e ocupa a linha inteira", () => {
    const regra = css.match(/\.mt-grupo > legend \{([^}]*)\}/)?.[1] ?? "";
    expect(regra).toMatch(/float:\s*left/);
    expect(regra).toMatch(/width:\s*100%/);
  });

  it("o conteúdo depois do legend volta para baixo dele", () => {
    expect(css).toMatch(/\.mt-grupo > legend \+ \* \{\s*clear:\s*both;?\s*\}/);
  });

  it("o fieldset tem o espaço em cima (é ele que afasta o rótulo da régua de cima)", () => {
    const regra = css.match(/\.mt-grupo \{([^}]*)\}/)?.[1] ?? "";
    expect(regra).toMatch(/padding:\s*22px 0 20px/);
  });

  it("vive dentro de @layer components, como o resto das classes do sistema", () => {
    // `ler`, e não `lerCodigo`: o marcador do fim da camada é um comentário.
    const css = ler("src/app/modernist.css");
    const inicio = css.indexOf("@layer components {");
    const fim = css.indexOf("} /* fim de @layer components */");
    const posicao = css.indexOf(".mt-grupo {");
    expect(posicao).toBeGreaterThan(inicio);
    expect(posicao).toBeLessThan(fim);
  });
});

describe("todo grupo do painel usa .mt-grupo, sem espaçamento próprio", () => {
  it.each(ARQUIVOS_COM_GRUPO)("%s", (arquivo) => {
    const codigo = lerCodigo(arquivo);
    const fieldsets = [...codigo.matchAll(/<fieldset([^>]*)>/g)].map((m) => m[1]);
    expect(fieldsets.length).toBeGreaterThan(0);
    for (const atributos of fieldsets) expect(atributos).toMatch(/className="mt-grupo"/);
    // Legend com classe é o defeito voltando: o espaçamento dele é o da `.mt-grupo`.
    expect(codigo).not.toMatch(/<legend\s+className=/);
  });
});

// ---------------------------------------------------------------------------
// A contagem de marcados no rótulo, montada de verdade.
// ---------------------------------------------------------------------------

const queryAtual = { valor: new URLSearchParams() };
vi.mock("next/navigation", () => ({ useSearchParams: () => queryAtual.valor }));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _f, sizes: _s, priority: _p, unoptimized: _u, ...resto } = props;
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

const ESTOQUE: Veiculo[] = [
  veiculo({ id: "1", combustivel: "Flex", marca: "Fiat" }),
  veiculo({ id: "2", combustivel: "Gasolina", marca: "Ford" }),
  veiculo({ id: "3", combustivel: "Diesel", marca: "Toyota" }),
];

let container: HTMLDivElement | undefined;
let root: Root | undefined;

async function montar(query = "") {
  queryAtual.valor = new URLSearchParams(query);
  window.history.replaceState(null, "", query ? `/estoque?${query}` : "/estoque");
  const { default: Catalogo } = await import("../src/components/modernist/Catalogo");
  const alvo = document.createElement("div");
  document.body.appendChild(alvo);
  container = alvo;
  const raiz = createRoot(alvo);
  root = raiz;
  await act(async () => {
    raiz.render(createElement(Catalogo, { estoque: ESTOQUE, quickTags: [], stockOverrides: {} }));
  });
}

afterEach(async () => {
  // Os testes de fonte, acima, não montam nada.
  if (!root || !container) return;
  const raiz = root;
  await act(async () => raiz.unmount());
  container.remove();
  root = undefined;
  container = undefined;
  window.history.replaceState(null, "", "/");
});

function tela(): HTMLDivElement {
  expect(container, "montar() antes").toBeTruthy();
  return container!;
}

function grupo(titulo: string): HTMLFieldSetElement {
  const legenda = [...tela().querySelectorAll("legend")].find(
    (l) => l.querySelector("span")?.textContent?.trim() === titulo || l.textContent?.trim() === titulo,
  );
  expect(legenda, `precisa existir o grupo ${titulo}`).toBeTruthy();
  return legenda!.closest("fieldset")!;
}

function caixa(rotulo: string): HTMLInputElement {
  const label = [...tela().querySelectorAll("label")].find((l) =>
    [...l.querySelectorAll("span")].some((s) => s.textContent?.trim() === rotulo),
  );
  return label!.querySelector('input[type="checkbox"]') as HTMLInputElement;
}

describe("o rótulo do grupo mostra quantas opções estão marcadas", () => {
  it("sem nada marcado, não há número", async () => {
    await montar();
    expect(grupo("COMBUSTÍVEL").querySelector(".mt-grupo-conta")).toBeNull();
  });

  it("marcar duas opções mostra 2, e desmarcar volta a esconder", async () => {
    await montar();
    await act(async () => caixa("Flex").click());
    await act(async () => caixa("Diesel").click());
    expect(grupo("COMBUSTÍVEL").querySelector(".mt-grupo-conta")?.textContent).toBe("2");

    await act(async () => caixa("Flex").click());
    await act(async () => caixa("Diesel").click());
    expect(grupo("COMBUSTÍVEL").querySelector(".mt-grupo-conta")).toBeNull();
  });

  it("o número é só visual: o leitor de tela já ouve cada caixa marcada", async () => {
    await montar();
    await act(async () => caixa("Flex").click());
    expect(grupo("COMBUSTÍVEL").querySelector(".mt-grupo-conta")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });
});
