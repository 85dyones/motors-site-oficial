// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { Veiculo } from "../src/types";
import { execSync } from "node:child_process";
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

  it("faixa própria acima do texto (16:9, 21:9 no tablet); só do lg para cima vira fundo", () => {
    // 16:9 e não os 3:2 da foto: em 3:2 a placa com o preço saía da primeira
    // dobra de um celular de 375 × 667 (medido: 704 px). Em 16:9 a foto
    // perde só uma faixa do céu e do piso — o carro fica inteiro. No tablet,
    // 21:9, senão a foto ocupava a dobra inteira de um iPad em pé.
    const moldura = /<div className="([^"]*aspect-\[16\/9\][^"]*)">\s*\{slides\.map/.exec(fonte)?.[1] ?? "";
    expect(moldura).toContain("aspect-[16/9]");
    expect(moldura).toContain("sm:aspect-[21/9]");
    expect(moldura).toContain("w-full");
    for (const classe of ["lg:absolute", "lg:inset-0", "lg:aspect-auto"]) expect(moldura).toContain(classe);
    // E ela não é mais `absolute` sem prefixo: seria o fundo de tela inteira de novo.
    expect(moldura).not.toMatch(/(^|\s)absolute(\s|$)/);
  });

  it("sem piso de 520px no celular — a altura sai do conteúdo", () => {
    expect(fonte).not.toContain("min-h-[520px]");
  });

  it("o véu escuro sobre a foto só existe onde o texto fica em cima dela (lg)", () => {
    expect(fonte).toMatch(/hidden bg-\[linear-gradient\(90deg,rgba\(32,30,29,\.92\)[^"]*lg:block/);
  });

  it("sem nenhuma foto, não sobra um retângulo vazio no celular", async () => {
    const { default: HeroHome } = await import("../src/components/modernist/HeroHome");
    const sem = { ...veiculo("9", "Kwid"), web_full_images: [], whatsapp_images: [] } as Veiculo;
    const html = renderToStaticMarkup(createElement(HeroHome, { slides: [sem], totalEstoque: 1, totalMarcas: 1 }));
    expect(html).not.toContain("aspect-[16/9]");
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
  it("a régua da capa se desenha; os números saem do servidor já com o valor final, uma vez", async () => {
    const html = await capa();
    expect(html).toContain("mt-regua-desenha");
    // Quem não roda JS (e o buscador) lê o número certo — e uma vez só: com um
    // `sr-only` ao lado, o texto do DOM virava "4141 EM ESTOQUE".
    const numeros = [...html.replace(/<!-- -->/g, "").matchAll(/<span class="mt-numeros-surgem tabular-nums">([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(numeros).toEqual(["41", "17"]);
    expect(html).not.toMatch(/4141|1717/);
    // O 100% fica parado.
    expect(html).toMatch(/>100%</);
  });

  it("só a capa se mexe: nenhum outro componente pede para desenhar a régua", () => {
    const quem = execSync("grep -rl -E '<EstatisticasRegua|NumeroQueConta' src --include=*.tsx || true", { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    const comMovimento = quem.filter(
      (f) => /\bdesenhar\b/.test(lerCodigo(f).replace(/desenhar = false|desenhar\?: boolean|desenhar &&|desenhar\s*\?/g, "")) || /<NumeroQueConta/.test(lerCodigo(f)),
    );
    expect(comMovimento).toEqual(["src/components/modernist/HeroHome.tsx"]);
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
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function montar({ reduzido = false, agora = 100, naTela = true, valor = 41 } = {}) {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: reduzido, addEventListener() {}, removeEventListener() {} }));
    vi.spyOn(performance, "now").mockReturnValue(agora);
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue(
      (naTela ? [{}] : []) as unknown as DOMRectList,
    );
    const quadros: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => (quadros.push(f), quadros.length));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const { default: NumeroQueConta } = await import("../src/components/modernist/NumeroQueConta");
    container = document.createElement("div");
    document.body.appendChild(container);
    const r = createRoot(container);
    root = r;
    await act(async () => r.render(createElement(NumeroQueConta, { valor, duracao: 900 })));
    const visivel = () => container!.querySelector("span")!.textContent;
    const trocar = (novo: number) =>
      act(async () => r.render(createElement(NumeroQueConta, { valor: novo, duracao: 900 })));
    return { quadros, visivel, trocar };
  }

  it("com movimento reduzido fica no valor — e acompanha quando ele muda", async () => {
    const { quadros, visivel, trocar } = await montar({ reduzido: true });
    expect(quadros).toHaveLength(0);
    expect(visivel()).toBe("41");
    await trocar(39);
    expect(visivel()).toBe("39");
  });

  it("fora da tela (a régua é só do desktop) não conta", async () => {
    const { quadros, visivel } = await montar({ naTela: false });
    await act(async () => vi.advanceTimersByTime(1000));
    expect(quadros).toHaveLength(0);
    expect(visivel()).toBe("41");
  });

  it("hidratação depois de o número aparecer: não conta — seria final, zero, final", async () => {
    const { quadros, visivel } = await montar({ agora: 1500 });
    await act(async () => vi.advanceTimersByTime(1000));
    expect(quadros).toHaveLength(0);
    expect(visivel()).toBe("41");
  });

  it("hidratação cedo: parte do zero, espera o número aparecer, conta e assenta no valor", async () => {
    const { quadros, visivel } = await montar({ agora: 100 });
    // Primeiro quadro: vai a zero, ainda invisível (o CSS só mostra aos 0,7 s).
    expect(quadros).toHaveLength(1);
    await act(async () => quadros.shift()!(0));
    expect(visivel()).toBe("0");
    await act(async () => vi.advanceTimersByTime(600));
    expect(quadros).toHaveLength(1);
    // O carimbo do rAF pode vir ANTES do início medido: nunca negativo.
    await act(async () => quadros.shift()!(50));
    expect(Number(visivel())).toBeGreaterThanOrEqual(0);
    await act(async () => quadros.shift()!(500));
    expect(Number(visivel())).toBeGreaterThan(20);
    await act(async () => quadros.shift()!(2000));
    expect(visivel()).toBe("41");
    expect(quadros).toHaveLength(0);
  });
});
