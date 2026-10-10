import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TextoCinetico from "../src/components/modernist/TextoCinetico";
import TextoQueRola from "../src/components/modernist/TextoQueRola";
import Hodometro from "../src/components/modernist/Hodometro";
import { ler, lerCodigo } from "./fonte";

/**
 * Onda cinética do plano de movimento (10/10/2026): títulos que se movem,
 * números que rodam e rótulos que giram no mouse, no Garagem Profiler, na
 * Avaliação Express e nas seções da home que levam a eles.
 *
 * As travas são as cinco regras de sempre, no ponto em que cada peça pode
 * quebrá-las:
 *
 * - o título que abre a página é o candidato a LCP: nasce pintado, nunca em
 *   opacidade zero nem atrás de máscara;
 * - o texto da página continua o mesmo (leitor de tela, busca, testes);
 * - tudo mora em blocos que se desligam com menos movimento, e o rótulo que
 *   rola só existe com mouse;
 * - só `transform` e opacidade.
 */

const css = ler("src/app/modernist.css");
const onda = css.slice(css.indexOf("/* — movimento com função, Onda cinética"));

/** O conteúdo entre as chaves do primeiro bloco que começa em `abertura`. */
function bloco(texto: string, abertura: string): string {
  const inicio = texto.indexOf(abertura);
  if (inicio < 0) return "";
  const chave = texto.indexOf("{", inicio);
  let nivel = 0;
  for (let i = chave; i < texto.length; i++) {
    if (texto[i] === "{") nivel++;
    if (texto[i] === "}" && --nivel === 0) return texto.slice(chave + 1, i);
  }
  return "";
}

/** O texto sem o corpo de nenhum dos blocos que abrem com `abertura`. */
function semBlocos(texto: string, abertura: string): string {
  let resto = texto;
  for (const corpo of todos(texto, abertura).split("\n\u0000")) if (corpo) resto = resto.replace(corpo, "");
  return resto;
}

/** Todos os blocos que abrem com `abertura`, juntos. */
function todos(texto: string, abertura: string): string {
  const partes: string[] = [];
  let resto = texto;
  while (resto.includes(abertura)) {
    const corpo = bloco(resto, abertura);
    partes.push(corpo);
    resto = resto.slice(resto.indexOf(abertura) + abertura.length + corpo.length);
  }
  return partes.join("\n\u0000");
}

