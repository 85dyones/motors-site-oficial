import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * A régua vertical que separa colunas precisa de respiro dos dois lados.
 *
 * O sistema Modernist separa item de item com uma régua de 1px. Quando ela é
 * vertical, o jeito errado de escrever é dar só `pr-*` à coluna:
 *
 *     flex-1 border-r pr-6 last:border-r-0
 *
 * Isso afasta a régua do texto da própria coluna e a cola no texto da coluna
 * seguinte, que não tem `pl-*` nenhum. Na tela o resultado é uma barra
 * encostada no "02", como se o número fizesse parte da régua. O jeito certo
 * é o da calculadora de financiamento: `pr-6` na primeira, `px-6` no meio,
 * `pl-6` na última — ou `pl-* pr-* first:pl-0 last:pr-0`, que dá o mesmo
 * resultado sem depender da posição de cada coluna estar escrita à mão.
 *
 * O teste não tenta adivinhar toda régua vertical do projeto: ele procura a
 * assinatura inequívoca de "fila de colunas separadas por régua" — um
 * `border-r` acompanhado do `last:border-r-0` que apaga a régua da última —
 * e cobra padding à esquerda no mesmo breakpoint. Réguas verticais de outra
 * natureza (moldura de coluna fixa, divisor de duas colunas com `gap`) não
 * têm essa assinatura e ficam de fora de propósito.
 */

const RAIZ = join(__dirname, "..", "src");

function arquivosTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosTsx(caminho);
    return nome.endsWith(".tsx") ? [caminho] : [];
  });
}

/** Prefixo de breakpoint de uma classe: "lg:" em `lg:border-r`, "" em `border-r`. */
const BREAKPOINTS = ["sm:", "md:", "lg:", "xl:", "desktop:", ""] as const;

/**
 * Colunas em fila: `{bp}:last:border-r-0` só existe onde há uma sequência de
 * colunas com régua entre elas. É essa a assinatura que o teste persegue.
 */
function breakpointsComFilaDeColunas(classes: string): string[] {
  return BREAKPOINTS.filter((bp) => {
    const temFila = new RegExp(`(^|[\\s\`])${bp}last:border-r-0(\\s|$|\`)`).test(classes);
    const temRegua = new RegExp(`(^|[\\s\`])${bp}border-r(\\s|$|\`)`).test(classes);
    return temFila && temRegua;
  });
}

/** `pl-*`, `px-*` ou `p-*` no mesmo breakpoint — sem contar `first:pl-0`. */
function temPaddingEsquerda(classes: string, bp: string): boolean {
  return new RegExp(`(^|[\\s\`])${bp}p[lx]?-[^\\s\`]+`).test(classes);
}

const CLASSNAME = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g;

/** Todo literal de className do arquivo, com onde ele começa na fonte. */
function classNames(fonte: string): { classes: string; em: number }[] {
  return [...fonte.matchAll(CLASSNAME)].map((m) => ({
    classes: m[1] ?? m[2] ?? m[3] ?? "",
    em: m.index ?? 0,
  }));
}

/**
 * O respiro à direita da régua pode vir do `gap` do contêiner em vez do
 * `pl-*` do filho — e onde ele vem do `gap`, escrever `pl-*` também só
 * empurraria o texto para longe demais. O contêiner é o `className` de
 * layout imediatamente anterior na fonte.
 */
function contêinerSeparaColunas(fonte: string, em: number): boolean {
  const anteriores = classNames(fonte.slice(0, em));
  for (const { classes } of anteriores.reverse()) {
    if (!/\b(grid|flex)\b/.test(classes)) continue;
    return /(^|\s)\w*:?gap(-x)?-/.test(classes);
  }
  return false;
}

describe("régua vertical entre colunas", () => {
  it("nunca encosta no texto da coluna seguinte", () => {
    const coladas: string[] = [];

    for (const arquivo of arquivosTsx(RAIZ)) {
      const fonte = readFileSync(arquivo, "utf-8");
      for (const { classes, em } of classNames(fonte)) {
        for (const bp of breakpointsComFilaDeColunas(classes)) {
          if (temPaddingEsquerda(classes, bp)) continue;
          if (contêinerSeparaColunas(fonte, em)) continue;
          coladas.push(
            `${relative(RAIZ, arquivo)} — falta "${bp}pl-*" em: ${classes.trim()}`
          );
        }
      }
    }

    expect(coladas).toEqual([]);
  });

  it("a régua de valores de /sobre continua alinhada à grade da seção", () => {
    // O bug relatado: a barra entre "01" e "02" nascia colada no "02". A
    // correção não pode ser "empurra tudo para a direita" — a primeira
    // coluna tem que seguir alinhada com o rótulo da seção acima dela, ou a
    // grade modular (que é o sistema inteiro) perde o prumo.
    const sobre = readFileSync(
      join(RAIZ, "components", "SobreClientWrapper.tsx"),
      "utf-8"
    );
    expect(sobre).toContain("lg:pl-6");
    expect(sobre).toContain("lg:first:pl-0");
    expect(sobre).toContain("lg:last:pr-0");
  });
});
