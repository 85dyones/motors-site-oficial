import { describe, it, expect } from "vitest";
import { mapVeiculoDbToVeiculo } from "../src/lib/supabase";

/**
 * Testes do mapper de linha do banco → interface do front.
 *
 * Servem a dois propósitos no Pacote 0.5:
 *
 *  1. provam que o runner recém-instalado roda contra código real do projeto,
 *     com os aliases do tsconfig, e não só contra fixtures de brinquedo;
 *  2. travam a invariante de segurança de `preco_compra`, hoje sustentada
 *     apenas por um comentário no código (src/lib/supabase.ts:380).
 *
 * O mapper é a fronteira entre `estoque_motors` e o front: toda linha do
 * inventário passa por aqui antes de virar HTML público.
 */

/** Linha mínima como o sync do n8n grava: `id` numérico, campos crus. */
function linhaDoBanco(extra: Record<string, unknown> = {}) {
  return {
    id: 4815162342,
    marca: "toyota",
    modelo: "corolla",
    versao: "2.0 XEi",
    ano: 2022,
    quilometragem: 31000,
    preco: 132000,
    ...extra,
  };
}

describe("mapVeiculoDbToVeiculo", () => {
  it("rejeita linha vazia em vez de devolver objeto meio preenchido", () => {
    expect(() => mapVeiculoDbToVeiculo(null)).toThrow(/empty database item/i);
  });

  it("converte o id numérico do RevendaMais em string", () => {
    // A PK em `estoque_motors` é o ID inteiro do anúncio, mas a interface
    // Veiculo declara `id: string` e as rotas montam URL a partir dele.
    // A coerção acontece aqui e em nenhum outro lugar.
    const v = mapVeiculoDbToVeiculo(linhaDoBanco());
    expect(v.id).toBe("4815162342");
    expect(typeof v.id).toBe("string");
  });

  it("nunca expõe preco_compra ao front", () => {
    // Invariante de negócio: `preco_compra` é o custo de aquisição. Vazar isso
    // numa página pública entrega a margem da loja a qualquer visitante.
    // O mapper é o único ponto onde a linha crua vira objeto serializado para
    // o cliente — se escapar aqui, escapa no HTML.
    const v = mapVeiculoDbToVeiculo(linhaDoBanco({ preco_compra: 98000 }));

    expect(v).not.toHaveProperty("preco_compra");
    expect(JSON.stringify(v)).not.toContain("98000");
  });

  it("preserva siglas de marca que não devem ser capitalizadas", () => {
    expect(mapVeiculoDbToVeiculo(linhaDoBanco({ marca: "bmw" })).marca).toBe("BMW");
    expect(mapVeiculoDbToVeiculo(linhaDoBanco({ marca: "byd" })).marca).toBe("BYD");
    // As demais viram Title Case.
    expect(mapVeiculoDbToVeiculo(linhaDoBanco({ marca: "toyota" })).marca).toBe("Toyota");
  });

  it("cai para url_imagem quando não há array de imagens", () => {
    const v = mapVeiculoDbToVeiculo(
      linhaDoBanco({ url_imagem: "https://cdn.exemplo/foto.jpg" })
    );
    expect(v.whatsapp_images).toEqual(["https://cdn.exemplo/foto.jpg"]);
    expect(v.web_full_images).toEqual(["https://cdn.exemplo/foto.jpg"]);
  });

  it("cai para o logo quando não há imagem nenhuma", () => {
    // Sem isso a ficha do veículo renderiza <img src=""> e quebra o layout.
    const v = mapVeiculoDbToVeiculo(linhaDoBanco());
    expect(v.whatsapp_images).toEqual(["/logo.png"]);
  });

  it("marca oportunidade_patio só quando o promocional é menor que o original", () => {
    const comDesconto = mapVeiculoDbToVeiculo(
      linhaDoBanco({ preco_original: 132000, preco_promocional: 125000 })
    );
    expect(comDesconto.oportunidade_patio).toBe(true);

    const semDesconto = mapVeiculoDbToVeiculo(
      linhaDoBanco({ preco_original: 132000, preco_promocional: 0 })
    );
    expect(semDesconto.oportunidade_patio).toBe(false);
  });
});
