import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MarcasQueJaPassaram from "../src/components/modernist/MarcasQueJaPassaram";
import { lerCodigo } from "./fonte";
import type { Veiculo } from "../src/types";

/**
 * Hub que existe no sitemap e em navegação nenhuma é URL órfã.
 *
 * `/estoque` liga a vitrine aos hubs perenes, mas o bloco "Seminovos por
 * marca" filtra `veiculos.length > 0`. A marca cujo último carro saiu do ar
 * continua com página, continua no sitemap — e perde o único link interno que
 * tinha. O mesmo vale para o segmento `motos`, que o bloco principal nem
 * consulta: ele é `hubsDeMarca(..., "carros")` em todos os chamadores.
 *
 * Medido em produção em 2026-09-08, varrendo o sitemap contra um rastreio de
 * três níveis a partir da home: **12 hubs** sem nenhum link interno apontando
 * para eles — 5 de marca (Toyota, Citroën, Mercedes-Benz, JTZ, Suzuki) e os 7
 * de modelo pendurados neles.
 *
 * A correção não é remover o filtro do bloco principal: misturar marca com e
 * sem carro na mesma lista confunde quem está comprando, e a contagem "0" ao
 * lado do nome comunica loja vazia. É um SEGUNDO bloco, com título próprio,
 * que assume a lista das que já passaram pela loja.
 *
 * O componente recebe `historico` e `disponiveis` — nunca um segmento — de
 * propósito: era a assinatura com segmento que deixava `motos` para trás em
 * todo chamador. Aqui não há como passar só metade.
 */

function veiculo(parcial: Partial<Veiculo> & Pick<Veiculo, "id" | "marca" | "modelo">): Veiculo {
  return {
    versao: "",
    ano: 2022,
    quilometragem: 40000,
    cambio: "Automático",
    combustivel: "Flex",
    cor: "Prata",
    preco_original: 80000,
    preco_promocional: 0,
    tipo: "Hatch",
    vendido: false,
    whatsapp_images: [],
    web_full_images: [],
    ...parcial,
  } as Veiculo;
}

/** Vendida: só no histórico. É a marca que fica órfã. */
const COROLLA = veiculo({ id: "1", marca: "Toyota", modelo: "Toyota Corolla", tipo: "Sedan" });
/** Moto vendida — o segmento que nenhum chamador consultava. */
const GSX = veiculo({ id: "2", marca: "Suzuki", modelo: "Suzuki GSX-R", tipo: "Motocicleta" });
/** À venda: a marca aparece no bloco PRINCIPAL, não neste. */
const ARGO = veiculo({ id: "3", marca: "Fiat", modelo: "Fiat Argo", tipo: "Hatch" });

const HISTORICO = [COROLLA, GSX, ARGO];
const DISPONIVEIS = [ARGO];

function bloco(historico: Veiculo[], disponiveis: Veiculo[]): string {
  return renderToStaticMarkup(
    createElement(MarcasQueJaPassaram, { historico, disponiveis }),
  );
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);
}

describe("as marcas sem estoque continuam alcançáveis por link", () => {
  it("a marca de carro sem nenhuma unidade à venda ganha link", () => {
    expect(hrefs(bloco(HISTORICO, DISPONIVEIS))).toContain("/carros/toyota");
  });

  it("a marca de MOTO sem unidade à venda também ganha link", () => {
    // O caso que a assinatura por segmento escondia: `hubsDeMarca(..., "carros")`
    // em todos os chamadores deixava `/motos/*` fora de qualquer navegação.
    expect(hrefs(bloco(HISTORICO, DISPONIVEIS))).toContain("/motos/suzuki");
  });

  it("a marca COM estoque não aparece neste bloco", () => {
    // Ela já está no bloco principal. Repetida aqui, o leitor lê duas listas
    // que dizem a mesma coisa e a segunda perde o sentido.
    expect(hrefs(bloco(HISTORICO, DISPONIVEIS))).not.toContain("/carros/fiat");
  });

  it("sem nenhuma marca vazia, o bloco inteiro some", () => {
    // Um título "Marcas que já passaram pela loja" seguido de nada é pior que
    // a ausência do bloco.
    expect(bloco([ARGO], [ARGO])).toBe("");
  });

  it("não mostra contagem zero ao lado do nome", () => {
    // "TOYOTA 0" comunica loja vazia. O bloco principal mostra a contagem
    // porque ela é notícia boa; aqui ela seria o contrário.
    const html = bloco(HISTORICO, DISPONIVEIS);

    expect(html).not.toMatch(/>\s*0\s*</);
  });

  it("o bloco tem cabeçalho próprio e diz o que fazer", () => {
    const html = bloco(HISTORICO, DISPONIVEIS);

    expect(html).toMatch(/<h2[^>]*>[^<]*já passaram pela loja/i);
    // O estoque gira: a página vazia de hoje é a busca sob encomenda de amanhã.
    expect(html).toMatch(/avise|encomenda|busca/i);
  });

  it("todo link do bloco aponta para um hub que existe", () => {
    // Um `/carros/ferrari` aqui seria 404 e sinal jogado fora. A fonte é o
    // histórico: marca que a loja nunca teve não vira link.
    for (const href of hrefs(bloco(HISTORICO, DISPONIVEIS))) {
      expect(href).toMatch(/^\/(carros|motos)\/[a-z0-9-]+$/);
    }
  });
});

describe("/estoque monta o bloco", () => {
  const fonte = lerCodigo("src/app/estoque/page.tsx");

  it("a página renderiza MarcasQueJaPassaram", () => {
    // Componente escrito e não montado é o defeito com a melhor aparência
    // possível: teste verde, arquivo bonito, zero efeito na página servida.
    expect(fonte).toMatch(/<MarcasQueJaPassaram\b/);
  });

  it("passa o histórico e os disponíveis, não uma lista já filtrada", () => {
    // Filtrar antes de entregar devolveria a decisão para a página, que é de
    // onde ela saiu. A guarda tem de morar junto do desenho.
    expect(fonte).toMatch(/<MarcasQueJaPassaram[^/>]*historico=\{historico\}/);
    expect(fonte).toMatch(/<MarcasQueJaPassaram[^/>]*disponiveis=\{disponiveis\}/);
  });

  it("o bloco principal continua filtrando quem tem estoque", () => {
    // A correção ADICIONA um bloco; não afrouxa o principal.
    expect(fonte).toMatch(/hubsDeMarca\(historico, disponiveis, "carros"\)\s*\.?\s*\n?\s*\.filter/);
  });
});
