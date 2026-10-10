// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import type { Veiculo } from "../src/types";
import { ler, lerCodigo } from "./fonte";

/**
 * Piloto do plano de movimento (10/10/2026): as duas mudanças de lugar do
 * site, com a View Transitions do navegador chamada pelo React.
 *
 * - Item 12: a foto do card viaja até a primeira foto da galeria da ficha.
 *   Só o card tocado ganha nome; a ficha recebe por baixo a foto que o card
 *   já tinha baixado, para a viagem pousar numa foto e não num retângulo
 *   escuro.
 * - Item 13: no /estoque, marcar um filtro, trocar a ordem ou carregar mais
 *   reorganiza os cards. O painel responde na hora; a grade vem numa
 *   transição marcada com o tipo `mt-vitrine`, e só com ele as classes dos
 *   cards acendem.
 *
 * O `<ViewTransition>` em si não roda aqui: o React dos testes é o do
 * `node_modules`, que não o tem (ver `Transicao.tsx`). Quem os testes
 * observam é a porta `Transicao`, trocada por um `<div data-vt>` que mostra o
 * nome e as classes que cada lado pediu.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const vt = vi.hoisted(() => ({ permitida: true, tipos: [] as string[] }));
const midia = vi.hoisted(() => ({ celular: false }));

vi.mock("../src/components/modernist/Transicao", () => ({
  Transicao: ({ children, ...props }: { children?: unknown }) =>
    createElement("div", { "data-vt": JSON.stringify(props) }, children as never),
  marcarTransicao: (tipo: string) => vt.tipos.push(tipo),
  transicaoPermitida: () => vt.permitida,
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) =>
    createElement(
      "img",
      Object.fromEntries(
        Object.entries(props).filter(
          ([k]) => !["fill", "sizes", "priority", "unoptimized", "fetchPriority", "loader", "preload"].includes(k),
        ),
      ) as never,
    ),
}));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  // O `onNavigate` do Next só roda na navegação dentro do site; aqui, no clique.
  default: ({
    href,
    children,
    onNavigate,
    ...resto
  }: {
    href: string;
    children?: unknown;
    onNavigate?: (e: { preventDefault: () => void }) => void;
  }) =>
    createElement(
      "a",
      {
        href,
        ...resto,
        onClick: (e: MouseEvent) => {
          e.preventDefault();
          onNavigate?.({ preventDefault: () => {} });
        },
      } as never,
      children as never,
    ),
}));

const FOTO = "https://s3.carro57.com.br/FC/9037/foto-1.jpg";

function veiculo(id: string, marca: string, fotos: string[] = []): Veiculo {
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
    web_full_images: fotos,
    opcionais: "",
    laudo_pericia: "",
    tipo: "Hatch",
  } as Veiculo;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vt.permitida = true;
  vt.tipos = [];
  midia.celular = false;
  vi.stubGlobal("matchMedia", (q: string) => ({
    media: q,
    get matches() {
      return midia.celular;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
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

/** O que a porta `Transicao` recebeu, no `data-vt` mais próximo acima de `el`. */
function pedido(el: Element | null): Record<string, unknown> {
  const casca = el?.closest("[data-vt]");
  return casca ? JSON.parse(casca.getAttribute("data-vt")!) : {};
}

describe("Piloto · a porta para o ViewTransition do React", () => {
  it("o React do App Router (o que vem dentro do Next) tem ViewTransition e addTransitionType", () => {
    // Se uma atualização do Next tirar os dois, a viagem e a vitrine param de
    // animar em silêncio. Este é o aviso.
    const reactDoNext = createRequire(import.meta.url)("next/dist/compiled/react");
    expect(typeof reactDoNext.ViewTransition).toBe("symbol");
    expect(typeof reactDoNext.addTransitionType).toBe("function");
  });

  it("sem o componente (o React dos testes), os filhos passam direto", async () => {
    const { Transicao } = await vi.importActual<typeof import("../src/components/modernist/Transicao")>(
      "../src/components/modernist/Transicao",
    );
    const html = renderToStaticMarkup(
      createElement(
        Transicao,
        { name: "mt-foto-1", share: "mt-foto-viaja" } as Parameters<typeof Transicao>[0],
        createElement("span", null, "foto"),
      ),
    );
    expect(html).toBe("<span>foto</span>");
  });

  it("só anima com o navegador capaz e sem pedido de menos movimento", async () => {
    const { transicaoPermitida } = await vi.importActual<typeof import("../src/components/modernist/Transicao")>(
      "../src/components/modernist/Transicao",
    );
    expect(transicaoPermitida()).toBe(false); // o jsdom não tem startViewTransition

    Object.defineProperty(document, "startViewTransition", { value: () => {}, configurable: true });
    try {
      expect(transicaoPermitida()).toBe(true);

      midia.celular = true; // o `matchMedia` falso responde `true` para qualquer consulta
      expect(transicaoPermitida()).toBe(false);
    } finally {
      delete (document as { startViewTransition?: unknown }).startViewTransition;
    }
  });
});

