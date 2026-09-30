// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ler, lerCodigo } from "./fonte";

/**
 * Qualidade percebida ao navegar (30/09/2026), itens 1, 2, 3 e 6 da revisão:
 *
 *   1. a foto esmaece ao chegar em vez de piscar sobre o cinza;
 *   2. o card responde ao mouse (zoom leve) e ao toque (escurece);
 *   3. o card tocado mostra que a ficha está abrindo;
 *   6. parágrafo sem palavra sozinha na última linha, e as setas da galeria
 *      com alvo de 44 px no celular.
 *
 * O risco do item 1 é uma foto que nunca aparece. Por isso o grosso deste
 * arquivo prova o que NÃO acontece: o servidor não esconde, a foto
 * prioritária não esconde, e erro também revela.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const link = vi.hoisted(() => ({ pending: false }));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _f, sizes: _s, priority: _p, preload: _pl, loader: _l, fetchPriority: _fp, unoptimized: _u, ...resto } = props;
    return createElement("img", resto as never);
  },
}));

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: link.pending }),
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

const CARRO57 = "https://s3.carro57.com.br/mt/1/foto.jpg";
const NOSSA = "https://zwbqmzgnagfeqinqkolp.supabase.co/storage/v1/object/public/veiculos/1/web/1.webp";

let raiz: Root | null = null;
let palco: HTMLDivElement | null = null;

afterEach(() => {
  act(() => raiz?.unmount());
  palco?.remove();
  raiz = null;
  palco = null;
  link.pending = false;
});

async function montar(elemento: ReturnType<typeof createElement>): Promise<HTMLDivElement> {
  palco = document.createElement("div");
  document.body.appendChild(palco);
  raiz = createRoot(palco);
  await act(async () => raiz!.render(elemento));
  return palco;
}

const disparar = async (img: HTMLImageElement, tipo: "load" | "error") => {
  await act(async () => {
    img.dispatchEvent(new Event(tipo));
  });
};

describe("1 · a foto surge em vez de piscar", () => {
  it("o HTML do servidor não esconde nenhuma foto", async () => {
    const { default: FotoOtimizadaDoCard } = await import("../src/components/modernist/FotoOtimizadaDoCard");
    const { default: FotoPropriaDoCard } = await import("../src/components/modernist/FotoPropriaDoCard");
    const { default: FotoDaFicha } = await import("../src/components/ficha/FotoDaFicha");
    const html = renderToStaticMarkup(
      createElement("div", null, [
        createElement(FotoOtimizadaDoCard, { key: "a", src: CARRO57, alt: "a", fill: true }),
        createElement(FotoPropriaDoCard, { key: "b", src: NOSSA, alt: "b", fill: true }),
        createElement(FotoDaFicha, { key: "c", src: NOSSA, alt: "c", fill: true }),
      ]),
    );
    expect(html.match(/<img/g)).toHaveLength(3);
    expect(html).not.toContain("data-surge");
  });

  it("depois da hidratação, a foto que ainda não chegou espera e esmaece quando chega", async () => {
    const { default: FotoOtimizadaDoCard } = await import("../src/components/modernist/FotoOtimizadaDoCard");
    const img = (await montar(createElement(FotoOtimizadaDoCard, { src: CARRO57, alt: "x", fill: true }))).querySelector("img")!;
    expect(img.getAttribute("data-surge")).toBe("espera");
    await disparar(img, "load");
    expect(img.getAttribute("data-surge")).toBe("pronta");
  });

  it("vale para as três: card do carro57, card da foto nossa e galeria da ficha", async () => {
    const { default: FotoPropriaDoCard } = await import("../src/components/modernist/FotoPropriaDoCard");
    const { default: FotoDaFicha } = await import("../src/components/ficha/FotoDaFicha");
    for (const [Componente, src] of [
      [FotoPropriaDoCard, NOSSA],
      [FotoDaFicha, NOSSA],
      [FotoDaFicha, CARRO57],
    ] as const) {
      const img = (await montar(createElement(Componente, { src, alt: "x", fill: true }))).querySelector("img")!;
      expect(img.getAttribute("data-surge")).toBe("espera");
      await disparar(img, "load");
      expect(img.getAttribute("data-surge")).toBe("pronta");
      act(() => raiz?.unmount());
      palco?.remove();
    }
  });

  it.each([{ priority: true }, { preload: true }])("a foto prioritária (a do LCP) nunca passa pela espera: %o", async (prioridade) => {
    const { default: FotoOtimizadaDoCard } = await import("../src/components/modernist/FotoOtimizadaDoCard");
    const img = (await montar(createElement(FotoOtimizadaDoCard, { src: CARRO57, alt: "x", fill: true, ...prioridade }))).querySelector("img")!;
    expect(img.hasAttribute("data-surge")).toBe(false);
    await disparar(img, "load");
    expect(img.hasAttribute("data-surge")).toBe(false);
  });

  it("foto que falha também sai da espera, e o onLoad/onError de quem usa continua sendo chamado", async () => {
    const { default: FotoDaFicha } = await import("../src/components/ficha/FotoDaFicha");
    const aoCarregar = vi.fn();
    const aoFalhar = vi.fn();
    const img = (
      await montar(createElement(FotoDaFicha, { src: CARRO57, alt: "x", fill: true, onLoad: aoCarregar, onError: aoFalhar }))
    ).querySelector("img")!;
    await disparar(img, "error");
    expect(img.getAttribute("data-surge")).toBe("pronta");
    expect(aoFalhar).toHaveBeenCalledTimes(1);
    await disparar(img, "load");
    expect(aoCarregar).toHaveBeenCalledTimes(1);
  });

  it("o CSS: esconde só na espera, com a garantia de 4 s, e sem transição para quem pede menos movimento", () => {
    const css = lerCodigo("src/app/modernist.css");
    expect(css).toMatch(/img\[data-surge="espera"\] \{\s*opacity: 0;\s*animation: mt-surge-garantia 0s linear 4s forwards;/);
    expect(css).toMatch(/@keyframes mt-surge-garantia \{\s*to \{\s*opacity: 1;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*img\[data-surge\],\s*\.mt-card-foto,\s*\.mt-card-foto\[data-surge\] \{\s*transition: none;/);
  });
});

describe("2 · o card responde ao mouse e ao toque", () => {
  it("zoom só em aparelho com mouse, preso ao link do card e não a qualquer `.group`", () => {
    const css = lerCodigo("src/app/modernist.css");
    expect(css).toMatch(/@media \(hover: hover\) \{\s*\.mt-card:hover \.mt-card-foto \{\s*transform: scale\(1\.03\);/);
    expect(css).toMatch(/\.mt-card:active \.mt-card-foto \{\s*opacity: 0\.88;/);
    expect(css).not.toMatch(/\.group:(hover|active) \.mt-card-foto/);
  });

  it("a moldura corta o zoom, e as duas fotos do card levam a classe", () => {
    const card = lerCodigo("src/components/modernist/primitivos.tsx");
    expect(card).toContain('className={`group mt-card mt-foco');
    expect(card).toContain('<div className="relative aspect-[4/3] overflow-hidden bg-mt-neutral-300">');
    expect(card.match(/className="mt-card-foto object-cover"/g)).toHaveLength(2);
  });
});

describe("3 · o card tocado mostra que a ficha está abrindo", () => {
  it("a linha só liga com a navegação pendente", async () => {
    const { default: SinalDeAbertura } = await import("../src/components/modernist/SinalDeAbertura");
    expect(renderToStaticMarkup(createElement(SinalDeAbertura))).not.toContain("data-abrindo");
    link.pending = true;
    const html = renderToStaticMarkup(createElement(SinalDeAbertura));
    expect(html).toContain('data-abrindo="sim"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("mora dentro do link do card, sobre a foto", async () => {
    const { CardVeiculo } = await import("../src/components/modernist/primitivos");
    const html = renderToStaticMarkup(
      createElement(CardVeiculo, {
        veiculo: {
          id: "1",
          marca: "Fiat",
          modelo: "Argo",
          versao: "1.0",
          ano: 2021,
          quilometragem: 10000,
          cambio: "Manual",
          combustivel: "Flex",
          cor: "Branco",
          preco_original: 70000,
          preco_promocional: 0,
          pericia: "",
          whatsapp_images: [CARRO57],
          web_full_images: [CARRO57],
        } as never,
        href: "/carros/fiat/argo/1",
      } as never),
    );
    const dentroDoLink = html.slice(html.indexOf("<a "), html.lastIndexOf("</a>"));
    expect(dentroDoLink).toContain("mt-sinal-de-abertura");
  });

  it("CSS: espera 120 ms, para em 90%, e com menos movimento fica parado e inteiro", () => {
    const css = lerCodigo("src/app/modernist.css");
    expect(css).toMatch(/\.mt-sinal-de-abertura\[data-abrindo\] \{\s*opacity: 1;\s*animation: mt-sinal-de-abertura 1\.6s [^;]* 120ms both;/);
    expect(css).toMatch(/to \{\s*transform: scaleX\(0\.9\);/);
    expect(css).toMatch(/\.mt-sinal-de-abertura\[data-abrindo\] \{\s*animation: mt-sinal-parado 0s linear 120ms both;\s*transform: none;/);
  });

  it("sem `loading.tsx` na ficha: ele trocaria o 308 e o 404 da ficha por respostas 200", () => {
    // A ficha decide no servidor se redireciona a URL antiga
    // (`permanentRedirect`) ou se o carro não existe (`notFound`). Com um
    // `loading.tsx`, a resposta começa a sair antes dessa decisão, e o código
    // HTTP já foi enviado quando ela chega.
    const ficha = lerCodigo("src/app/[categoria]/[marca]/[modelo]/[ficha]/page.tsx");
    expect(ficha).toMatch(/permanentRedirect\(/);
    expect(ficha).toMatch(/notFound\(/);
    for (const pasta of ["[categoria]", "[categoria]/[marca]", "[categoria]/[marca]/[modelo]", "[categoria]/[marca]/[modelo]/[ficha]", "estoque", "estoque/[recorte]"]) {
      expect(existsSync(join(__dirname, "..", "src", "app", pasta, "loading.tsx")), pasta).toBe(false);
    }
    expect(existsSync(join(__dirname, "..", "src", "app", "loading.tsx"))).toBe(false);
  });
});

describe("6 · acabamentos", () => {
  it("parágrafo com `text-wrap: pretty`", () => {
    expect(lerCodigo("src/app/modernist.css")).toMatch(/\np \{\s*text-wrap: pretty;/);
  });

  it("as setas da galeria da ficha desenham 36 px no celular, mas o toque pega em 44", () => {
    const ficha = ler("src/components/PDPClientWrapper.tsx");
    const setas = ficha.match(/className="mt-foco mt-alvo absolute (left|right)-0 top-1\/2 z-30 flex h-9 w-9/g);
    expect(setas).toHaveLength(2);
  });
});
