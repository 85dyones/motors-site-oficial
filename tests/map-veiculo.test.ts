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

  it("nunca expõe a placa ao front", () => {
    // Mesma invariante do custo, por outro motivo: placa é documento do
    // veículo, dado interno da operação. O objeto mapeado vira prop de Server
    // Component no catálogo e na PDP, e prop de Server Component vai
    // serializada no HTML — "a UI não mostra" não impede que esteja lá.
    //
    // Até 2026-08-08 o payload público de /estoque levava `placa` de todos os
    // 65 veículos; passava despercebido porque o campo estava vazio em todos.
    // Quem precisa dela pede `getEstoque({ incluirPlaca: true })`, em rota
    // autenticada.
    const v = mapVeiculoDbToVeiculo(linhaDoBanco({ placa: "ABC1D23" }));

    expect(v).not.toHaveProperty("placa");
    expect(JSON.stringify(v)).not.toContain("ABC1D23");
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

/**
 * Invariante de veracidade: o mapper NÃO INVENTA atributo de veículo.
 *
 * Estes testes existem porque a auditoria de 2026-08-06 encontrou o mapper
 * preenchendo atributo ausente com texto promocional fixo, e o site exibindo
 * isso como fato. Medido contra produção no mesmo dia: `opcionais` vazio em 87
 * dos 88 veículos (todos anunciando "Teto solar, Multimídia, Rodas de liga
 * leve, Câmera de ré") e `laudo_pericia` vazio em 88 de 88 (todos com
 * "histórico livre de passagens por leilão ou sinistros").
 *
 * A remoção desses defaults NÃO quebrou nenhum teste — a suíte inteira passou
 * antes e depois. Era um buraco: a invariante mais cara do site, do ponto de
 * vista de risco ao consumidor, não tinha guarda nenhuma. Isto é essa guarda.
 *
 * Anunciar opcional que o carro não tem, ou laudo limpo em carro não periciado,
 * é afirmação falsa sobre o produto — CDC art. 37.
 */
describe("mapVeiculoDbToVeiculo — não inventa atributo do veículo", () => {
  const INVENCOES_CONHECIDAS = [
    "Teto solar",
    "Câmera de ré",
    "Rodas de liga leve",
    "histórico livre",
    "Cinza Nardo",
    "V-REF100",
    "Consulta Fipe",
    "vistoria cautelar aprovada",
    // Carroceria e perfil de uso adivinhados, removidos em 2026-08-06.
    // "Premium" era o fim da cadeia de `modelo.includes()` de `resolveTipo`:
    // o que o site chamava de CATEGORIA quando não sabia a carroceria.
    "Premium",
    "URBANO & EFICIENTE",
    "FORÇA & OFF-ROAD",
    "LINHAGEM ESPORTIVA",
    "CURADORIA EXCLUSIVA",
  ];

  it("linha sem atributos não ganha nenhum texto promocional", () => {
    const v = mapVeiculoDbToVeiculo(linhaDoBanco());
    const serializado = JSON.stringify(v);

    for (const invencao of INVENCOES_CONHECIDAS) {
      expect(
        serializado.includes(invencao),
        `O mapper reintroduziu um default inventado: "${invencao}"`
      ).toBe(false);
    }
  });

  it("campos ausentes viram string vazia, para a UI poder ocultar a seção", () => {
    const v = mapVeiculoDbToVeiculo(linhaDoBanco());
    expect(v.opcionais).toBe("");
    expect(v.laudo_pericia).toBe("");
    expect(v.combustivel).toBe("");
    expect(v.cor).toBe("");
    expect(v.cambio).toBe("");
    expect(v.tipo).toBe("");
    expect(v.perfil_uso).toBe("");
  });

  it("preserva o atributo real quando ele existe", () => {
    // Contraprova: sem isto, um mapper que zerasse TUDO passaria nos testes
    // acima e destruiria a ficha dos veículos que têm dado de verdade.
    const v = mapVeiculoDbToVeiculo(
      linhaDoBanco({
        opcionais: "Ar-condicionado, Direção elétrica",
        combustivel: "diesel",
        cor: "branco",
        cambio: "manual",
      })
    );
    expect(v.opcionais).toBe("Ar-condicionado, Direção elétrica");
    expect(v.combustivel).toBe("Diesel");
    expect(v.cor).toBe("Branco");
    expect(v.cambio).toBe("Manual");
  });

  it("o nome do modelo não decide a carroceria", () => {
    // `resolveTipo` caía numa cadeia de `modelo.includes()` quando `tipo` vinha
    // vazio. Medido em produção em 2026-08-06: `tipo` preenchido em 88 de 88
    // veículos — a cadeia inteira era palpite guardado para um caso que não
    // acontece. Carroceria é dado do feed ou não é nada.
    for (const modelo of ["hilux", "compass", "corolla", "911 carrera", "gol"]) {
      const v = mapVeiculoDbToVeiculo(linhaDoBanco({ modelo }));
      expect(v.tipo, `"${modelo}" não pode inferir carroceria`).toBe("");
    }
  });

  it("perfil de uso não sai de marca, preço, quilometragem nem texto livre", () => {
    // Os quatro casos que a heurística antiga classificava com mais confiança —
    // e que o feed contradizia. Em produção o palpite acertava 0 de 88.
    const casos = [
      { rotulo: "marca de prestígio + km baixo", linha: { marca: "bmw", quilometragem: 12000 } },
      { rotulo: "preço alto", linha: { marca: "porsche", preco_original: 400000 } },
      { rotulo: "diesel", linha: { combustivel: "diesel" } },
      { rotulo: "'tsi' na versão", linha: { versao: "1.4 TSI Comfortline" } },
      { rotulo: "'4x4' no texto livre", linha: { opcionais: "Tração 4x4, ar-condicionado" } },
    ];

    for (const { rotulo, linha } of casos) {
      const v = mapVeiculoDbToVeiculo(linhaDoBanco(linha));
      expect(v.perfil_uso, `${rotulo} não pode virar perfil de uso`).toBe("");
    }
  });

  it("preserva o perfil de uso do feed sem reescrever o vocabulário", () => {
    // O feed usa um vocabulário próprio ("Família / Conforto", "Econômico /
    // Diário", ...) que não é o dos rótulos inventados. O mapper repassa o
    // texto como está: normalizar aqui seria inventar de novo, um nível abaixo.
    const v = mapVeiculoDbToVeiculo(
      linhaDoBanco({ perfil_uso: "Família / Conforto", combustivel: "diesel" })
    );
    expect(v.perfil_uso).toBe("Família / Conforto");
  });

  it("normaliza a carroceria para exibição, sem inferir nada", () => {
    expect(mapVeiculoDbToVeiculo(linhaDoBanco({ tipo: "suv" })).tipo).toBe("SUV");
    expect(mapVeiculoDbToVeiculo(linhaDoBanco({ tipo: "hatch" })).tipo).toBe("Hatch");
    expect(mapVeiculoDbToVeiculo(linhaDoBanco({ tipo: "MOTOCICLETA" })).tipo).toBe("Motocicleta");
    // "Selecionado" é o placeholder do painel, não uma carroceria.
    expect(mapVeiculoDbToVeiculo(linhaDoBanco({ tipo: "Selecionado" })).tipo).toBe("");
  });

  it("só marca perícia aprovada com aprovação explícita no feed", () => {
    expect(mapVeiculoDbToVeiculo(linhaDoBanco({ pericia: "Aprovado" })).pericia)
      .toBe("PERÍCIA APROVADA");
    expect(mapVeiculoDbToVeiculo(linhaDoBanco({ pericia: "Em análise" })).pericia)
      .toBe("EM ANÁLISE");
    expect(mapVeiculoDbToVeiculo(linhaDoBanco()).pericia).toBe("EM ANÁLISE");
  });

  it("negação no texto da perícia nunca vira selo de aprovação", () => {
    // A heurística anterior aprovava com qualquer menção a "cautelar", "ok" ou
    // "100%" — um "cautelar reprovada" no feed estampava selo verde.
    for (const texto of [
      "cautelar reprovada",
      "laudo cautelar pendente",
      "não aprovado",
      "nao aprovado",
      "sem aprovação",
    ]) {
      const v = mapVeiculoDbToVeiculo(linhaDoBanco({ pericia: texto }));
      expect(v.pericia, `"${texto}" não pode virar perícia aprovada`).not.toBe(
        "PERÍCIA APROVADA"
      );
      expect(v.cautelar_100, `"${texto}" não pode acender o selo cautelar`).toBe(false);
    }
  });

  it("laudo promocional não acende o selo de perícia aprovada", () => {
    // O selo afirma aprovação ao cliente; só o status real do feed pode ligá-lo.
    // Antes, a mera presença de `laudo_pericia` (texto livre) já aprovava.
    const v = mapVeiculoDbToVeiculo(
      linhaDoBanco({
        pericia: "Em análise",
        laudo_pericia: "Veículo aprovado em vistoria cautelar completa",
      })
    );
    expect(v.pericia).toBe("EM ANÁLISE");
    expect(v.cautelar_100).toBe(false);
  });
});
