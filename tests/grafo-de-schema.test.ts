import { describe, it, expect } from "vitest";
import {
  ID_DA_LOJA,
  ID_DO_SITE,
  schemaDaLoja,
  schemaDoSite,
} from "../src/lib/schemaLoja";
import { galeriaDoSchema, MAXIMO_DE_IMAGENS, schemaDoVeiculo } from "../src/lib/schemaVeiculo";
import { grafoDaFicha } from "../src/lib/grafoDaFicha";
import type { CompanySettings, Veiculo } from "../src/types";

/**
 * O grafo: quem é a loja, quem é o site, e como os dois se ligam ao veículo.
 *
 * A F2 fecha três buracos que o relatório de schema de 05/09 apontou e que a
 * leitura do código confirmou:
 *
 *  1. a `Offer` de cada ficha referencia `#dealer` desde 25/08, e o nó que esse
 *     id nomeia era emitido em toda página MENOS na ficha — referência órfã
 *     dentro do próprio documento;
 *  2. não existia nó `WebSite` em lugar nenhum, então o domínio não se
 *     declarava como uma entidade só;
 *  3. o `Car` publicava UMA foto, enquanto a ficha mostra a galeria inteira.
 *
 * Nada disso gera rich result — é reforço de grafo, e vale porque é barato.
 */

const EMPRESA: CompanySettings = {
  name: "Motors Store",
  phone: "41 99737-2165",
  whatsapp: "41 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "Seg a sex 8h30-18h30",
  instagram: "https://instagram.com/motorsstore.oficial",
  facebook: "https://facebook.com/motorsstore.oficial",
  cnpj: "",
};

function veiculo(extra: Partial<Veiculo> = {}): Veiculo {
  return {
    id: "8171616",
    marca: "Fiat",
    modelo: "Titano",
    versao: "Volcano 2.2",
    ano: 2025,
    preco_original: 189900,
    preco_promocional: 0,
    quilometragem: 12000,
    tipo: "Picape",
    vendido: false,
    web_full_images: ["https://x/1.webp", "https://x/2.webp", "https://x/3.webp"],
    whatsapp_images: ["https://x/1-zap.jpg"],
    ...extra,
  } as unknown as Veiculo;
}

