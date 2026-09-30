// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Veiculo } from "../src/types";
import { THEME_PRESETS, TEMA_PADRAO, TEMAS_ESCUROS, scriptAntiFlicker } from "../src/lib/temas";
import { razaoDeContraste } from "../src/lib/contraste";
import { ler, lerCodigo } from "./fonte";

/**
 * O cobre da marca no site — Fase 3 da revisão de UI de 29/09/2026 (tarefas
 * 3.1, 3.2 e 3.4 do plano de ação).
 *
 * Até ali o site rodava `luxury-light`, ferrugem sobre branco-azulado, e o
 * cobre do logo não aparecia em superfície nenhuma. A regra que entra: cobre
 * para identidade (marca, código, numeração, selo, régua de destaque),
 * ferrugem só para ação (botão e link que leva a algum lugar).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("3.1 · o preset cobre é o padrão do site", () => {
  it("quem nunca trocou de tema vê o cobre", () => {
    expect(TEMA_PADRAO).toBe("motors-cobre");
    expect(lerCodigo("src/app/ThemeContext.tsx")).toContain("useState<ThemeType>(TEMA_PADRAO)");
  });

  it("as cores do manual: ferrugem na ação, cobre de texto na identidade", () => {
    const cobre = THEME_PRESETS["motors-cobre"];
    expect(cobre["--brand-primary"]).toBe("#C83F00");
    expect(cobre["--brand-cobre"]).toBe("#8A6647");
    expect(cobre["--brand-foreground"]).toBe("#1C1A19");
    expect(lerCodigo("src/app/modernist.css")).toMatch(/--mt-cobre-marca:\s*#b29172/i);
  });

  it("o layout não tem mais cópia das paletas: o script sai de lib/temas", () => {
    const layout = lerCodigo("src/app/layout.tsx");
    expect(layout).toContain("scriptAntiFlicker()");
    expect(layout).not.toMatch(/--brand-background'\s*:/);
  });
});

describe("o script anti-flicker, rodando de verdade", () => {
  const rodar = () => new Function(scriptAntiFlicker())();

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("dark");
  });

  it("sem escolha salva, aplica o cobre", () => {
    rodar();
    const raiz = document.documentElement;
    expect(raiz.getAttribute("data-theme")).toBe("motors-cobre");
    expect(raiz.style.getPropertyValue("--brand-cobre")).toBe("#8A6647");
    expect(raiz.classList.contains("dark")).toBe(false);
  });

  it("respeita a escolha de quem trocou pelo painel", () => {
    localStorage.setItem("ag_theme", "stealth-dark");
    rodar();
    expect(document.documentElement.getAttribute("data-theme")).toBe("stealth-dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(TEMAS_ESCUROS).toContain("stealth-dark");
  });

  it("escolha salva que não existe mais cai no padrão — inclusive nome herdado", () => {
    for (const salvo of ["tema-apagado", "__proto__", "constructor"]) {
      localStorage.setItem("ag_theme", salvo);
      rodar();
      expect(document.documentElement.getAttribute("data-theme"), salvo).toBe("motors-cobre");
    }
  });

  it("com o armazenamento bloqueado, aplica o padrão mesmo assim", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });
    try {
      rodar();
    } finally {
      Object.defineProperty(window, "localStorage", original);
    }
    expect(document.documentElement.getAttribute("data-theme")).toBe("motors-cobre");
    expect(document.documentElement.style.getPropertyValue("--brand-background")).toBe("#F6F4F1");
  });

  it("o script não pode fechar a própria tag", () => {
    expect(scriptAntiFlicker()).not.toMatch(/<\//);
  });
});

describe("sem JavaScript, o :root já é o cobre", () => {
  it("o :root de globals.css diz o mesmo que o preset padrão", () => {
    const css = lerCodigo("src/app/globals.css");
    const raiz = /:root \{([\s\S]*?)\}/.exec(css)![1];
    for (const [token, valor] of Object.entries(THEME_PRESETS[TEMA_PADRAO])) {
      const m = new RegExp(`${token}:\\s*([^;]+);`).exec(raiz);
      expect(m?.[1].trim().toLowerCase(), token).toBe(valor.toLowerCase());
    }
  });
});

describe("contraste do cobre", () => {
  it("a identidade passa de 4,5:1 sobre o fundo e o cartão, em toda paleta", () => {
    for (const [nome, t] of Object.entries(THEME_PRESETS)) {
      for (const fundo of ["--brand-background", "--brand-card"] as const) {
        const razao = razaoDeContraste(t["--brand-cobre"], t[fundo])!;
        expect(razao, `${nome}: cobre ${t["--brand-cobre"]} sobre ${fundo}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("no preset cobre, a ferrugem passa em texto e o branco passa sobre ela", () => {
    const t = THEME_PRESETS["motors-cobre"];
    expect(razaoDeContraste(t["--brand-primary"], t["--brand-background"])!).toBeGreaterThanOrEqual(4.5);
    expect(razaoDeContraste("#FFFFFF", t["--brand-primary"])!).toBeGreaterThanOrEqual(4.5);
  });

  it("o cobre do logo passa sobre o fundo escuro do sistema — e só lá é usado em texto", () => {
    const css = lerCodigo("src/app/modernist.css");
    const escuro = /--mt-inverso-fundo:\s*(#[0-9a-f]{6})/i.exec(css)![1];
    expect(razaoDeContraste("#B29172", escuro)!).toBeGreaterThanOrEqual(4.5);
  });
});

describe("3.2 · cobre na identidade, ferrugem na ação", () => {
  const css = ler("src/app/modernist.css");
  const regra = (classe: string) => new RegExp(`\\${classe} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";

  it.each([".mt-rotulo-accent", ".mt-secao-numero", ".mt-grupo-conta"])("%s é cobre", (classe) => {
    expect(regra(classe)).toMatch(/color:\s*var\(--mt-cobre\)/);
  });

  it("os botões de ação continuam na ferrugem", () => {
    expect(regra(".mt-btn-primario")).toMatch(/background:\s*var\(--mt-accent\)/);
    expect(regra(".mt-link-regua")).toMatch(/border-bottom:\s*2px solid var\(--mt-accent\)/);
  });

  it("selo de perícia e réguas de destaque da ficha", () => {
    const pdp = lerCodigo("src/components/PDPClientWrapper.tsx");
    expect(pdp).toMatch(/mt-pulso h-1\.5 w-1\.5 bg-mt-cobre-marca/);
    expect(pdp).toMatch(/text-mt-cobre">\s*\{`COD\./);
    const laudo = lerCodigo("src/components/ficha/LaudoAprovado.tsx");
    expect(laudo).toContain("bg-mt-cobre-marca");
    expect(laudo).toContain("border-mt-cobre");
    expect(laudo).not.toMatch(/mt-accent/);
  });
});

// ---------------------------------------------------------------------------
// 3.4 · o card "ficha de perícia", montado.
// ---------------------------------------------------------------------------

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

function veiculo(parcial: Partial<Veiculo>): Veiculo {
  return {
    id: "7947766",
    marca: "BMW",
    modelo: "X4",
    versao: "M40i",
    ano: 2020,
    quilometragem: 80000,
    cambio: "Automático",
    combustivel: "Gasolina",
    cor: "Preto",
    fipe: "",
    preco_original: 318900,
    preco_promocional: 0,
    pericia: "PERÍCIA APROVADA",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
    tipo: "SUV",
    ...parcial,
  } as Veiculo;
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;

async function card(v: Veiculo, extra: Record<string, unknown> = {}) {
  const { CardVeiculo } = await import("../src/components/modernist/primitivos");
  container = document.createElement("div");
  document.body.appendChild(container);
  const raiz = createRoot(container);
  root = raiz;
  await act(async () => raiz.render(createElement(CardVeiculo, { veiculo: v, href: "/carros/x", ...extra })));
  return container;
}

afterEach(async () => {
  if (!root || !container) return;
  const raiz = root;
  await act(async () => raiz.unmount());
  container.remove();
  root = undefined;
  container = undefined;
});

describe("3.4 · o card é uma ficha de perícia", () => {
  it("perícia aprovada: selo no canto, grafite com ponto no cobre do logo", async () => {
    const tela = await card(veiculo({}));
    const selo = tela.querySelector('[data-selo="pericia"]')!;
    expect(selo.textContent).toBe("PERÍCIA APROVADA");
    expect(selo.className).toContain("bg-mt-inverso-fundo");
    expect(selo.querySelector("span")!.className).toContain("bg-mt-cobre-marca");
  });

  it("perícia em análise: nenhum selo — o card não afirma o que não sabe", async () => {
    const tela = await card(veiculo({ pericia: "EM ANÁLISE" }));
    expect(tela.querySelector('[data-selo="pericia"]')).toBeNull();
    expect(tela.textContent).not.toMatch(/aprovad/i);
  });

  it("a etiqueta da vitrine fica abaixo do selo, no mesmo canto", async () => {
    const tela = await card(veiculo({}), { etiqueta: "BLINDADO" });
    const canto = tela.querySelector('[data-selo="pericia"]')!.parentElement!;
    expect(canto.textContent).toBe("PERÍCIA APROVADABLINDADO");
  });

  it("marca em cobre e código do veículo na mesma linha", async () => {
    const tela = await card(veiculo({}));
    const codigo = tela.querySelector('[data-linha="codigo"]')!;
    expect(codigo.textContent).toBe("cód. 7947766");
    const marca = codigo.previousElementSibling!;
    expect(marca.textContent).toBe("BMW");
    expect(marca.className).toContain("text-mt-cobre");
  });

  it("ano, km e câmbio em três colunas com régua", async () => {
    const tela = await card(veiculo({}));
    const colunas = [...tela.querySelectorAll("dl > div")];
    expect(colunas.map((c) => c.querySelector("dt")!.textContent)).toEqual(["ANO", "KM", "CÂMBIO"]);
    expect(colunas.map((c) => c.querySelector("dd")!.textContent)).toEqual(["2020", "80.000", "Automático"]);
    expect(colunas[1].className).toContain("border-l");
    expect(colunas[2].className).toContain("border-l");
  });

  it("no fundo escuro (Profiler), nenhuma cor do claro: tinta e cobre de texto trocam", async () => {
    const tela = await card(veiculo({}), { inverso: true });
    const classes = [...tela.querySelectorAll("*")].map((el) => el.getAttribute("class") ?? "").join(" ");
    expect(classes).not.toMatch(/(^|\s)text-mt-(ink|cobre|neutral-600|neutral-700)(\s|$)/);
    expect(tela.querySelector("dd")!.className).toContain("text-mt-inverso");
    const marca = tela.querySelector('[data-linha="codigo"]')!.previousElementSibling!;
    expect(marca.className).toContain("text-mt-cobre-marca");
    // E o Profiler, que desenha o card no escuro, pede a variante.
    const profiler = lerCodigo("src/components/ResultadoDoProfiler.tsx");
    expect(profiler.match(/<CardVeiculo\b[^>]*\binverso\b/g)).toHaveLength(2);
  });

  it("a ferrugem do card é só o convite de ação", async () => {
    const tela = await card(veiculo({}));
    const comAcento = [...tela.querySelectorAll("*")].filter((el) =>
      /(^|\s)(text|bg|border)-mt-accent(\s|$)/.test(el.getAttribute("class") ?? ""),
    );
    expect(comAcento.map((el) => el.textContent)).toEqual(["VER CARRO →"]);
  });
});
