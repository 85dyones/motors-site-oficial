import { describe, it, expect, vi } from "vitest";

/**
 * O `<head>` da ficha que não existe não pode afirmar venda.
 *
 * A descrição servida até 11/09 era *"O veículo procurado não foi localizado em
 * nosso estoque ou já foi vendido"*. A segunda metade é falsa desde que a
 * carência entrou: carro vendido responde **200** com o selo e, passados 90
 * dias, **301** para o hub do modelo (`publicacao.arquivar`). Conferido contra
 * oito vendidos em produção — todos 200.
 *
 * Então o `notFound()` desta rota nunca é venda. É id que nunca existiu, ficha
 * apagada, URL velha de portal ou link torto — e é isso que o corpo da página
 * passou a dizer. O `<head>` tinha ficado para trás, dizendo o contrário do
 * `<h1>` no mesmo documento.
 *
 * Este arquivo é separado de `ficha-sem-veiculo.test.ts` de propósito: lá o
 * assunto é o corpo, que vem de `not-found.tsx`; aqui é o `generateMetadata`,
 * que vem de `page.tsx` e precisa dos dublês da rota inteira.
 */

vi.mock("../src/lib/supabase", () => ({
  getVeiculoById: async () => null,
  getEstoque: async () => [],
  getSinaisDeEstoque: async () => ({ foraDoFeed: false, ultimaPresenca: null }),
  getVeiculoPdpUrl: () => "/carros/volkswagen/nivus/x-1",
  truncateString: (s: string) => s,
}));

vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: {}, procedencia: null }),
}));

async function metadataDaFichaAusente() {
  const { generateMetadata } = await import(
    "../src/app/[categoria]/[marca]/[modelo]/[ficha]/page"
  );
  return generateMetadata({
    params: Promise.resolve({
      categoria: "carros",
      marca: "volkswagen",
      modelo: "nivus",
      ficha: "vw-nivus-999999999",
    }),
  });
}

describe("o metadata da ficha que não existe", () => {
  it("não atribui a ausência a uma venda", async () => {
    const { description } = await metadataDaFichaAusente();

    expect(String(description)).not.toMatch(/vendid/i);
  });

  it("continua nomeando o que aconteceu, em português", async () => {
    const meta = await metadataDaFichaAusente();

    expect(meta.title).toBe("Veículo não encontrado | Motors Store");
    expect(String(meta.description)).toContain("não abre nenhuma ficha");
  });
});
