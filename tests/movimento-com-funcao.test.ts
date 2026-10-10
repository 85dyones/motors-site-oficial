// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { Veiculo } from "../src/types";
import Hodometro from "../src/components/modernist/Hodometro";
import { ler, lerCodigo } from "./fonte";

/**
 * Onda 1 do plano de movimento (09/10/2026): a régua dos cabeçalhos que se
 * desenha com a rolagem, o mouse no card e nos links em régua, o hodômetro da
 * contagem do estoque e da parcela, e o zoom lento da foto do hero.
 *
 * O que estes testes seguram é a regra, não o efeito: todo movimento novo vive
 * dentro de um bloco que o desliga para quem pede menos movimento (e, no caso
 * da régua, para o navegador que não liga animação à rolagem); só mexe em
 * `transform` e opacidade; e não troca o texto que a página entrega — o
 * número do hodômetro aparece uma vez, o convite continua "VER CARRO →".
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // Só os atributos que um <img> entende; o resto é do `next/image`.
    const resto = Object.fromEntries(
      Object.entries(props).filter(([k]) => !["fill", "sizes", "priority", "unoptimized", "fetchPriority", "loader"].includes(k)),
    );
    return createElement("img", resto as never);
  },
}));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

const css = ler("src/app/modernist.css");
// Só a seção da Onda 1: as ondas seguintes moram depois dela, com testes
// próprios (a onda cinética também tem um bloco de mouse).
const secao = css.slice(
  css.indexOf("/* — movimento com função"),
  css.indexOf("/* — movimento com função, Onda 2"),
);

/** O conteúdo entre as chaves do primeiro bloco que começa em `abertura`. */
function bloco(texto: string, abertura: string): string {
  const inicio = texto.indexOf(abertura);
  if (inicio < 0) return "";
  const chave = texto.indexOf("{", inicio);
  let nivel = 0;
  for (let i = chave; i < texto.length; i++) {
    if (texto[i] === "{") nivel++;
    if (texto[i] === "}" && --nivel === 0) return texto.slice(chave + 1, i);
  }
  return "";
}

