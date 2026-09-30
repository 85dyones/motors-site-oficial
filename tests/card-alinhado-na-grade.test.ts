// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Veiculo } from "../src/types";
import { grafiaDoToken, grafiaDaVersao } from "../src/lib/grafiaCanonica";
import { lerCodigo } from "./fonte";

/**
 * O card de veículo alinhado com os vizinhos da grade — revisão de UI de
 * 29/09/2026 (tarefas 1.2, 1.3 e 1.8 do plano de ação).
 *
 * No `/estoque` daquele dia, a Ford F-250 não tinha versão. O card pulava a
 * linha, e ano, km e preço subiam em relação aos outros dois da fileira. O
 * mesmo card mostrava "F-250 Xlt": o "xlt" não estava na lista de siglas.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _f, sizes: _s, priority: _p, unoptimized: _u, fetchPriority: _fp, ...resto } = props;
    return createElement("img", resto as never);
  },
}));
vi.mock("next/link", () => ({
  // O card desenha `SinalDeAbertura`, que lê o estado do link.
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

function veiculo(parcial: Partial<Veiculo> & { id: string }): Veiculo {
  return {
    marca: "Ford",
    modelo: "F-250",
    versao: "",
    ano: 2008,
    quilometragem: 269766,
    cambio: "Manual",
    combustivel: "Diesel",
    cor: "Preto",
    fipe: "",
    preco_original: 158900,
    preco_promocional: 0,
    pericia: "aprovada",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
    tipo: "Picape",
    ...parcial,
  } as Veiculo;
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;

async function montarCard(v: Veiculo): Promise<HTMLDivElement> {
  const { CardVeiculo } = await import("../src/components/modernist/primitivos");
  const alvo = document.createElement("div");
  document.body.appendChild(alvo);
  container = alvo;
  const raiz = createRoot(alvo);
  root = raiz;
  await act(async () => {
    raiz.render(createElement(CardVeiculo, { veiculo: v, href: "/carros/x" }));
  });
  return alvo;
}

afterEach(async () => {
  if (!root || !container) return;
  const raiz = root;
  await act(async () => raiz.unmount());
  container.remove();
  root = undefined;
  container = undefined;
});

describe("a linha da versão existe mesmo sem versão", () => {
  it("carro sem versão: a linha está lá, com um espaço que ocupa a altura", async () => {
    const card = await montarCard(veiculo({ id: "1", versao: "" }));
    const linha = card.querySelector('[data-linha="versao"]');
    expect(linha).not.toBeNull();
    expect(linha!.textContent).toBe(" ");
  });

  it("carro com versão: a mesma linha, com a versão", async () => {
    const card = await montarCard(veiculo({ id: "2", marca: "BMW", modelo: "X4", versao: "M40i 3.0 M Sport" }));
    expect(card.querySelector('[data-linha="versao"]')!.textContent).toBe("M40i 3.0 M Sport");
  });

  it("a linha reserva a altura e corta em uma linha só", () => {
    const codigo = lerCodigo("src/components/modernist/primitivos.tsx");
    const trecho = codigo.slice(codigo.indexOf('data-linha="versao"'), codigo.indexOf("{versaoExibida ||"));
    expect(trecho).toContain("min-h-[1.45em]");
    expect(trecho).toContain("truncate");
  });

  it("o card aceita encolher, para a versão longa cortar em vez de alargar a grade", async () => {
    const card = await montarCard(
      veiculo({ id: "4", versao: "2.8 D-4D Turbo Diesel SRX 4x4 Cabine Dupla Automatic Premium" }),
    );
    expect(card.querySelector("a")!.className).toContain("min-w-0");
  });
});

describe("números do card em algarismos de largura fixa", () => {
  it("preço e as colunas de ano, km e câmbio usam tabular-nums", async () => {
    const card = await montarCard(veiculo({ id: "3" }));
    // O elemento mais interno com o preço: o contêiner em volta tem o mesmo
    // texto quando o card não tem parcela.
    const preco = [...card.querySelectorAll("div")].find(
      (d) => d.textContent?.trim() === "R$ 158.900" && d.querySelector("div") === null,
    );
    expect(preco?.className).toContain("tabular-nums");
    // Desde a 3.4 ano, km e câmbio são três colunas (`<dl>`), e o km sai sem
    // o "km" — o rótulo da coluna diz a unidade.
    const km = [...card.querySelectorAll("dd")].find((d) => d.textContent === "269.766");
    expect(km?.className).toContain("tabular-nums");
  });
});

describe("siglas das versões da Ford", () => {
  it.each([
    ["xlt", "XLT"],
    ["xls", "XLS"],
    ["xl", "XL"],
  ])("%s → %s", (bruto, esperado) => {
    expect(grafiaDoToken(bruto)).toBe(esperado);
  });

  it("a versão inteira sai com a sigla em maiúscula e o resto intacto", () => {
    expect(grafiaDaVersao("xlt 3.9 4x4 cd die.")).toBe("XLT 3.9 4x4 CD Die.");
  });
});

describe(".mt-rotulo a 11px", () => {
  it("11px e 0,12em", () => {
    const regra = lerCodigo("src/app/modernist.css").match(/\.mt-rotulo \{([^}]*)\}/)?.[1] ?? "";
    expect(regra).toMatch(/font-size:\s*11px/);
    expect(regra).toMatch(/letter-spacing:\s*0\.12em/);
  });
});
