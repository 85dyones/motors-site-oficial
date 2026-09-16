import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Veiculo } from "../src/types";

/**
 * O feed de catálogo declara preço e oferta em DUAS tags.
 *
 * Até 2026-08-31 declarava numa só: `g:price` recebia o promocional quando
 * havia promoção, e `g:sale_price` não aparecia em nenhum dos 34 itens. Medido
 * no feed em produção naquele dia, na Saveiro `8335204`:
 *
 *   <g:price>65900.00 BRL</g:price>          ← o promocional, sem dizer que era
 *   (nenhum g:sale_price)
 *
 * Enquanto a ficha do mesmo carro mostrava "de R$ 68.900 por R$ 65.900". Duas
 * consequências: o anúncio perdia a tarja de oferta e o preço riscado, e o
 * valor declarado divergia da página de destino — divergência que o Meta e o
 * Merchant Center reprovam por conta própria, sem avisar que reprovaram.
 *
 * Este teste EXERCITA o handler em vez de ler o arquivo: a suíte já tinha
 * asserções por texto sobre este mesmo feed, e elas não teriam pegado nada
 * disto — o código "certo" pelo texto era exatamente o que produzia o XML
 * errado.
 */

const carro = (over: Partial<Veiculo> = {}): Veiculo =>
  ({
    id: "8335204",
    marca: "volkswagen",
    modelo: "saveiro 1.6 msi robust cs 8v flex 2p manual",
    versao: "",
    ano: 2022,
    quilometragem: 40000,
    cambio: "Manual",
    combustivel: "Flex",
    cor: "Branco",
    fipe: "",
    preco_original: 68900,
    preco_promocional: 65900,
    pericia: "",
    whatsapp_images: ["https://exemplo/foto.jpg"],
    web_full_images: ["https://exemplo/foto.webp"],
    opcionais: "",
    laudo_pericia: "",
    descricao: "Um carro.",
    vendido: false,
    ...over,
  }) as Veiculo;

let estoque: Veiculo[] = [];

vi.mock("../src/lib/supabase", async (original) => {
  const real = await original<typeof import("../src/lib/supabase")>();
  return {
    ...real,
    getEstoque: async () => estoque,
  };
});

async function gerarFeed(veiculos: Veiculo[]): Promise<string> {
  estoque = veiculos;
  const { GET } = await import("../src/app/api/feed/xml/route");
  const res = await GET(new Request("https://motorsstore.com.br/api/feed/xml"));
  return await res.text();
}

/** O bloco `<item>` de um veículo, para as asserções não pegarem o vizinho. */
function itemDe(xml: string, id: string): string {
  const marca = `<g:id>${id}</g:id>`;
  const i = xml.indexOf(marca);
  if (i === -1) return "";
  const inicio = xml.lastIndexOf("<item>", i);
  return xml.slice(inicio, xml.indexOf("</item>", i));
}

beforeEach(() => {
  estoque = [];
});

describe("preço e oferta no feed de catálogo", () => {
  it("carro em promoção: price é o CHEIO e sale_price é o promocional", async () => {
    const item = itemDe(await gerarFeed([carro()]), "8335204");

    expect(item).toContain("<g:price>68900.00 BRL</g:price>");
    expect(item).toContain("<g:sale_price>65900.00 BRL</g:sale_price>");
    // A regressão exata que existia: o promocional ocupando o lugar do cheio.
    expect(item).not.toContain("<g:price>65900.00 BRL</g:price>");
  });

  it("carro sem promoção: price é o cheio e sale_price NÃO aparece", async () => {
    // Tag vazia é pior que tag ausente: o Meta lê `sale_price` vazio como
    // oferta de R$ 0 em alguns fluxos, e como erro de item em outros.
    const item = itemDe(
      await gerarFeed([carro({ id: "8358193", preco_original: 55900, preco_promocional: 0 })]),
      "8358193",
    );

    expect(item).toContain("<g:price>55900.00 BRL</g:price>");
    expect(item).not.toContain("sale_price");
  });

  it("promoção inválida (maior ou igual ao cheio) não vira oferta", async () => {
    // O feed usa a MESMA régua da ficha. Se um valor ruim entrasse no banco por
    // outro caminho, o anúncio não pode prometer desconto que a página não dá.
    for (const promo of [68900, 70000]) {
      const item = itemDe(await gerarFeed([carro({ preco_promocional: promo })]), "8335204");
      expect(item, `promocional ${promo}`).toContain("<g:price>68900.00 BRL</g:price>");
      expect(item, `promocional ${promo}`).not.toContain("sale_price");
    }
  });

  it("o preço declarado é o mesmo que a ficha mostra como 'de'", async () => {
    // A divergência entre feed e página de destino é o que faz o item ser
    // reprovado. `preco_original` é o que a PDP mostra riscado.
    const veiculo = carro();
    const item = itemDe(await gerarFeed([veiculo]), "8335204");
    expect(item).toContain(`<g:price>${veiculo.preco_original.toFixed(2)} BRL</g:price>`);
    expect(item).toContain(`<g:sale_price>${veiculo.preco_promocional.toFixed(2)} BRL</g:sale_price>`);
  });

  it("carro vendido continua fora do feed", async () => {
    const xml = await gerarFeed([carro({ vendido: true })]);
    expect(xml).not.toContain("<g:id>8335204</g:id>");
  });
});
