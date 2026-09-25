import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
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
 *
 * Desde 2026-09-25 as duas famílias vêm do repositório (`next/font/local`, em
 * `src/app/fontes.ts`), não do Google Fonts na hora da build — ver o cabeçalho
 * de lá. As travas abaixo leem aquele arquivo: `next/font` é resolvido na
 * compilação, e não há o que executar num teste.
 */

const LAYOUT = "src/app/layout.tsx";
const FONTES = "src/app/fontes.ts";
const PASTA_DAS_FONTES = "src/app/fonts";
const GLOBAIS = "src/app/globals.css";

interface ChamadaDeFonte {
  constante: string;
  familia: string | null;
  variavel: string | null;
  caminhos: string[];
  semPreload: boolean;
  semReservaCalculada: boolean;
  reserva: string[];
}

/** Cada `export const X = localFont({ ... });` de `fontes.ts`, lido. */
function chamadas(): ChamadaDeFonte[] {
  const codigo = lerCodigo(FONTES);
  const blocos = [...codigo.matchAll(/export const (\w+) = localFont\(\{([\s\S]*?)\n\}\);/g)];
  return blocos.map(([, constante, corpo]) => ({
    constante,
    familia: /prop:\s*"font-family",\s*value:\s*"([^"]+)"/.exec(corpo)?.[1] ?? null,
    variavel: /variable:\s*"([^"]+)"/.exec(corpo)?.[1] ?? null,
    caminhos: [...corpo.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]),
    semPreload: /preload:\s*false/.test(corpo),
    semReservaCalculada: /adjustFontFallback:\s*false/.test(corpo),
    reserva: [...(/fallback:\s*\[([^\]]*)\]/.exec(corpo)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(
      (m) => m[1],
    ),
  }));
}

function arquivosDe(pasta: string): string[] {
  return readdirSync(join(__dirname, "..", pasta)).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(join(__dirname, "..", caminho)).isDirectory() ? arquivosDe(caminho) : [caminho];
  });
}

describe("o layout raiz não baixa fonte que o site não usa", () => {
  it("declara no máximo duas famílias", () => {
    const leitura = chamadas();
    // Sem isto, um formato novo de chamada que a regex não reconhece deixaria
    // as travas abaixo verdes por não terem o que ler.
    expect(leitura.length, "nenhuma chamada de localFont lida em fontes.ts").toBeGreaterThan(0);

    const familias = [...new Set(leitura.map((c) => c.familia))].sort();
    expect(familias, `famílias declaradas: ${familias.join(", ")}`).toEqual(["Archivo", "Geist"]);
  });

  it("a Geist Mono não é mais carregada", () => {
    expect(lerCodigo(LAYOUT)).not.toMatch(/Geist_?Mono/);
    expect(lerCodigo(FONTES)).not.toMatch(/Geist_?Mono/i);
  });

  it("Archivo e Geist continuam — a identidade não sai junto", () => {
    // A trava tem duas pontas de propósito. Um "no máximo duas" sozinho ficaria
    // verde com o layout carregando duas fontes ERRADAS.
    const codigo = lerCodigo(LAYOUT);

    expect(codigo).toMatch(/import\s*\{\s*Archivo,\s*Geist\s*\}\s*from\s*"\.\/fontes"/);
    expect(codigo).toMatch(/\$\{Geist\.variable\}/);
    expect(codigo).toMatch(/\$\{Archivo\.variable\}/);
  });
});

describe("a build não depende do Google Fonts", () => {
  it("nenhum arquivo de src/ usa next/font/google", () => {
    // `next/font/google` baixa a fonte NA BUILD, e a build cai quando o Google
    // não responde — derrubou o deploy de produção do aa34ca2 em 2026-09-25.
    const culpados = arquivosDe("src")
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => /from\s*"next\/font\/google"/.test(lerCodigo(f)));

    expect(culpados).toEqual([]);
  });

  it("todo arquivo citado existe, e cada família leva a licença junto", () => {
    for (const { caminhos } of chamadas()) {
      for (const caminho of caminhos) {
        expect(existsSync(join(__dirname, "..", "src/app", caminho)), caminho).toBe(true);
      }
    }
    // A OFL permite redistribuir a fonte desde que a licença vá junto.
    expect(existsSync(join(__dirname, "..", PASTA_DAS_FONTES, "OFL-Archivo.txt"))).toBe(true);
    expect(existsSync(join(__dirname, "..", PASTA_DAS_FONTES, "OFL-Geist.txt"))).toBe(true);
  });

  it("a constante que vira variável CSS tem o nome exato da família", () => {
    // `next/font/local` escreve a variável com o NOME DA CONSTANTE, não com o
    // `font-family` das `declarations`. Com `geistSans`, `--font-geist-sans`
    // apontava para uma família "geistSans" que não existe, e o corpo do site
    // caía na fonte reserva sem erro nenhum — achado ao conferir a build.
    const comVariavel = chamadas().filter((c) => c.variavel);

    expect(comVariavel.map((c) => c.variavel).sort()).toEqual([
      "--font-archivo",
      "--font-geist-sans",
    ]);
    for (const c of comVariavel) {
      expect(c.constante, `${c.variavel} é montada pela constante ${c.constante}`).toBe(c.familia);
    }
  });

  it("só a fatia principal é pré-carregada, como era com subsets: [\"latin\"]", () => {
    for (const c of chamadas()) {
      // A fatia principal é a que vira variável; as outras só servem ao
      // caractere raro e não podem pesar em toda página.
      expect(c.semPreload, `${c.constante}: preload`).toBe(c.variavel === null);
    }
  });

  it("a reserva é a de antes, declarada no globals.css", () => {
    const css = ler(GLOBAIS);
    for (const c of chamadas().filter((x) => x.variavel)) {
      expect(c.semReservaCalculada, `${c.constante}: adjustFontFallback`).toBe(true);
      expect(c.reserva).toEqual([`${c.familia} Fallback`]);
      expect(css).toMatch(new RegExp(`@font-face\\s*\\{[^}]*font-family:\\s*"${c.familia} Fallback"`));
    }
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
