import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";

/**
 * Quantas famílias de fonte o site baixa em TODA página.
 *
 * O layout raiz declarava três via `next/font/google`: Archivo (identidade
 * visual), Geist (corpo) e Geist Mono. A terceira é a que não se paga.
 *
 * Onde `font-mono` aparece no site público: a placa na ficha e os campos da
 * Garagem. Todo o resto está no /admin, atrás de sessão — ou seja, o visitante
 * que chega pela busca baixa uma família inteira para renderizar, no máximo,
 * uma placa. `next/font` injeta o `<link rel="preload">` da fonte no layout
 * raiz, então o custo é de toda página, inclusive das que não têm nenhum
 * `font-mono`.
 *
 * A pilha do sistema resolve os dois casos com zero byte de rede: monoespaçada
 * é justamente o tipo de fonte que todo sistema operacional já tem, e a
 * diferença entre Geist Mono e Consolas numa placa de sete caracteres não é o
 * que sustenta a identidade da marca — Archivo é.
 */

const LAYOUT = "src/app/layout.tsx";
const GLOBAIS = "src/app/globals.css";

describe("o layout raiz não baixa fonte que o site não usa", () => {
  it("declara no máximo duas famílias via next/font", () => {
    // Lido sem comentários: a nota que explica a saída da Geist Mono precisa
    // poder citá-la pelo nome.
    const codigo = lerCodigo(LAYOUT);
    const importe = /import\s*\{([^}]*)\}\s*from\s*"next\/font\/google"/.exec(codigo);

    expect(importe, "o layout não importa next/font/google").not.toBeNull();

    const familias = importe![1]
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);

    expect(familias, `famílias declaradas: ${familias.join(", ")}`).toHaveLength(2);
  });

  it("a Geist Mono não é mais carregada", () => {
    expect(lerCodigo(LAYOUT)).not.toMatch(/Geist_Mono/);
  });

  it("Archivo e Geist continuam — a identidade não sai junto", () => {
    // A trava tem duas pontas de propósito. Um "no máximo duas" sozinho ficaria
    // verde com o layout carregando duas fontes ERRADAS.
    const codigo = lerCodigo(LAYOUT);

    expect(codigo).toMatch(/\bArchivo\b/);
    expect(codigo).toMatch(/\bGeist\b/);
  });
});

describe("font-mono continua funcionando, pela pilha do sistema", () => {
  it("`--font-mono` não aponta para uma webfont", () => {
    const css = ler(GLOBAIS);
    const regra = /--font-mono:\s*([^;]+);/.exec(css);

    expect(regra, "`--font-mono` sumiu do globals.css").not.toBeNull();
    // Apontar para `var(--font-geist-mono)` depois de remover a fonte deixaria
    // a variável indefinida, e o navegador cairia no tipo padrão — que é
    // serifado, não monoespaçado. A placa da ficha ficaria com espaçamento
    // proporcional, e ninguém veria isso num teste de fonte.
    expect(regra![1]).not.toMatch(/--font-geist-mono/);
    expect(regra![1]).toMatch(/monospace/);
  });
});
