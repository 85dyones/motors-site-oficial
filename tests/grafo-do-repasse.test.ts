import { describe, it, expect } from "vitest";
import type { CompanySettings } from "../src/types";
import { disponibilidadeDoRepasse, grafoDaPaginaDoRepasse, grafoDoRepasse } from "../src/lib/grafoDoRepasse";
import { PERGUNTAS_DO_REPASSE } from "../src/lib/paginaDoRepasse";
import { ID_DA_LOJA } from "../src/lib/schemaLoja";
import { SITE_URL } from "../src/lib/site";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * Os nós de JSON-LD do repasse, pela função (decisão 17 do PR 3). As rotas
 * são contadas nas Tasks 10 e 11, no molde de `ficha-publica-o-grafo`.
 */
const EMPRESA = { name: "Motors Store", whatsappRaw: "5541997372165", address: "" } as CompanySettings;
const TRILHA = [
  { nome: "Início", caminho: "/" },
  { nome: "Repasse", caminho: "/repasse" },
];
const ABERTO = repasseDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z", aberto_ao_publico_em: "2026-09-24T12:00:00Z" });
const LOJISTAS = repasseDeTeste({ id: "bbbbbbbb-0000-4000-8000-000000000002", slug: "fiat-argo-2019-bbbbbb", situacao: "publicado", lojistas_desde: "2026-09-23T12:00:00Z" });
const RESERVADO = repasseDeTeste({ id: "cccccccc-0000-4000-8000-000000000003", slug: "vw-gol-2015-cccccc", situacao: "reservado", lojistas_desde: "2026-09-20T12:00:00Z", aberto_ao_publico_em: "2026-09-20T12:00:00Z", reservado_em: "2026-09-23T12:00:00Z" });
const VENDIDO = repasseDeTeste({ id: "dddddddd-0000-4000-8000-000000000004", slug: "ford-ka-2018-dddddd", situacao: "vendido", lojistas_desde: "2026-09-15T12:00:00Z", aberto_ao_publico_em: "2026-09-15T12:00:00Z", vendido_em: "2026-09-20T12:00:00Z" });

const tipos = (nos: unknown[]) => nos.map((n) => (n as { "@type": string })["@type"]);
const carroDe = (nos: unknown[]) => nos[0] as Record<string, Record<string, unknown>>;

describe("a ficha do repasse", () => {
  const nos = grafoDoRepasse({ repasse: ABERTO, caminho: `/repasse/${ABERTO.slug}`, trilha: TRILHA, empresa: EMPRESA, disponiveis: [] });

  it("Car, BreadcrumbList, AutoDealer e WebSite", () => {
    expect(tipos(nos)).toEqual(["Car", "BreadcrumbList", "AutoDealer", "WebSite"]);
  });

  it("a oferta é da loja, em reais, usada, e aponta para o #dealer emitido", () => {
    const carro = carroDe(nos);
    expect(carro.offers).toMatchObject({
      "@type": "Offer",
      price: "36900.00",
      priceCurrency: "BRL",
      itemCondition: "https://schema.org/UsedCondition",
      availability: "https://schema.org/InStock",
      seller: { "@id": ID_DA_LOJA },
      availableAtOrFrom: { "@id": ID_DA_LOJA },
    });
    expect((nos[2] as { "@id": string })["@id"]).toBe(ID_DA_LOJA);
  });

  it("o carro se chama pelo nome da casa e mora na URL da ficha", () => {
    const carro = nos[0] as Record<string, unknown>;
    expect(carro.name).toBe("Renault Kwid Zen 1.0 2021");
    expect(carro["@id"]).toBe(`${SITE_URL}/repasse/${ABERTO.slug}#car`);
    expect(carro.bodyType).toBe("Hatch");
    // O id do repasse não existe no catálogo da Meta: sem sku/mpn (spec §8).
    expect(carro).not.toHaveProperty("sku");
  });

  it("a disponibilidade diz o estado", () => {
    expect(disponibilidadeDoRepasse(ABERTO)).toBe("https://schema.org/InStock");
    expect(disponibilidadeDoRepasse(LOJISTAS)).toBe("https://schema.org/LimitedAvailability");
    expect(disponibilidadeDoRepasse(RESERVADO)).toBe("https://schema.org/LimitedAvailability");
    expect(disponibilidadeDoRepasse(VENDIDO)).toBe("https://schema.org/SoldOut");
  });
});

describe("a página /repasse", () => {
  it("com carro aberto: Breadcrumb, ItemList só dos abertos, FAQ, AutoDealer, WebSite", () => {
    const nos = grafoDaPaginaDoRepasse({
      repasses: [ABERTO, LOJISTAS, RESERVADO, VENDIDO],
      perguntas: PERGUNTAS_DO_REPASSE,
      trilha: TRILHA,
      empresa: EMPRESA,
      disponiveis: [],
    });
    expect(tipos(nos)).toEqual(["BreadcrumbList", "ItemList", "FAQPage", "AutoDealer", "WebSite"]);
    const lista = nos[1] as { itemListElement: Array<{ url: string }> };
    expect(lista.itemListElement.map((i) => i.url)).toEqual([`${SITE_URL}/repasse/${ABERTO.slug}`]);
    expect((nos[2] as { mainEntity: unknown[] }).mainEntity).toHaveLength(10);
  });

  it("sem carro aberto, sem ItemList", () => {
    const nos = grafoDaPaginaDoRepasse({
      repasses: [LOJISTAS, VENDIDO],
      perguntas: PERGUNTAS_DO_REPASSE,
      trilha: TRILHA,
      empresa: EMPRESA,
      disponiveis: [],
    });
    expect(tipos(nos)).toEqual(["BreadcrumbList", "FAQPage", "AutoDealer", "WebSite"]);
  });
});
