import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PaginaDeEstoque from "../src/components/modernist/PaginaDeEstoque";
import type { Veiculo } from "../src/types";

/**
 * O bloco tem que estar no HTML DO SERVIDOR.
 *
 * `BuscaSobEncomenda` é `"use client"`, e a dúvida legítima é se a oferta chega
 * ao Googlebot. Chega: client component montado por server component é
 * renderizado no servidor na primeira resposta. `renderToStaticMarkup` prova
 * isso aqui — e prova no PONTO DE CHAMADA, montando a página, não chamando a
 * função da copy (que já é testada em busca-sob-encomenda.test.ts e passaria
 * mesmo que ninguém a usasse).
 *
 * As três regressões que este arquivo trava:
 *
 *   1. Página COM carro não ganha o bloco — o hub existe para levar ao carro.
 *   2. Página SEM a prop mantém o "avise-me" de hoje. São 60+ hubs
 *      (/estoque/[recorte], bairros, /garantia, /financiamento) compartilhando
 *      este mesmo componente, e nenhum deles pediu formulário.
 *   3. "Ver todo o estoque" continua nas duas variantes — regra 6 do CLAUDE.md.
 */

const carro = (id: string): Veiculo =>
  ({
    id,
    marca: "Volkswagen",
    modelo: "Nivus",
    versao: "",
    ano: 2022,
    // `CardVeiculo` lê preco_original/preco_promocional (nunca `preco`) —
    // mesmo par de campos do fixture em tests/hub-sem-estoque.test.ts.
    preco_original: 90000,
    preco_promocional: 0,
    quilometragem: 30000,
    vendido: false,
  }) as unknown as Veiculo;

const alvoDeMarca = {
  marca: "Citroën",
  caminho: "/carros/citroen",
  genero: "m" as const,
  avisarHref: "https://wa.me/5541997372165?text=oi",
};

const alvoDeModelo = {
  marca: "Volkswagen",
  modelo: "Tiguan",
  caminho: "/carros/volkswagen/tiguan",
  genero: "m" as const,
  avisarHref: "https://wa.me/5541997372165?text=oi",
};

const montar = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(PaginaDeEstoque, {
      trilha: [{ rotulo: "Home", href: "/" }],
      titulo: "Teste",
      veiculos: [],
      ...props,
    } as never),
  );

describe("o bloco no HTML do servidor", () => {
  it("aparece com a grade vazia e a prop presente", () => {
    const html = montar({ buscaSobEncomenda: alvoDeMarca });
    expect(html).toContain("Sem Citroën hoje. A gente busca o seu.");
    expect(html).toContain("perícia cautelar independente");
    expect(html).toContain("laudo cautelar independente");
  });

  it("traz a oferta e o botão prontos, sem depender de hidratação", () => {
    const html = montar({ buscaSobEncomenda: alvoDeMarca });
    expect(html).toContain("PROCURE ESSE CARRO PRA MIM");
    expect(html).toContain("Sem taxa, sem compromisso.");
  });

  it("usa a variante de modelo quando há modelo", () => {
    const html = montar({ buscaSobEncomenda: alvoDeModelo });
    expect(html).toContain("Nenhum Volkswagen Tiguan no estoque agora.");
    expect(html).toContain("PROCURE ESSE TIGUAN PRA MIM");
  });

  it("concorda no feminino para moto", () => {
    const html = montar({
      buscaSobEncomenda: { ...alvoDeMarca, marca: "Suzuki", genero: "f", caminho: "/motos/suzuki" },
    });
    expect(html).toContain("Sem Suzuki hoje. A gente busca a sua.");
    expect(html).toContain("PROCURE ESSA MOTO PRA MIM");
  });
});

describe("o que o bloco não pode quebrar", () => {
  it("não aparece quando a grade tem carro", () => {
    const html = montar({ veiculos: [carro("1")], buscaSobEncomenda: alvoDeMarca });
    expect(html).not.toContain("A gente busca o seu");
  });

  it("sem a prop, o avise-me de hoje continua igual", () => {
    // Os 60+ hubs que compartilham este componente e não pediram formulário.
    const html = montar({ avisarHref: "https://wa.me/5541997372165?text=oi" });
    expect(html).toContain("AVISE-ME QUANDO ENTRAR");
    expect(html).not.toContain("A gente busca");
  });

  it("com a prop, o avise-me dá lugar ao formulário — não empilha os dois CTAs", () => {
    const html = montar({ buscaSobEncomenda: alvoDeMarca, avisarHref: "https://wa.me/55419?text=oi" });
    expect(html).not.toContain("AVISE-ME QUANDO ENTRAR");
  });

  it("mantém 'ver todo o estoque' nas duas variantes (regra 6)", () => {
    expect(montar({ buscaSobEncomenda: alvoDeMarca })).toContain("/estoque");
    expect(montar({ buscaSobEncomenda: alvoDeMarca })).toContain("VER TODO O ESTOQUE");
    expect(montar({ buscaSobEncomenda: alvoDeModelo })).toContain("VER O QUE TEM HOJE NO ESTOQUE");
  });

  it("oferece o /carro-perfeito só na página de marca", () => {
    // Na de modelo a pessoa JÁ sabe qual carro quer — a pergunta não se aplica.
    expect(montar({ buscaSobEncomenda: alvoDeMarca })).toContain("/carro-perfeito");
    expect(montar({ buscaSobEncomenda: alvoDeModelo })).not.toContain("/carro-perfeito");
  });
});
