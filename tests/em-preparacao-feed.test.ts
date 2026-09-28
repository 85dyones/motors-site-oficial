import { describe, it, expect, vi } from "vitest";
import type { Veiculo } from "../src/types";

/**
 * O feed de anúncios recusa o carro "em preparação" até ter 4 fotos — decisão
 * do dono em 28/09/2026, "só no site". Exercita o handler, como
 * `feed-catalogo-meta.test.ts`.
 */

const fotos = (n: number) => Array.from({ length: n }, (_, i) => `https://cdn.exemplo/f${i}.jpg`);

const carro = (id: string, over: Partial<Veiculo> = {}): Veiculo =>
  ({
    id,
    marca: "volkswagen",
    modelo: "polo track",
    versao: "",
    ano: 2025,
    quilometragem: 12000,
    cambio: "Manual",
    combustivel: "Flex",
    cor: "Branco",
    fipe: "",
    preco_original: 89900,
    preco_promocional: 0,
    pericia: "",
    tipo: "Hatch",
    whatsapp_images: fotos(1),
    web_full_images: fotos(1),
    opcionais: "",
    laudo_pericia: "",
    descricao: "Um carro.",
    vendido: false,
    ...over,
  }) as Veiculo;

let estoque: Veiculo[] = [];

vi.mock("../src/lib/supabase", async (original) => {
  const real = await original<typeof import("../src/lib/supabase")>();
  return { ...real, getEstoque: async () => estoque };
});

vi.mock("../src/lib/publicacao", async (original) => {
  const real = await original<typeof import("../src/lib/publicacao")>();
  return { ...real, getDatasDeVenda: async () => ({}) };
});

async function gerarFeed(veiculos: Veiculo[]): Promise<string> {
  estoque = veiculos;
  const { GET } = await import("../src/app/api/feed/xml/route");
  return await (await GET(new Request("https://motorsstore.com.br/api/feed/xml"))).text();
}

const DATA = "2026-10-03T17:00:00+00:00";

describe("o feed e o carro em preparação", () => {
  it("em preparação com a foto de cadastro: fora do feed", async () => {
    const xml = await gerarFeed([
      carro("1001", { em_preparacao: true, previsao_chegada_em: DATA }),
    ]);
    expect(xml).not.toContain("<g:id>1001</g:id>");
  });

  it("em preparação com 4 fotos: no feed", async () => {
    const xml = await gerarFeed([
      carro("1002", { em_preparacao: true, previsao_chegada_em: DATA, whatsapp_images: fotos(4) }),
    ]);
    expect(xml).toContain("<g:id>1002</g:id>");
  });

  it("controle: carro comum que a vitrine aceitou continua no feed", async () => {
    const xml = await gerarFeed([carro("1003")]);
    expect(xml).toContain("<g:id>1003</g:id>");
  });
});