describe("o site é uma entidade declarada", () => {
  it("o nó WebSite tem @id estável e aponta para a loja como publisher", () => {
    const site = schemaDoSite(EMPRESA) as unknown as Record<string, unknown>;

    expect(site["@type"]).toBe("WebSite");
    expect(site["@id"]).toBe(ID_DO_SITE);
    expect(site.publisher).toEqual({ "@id": ID_DA_LOJA });
    expect(site.inLanguage).toBe("pt-BR");
  });

  it("os dois @id são diferentes — site e loja não são a mesma coisa", () => {
    expect(ID_DO_SITE).not.toBe(ID_DA_LOJA);
    expect(ID_DO_SITE).toMatch(/#website$/);
    expect(ID_DA_LOJA).toMatch(/#dealer$/);
  });

  it("não promete uma busca que o servidor não entrega", () => {
    // `Catalogo` lê `?q=` como valor inicial de estado de cliente: quem chega
    // sem JavaScript recebe os 9 cards do fallback, não o resultado. Declarar
    // `SearchAction` seria descrever o que só existe depois da hidratação.
    const site = schemaDoSite(EMPRESA) as unknown as Record<string, unknown>;

    expect(site).not.toHaveProperty("potentialAction");
  });
});

describe("a oferta do veículo resolve quem vende", () => {
  it("o seller aponta para o mesmo @id que o nó da loja publica", () => {
    const carro = schemaDoVeiculo(veiculo(), { caminho: "/carros/fiat/titano/x-1", indisponivel: false });
    const loja = schemaDaLoja(EMPRESA) as unknown as Record<string, unknown>;
    const oferta = (carro as unknown as Record<string, Record<string, unknown>>).offers;

    // A referência e o nó precisam casar: é isso que faz o `@id` resolver em
    // vez de virar ponteiro solto.
    expect(oferta.seller).toEqual({ "@id": loja["@id"] });
    expect(oferta.availableAtOrFrom).toEqual({ "@id": loja["@id"] });
  });
});

describe("o Car publica a galeria, não uma foto", () => {
  it("manda todas as fotos do site, na ordem do cadastro", () => {
    const carro = schemaDoVeiculo(veiculo(), { caminho: "/x", indisponivel: false }) as unknown as Record<string, unknown>;

    expect(carro.image).toEqual(["https://x/1.webp", "https://x/2.webp", "https://x/3.webp"]);
  });

  it("a primeira posição continua sendo a foto principal", () => {
    const carro = schemaDoVeiculo(veiculo(), { caminho: "/x", indisponivel: false }) as unknown as Record<string, string[]>;

    expect(carro.image[0]).toBe("https://x/1.webp");
  });

  it("cai para as fotos de WhatsApp quando não há as do site", () => {
    expect(galeriaDoSchema({ web_full_images: [], whatsapp_images: ["https://x/a.jpg"] } as never))
      .toEqual(["https://x/a.jpg"]);
  });

  it("não mistura as duas fontes — seria a mesma foto em duas URLs", () => {
    const g = galeriaDoSchema({
      web_full_images: ["https://x/1.webp"],
      whatsapp_images: ["https://x/1-zap.jpg"],
    } as never);

    expect(g).toEqual(["https://x/1.webp"]);
  });

  it("descarta vazio e duplicata", () => {
    const g = galeriaDoSchema({
      web_full_images: ["https://x/1.webp", "", "  ", "https://x/1.webp", "https://x/2.webp"],
      whatsapp_images: [],
    } as never);

    expect(g).toEqual(["https://x/1.webp", "https://x/2.webp"]);
  });

  it("corta no teto — 56 das 59 fichas publicam exatamente dez", () => {
    const muitas = Array.from({ length: 30 }, (_, i) => `https://x/${i}.webp`);
    const g = galeriaDoSchema({ web_full_images: muitas, whatsapp_images: [] } as never);

    expect(g).toHaveLength(MAXIMO_DE_IMAGENS);
    expect(g[0]).toBe("https://x/0.webp");
  });

  it("veículo sem foto nenhuma omite o campo, em vez de publicar lista vazia", () => {
    const carro = schemaDoVeiculo(
      veiculo({ web_full_images: [], whatsapp_images: [] }),
      { caminho: "/x", indisponivel: false },
    ) as unknown as Record<string, unknown>;

    expect(carro.image).toBeUndefined();
  });
});

describe("a ficha publica os quatro nós", () => {
  /**
   * A montagem, que é o que estava descoberto.
   *
   * Enquanto o array vivia no JSX da rota, remover um nó não quebrava tipo,
   * render nem teste — a página seguia publicando JSON-LD válido, só que mudo.
   * Foi assim que a `Offer` passou 11 dias apontando para um `#dealer`
   * que a própria ficha não emitia.
   */
  function grafo() {
    return grafoDaFicha({
      veiculo: veiculo(),
      caminho: "/carros/fiat/titano/volcano-8171616",
      indisponivel: false,
      trilha: [
        { nome: "Home", caminho: "/" },
        { nome: "Estoque", caminho: "/estoque" },
      ],
      empresa: EMPRESA,
      disponiveis: [veiculo()],
    }) as Record<string, unknown>[];
  }

  it("emite Car, BreadcrumbList, AutoDealer e WebSite", () => {
    expect(grafo().map((n) => n["@type"])).toEqual([
      "Car",
      "BreadcrumbList",
      "AutoDealer",
      "WebSite",
    ]);
  });

  it("o #dealer que a oferta referencia está no MESMO documento", () => {
    const nos = grafo();
    const oferta = (nos[0] as unknown as Record<string, Record<string, unknown>>).offers;
    const loja = nos.find((n) => n["@type"] === "AutoDealer");

    // A prova do que a F2 conserta: a referência resolve dentro da página.
    expect(loja).toBeDefined();
    expect(oferta.seller).toEqual({ "@id": loja!["@id"] });
  });

  it("o WebSite publica a mesma loja como publisher", () => {
    const nos = grafo();
    const site = nos.find((n) => n["@type"] === "WebSite");
    const loja = nos.find((n) => n["@type"] === "AutoDealer");

    expect(site!.publisher).toEqual({ "@id": loja!["@id"] });
  });

  it("nenhum nó sai vazio ou sem @type", () => {
    for (const no of grafo()) {
      expect(no).toBeTruthy();
      expect(no["@type"], `nó sem @type: ${JSON.stringify(no).slice(0, 60)}`).toBeTruthy();
    }
  });

  it("o veículo indisponível continua com os quatro nós", () => {
    const nos = grafoDaFicha({
      veiculo: veiculo(),
      caminho: "/x",
      indisponivel: true,
      trilha: [{ nome: "Home", caminho: "/" }],
      empresa: EMPRESA,
      disponiveis: [],
    }) as Record<string, unknown>[];

    expect(nos).toHaveLength(4);
    const oferta = (nos[0] as unknown as Record<string, Record<string, unknown>>).offers;
    expect(oferta.availability).toBe("https://schema.org/OutOfStock");
  });
});
