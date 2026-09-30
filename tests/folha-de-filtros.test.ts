// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Veiculo } from "../src/types";
import { ler } from "./fonte";

/**
 * Os filtros do celular numa folha que sobe de baixo — tarefa 3.5 da revisão
 * de UI de 29/09/2026.
 *
 * Até ali o painel abria no meio da página e empurrava a grade para baixo: o
 * cliente marcava um filtro, rolava de volta, e o "VER N VEÍCULOS" só
 * aparecia no fim de uma coluna comprida. Pronto quando (plano de ação): foco
 * preso na folha, Esc fecha, o foco volta ao botão que abriu.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const midia = vi.hoisted(() => ({
  celular: true,
  ouvintes: [] as ((e: { matches: boolean }) => void)[],
  consultas: [] as string[],
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _f, sizes: _s, priority: _p, unoptimized: _u, fetchPriority: _fp, loader: _l, ...resto } = props;
    return createElement("img", resto as never);
  },
}));
vi.mock("next/link", () => ({
  // O card desenha `SinalDeAbertura`, que lê o estado do link.
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

function veiculo(id: string, marca: string): Veiculo {
  return {
    id,
    marca,
    modelo: "Modelo",
    versao: "1.0",
    ano: 2021,
    quilometragem: 30000,
    cambio: "Manual",
    combustivel: "Flex",
    cor: "Branco",
    fipe: "",
    preco_original: 70000,
    preco_promocional: 0,
    pericia: "PERÍCIA APROVADA",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
    tipo: "Hatch",
  } as Veiculo;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  midia.celular = true;
  midia.ouvintes = [];
  midia.consultas = [];
  vi.stubGlobal("matchMedia", (q: string) => (midia.consultas.push(q), {
    media: q,
    get matches() {
      return midia.celular;
    },
    addEventListener: (_: string, f: (e: { matches: boolean }) => void) => midia.ouvintes.push(f),
    removeEventListener: () => {},
  }));
  // O jsdom não desenha: tudo tem zero retângulos. A trava de foco só conta o
  // que está na tela, então aqui tudo "está".
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  document.body.style.overflow = "";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function montar() {
  const { default: Catalogo } = await import("../src/components/modernist/Catalogo");
  await act(async () => {
    root.render(
      createElement(Catalogo, {
        estoque: [veiculo("1", "Fiat"), veiculo("2", "Ford"), veiculo("3", "Toyota")],
        quickTags: [],
        stockOverrides: {},
      }),
    );
  });
}

const painel = () => container.querySelector<HTMLElement>("#painel-de-filtros")!;
const alternador = () => container.querySelector<HTMLButtonElement>('[aria-controls="painel-de-filtros"]')!;
const tecla = (key: string, shiftKey = false) =>
  act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));
  });

describe("no celular, o painel aberto é uma folha", () => {
  it("abrir: vira folha, o foco entra no X de fechar e a página para de rolar", async () => {
    await montar();
    expect(painel().className).toContain("hidden");
    await act(async () => alternador().click());
    expect(painel().className).toContain("mt-folha");
    expect(painel().className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Fechar os filtros");
    expect(document.body.style.overflow).toBe("hidden");
    // E se anuncia como diálogo modal — só enquanto é folha.
    expect(painel().getAttribute("role")).toBe("dialog");
    expect(painel().getAttribute("aria-modal")).toBe("true");
  });

  it("a mídia que o componente consulta é a mesma do `@media` da folha", async () => {
    await montar();
    await act(async () => alternador().click());
    const css = ler("src/app/modernist.css");
    const condicao = /@media (\(width < [^)]+\)) \{\s*\.mt-folha/.exec(css)![1];
    expect(new Set(midia.consultas)).toEqual(new Set([condicao]));
  });

  it("LIMPAR (N) com a folha aberta deixa o foco NA folha, no VER N VEÍCULOS", async () => {
    await montar();
    await act(async () => alternador().click());
    const caixa = [...painel().querySelectorAll("label")].find((l) => l.textContent?.includes("Fiat"))!;
    await act(async () => caixa.querySelector("input")!.click());
    const limpar = [...painel().querySelectorAll("button")].find((b) => b.textContent?.startsWith("LIMPAR ("))!;
    await act(async () => limpar.click());
    expect(painel().contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.textContent).toMatch(/^VER 3 VEÍCULOS$/);
  });

  it("um Esc já consumido (lista de sugestões) não fecha a folha", async () => {
    await montar();
    await act(async () => alternador().click());
    await act(async () => {
      const e = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      e.preventDefault();
      document.dispatchEvent(e);
    });
    expect(painel().className).toContain("mt-folha");
  });

  it("com o foco numa camada por cima (pop-up, cookies), a folha não rouba o Tab", async () => {
    await montar();
    await act(async () => alternador().click());
    const popup = document.createElement("button");
    document.body.appendChild(popup);
    popup.focus();
    await tecla("Tab");
    expect(document.activeElement).toBe(popup);
    popup.remove();
  });

  it("Esc fecha e devolve o foco ao botão que abriu", async () => {
    await montar();
    await act(async () => alternador().click());
    await tecla("Escape");
    expect(painel().className).toContain("hidden");
    expect(document.activeElement).toBe(alternador());
    expect(document.body.style.overflow).toBe("");
  });

  it("o Tab dá a volta dentro da folha, nos dois sentidos", async () => {
    await montar();
    await act(async () => alternador().click());
    const botoes = [...painel().querySelectorAll<HTMLElement>("button, input, select")];
    const primeiro = botoes[0];
    const ultimo = botoes[botoes.length - 1];
    expect(ultimo.textContent).toMatch(/^VER \d+ VEÍCULOS?$/);

    ultimo.focus();
    await tecla("Tab");
    expect(document.activeElement).toBe(primeiro);
    await tecla("Tab", true);
    expect(document.activeElement).toBe(ultimo);
  });

  it("tocar no fundo escurecido fecha", async () => {
    await montar();
    await act(async () => alternador().click());
    const fundo = painel().previousElementSibling as HTMLElement;
    expect(fundo.getAttribute("aria-hidden")).toBe("true");
    await act(async () => fundo.click());
    expect(painel().className).toContain("hidden");
  });

  it("girar a tela até o desktop fecha a folha", async () => {
    await montar();
    await act(async () => alternador().click());
    await act(async () => midia.ouvintes.forEach((f) => f({ matches: false })));
    expect(painel().className).toContain("hidden");
    expect(painel().hasAttribute("role")).toBe(false);
  });
});

describe("no desktop nada disso age", () => {
  it("sem trava de rolagem, sem roubar o foco", async () => {
    midia.celular = false;
    await montar();
    // O alternador é `lg:hidden`, mas o estado pode ficar aberto (quem abriu
    // no celular e esticou a janela); a folha não pode se comportar como tal.
    await act(async () => alternador().click());
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).not.toBe(container.querySelector('[aria-label="Fechar os filtros"]'));
  });
});

describe("a folha no CSS", () => {
  const css = ler("src/app/modernist.css");
  const bloco = /@media \(width < 64rem\) \{\s*\.mt-folha \{([^}]*)\}/.exec(css)?.[1] ?? "";

  it("só abaixo do `lg`: presa ao pé da tela, com rolagem própria", () => {
    expect(bloco).toMatch(/position:\s*fixed/);
    expect(bloco).toMatch(/bottom:\s*0/);
    expect(bloco).toMatch(/max-height:\s*88svh/);
    expect(bloco).toMatch(/overflow-y:\s*auto/);
    expect(bloco).toMatch(/overscroll-behavior:\s*contain/);
  });

  it("com movimento reduzido, a folha aparece sem subir", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.mt-folha \{\s*animation:\s*none/);
  });
});
