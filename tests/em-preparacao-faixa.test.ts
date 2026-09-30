import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Veiculo } from "../src/types";

/**
 * A faixa "EM PREPARAÇÃO · CHEGA EM N DIAS" no card — renderizado, e afirmando
 * sobre o texto que chega ao leitor, nos dois ramos (memória "trava só vale se
 * reprovar": recorte de fonte tem sempre uma borda a mais).
 */

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

const veiculo = (over: Partial<Veiculo> = {}): Veiculo =>
  ({
    id: "8497421",
    marca: "Fiat",
    modelo: "Argo",
    versao: "Drive 1.0",
    ano: 2025,
    quilometragem: 9000,
    cambio: "Manual",
    combustivel: "Flex",
    cor: "Branco",
    fipe: "",
    preco_original: 79900,
    preco_promocional: 0,
    pericia: "",
    whatsapp_images: ["https://cdn.exemplo/f.jpg"],
    web_full_images: ["https://cdn.exemplo/f.webp"],
    opcionais: "",
    laudo_pericia: "",
    ...over,
  }) as Veiculo;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T13:00:00Z")); // seg 28/09, 10h em SP
});
afterEach(() => vi.useRealTimers());

async function card(v: Veiculo): Promise<string> {
  const { CardVeiculo } = await import("../src/components/modernist/primitivos");
  return renderToStaticMarkup(createElement(CardVeiculo, { veiculo: v, href: "/carros/x" }))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

describe("a faixa no card", () => {
  it("carro em preparação: a faixa com os dias, E o preço", async () => {
    const texto = await card(veiculo({ em_preparacao: true, previsao_chegada_em: "2026-10-03T17:00:00Z" }));
    expect(texto).toContain("EM PREPARAÇÃO · CHEGA EM 5 DIAS");
    expect(texto).toMatch(/R\$\s79\.900/);
  });

  it("carro comum: nenhuma faixa", async () => {
    const texto = await card(veiculo());
    expect(texto).not.toContain("EM PREPARAÇÃO");
  });

  it("data vencida: sem prometer dia", async () => {
    const texto = await card(veiculo({ em_preparacao: true, previsao_chegada_em: "2026-09-25T17:00:00Z" }));
    expect(texto).toContain("EM PREPARAÇÃO · CHEGA A QUALQUER MOMENTO");
  });
});

describe("a faixa na TV do showroom", () => {
  // VitrineTV é "use client" e troca de carro sozinha via `setInterval`
  // (efeito). `renderToStaticMarkup` não roda efeitos — a montagem inicial
  // fica presa no carro de índice 0, que é exatamente o que os dois casos
  // abaixo precisam: um array com um carro só, sem depender do temporizador.
  async function tv(v: Veiculo): Promise<string> {
    const { default: VitrineTV } = await import("../src/components/modernist/VitrineTV");
    return renderToStaticMarkup(
      createElement(VitrineTV, {
        veiculos: [v],
        totalEstoque: 1,
        nomeLoja: "Motors Store",
        telefone: "(11) 4000-0000",
      }),
    )
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
  }

  it("carro em preparação: a faixa aparece sobre a foto", async () => {
    const texto = await tv(veiculo({ em_preparacao: true, previsao_chegada_em: "2026-10-03T17:00:00Z" }));
    expect(texto).toContain("EM PREPARAÇÃO · CHEGA EM 5 DIAS");
  });

  it("carro comum: nenhuma faixa", async () => {
    const texto = await tv(veiculo());
    expect(texto).not.toContain("EM PREPARAÇÃO");
  });
});

describe("a faixa no tablet de balcão", () => {
  // VitrineBalcao usa `getVeiculoPdpUrl` (lib/supabase) só para montar o
  // `href` do card — função pura sobre marca/modelo/versão/tipo, sem cliente
  // Supabase de verdade (o módulo cai em `supabase: null` sem as variáveis de
  // ambiente). Nada aqui é dublado além do `next/link` já mockado acima.
  async function balcao(v: Veiculo): Promise<string> {
    const { default: VitrineBalcao } = await import("../src/components/modernist/VitrineBalcao");
    return renderToStaticMarkup(
      createElement(VitrineBalcao, {
        veiculos: [v],
        nomeLoja: "Motors Store",
        whatsappHref: "https://wa.me/5511999999999",
      }),
    )
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
  }

  it("carro em preparação: a faixa aparece sobre a foto", async () => {
    const texto = await balcao(veiculo({ em_preparacao: true, previsao_chegada_em: "2026-10-03T17:00:00Z" }));
    expect(texto).toContain("EM PREPARAÇÃO · CHEGA EM 5 DIAS");
  });

  it("carro comum: nenhuma faixa", async () => {
    const texto = await balcao(veiculo());
    expect(texto).not.toContain("EM PREPARAÇÃO");
  });
});
