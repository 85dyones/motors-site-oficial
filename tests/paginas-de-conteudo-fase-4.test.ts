import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PaginaDeEstoque from "../src/components/modernist/PaginaDeEstoque";
import { lerCodigo } from "./fonte";
import {
  RESUMO_DA_GARANTIA,
  PRAZO_DA_GARANTIA,
  SECOES_DE_GARANTIA,
  TEXTO_DE_FINANCIAMENTO,
} from "../src/lib/paginasInstitucionais";

/**
 * Tarefas 4.7 e 4.8 da revisão de UI de 30/09/2026: as duas páginas de
 * conteúdo que abriam com um muro de texto antes do que o visitante veio
 * buscar. `/financiamento` passa a abrir pelo simulador; `/garantia` ganha um
 * resumo de prazo, cobertura e exclusões logo abaixo do título.
 */

type Props = Parameters<typeof PaginaDeEstoque>[0];
const BASE: Props = { trilha: [{ rotulo: "Home", href: "/" }], titulo: "Página", veiculos: [], contagem: false };
const desenhar = (extra: Partial<Props>) =>
  renderToStaticMarkup(createElement(PaginaDeEstoque, { ...BASE, ...extra }));

describe("4.7 · /financiamento abre pelo simulador", () => {
  it("com `secoesDepoisDoConteudo`, a ordem é abertura, ferramenta, seções", () => {
    const html = desenhar({
      introducao: ["ABERTURA"],
      conteudo: createElement("div", null, "FERRAMENTA"),
      posicaoDoConteudo: "antes-da-grade",
      secoes: [{ titulo: "SECAO", paragrafos: ["CORPO"] }],
      secoesDepoisDoConteudo: true,
    });
    const ordem = ["ABERTURA", "FERRAMENTA", "SECAO", "CORPO"].map((t) => html.indexOf(t));
    expect(ordem.every((i) => i >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });

  it("sem a prop, as seções continuam antes do conteúdo (a /garantia não muda)", () => {
    const html = desenhar({
      conteudo: createElement("div", null, "FERRAMENTA"),
      posicaoDoConteudo: "antes-da-grade",
      secoes: [{ titulo: "SECAO", paragrafos: ["CORPO"] }],
    });
    expect(html.indexOf("SECAO")).toBeLessThan(html.indexOf("FERRAMENTA"));
  });

  it("a página usa o mesmo texto, só redistribuído: um parágrafo na abertura, o resto depois", () => {
    const pagina = lerCodigo("src/app/financiamento/page.tsx");
    expect(pagina).toContain("introducao={TEXTO_DE_FINANCIAMENTO.slice(0, 1)}");
    expect(pagina).toContain('secoes={[{ titulo: "Depois da simulação", paragrafos: TEXTO_DE_FINANCIAMENTO.slice(1) }]}');
    expect(pagina).toMatch(/secoesDepoisDoConteudo\s/);
    expect(pagina).toContain('posicaoDoConteudo="antes-da-grade"');
    // O parágrafo que fica na abertura é o que apresenta o simulador.
    expect(TEXTO_DE_FINANCIAMENTO[0]).toMatch(/simulador abaixo/i);
  });
});

describe("4.8 · /garantia com resumo no topo", () => {
  it("o resumo entra logo abaixo do h1, antes da introdução", () => {
    const html = desenhar({
      titulo: "Garantia do seminovo",
      resumo: createElement("dl", null, "RESUMO"),
      introducao: ["INTRODUCAO"],
    });
    const h1 = html.indexOf("</h1>");
    expect(h1).toBeGreaterThan(0);
    expect(html.indexOf("RESUMO")).toBeGreaterThan(h1);
    expect(html.indexOf("RESUMO")).toBeLessThan(html.indexOf("INTRODUCAO"));
  });

  it("prazo, o que cobre e o que não cobre, com o prazo da constante", () => {
    expect(RESUMO_DA_GARANTIA.map((r) => r.rotulo)).toEqual(["Prazo", "Cobre", "Não cobre"]);
    expect(RESUMO_DA_GARANTIA[0].texto.toLowerCase()).toContain(PRAZO_DA_GARANTIA);
    expect(RESUMO_DA_GARANTIA[0].texto).toMatch(/sem carência e sem franquia/i);
  });

  it("nenhuma afirmação nova: cada item do resumo está detalhado nas seções", () => {
    const secoes = SECOES_DE_GARANTIA.flatMap((s) => s.paragrafos).join(" ").toLowerCase();
    for (const termo of ["turbo", "diferencial", "mão de obra", "óleo", "filtros", "pneu", "bateria", "embreagem", "fora de especificação", "colisão", "enchente"]) {
      expect(secoes, termo).toContain(termo);
    }
  });

  it("a página passa o resumo", () => {
    expect(lerCodigo("src/app/garantia/page.tsx")).toContain("resumo={<ResumoDaGarantia />}");
  });
});
