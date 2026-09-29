// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Veiculo } from "../src/types";
import { PARAMETROS_DE_FABRICA } from "../src/lib/finance-calculator";

/**
 * A ficha anuncia a visualização uma vez por carro — conferência da tarefa 2.6
 * da revisão de UI, em produção, 29/09/2026.
 *
 * Na BMW X4 (que tem ajuste no painel) o `dataLayer` recebia dois
 * `view_vehicle`, o GA4 dois `view_item` e a `/api/capi` dois ViewContent. O
 * ajuste do painel chega do cliente depois do primeiro render, recria o
 * `veiculo` e o efeito da visualização rodava de novo. Aqui o ajuste chega do
 * mesmo jeito — um rerender com `stockOverrides` novo — e a contagem é feita
 * na função que dispara o evento.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tema = vi.hoisted(() => ({ stockOverrides: {} as Record<string, Record<string, unknown>> }));
const trackVehicleView = vi.hoisted(() => vi.fn(() => "evt-1"));

vi.mock("../src/app/ThemeContext", async () => {
  const real = await vi.importActual<typeof import("../src/app/ThemeContext")>("../src/app/ThemeContext");
  return {
    ...real,
    useTheme: () => ({ companySettings: real.DEFAULT_COMPANY_SETTINGS, stockOverrides: tema.stockOverrides }),
  };
});
vi.mock("../src/lib/telemetry", async () => {
  const real = await vi.importActual<typeof import("../src/lib/telemetry")>("../src/lib/telemetry");
  return { ...real, trackVehicleView };
});
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _f, sizes: _s, priority: _p, unoptimized: _u, fetchPriority: _fp, loader: _l, ...resto } = props;
    return createElement("img", resto as never);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

function veiculo(id: string): Veiculo {
  return {
    id,
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
    pericia: "",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
    tipo: "SUV",
  } as Veiculo;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  tema.stockOverrides = {};
  trackVehicleView.mockClear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function desenhar(v: Veiculo) {
  const { default: PDPClientWrapper } = await import("../src/components/PDPClientWrapper");
  await act(async () => {
    root.render(createElement(PDPClientWrapper, { veiculo: v, parametrosDoFinanciamento: PARAMETROS_DE_FABRICA }));
  });
}

describe("a visualização da ficha sai uma vez", () => {
  it("o ajuste do painel chegando depois não repete o evento", async () => {
    const v = veiculo("7947766");
    await desenhar(v);
    expect(trackVehicleView).toHaveBeenCalledTimes(1);

    // O ajuste chega: `veiculo` é recriado com a descrição do painel.
    tema.stockOverrides = { "7947766": { descricao: "Revisada" } };
    await desenhar(v);
    expect(container.textContent).toContain("Revisada");
    expect(trackVehicleView).toHaveBeenCalledTimes(1);
  });

  it("outro carro na mesma montagem anuncia de novo", async () => {
    await desenhar(veiculo("1"));
    await desenhar(veiculo("2"));
    expect(trackVehicleView.mock.calls.map((c) => (c as unknown as [{ id: string }])[0].id)).toEqual(["1", "2"]);
  });
});
