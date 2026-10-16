import { describe, it, expect } from "vitest";
import { aliviarListaParaOCliente, aliviarParaOCliente, totalDeFotos } from "../src/lib/estoqueParaOCliente";
import { CAMPOS_DA_BUSCA, textoBuscavel } from "../src/lib/vitrine";
import { lerCodigo } from "./fonte";
import type { Veiculo } from "../src/types";

/**
 * O estoque que vai para componente de cliente vai aliviado — 16/10/2026.
 *
 * Medido na produção: home e /estoque com ~490 KB de HTML, 358 KB deles os
 * 43 veículos inteiros serializados no payload do React para a barra de
 * busca e o catálogo. Fotos além da capa, descrição e laudo não cabem num
 * card e não entram na busca — saem do que viaja.
 */

const VEICULO = {
  id: "8171616",
  marca: "Fiat",
  modelo: "Titano",
  versao: "Volcano 2.2 16V 4x4 TB Die. Aut.",
  ano: 2025,
  quilometragem: 42000,
  cambio: "Automático",
  combustivel: "Diesel",
  cor: "Vermelho",
  tipo: "Picape",
  motor: "2.2",
  fipe: "",
  preco_original: 184900,
  preco_promocional: 170900,
  pericia: "PERÍCIA APROVADA",
  whatsapp_images: ["o1", "o2", "o3"],
  web_full_images: ["w1", "w2", "w3", "w4"],
  opcionais: "Ar-condicionado, Teto solar",
  laudo_pericia: "Laudo longo…",
  descricao: "Texto longo da descrição…",
  descricao_seo: "<p>Texto ainda mais longo…</p>",
  status_tag: "ÚNICO DONO",
  perfis_uso: ["familia"],
  em_preparacao: false,
} as unknown as Veiculo;

describe("aliviarParaOCliente", () => {
  const leve = aliviarParaOCliente(VEICULO);

  it("fica só com a capa de cada lista, e a contagem vai em `total_de_fotos`", () => {
    expect(leve.web_full_images).toEqual(["w1"]);
    expect(leve.whatsapp_images).toEqual(["o1"]);
    expect(leve.total_de_fotos).toBe(4);
    expect(totalDeFotos(leve)).toBe(4);
  });

  it("a ficha inteira conta pelas listas; a aliviada, pelo campo", () => {
    expect(totalDeFotos(VEICULO)).toBe(4);
    expect(totalDeFotos({ ...VEICULO, web_full_images: [], whatsapp_images: [] })).toBe(0);
  });

  it("descrição, descrição SEO e laudo não viajam", () => {
    expect(leve).not.toHaveProperty("descricao");
    expect(leve).not.toHaveProperty("descricao_seo");
    expect(leve.laudo_pericia).toBe("");
  });

  it("tudo que a busca varre continua lá, e o texto buscável é o mesmo", () => {
    for (const campo of CAMPOS_DA_BUSCA) expect(leve[campo]).toEqual(VEICULO[campo]);
    expect(textoBuscavel(leve)).toBe(textoBuscavel(VEICULO));
  });

  it("o que o card, o filtro e o simulador lêem continua lá", () => {
    for (const campo of ["id", "preco_original", "preco_promocional", "quilometragem", "pericia", "status_tag", "perfis_uso", "em_preparacao"] as const) {
      expect(leve[campo]).toEqual(VEICULO[campo]);
    }
  });

  it("não muda o original", () => {
    expect(VEICULO.web_full_images).toHaveLength(4);
    expect(VEICULO.descricao).toBeDefined();
  });

  it("lista vazia de fotos não quebra", () => {
    const semFotos = aliviarParaOCliente({ ...VEICULO, web_full_images: undefined, whatsapp_images: undefined } as unknown as Veiculo);
    expect(semFotos.web_full_images).toEqual([]);
    expect(semFotos.total_de_fotos).toBe(0);
  });

  it("a lista inteira passa pelo mesmo alívio", () => {
    expect(aliviarListaParaOCliente([VEICULO, VEICULO]).every((v) => v.total_de_fotos === 4)).toBe(true);
  });
});

describe("as páginas passam a lista aliviada aos componentes de cliente", () => {
  it("home: a barra de busca e o hero", () => {
    const fonte = lerCodigo("src/app/page.tsx");
    expect(fonte).toMatch(/<BuscaRegua estoque=\{estoqueParaOCliente\}/);
    expect(fonte).toMatch(/slides=\{slidesParaOCliente\}/);
    expect(fonte).not.toMatch(/<BuscaRegua estoque=\{disponiveis\}/);
  });

  it("/estoque: o catálogo", () => {
    const fonte = lerCodigo("src/app/estoque/page.tsx");
    expect(fonte).toMatch(/<Catalogo[\s\S]*?estoque=\{aliviarListaParaOCliente\(disponiveis\)\}/);
  });

  it("/financiamento: o simulador", () => {
    const fonte = lerCodigo("src/app/financiamento/page.tsx");
    expect(fonte).toMatch(/<SimuladorDeFinanciamento veiculos=\{aliviarListaParaOCliente\(disponiveis\)\}/);
  });

  it("a ficha: os similares — a ficha do próprio carro vai inteira", () => {
    const fonte = lerCodigo("src/app/[categoria]/[marca]/[modelo]/[ficha]/page.tsx");
    expect(fonte).toMatch(/similares=\{aliviarListaParaOCliente\(similares\)\}/);
    expect(fonte).toMatch(/veiculo=\{veiculo\}/);
  });

  it("o catálogo escreve a contagem de fotos pelo campo, não pelo tamanho da lista", () => {
    const fonte = lerCodigo("src/components/modernist/Catalogo.tsx");
    expect(fonte).toContain("totalDeFotos(v)");
    expect(fonte).not.toMatch(/web_full_images\.length\} fotos/);
  });
});
