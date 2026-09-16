import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HeroHome from "../src/components/modernist/HeroHome";
import type { Veiculo } from "../src/types";

/**
 * O `<h1>` da home precisa dizer O QUE a loja vende e ONDE.
 *
 * Medido em produção em 2026-09-08: o único `<h1>` do site na página de maior
 * autoridade era "FORA DA CURVA" — uma frase de campanha, sem substantivo e
 * sem praça. O `<title>` já trazia as duas coisas desde 25/08; o `<h1>`, não.
 * Para o rastreador a home não afirmava nada sobre seminovos em Curitiba.
 *
 * A correção não é trocar a frase da marca: é PROMOVER a sobrelinha que já
 * existia logo acima ("CURITIBA · 3 DE CADA 10 ENTRAM") para dentro do `<h1>`,
 * com o texto da consulta-alvo. O desenho não muda de lugar; a semântica sim.
 *
 * Por que o texto precisa ser VISÍVEL: `sr-only` ou `display:none` dentro do
 * `<h1>` é o pior dos dois mundos — perde o peso que o texto visível tem e
 * ganha o risco de texto oculto. Este arquivo trava isso junto.
 */

function veiculo(id: string): Veiculo {
  return {
    id,
    marca: "Fiat",
    modelo: "Argo",
    versao: "Drive 1.0",
    ano: 2022,
    preco_original: 78000,
    preco_promocional: 0,
    quilometragem: 30000,
    tipo: "Hatch",
    cambio: "Manual",
    combustivel: "Flex",
    cor: "Prata",
    vendido: false,
    whatsapp_images: [],
    web_full_images: [],
  } as unknown as Veiculo;
}

function hero(): string {
  return renderToStaticMarkup(
    createElement(HeroHome, {
      slides: [veiculo("1"), veiculo("2")],
      totalEstoque: 41,
      totalMarcas: 17,
    }),
  );
}

/** O HTML bruto de cada `<h1>` da saída. */
function h1sBrutos(html: string): string[] {
  return [...html.matchAll(/<h1\b[^>]*>[\s\S]*?<\/h1>/g)].map((m) => m[0]);
}

/**
 * O texto ACESSÍVEL de um `<h1>` — o que o rastreador e o leitor de tela leem.
 *
 * Some com a subárvore de todo elemento `aria-hidden` antes de extrair o texto.
 * É o ponto do arquivo: um `<h1>` pode conter a palavra certa no fonte e não
 * afirmar nada, porque o pedaço que a carrega está marcado como decoração. O
 * traço vermelho da sobrelinha É decoração e tem `aria-hidden` de propósito —
 * o que não pode é o TEXTO estar sob ele.
 */
function textoAcessivel(h1: string): string {
  return h1
    .replace(/<(\w+)\b[^>]*\baria-hidden="true"[^>]*>[\s\S]*?<\/\1>/g, " ")
    .replace(/<(\w+)\b[^>]*\baria-hidden="true"[^>]*\/?>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Os `<h1>` da saída, já reduzidos ao texto que de fato afirma alguma coisa. */
function h1s(html: string): string[] {
  return h1sBrutos(html).map(textoAcessivel);
}

describe("o h1 da home nomeia o produto e a praça", () => {
  it("existe exatamente um h1", () => {
    // A sobrelinha promovida entra DENTRO do h1 que já existe. Se alguém a
    // colar como um segundo h1 ao lado, a página passa a ter dois títulos
    // concorrentes — que é o defeito que esta correção não pode criar.
    expect(h1s(hero())).toHaveLength(1);
  });

  it("o h1 diz Curitiba", () => {
    expect(h1s(hero())[0]).toMatch(/curitiba/i);
  });

  it("o h1 continua dizendo a frase da marca", () => {
    // "FORA DA CURVA" sai do DOM com um <br> no meio; o normalizador acima já
    // devolve as duas palavras separadas por espaço.
    expect(h1s(hero())[0]).toMatch(/fora\s+da\s+curva/i);
  });

  it("o h1 diz que o produto é seminovo", () => {
    expect(h1s(hero())[0]).toMatch(/seminovos?/i);
  });

  it("nenhuma técnica de esconder texto aparece dentro do h1", () => {
    // `sr-only`, `hidden` (a utilidade do Tailwind) e as duas formas em estilo
    // embutido. `aria-hidden` NÃO entra nesta lista: ele é legítimo no traço
    // decorativo, e quem cobre o abuso dele é o caso seguinte.
    const bruto = h1sBrutos(hero())[0] ?? "";
    const classes = [...bruto.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/));

    expect(classes).not.toContain("sr-only");
    expect(classes).not.toContain("hidden");
    expect(bruto).not.toMatch(/display:\s*none/);
    expect(bruto).not.toMatch(/visibility:\s*hidden/);
  });

  it("o texto que afirma a praça não está sob aria-hidden", () => {
    // A armadilha silenciosa: marcar como decoração justamente o span que
    // carrega "Curitiba". O fonte continua com a palavra, o `<h1>` deixa de
    // dizê-la, e nenhum dos outros casos deste arquivo percebe.
    expect(textoAcessivel(h1sBrutos(hero())[0] ?? "")).toMatch(/curitiba/i);
  });

  it("a sobrelinha antiga não sobrou fora do h1", () => {
    // Duas sobrelinhas — a antiga acima e a promovida dentro — repetiriam a
    // mesma informação em cima da outra. Sai a de fora.
    const html = hero();
    const foraDoH1 = html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/g, "");

    expect(foraDoH1).not.toMatch(/3 DE CADA 10 ENTRAM/i);
  });
});
