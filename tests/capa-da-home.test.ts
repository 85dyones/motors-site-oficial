// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { Veiculo } from "../src/types";
import { ler, lerCodigo } from "./fonte";

/**
 * A capa da home — tarefas 3.6 e 3.7 da revisão de UI de 29/09/2026, e o
 * enquadramento da foto no celular, apontado pelo dono no mesmo dia: "corta o
 * carro na metade vertical".
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

function veiculo(id: string, modelo: string): Veiculo {
  return {
    id,
    marca: "Renault",
    modelo,
    versao: "1.0",
    ano: 2022,
    quilometragem: 30000,
    cambio: "Manual",
    combustivel: "Flex",
    cor: "Branco",
    fipe: "",
    preco_original: 60000,
    preco_promocional: 0,
    pericia: "PERÍCIA APROVADA",
    whatsapp_images: [],
    web_full_images: [`https://s3.carro57.com.br/FC/9037/${id}.jpg`],
    opcionais: "",
    laudo_pericia: "",
    tipo: "Hatch",
  } as Veiculo;
}

async function capa() {
  const { default: HeroHome } = await import("../src/components/modernist/HeroHome");
  return renderToStaticMarkup(
    createElement(HeroHome, { slides: [veiculo("1", "Kwid"), veiculo("2", "Sandero")], totalEstoque: 41, totalMarcas: 17 }),
  );
}

describe("no celular, a foto entra inteira", () => {
  const fonte = lerCodigo("src/components/modernist/HeroHome.tsx");

  it("faixa própria em 3:2 acima do texto; só do lg para cima vira fundo", () => {
    const moldura = /<div className="([^"]*aspect-\[3\/2\][^"]*)">\s*\{slides\.map/.exec(fonte)?.[1] ?? "";
    expect(moldura).toContain("aspect-[3/2]");
    expect(moldura).toContain("w-full");
    for (const classe of ["lg:absolute", "lg:inset-0", "lg:aspect-auto"]) expect(moldura).toContain(classe);
    // E ela não é mais `absolute` sem prefixo: seria o fundo de tela inteira de novo.
    expect(moldura).not.toMatch(/(^|\s)absolute(\s|$)/);
  });

  it("sem piso de 520px no celular — a altura sai do conteúdo", () => {
    expect(fonte).not.toContain("min-h-[520px]");
  });

  it("o véu escuro sobre a foto só existe onde o texto fica em cima dela (lg)", () => {
    expect(fonte).toMatch(/hidden bg-\[linear-gradient\(90deg,rgba\(28,26,25,\.92\)[^"]*lg:block/);
  });
});

describe("3.6 · o texto da capa", () => {
  it("a frase de posicionamento no lugar de \"Curadoria, não vitrine\" (D4)", async () => {
    const html = await capa();
    expect(html).toContain("Três em cada dez avaliados entram.");
    expect(html).not.toMatch(/curadoria/i);
  });

  it("a paginação mostra o modelo de cada slide", async () => {
    const html = await capa();
    expect(html).toMatch(/>01<\/span> <span[^>]*>Kwid<\/span>/);
    expect(html).toMatch(/>02<\/span> <span[^>]*>Sandero<\/span>/);
  });
});

describe("3.7 · o único movimento: a régua se desenha e os números contam", () => {
  it("a régua da capa se desenha; os números sobem do servidor já com o valor final", async () => {
    const html = await capa();
    expect(html).toContain("mt-regua-desenha");
    // Quem não roda JS (e o buscador) lê o número certo, uma vez.
    const lidos = [...html.replace(/<!-- -->/g, "").matchAll(/<span class="sr-only">([^<]*)<\/span>/g)].map((m) => m[1]);
    for (const n of ["41", "17", "100%"]) expect(lidos).toContain(n);
  });

  it("só a capa se mexe: nenhum outro componente pede para desenhar a régua", () => {
    const usos = ["src/app/page.tsx", "src/app/sobre/page.tsx", "src/components/SobreClientWrapper.tsx"]
      .map((f) => lerCodigo(f))
      .join("\n");
    expect(usos).not.toMatch(/<EstatisticasRegua[^>]*\bdesenhar\b/);
  });

  it("com movimento reduzido, nada se mexe", () => {
    const css = ler("src/app/modernist.css");
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.mt-regua-desenha,\s*\.mt-numeros-surgem \{\s*animation:\s*none/,
    );
  });
});

describe("NumeroQueConta", () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(async () => {
    if (root) {
      const r = root;
      await act(async () => r.unmount());
    }
    container?.remove();
    root = undefined;
    vi.unstubAllGlobals();
  });

  async function montar(reduzido: boolean) {
    vi.stubGlobal("matchMedia", () => ({ matches: reduzido, addEventListener() {}, removeEventListener() {} }));
    const quadros: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => (quadros.push(f), quadros.length));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const { default: NumeroQueConta } = await import("../src/components/modernist/NumeroQueConta");
    container = document.createElement("div");
    document.body.appendChild(container);
    const r = createRoot(container);
    root = r;
    await act(async () => r.render(createElement(NumeroQueConta, { valor: 41, duracao: 900 })));
    const visivel = () => container!.querySelector('[aria-hidden="true"]')!.textContent;
    return { quadros, visivel };
  }

  it("com movimento reduzido fica no valor final, sem pedir quadro nenhum", async () => {
    const { quadros, visivel } = await montar(true);
    expect(quadros).toHaveLength(0);
    expect(visivel()).toBe("41");
  });

  it("sem a preferência, conta de perto de zero e assenta no valor", async () => {
    const { quadros, visivel } = await montar(false);
    const inicio = performance.now();
    await act(async () => quadros.shift()!(inicio + 1));
    expect(Number(visivel())).toBeLessThan(5);
    await act(async () => quadros.shift()!(inicio + 450));
    expect(Number(visivel())).toBeGreaterThan(20);
    await act(async () => quadros.shift()!(inicio + 2000));
    expect(visivel()).toBe("41");
    expect(quadros).toHaveLength(0);
    // O leitor de tela ouve o valor uma vez, no `sr-only`.
    expect(container!.querySelector(".sr-only")!.textContent).toBe("41");
  });
});
