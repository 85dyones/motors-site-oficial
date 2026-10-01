// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { VeiculoDaVisao } from "../src/components/admin/VisaoDoVeiculo";

/**
 * A grafia da casa na visão e no editor do veículo — pedido do dono em 01/10.
 *
 * O feed do RevendaMais chega em caixa baixa ("renault", "captur intense 1.3
 * tb 16v flex 5p aut.", "automatico", "flex", "branco"), e a visão e o editor
 * mostravam o valor cru: o título do carro, a marca, o câmbio sem acento. A
 * lista do estoque e a ficha pública já saem na grafia da casa porque passam
 * pelo mapeador do site; a visão e o editor liam a linha do banco direto.
 *
 * As duas armadilhas que este arquivo trava:
 *   - o formatador de câmbio do site devolve "Automático" para valor VAZIO, e o
 *     de combustível, "Flex". No painel, campo vazio é "Não informado" — o
 *     painel não pode afirmar sobre o carro o que o cadastro não diz;
 *   - o override do painel (`modelo_override`) vai como foi escrito.
 *
 * Os valores abaixo são os do Renault Captur 8506096, em produção em 01/10.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));
vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => ({}) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DO_FEED = {
  id: 8506096,
  marca: "renault",
  modelo: "captur intense 1.3 tb 16v flex 5p aut.",
  versao: "intense 1.3 tb 16v flex 5p aut.",
  cambio: "automatico",
  combustivel: "flex",
  cor: "branco",
};

const carro = (over: Partial<VeiculoDaVisao> = {}): VeiculoDaVisao => ({
  ...DO_FEED,
  ano: 2022,
  ano_fabricacao: 2021,
  quilometragem: 52631,
  cor_interna: "Preto",
  motor: "1.3 Turbo",
  placa: "RTB1I69",
  donos_anteriores: 0,
  garantia_fabrica: null,
  tipo: "SUV",
  perfis_uso: ["familia"],
  origem: "sync",
  preco_original: 92900,
  preco_promocional: 0,
  preco_compra: null,
  status_tag: null,
  em_preparacao: false,
  previsao_chegada_em: null,
  vendido: false,
  estado_cadastro: "publicado",
  pericia: "Em análise",
  laudo_pericia: null,
  opcionais: null,
  descricao: null,
  descricao_seo: null,
  whatsapp_images: [],
  web_full_images: [],
  created_at: "2026-09-29T12:00:00Z",
  ...over,
} as VeiculoDaVisao);

async function visao(veiculo: VeiculoDaVisao) {
  const { default: VisaoDoVeiculo } = await import("../src/components/admin/VisaoDoVeiculo");
  return renderToStaticMarkup(
    createElement(VisaoDoVeiculo, {
      veiculo,
      perfis: ["comercial"],
      visitas30Dias: null,
      historico: [],
      agora: new Date("2026-10-01T15:00:00Z"),
    }),
  ).replace(/ /g, " ");
}

const titulo = (html: string) => html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, "").trim();

/** Os pares rótulo → valor da ficha, como o leitor os vê. */
const ficha = (html: string) =>
  Object.fromEntries(
    [...html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/g)].map((m) => [
      m[1].replace(/<[^>]+>/g, "").trim(),
      m[2].replace(/<[^>]+>/g, "").trim(),
    ]),
  );

describe("a visão do veículo na grafia da casa", () => {
  it("o título é o nome do carro como a lista e o site o escrevem", async () => {
    expect(titulo(await visao(carro()))).toBe("Renault Captur Intense 1.3 TB 16V Flex 5P Aut.");
  });

  it("marca, modelo, versão, câmbio, combustível e cor saem na grafia da casa", async () => {
    const f = ficha(await visao(carro()));
    expect(f["Marca"]).toBe("Renault");
    expect(f["Modelo"]).toBe("Captur Intense 1.3 TB 16V Flex 5P Aut.");
    expect(f["Versão"]).toBe("Intense 1.3 TB 16V Flex 5P Aut.");
    expect(f["Câmbio"]).toBe("Automático");
    expect(f["Combustível"]).toBe("Flex");
    expect(f["Cor"]).toBe("Branco");
  });

  it("campo vazio continua 'Não informado' — nunca o 'Automático' ou 'Flex' de enfeite", async () => {
    const f = ficha(await visao(carro({ cambio: null, combustivel: "", cor: "  " })));
    expect(f["Câmbio"]).toBe("Não informado");
    expect(f["Combustível"]).toBe("Não informado");
    expect(f["Cor"]).toBe("Não informado");
  });

  it("o override do painel vai como foi escrito", async () => {
    const html = await visao(carro({ modelo_override: "Captur Iconic", versao_override: "Iconic 1.3 TB" }));
    expect(titulo(html)).toBe("Renault Captur Iconic");
    expect(ficha(html)["Modelo"]).toBe("Captur Iconic");
    expect(ficha(html)["Versão"]).toBe("Iconic 1.3 TB");
  });
});

describe("o editor do veículo na grafia da casa", () => {
  let container: HTMLDivElement;
  let root: Root;
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({}) })) as unknown as typeof fetch;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    globalThis.fetch = fetchOriginal;
  });

  async function editor(inicial: Record<string, unknown>) {
    const { default: EditorDeVeiculo } = await import("../src/components/admin/EditorDeVeiculo");
    await act(async () => {
      root.render(
        createElement(EditorDeVeiculo as never, {
          inicial: { preco: 92900, estado_cadastro: "publicado", origem: "sync", whatsapp_images: [], ...inicial } as never,
          visitas30Dias: null,
          perfil: ["comercial"] as never,
        }),
      );
    });
  }

  /** As etiquetas "Do feed" moram na aba "Ficha técnica". */
  async function abrirAFicha() {
    const aba = Array.from(container.querySelectorAll("button")).find((b) => /ficha técnica/i.test(b.textContent ?? ""));
    await act(async () => aba!.click());
  }

  /** As etiquetas "Do feed": rótulo → valor. */
  const etiquetasDoFeed = () =>
    Object.fromEntries(
      Array.from(container.querySelectorAll('span[title^="Campo do feed"]')).map((s) => {
        const rotulo = s.firstElementChild?.textContent?.trim() ?? "";
        return [rotulo, (s.textContent ?? "").slice(rotulo.length).trim()];
      }),
    );

  it("o título do editor é o nome do carro na grafia da casa", async () => {
    await editor(DO_FEED);
    expect(container.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Renault Captur Intense 1.3 TB 16V Flex 5P Aut.",
    );
  });

  it("as etiquetas do feed saem na grafia da casa, e vazio continua '—'", async () => {
    await editor(DO_FEED);
    await abrirAFicha();
    const e = etiquetasDoFeed();
    expect(e["Marca"]).toBe("Renault");
    expect(e["Câmbio"]).toBe("Automático");
    expect(e["Combustível"]).toBe("Flex");
    expect(e["Cor externa"]).toBe("Branco");

    act(() => root.unmount());
    root = createRoot(container);
    await editor({ ...DO_FEED, cambio: null, combustivel: "" });
    await abrirAFicha();
    expect(etiquetasDoFeed()["Câmbio"]).toBe("—");
    expect(etiquetasDoFeed()["Combustível"]).toBe("—");
  });
});