function veiculo(parcial: Partial<Veiculo> = {}): Veiculo {
  return {
    id: "8558123",
    marca: "Volvo",
    modelo: "XC60",
    versao: "T8 Híbrido",
    ano: 2022,
    quilometragem: 1,
    cambio: "Automático",
    combustivel: "Híbrido",
    cor: "Preto",
    fipe: "",
    preco_original: 249900,
    preco_promocional: 0,
    pericia: "PERÍCIA APROVADA",
    whatsapp_images: [],
    web_full_images: [`https://s3.carro57.com.br/FC/9037/${parcial.id ?? "8558123"}.jpg`],
    opcionais: "",
    laudo_pericia: "",
    tipo: "SUV",
    ...parcial,
  } as Veiculo;
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;

async function montar(elemento: ReturnType<typeof createElement>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  const raiz = createRoot(container);
  root = raiz;
  await act(async () => raiz.render(elemento));
  return container;
}

afterEach(async () => {
  if (root) {
    const raiz = root;
    await act(async () => raiz.unmount());
  }
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("a regra escrita mudou junto", () => {
  it("o CSS traz as cinco regras do movimento com função", () => {
    expect(secao).toContain("1. O que o visitante veio ver nunca espera.");
    expect(secao).toContain("5. Se serve para qualquer loja, fica de fora.");
  });

  it("a capa deixou de se chamar o único movimento do site", () => {
    expect(css).not.toContain("o único movimento de entrada do site (tarefa 3.7");
    expect(css).not.toContain("a régua da capa continua sendo o único");
  });

  it("as animações novas só mexem em transform e opacidade", () => {
    for (const nome of ["mt-sublinha", "mt-selo-reflexo", "mt-hero-zoom"]) {
      const corpo = bloco(secao, `@keyframes ${nome} {`);
      expect(corpo, nome).not.toBe("");
      const propriedades = [...corpo.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const p of propriedades) expect(["transform", "transform-origin", "opacity"], `${nome}: ${p}`).toContain(p);
    }
  });
});

describe("01 · a régua do cabeçalho de seção se desenha com a rolagem", () => {
  it("só com animação ligada à rolagem e com movimento liberado", () => {
    const comSuporte = bloco(secao, "@supports (animation-timeline: view())");
    const liberado = bloco(comSuporte, "@media (prefers-reduced-motion: no-preference)");
    expect(liberado).toMatch(/\.mt-cabecalho-secao \{[^}]*border-bottom-color: transparent/);
    expect(liberado).toMatch(/\.mt-cabecalho-secao::after \{[^}]*animation-timeline: view\(\)/);
    // Fora desse bloco a borda nunca fica transparente: é ela que aparece
    // para quem não tem o desenho.
    expect(css.split(".mt-cabecalho-secao {").length - 1).toBe(1);
  });

  it("o cabeçalho continua com a borda de 2px, e ganha a classe do desenho", async () => {
    const { CabecalhoSecao } = await import("../src/components/modernist/primitivos");
    const html = renderToStaticMarkup(createElement(CabecalhoSecao, { numero: "01 — ESTOQUE SELECIONADO", titulo: "Destaques" }));
    const classe = html.match(/^<div class="([^"]*)"/)?.[1] ?? "";
    expect(classe).toContain("mt-cabecalho-secao");
    expect(classe).toContain("border-b-2");
    expect(classe).toContain("border-mt-regua");
  });
});

describe("02 · o mouse no card e nos links em régua", () => {
  it("só com mouse e com movimento liberado", () => {
    const hover = bloco(secao, "@media (hover: hover) and (prefers-reduced-motion: no-preference)");
    expect(hover).toMatch(/\.mt-card:hover \.mt-convite,\s*\.mt-link-regua:hover \{\s*border-bottom-color: transparent/);
    expect(hover).toMatch(/\.mt-card:hover \.mt-selo-pericia::after \{\s*animation: mt-selo-reflexo/);
    // A régua e a seta só mudam dentro do bloco.
    const fora = secao.replace(hover, "");
    expect(fora).not.toMatch(/:hover/);
  });

  it("o convite segue dizendo VER CARRO →, com a seta numa casa própria; o selo ganha o reflexo", async () => {
    const { CardVeiculo } = await import("../src/components/modernist/primitivos");
    const tela = await montar(createElement(CardVeiculo, { veiculo: veiculo(), href: "/carros/x" }));
    const convite = tela.querySelector(".mt-convite")!;
    expect(convite.textContent).toBe("VER CARRO →");
    expect(convite.querySelector(".mt-convite-seta")!.textContent).toBe("→");
    expect(tela.querySelector('[data-selo="pericia"]')!.className).toContain("mt-selo-pericia");
  });

  it("o link em régua tem a seta numa casa própria", async () => {
    const { LinkRegua } = await import("../src/components/modernist/primitivos");
    const html = renderToStaticMarkup(createElement(LinkRegua, { href: "/estoque" } as Parameters<typeof LinkRegua>[0], "VER OS 44 VEÍCULOS"));
    expect(html).toMatch(/<span class="mt-link-regua-seta text-mt-accent">/);
  });
});

describe("03 e 04 · o hodômetro", () => {
  it("o texto da página é o número, uma vez; a fita fica escondida do leitor de tela", () => {
    const div = document.createElement("div");
    div.innerHTML = renderToStaticMarkup(createElement(Hodometro, { texto: "R$ 5.835,58" }));
    expect(div.textContent).toBe("R$ 5.835,58");
    expect(div.querySelector(".mt-hodometro-rolo")!.getAttribute("aria-hidden")).toBe("true");
    const fitas = [...div.querySelectorAll<HTMLElement>(".mt-hodometro-fita")];
    expect(fitas.map((f) => f.style.getPropertyValue("--mt-hodometro-digito"))).toEqual(["5", "8", "3", "5", "5", "8"]);
    // As unidades andam primeiro; cada casa à esquerda espera mais um degrau.
    expect(fitas.map((f) => f.style.getPropertyValue("--mt-hodometro-ordem"))).toEqual(["5", "4", "3", "2", "1", "0"]);
    expect([...div.querySelectorAll(".mt-hodometro-sinal")].map((s) => s.getAttribute("data-sinal"))).toEqual(["R", "$", " ", ".", ","]);
  });

  it("quando o número muda, a fita das unidades é a mesma: é ela que desliza", async () => {
    const tela = await montar(createElement(Hodometro, { texto: "44" }));
    const unidades = tela.querySelectorAll<HTMLElement>(".mt-hodometro-fita")[1];
    await act(async () => root!.render(createElement(Hodometro, { texto: "9" })));
    const depois = tela.querySelectorAll<HTMLElement>(".mt-hodometro-fita");
    expect(depois).toHaveLength(1);
    expect(depois[0]).toBe(unidades);
    expect(depois[0].style.getPropertyValue("--mt-hodometro-digito")).toBe("9");
    expect(tela.textContent).toBe("9");
  });

  it("sem a unidade lh, a fita não aparece e o número fica como sempre", () => {
    // Fora do @supports a fita está escondida e o número, visível: o Safari
    // anterior ao 16.4 mostraria a fita inteira, de 0 a 9, empilhada.
    expect(secao).toMatch(/\.mt-hodometro-rolo \{\s*display: none;\s*\}/);
    const comLh = bloco(secao, "@supports (height: 1lh)");
    expect(comLh).toMatch(/\.mt-hodometro-valor \{\s*color: transparent/);
    expect(comLh).toMatch(/\.mt-hodometro-casa \{[^}]*height: 1lh/);
    // O número só fica transparente onde a fita existe.
    expect(secao.match(/[\s{;]color: transparent/g)).toHaveLength(1);
  });

  it("com movimento reduzido o número troca de uma vez", () => {
    expect(secao).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.mt-hodometro-fita \{\s*transition: none/);
  });

  it("a contagem do estoque e a parcela do simulador usam o hodômetro", () => {
    expect(lerCodigo("src/components/modernist/Catalogo.tsx")).toContain("<Hodometro texto={String(totalFiltrado)}");
    expect(lerCodigo("src/components/CalculadoraFinanciamento.tsx")).toMatch(/<Hodometro\s+texto=\{`R\$ \$\{result\.parcela_mensal/);
  });
});

describe("05 · o zoom lento do hero", () => {
  async function capa() {
    const { default: HeroHome } = await import("../src/components/modernist/HeroHome");
    return createElement(HeroHome, {
      slides: [veiculo({ id: "1", modelo: "Kwid" }), veiculo({ id: "2", modelo: "Sandero" })],
      totalEstoque: 41,
      totalMarcas: 17,
    });
  }

  it("a primeira foto sai do servidor ativa e com prioridade de rede; só ela", async () => {
    const html = renderToStaticMarkup(await capa());
    const primeiro = html.match(/<div aria-hidden="false" data-slide="ativo"[^>]*><img[^>]*>/)?.[0] ?? "";
    expect(primeiro).toMatch(/fetchpriority="high"/i);
    expect(primeiro).toContain("mt-hero-foto");
    expect(html.match(/data-slide=/g)).toHaveLength(1);
    // Com a prioridade, o React 19 ainda emite o preload da foto (que o Next
    // sobe para o <head>): ela entra na fila da rede antes do resto. Só a
    // primeira — a segunda foto continua `lazy`.
    const comPrioridade = html.match(/<(img|link)[^>]*fetchpriority="high"[^>]*>/gi) ?? [];
    expect(comPrioridade).toHaveLength(2);
    expect(comPrioridade.every((tag) => tag.includes("/1.jpg"))).toBe(true);
    expect(comPrioridade.some((tag) => tag.startsWith('<link rel="preload" as="image"'))).toBe(true);
  });

  it("na troca, a foto que sai continua o zoom enquanto esmaece", async () => {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    const tela = await montar(await capa());
    const botoes = tela.querySelectorAll<HTMLButtonElement>("button[aria-current]");
    await act(async () => botoes[1].click());
    const slides = [...tela.querySelectorAll("[data-slide]")].map((s) => s.getAttribute("data-slide"));
    expect(slides).toEqual(["saindo", "ativo"]);
  });

  it("o zoom só existe com movimento liberado, para a foto ativa e para a que sai", () => {
    const liberado = bloco(secao.slice(secao.indexOf("A foto do hero cresce")), "@media (prefers-reduced-motion: no-preference)");
    expect(liberado).toMatch(/\[data-slide="ativo"\] > \.mt-hero-foto,\s*\[data-slide="saindo"\] > \.mt-hero-foto \{\s*animation: mt-hero-zoom 6\.1s linear both/);
  });
});