const textoDe = (html: string) =>
  html
    .replace(/<br\/?>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&");

describe("Onda cinética · o título cinético", () => {
  it("o texto da página é a frase inteira, com os mesmos espaços", () => {
    const html = renderToStaticMarkup(
      createElement(TextoCinetico, { texto: "Cinco perguntas até o carro certo.", modo: "carga" }),
    );
    expect(textoDe(html)).toBe("Cinco perguntas até o carro certo.");
    expect(html).toContain('data-cinetico="carga"');
  });

  it("a quebra de linha vira <br>, e a ordem das palavras atravessa as linhas", () => {
    const html = renderToStaticMarkup(createElement(TextoCinetico, { texto: "Garagem\nProfiler", modo: "aparece" }));
    expect(html).toMatch(/Garagem<\/span><\/span><br\/><span class="mt-cinetico-mascara">/);
    expect([...html.matchAll(/--mt-palavra:(\d+)/g)].map((m) => Number(m[1]))).toEqual([0, 1]);
  });

  it("na carga a palavra nasce pintada: nem opacidade zero, nem máscara", () => {
    const acende = bloco(onda, "@keyframes mt-cinetico-acende");
    const opacidade = Number(/opacity:\s*([\d.]+)/.exec(acende)![1]);
    expect(opacidade).toBeGreaterThan(0);
    // A máscara (clip-path) só vale para "gesto" e "aparece".
    const liberado = todos(onda, "@media (prefers-reduced-motion: no-preference)");
    expect(liberado).not.toMatch(/\[data-cinetico="carga"\] \.mt-cinetico-mascara/);
    expect(liberado).toMatch(
      /\[data-cinetico="gesto"\] \.mt-cinetico-mascara,\s*\[data-cinetico="aparece"\] \.mt-cinetico-mascara \{\s*clip-path/,
    );
  });

  it("abaixo da dobra, só toca dentro de um AoAparecer", () => {
    const liberado = todos(onda, "@media (prefers-reduced-motion: no-preference)");
    const usos = [...liberado.matchAll(/(\S*)\s\[data-cinetico="aparece"\] \.mt-cinetico-palavra/g)];
    expect(usos.length).toBeGreaterThan(0);
    for (const [, antes] of usos) expect(antes).toBe("[data-aparece]");
  });

  it("o título que abre cada funil acende na carga; o que vem depois de um toque sobe da linha", () => {
    const carMatch = lerCodigo("src/components/CarMatch.tsx");
    expect(carMatch).toContain('<TextoCinetico texto="Cinco perguntas até o carro certo." modo="carga" />');
    expect(carMatch).toContain('<TextoCinetico texto={titulo} modo="gesto" />');
    const avaliacao = lerCodigo("src/components/AutoAvaliacao.tsx");
    expect(avaliacao).toContain('<TextoCinetico texto={tituloDaTela} modo="carga" />');
    expect(avaliacao).toMatch(/texto=\{`Obrigado, \$\{step3\.nome\.split\(" "\)\[0\]\}\.`\} modo="gesto"/);
    const resultado = lerCodigo("src/components/ResultadoDoProfiler.tsx");
    expect(resultado).toMatch(/<TextoCinetico[\s\S]{0,200}modo="gesto"/);
  });

  it("todo título 'aparece' mora dentro de um AoAparecer", () => {
    for (const arquivo of ["src/app/page.tsx", "src/app/avaliacao/page.tsx"]) {
      const fonte = lerCodigo(arquivo);
      const usos = [...fonte.matchAll(/modo="aparece"/g)];
      expect(usos.length).toBeGreaterThan(0);
      for (const uso of usos) {
        const antes = fonte.slice(0, uso.index);
        expect(antes.lastIndexOf("<AoAparecer")).toBeGreaterThan(antes.lastIndexOf("</AoAparecer>"));
      }
    }
  });
});

describe("Onda cinética · as letras que rolam no mouse", () => {
  const html = renderToStaticMarkup(
    createElement("button", { className: "mt-rola-alvo" }, createElement(TextoQueRola, { texto: "MONTAR MEU PERFIL" })),
  );

  it("o nome do botão é o rótulo, uma vez; as letras são desenho, escondidas do leitor de tela", () => {
    expect(textoDe(html)).toBe("MONTAR MEU PERFIL");
    expect(html).toContain('<span class="sr-only">MONTAR MEU PERFIL</span>');
    expect(html).toMatch(/<span class="mt-rola-letras" aria-hidden="true">/);
    // Cada letra é um `span` vazio: a letra vem do CSS (`attr(data-l)`).
    expect(html).toMatch(/<span class="mt-rola-letra" data-l="M" style="--mt-letra:0"><\/span>/);
  });

  it("o atraso conta as letras do rótulo inteiro, atravessando as palavras", () => {
    const ordens = [...html.matchAll(/--mt-letra:(\d+)/g)].map((m) => Number(m[1]));
    expect(ordens).toEqual(Array.from({ length: "MONTARMEUPERFIL".length }, (_, i) => i));
  });

  it("parado, o rótulo é o de sempre; a cópia que entra e o giro só existem com mouse e movimento liberado", () => {
    const comMouse = bloco(onda, "@media (hover: hover) and (prefers-reduced-motion: no-preference)");
    expect(comMouse).toMatch(/\.mt-rola-letra::after \{\s*content: attr\(data-l\);/);
    expect(comMouse).toMatch(/\.mt-rola-alvo:hover \.mt-rola-letra::before/);
    expect(comMouse).toMatch(/\.mt-rola-alvo:focus-visible \.mt-rola-letra::before/);
    const fora = onda.replace(comMouse, "");
    expect(fora).not.toMatch(/:hover|\.mt-rola-letra::after \{/);
    // O espaço entre as palavras é um espaço de verdade, na largura da fonte.
    expect(bloco(onda, ".mt-rola-palavra:not(:last-child)::after")).toMatch(/content: " ";\s*white-space: pre;/);
  });

  it("opções, abas e botões dos dois funis giram; o alvo é o próprio botão", () => {
    const carMatch = lerCodigo("src/components/CarMatch.tsx");
    const opcao = carMatch.slice(carMatch.indexOf("function OpcaoQuiz"), carMatch.indexOf("function ReguaProgresso"));
    expect(opcao).toContain("mt-rola-alvo");
    expect(opcao).toContain("<TextoQueRola texto={titulo} />");
    expect(carMatch).toContain('<TextoQueRola texto="MONTAR MEU PERFIL" />');
    const avaliacao = lerCodigo("src/components/AutoAvaliacao.tsx");
    const estado = avaliacao.slice(avaliacao.indexOf("function OpcaoEstado"), avaliacao.indexOf("export default function"));
    expect(estado).toContain("mt-rola-alvo");
    expect(estado).toContain("<TextoQueRola texto={label} />");
    expect(avaliacao).toContain('<TextoQueRola texto={loading ? "CALCULANDO…" : "SOLICITAR PROPOSTA"} />');
  });
});

describe("Onda cinética · os dados que rodam", () => {
  it("o hodômetro que chega marca o modo; sem `chega`, nasce parado como sempre", () => {
    expect(renderToStaticMarkup(createElement(Hodometro, { texto: "R$ 85.432,00", chega: "montagem" }))).toContain(
      'data-chega="montagem"',
    );
    expect(renderToStaticMarkup(createElement(Hodometro, { texto: "44" }))).not.toContain("data-chega");
  });

  it("a chegada sai do zero e devolve a fita à transição de sempre (`backwards`)", () => {
    const supports = bloco(onda, "@supports (height: 1lh)");
    expect(supports).toMatch(/@media \(prefers-reduced-motion: no-preference\)/);
    expect(supports).toMatch(/\.mt-hodometro\[data-chega="montagem"\] \.mt-hodometro-fita/);
    expect(supports).toMatch(/\[data-aparece\] \.mt-hodometro\[data-chega="aparece"\] \.mt-hodometro-fita/);
    expect(supports).toMatch(/animation: mt-hodometro-chega [^;]* backwards;/);
    expect(bloco(onda, "@keyframes mt-hodometro-chega")).toMatch(/from \{\s*transform: translateY\(0\);/);
  });

  it("a FIPE, os números do Profiler e os passos da home rodam", () => {
    expect(lerCodigo("src/components/AutoAvaliacao.tsx")).toContain('<Hodometro texto={fipeValor} chega="montagem" />');
    const carMatch = lerCodigo("src/components/CarMatch.tsx");
    expect(carMatch).toContain('<Hodometro texto={item.valor} chega="montagem" />');
    expect(carMatch).toContain("SOBRAM <Hodometro texto={String(restantes.length)} />");
    expect(carMatch).toContain("<Hodometro texto={doisDigitos(posicao + 1)} />");
    expect([...lerCodigo("src/app/page.tsx").matchAll(/<Hodometro texto=\{passo\.n\} chega="aparece" \/>/g)]).toHaveLength(2);
  });

  it("a barra da composição anda com scaleX, e não com width", () => {
    const carMatch = lerCodigo("src/components/CarMatch.tsx");
    const painel = carMatch.slice(carMatch.indexOf("composicaoEstoque.map"), carMatch.indexOf("Participação por carroceria"));
    expect(painel).not.toMatch(/transition-\[width\]|width: `/);
    expect(painel).toMatch(/className="mt-barra-dado[^"]*"/);
    expect(painel).toContain("transform: `scaleX(${linha.percentual / 100})`");
  });

  it("o resultado entra em cascata, e as marcas do que o carro atende uma a uma", () => {
    const resultado = lerCodigo("src/components/ResultadoDoProfiler.tsx");
    expect(resultado).toMatch(/className="mt-resultado-entra flex flex-col"\s*style=\{\{ "--mt-ordem": ordem \} as CSSProperties\}/);
    expect(resultado).toMatch(/mt-pedido-marca[\s\S]{0,160}"--mt-marca": marca/);
  });
});

describe("Onda cinética · as regras", () => {
  it("toda animação da onda mora num bloco de quem aceita movimento", () => {
    const fora = semBlocos(
      semBlocos(onda, "@media (prefers-reduced-motion: no-preference)"),
      "@media (hover: hover) and (prefers-reduced-motion: no-preference)",
    );
    expect(fora).not.toMatch(/animation:\s*mt-/);
    expect(fora).not.toMatch(/transition: transform 0\.42s/);
  });

  it("os quadros-chave só mexem em transform e opacidade", () => {
    for (const [, nome] of onda.matchAll(/@keyframes ([a-z-]+)/g)) {
      const corpo = bloco(onda, `@keyframes ${nome}`);
      const propriedades = [...corpo.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const p of propriedades) expect(["opacity", "transform"]).toContain(p);
    }
  });

  it("com menos movimento, a barra de dado troca de uma vez", () => {
    expect(bloco(onda, "@media (prefers-reduced-motion: reduce)")).toMatch(/\.mt-barra-dado \{\s*transition: none;/);
  });
});