describe("Piloto · item 12, a foto do card viaja até a ficha", () => {
  async function montarCard(id = "123") {
    const { CardVeiculo } = await import("../src/components/modernist/primitivos");
    await act(async () => {
      root.render(createElement(CardVeiculo, { veiculo: veiculo(id, "Fiat", [FOTO]), href: `/carros/fiat/modelo/${id}` }));
    });
    const foto = container.querySelector<HTMLImageElement>("img.mt-card-foto")!;
    // O jsdom não baixa imagem: o que o navegador teria escolhido no srcset.
    Object.defineProperty(foto, "complete", { value: true });
    Object.defineProperty(foto, "currentSrc", { value: `/_next/image?url=${encodeURIComponent(FOTO)}&w=640&q=75` });
    return foto;
  }

  it("a moldura que viaja é só a foto: selo, contagem e sinal de abertura ficam no card", async () => {
    const foto = await montarCard();
    const moldura = foto.parentElement!;
    expect(moldura.className).toBe("absolute inset-0 overflow-hidden");
    expect(moldura.parentElement!.getAttribute("data-vt")).not.toBeNull();
    const caixa = moldura.parentElement!.parentElement!;
    expect(caixa.className).toContain("aspect-[4/3]");
    expect(moldura.querySelector('[data-selo="pericia"]')).toBeNull();
    expect(caixa.querySelector('[data-selo="pericia"]')).not.toBeNull();
    expect(moldura.querySelector(".mt-sinal-de-abertura")).toBeNull();
  });

  it("parado, o card não tem nome: nada casa com a home, o /estoque ou os parecidos da ficha", async () => {
    const foto = await montarCard();
    expect(pedido(foto)).toEqual({ share: "mt-foto-viaja", default: "none" });
  });

  it("tocado, só ele ganha o nome do carro, e a foto que já baixou fica para a ficha", async () => {
    const foto = await montarCard("123");
    const { fotoEmViagem } = await import("../src/components/modernist/FotoQueViaja");
    await act(async () => container.querySelector("a")!.click());
    expect(pedido(foto)).toEqual({ name: "mt-foto-123", share: "mt-foto-viaja", default: "none" });
    expect(fotoEmViagem("123")).toBe(foto.currentSrc);
    expect(fotoEmViagem("999")).toBeUndefined();
  });

  it("sem view transitions ou com menos movimento, o toque não dá nome a nada", async () => {
    vt.permitida = false;
    const foto = await montarCard("456");
    await act(async () => container.querySelector("a")!.click());
    expect(pedido(foto).name).toBeUndefined();
  });

  it("a ficha recebe com o mesmo nome e a mesma classe", async () => {
    const { FotoQueChega, nomeDaViagem } = await import("../src/components/modernist/FotoQueViaja");
    expect(nomeDaViagem("123")).toBe("mt-foto-123");
    // O nome vira `view-transition-name`: precisa ser um ident de CSS.
    expect(nomeDaViagem("ab 12/x")).toBe("mt-foto-ab_12_x");
    const html = renderToStaticMarkup(
      createElement(FotoQueChega, { idDoVeiculo: "123" } as Parameters<typeof FotoQueChega>[0], createElement("i")),
    );
    expect(html).toContain(
      `data-vt="${JSON.stringify({ name: "mt-foto-123", share: "mt-foto-viaja", default: "none" }).replace(/"/g, "&quot;")}"`,
    );
  });

  it("na ficha, o destino é a primeira foto da galeria, com a do card por baixo", () => {
    const ficha = lerCodigo("src/components/PDPClientWrapper.tsx");
    expect(ficha).toMatch(/const \[fotoDoCard\] = useState\(\(\) => fotoEmViagem\(veiculo\.id\)\);/);
    expect(ficha).toMatch(
      /return index === 0 \? \(\s*<FotoQueChega key=\{index\} idDoVeiculo=\{veiculo\.id\}>\s*\{slide\}\s*<\/FotoQueChega>/,
    );
    // A ponte só na primeira foto, e nunca no carro indisponível (foto translúcida).
    expect(ficha).toMatch(/\{index === 0 && fotoDoCard && !indisponivel && \(\s*<img\s+src=\{fotoDoCard\}/);
    // Por baixo: vem antes da foto da galeria no slide.
    const slide = ficha.slice(ficha.indexOf("const slide = ("), ficha.indexOf("return index === 0"));
    expect(slide.indexOf("src={fotoDoCard}")).toBeLessThan(slide.indexOf("<FotoDaFicha"));
  });
});

describe("Piloto · item 13, a vitrine do /estoque se reorganiza", () => {
  async function montarCatalogo(estoque: Veiculo[]) {
    const { default: Catalogo } = await import("../src/components/modernist/Catalogo");
    await act(async () => {
      root.render(createElement(Catalogo, { estoque, quickTags: [], stockOverrides: {} }));
    });
  }
  const cards = () => [...container.querySelectorAll<HTMLAnchorElement>("a.mt-card")];
  const caixa = (rotulo: string) =>
    [...container.querySelectorAll("label")]
      .find((l) => l.textContent?.includes(rotulo))!
      .querySelector("input")!;
  const tres = () => [veiculo("1", "Fiat"), veiculo("2", "Ford"), veiculo("3", "Toyota")];

  it("cada card pede as três classes, todas presas ao tipo mt-vitrine", async () => {
    await montarCatalogo(tres());
    expect(cards()).toHaveLength(3);
    for (const card of cards()) {
      expect(pedido(card)).toEqual({
        enter: { "mt-vitrine": "mt-card-entra", default: "none" },
        exit: { "mt-vitrine": "mt-card-sai", default: "none" },
        update: { "mt-vitrine": "mt-card-reorganiza", default: "none" },
        default: "none",
      });
    }
  });

  it("marcar um filtro reorganiza a grade numa transição com o tipo", async () => {
    await montarCatalogo(tres());
    await act(async () => caixa("Fiat").click());
    expect(cards().map((a) => a.querySelector("[data-linha=codigo]")?.textContent)).toEqual(["cód. 1"]);
    expect(vt.tipos).toEqual(["mt-vitrine"]);
  });

  it("carregar mais também: os cards novos entram subindo", async () => {
    await montarCatalogo(Array.from({ length: 12 }, (_, i) => veiculo(String(i + 1), "Fiat")));
    expect(cards()).toHaveLength(9);
    const botao = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("CARREGAR MAIS"))!;
    await act(async () => botao.click());
    expect(cards()).toHaveLength(12);
    expect(vt.tipos).toEqual(["mt-vitrine"]);
  });

  it("digitando na busca a grade segue sem animar", async () => {
    await montarCatalogo(tres());
    const campo = container.querySelector<HTMLInputElement>("#busca-da-vitrine")!;
    const valor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      valor.call(campo, "toyota");
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(cards()).toHaveLength(1);
    expect(vt.tipos).toEqual([]);

    // E o gesto seguinte, que não é digitação, volta a animar.
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Limpar a busca"]')!.click());
    expect(cards()).toHaveLength(3);
    expect(vt.tipos).toEqual(["mt-vitrine"]);
  });

  it("com a folha de filtros aberta no celular, a grade troca por trás sem animar", async () => {
    midia.celular = true;
    await montarCatalogo(tres());
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-controls="painel-de-filtros"]')!.click());
    await act(async () => caixa("Ford").click());
    expect(cards()).toHaveLength(1);
    expect(vt.tipos).toEqual([]);
  });

  it("sem view transitions ou com menos movimento, a grade troca de uma vez, como antes", async () => {
    vt.permitida = false;
    await montarCatalogo(tres());
    await act(async () => caixa("Toyota").click());
    expect(cards()).toHaveLength(1);
    expect(vt.tipos).toEqual([]);
  });

  it("o painel continua na hora: a região e a contagem leem o filtro, não a grade", () => {
    const catalogo = lerCodigo("src/components/modernist/Catalogo.tsx");
    expect(catalogo).toContain("aria-label={rotuloDosResultados(totalFiltrado)}");
    expect(catalogo).toContain('<Hodometro texto={String(totalFiltrado)}');
    expect(catalogo).toMatch(/\{cardsNaTela\.map\(\(v, i\) => \(\s*<Transicao key=\{v\.id\}/);
    expect(catalogo).toMatch(/startTransition\(\(\) => \{\s*marcarTransicao\(TIPO_DA_VITRINE\);\s*setCardsNaTela\(cardsDoFiltro\);/);
  });

  it("sem animação, nem transição: o React não fotografa a página à toa", () => {
    // Qualquer transição do React que monta um `<ViewTransition>` chama
    // `document.startViewTransition`, com ou sem classe. Medido no preview em
    // 10/10: digitando, com a folha aberta ou com menos movimento, a página
    // inteira era capturada para nada. Sem o tipo, a grade troca por
    // atualização comum, antes de chegar ao `startTransition`.
    const catalogo = lerCodigo("src/components/modernist/Catalogo.tsx");
    expect(catalogo).toMatch(/if \(!reorganiza\) \{\s*setCardsNaTela\(cardsDoFiltro\);\s*return;\s*\}\s*startTransition/);
  });
});

describe("Piloto · o CSS", () => {
  const css = ler("src/app/modernist.css");
  const piloto = css.slice(css.indexOf("/* — movimento com função, Piloto"));

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

  it("a seção existe e fica no fim do arquivo", () => {
    expect(piloto.length).toBeGreaterThan(0);
    expect(css.indexOf("/* — movimento com função, Piloto")).toBeGreaterThan(
      css.indexOf("/* — movimento com função, Onda 2"),
    );
  });

  it("toda duração mora no bloco de quem aceita movimento", () => {
    const liberado = bloco(piloto, "@media (prefers-reduced-motion: no-preference)");
    for (const classe of [".mt-foto-viaja", ".mt-card-reorganiza", ".mt-card-sai", ".mt-card-entra"]) {
      expect(liberado).toContain(`(${classe})`);
    }
    // Fora dele, só o enquadramento da foto e a barra parada.
    const fora = piloto.replace(liberado, "");
    expect(fora).not.toMatch(/animation-duration|animation: mt-/);
  });

  it("com menos movimento, nenhuma transição anima", () => {
    const reduzido = bloco(piloto, "@media (prefers-reduced-motion: reduce)");
    expect(reduzido).toMatch(
      /::view-transition-group\(\*\),\s*::view-transition-old\(\*\),\s*::view-transition-new\(\*\)\s*\{\s*animation: none !important;/,
    );
  });

  it("a saída e a entrada dos cards só mexem em opacidade e transform", () => {
    for (const nome of ["mt-card-sai", "mt-card-entra"]) {
      const corpo = bloco(piloto, `@keyframes ${nome}`);
      const propriedades = [...corpo.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      expect(propriedades.length).toBeGreaterThan(0);
      for (const p of propriedades) expect(["opacity", "transform"]).toContain(p);
    }
  });

  it("na viagem, as duas fotos cobrem a caixa e a sobra é cortada", () => {
    // Sem o corte, a foto 4:3 do card vazava acima e abaixo da caixa 16:9.
    expect(bloco(piloto, "::view-transition-image-pair(.mt-foto-viaja),")).toContain("overflow: clip;");
    expect(piloto).toMatch(
      /::view-transition-old\(\.mt-foto-viaja\),\s*::view-transition-new\(\.mt-foto-viaja\)\s*\{\s*height: 100%;\s*object-fit: cover;/,
    );
  });

  it("a cabeça do site tem nome e fica parada por cima", () => {
    expect(bloco(piloto, ".mt-cabecalho-do-site")).toContain("view-transition-name: mt-cabecalho;");
    expect(bloco(piloto, "::view-transition-group(mt-cabecalho)")).toMatch(/z-index: 1;\s*animation: none;/);
    expect(lerCodigo("src/components/Header.tsx")).toContain('<header className="mt-cabecalho-do-site sticky top-0');
  });
});
