import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { semComentarios } from "./fonte";

/**
 * O varredor de comentários, ele mesmo sob trava.
 *
 * `tests/fonte.ts` é a base de mais de quarenta asserções de fonte deste
 * repositório. Quando ele engole código por engano, o estrago não aparece
 * como vermelho: `toContain` falha por motivo errado e `not.toContain` PASSA
 * lendo o vazio. Uma trava que parou de ler não avisa que parou de proteger —
 * foi assim em 2026-08-28 com `accept="image/*"`, e de novo em 2026-09-05
 * com literal de regex.
 *
 * O defeito de 2026-09-05: o varredor via `//` sem saber que estava DENTRO de
 * um literal. Em `/^https?:\/\//i` a barra escapada encosta na que fecha o
 * literal, e o resto da linha sumia. Sete literais de `src/` caíam nisso, em
 * cinco arquivos — `site.ts` (2), `ciclo/foto.ts` (2), `chatwoot.ts` (1) e
 * `analytics.ts` (2, e ali some o `base64url` inteiro).
 *
 * Os casos vêm em dois blocos, e os dois importam:
 *   • o que o varredor precisa PRESERVAR — o código que ele engolia;
 *   • o que ele precisa CONTINUAR REMOVENDO, porque a correção de um lexer
 *     preguiçoso é ficar guloso. Confundir divisão com literal engole trecho
 *     muito maior do que o defeito original, e `</div>` num `.tsx` é a
 *     armadilha óbvia.
 */

const raiz = join(__dirname, "..");

function arquivosDeCodigo(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosDeCodigo(caminho, achados);
    else if (/\.tsx?$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

/**
 * Onde estão os literais de regex de um arquivo, segundo o compilador.
 *
 * A tentação era procurar literal com regex — e o teste passaria a repetir o
 * mesmo palpite do código que ele deveria julgar. O parser do TypeScript já
 * está no projeto, sabe distinguir literal de divisão (é o que exige olhar o
 * token anterior) e não enxerga o que está dentro de comentário, que é
 * exatamente o falso positivo a evitar aqui.
 */
function literaisDeRegex(caminho: string, fonte: string): string[] {
  const arvore = ts.createSourceFile(
    caminho,
    fonte,
    ts.ScriptTarget.Latest,
    true,
    caminho.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const achados: string[] = [];
  const visitar = (no: ts.Node) => {
    if (no.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      achados.push(no.getText(arvore));
    }
    ts.forEachChild(no, visitar);
  };
  visitar(arvore);
  return achados;
}

describe("o varredor preserva literal de regex", () => {
  it("barra escapada encostada na que fecha o literal", () => {
    // O sobrevivente fica na MESMA linha de propósito: a perda tem
    // escopo de linha, e uma linha abaixo ele passaria sem ler nada.
    const fonte = "const re = /a\\//; const sobrevivo = 1;";
    expect(semComentarios(fonte)).toContain("sobrevivo");
  });

  it("barra dentro de classe de caracteres", () => {
    const fonte = "const re = /[//]/; const sobrevivo = 1;";
    expect(semComentarios(fonte)).toContain("sobrevivo");
  });

  it("`/*` dentro do literal não abre comentário de bloco", () => {
    const fonte = "const re = /x\\/*/;\nconst sobrevivo = 1;";
    expect(semComentarios(fonte)).toContain("sobrevivo");
  });

  it("aspas dentro do literal não abrem string", () => {
    const fonte = 'const re = /["]/;\n// NOTA\nconst s = "fim";';
    expect(semComentarios(fonte)).not.toContain("NOTA");
  });

  it("todo literal de src/ chega inteiro na saída", () => {
    const perdidos: string[] = [];

    for (const caminho of arquivosDeCodigo(join(raiz, "src"))) {
      const fonte = readFileSync(caminho, "utf-8");
      const saida = semComentarios(fonte);
      for (const literal of literaisDeRegex(caminho, fonte)) {
        if (!saida.includes(literal)) {
          perdidos.push(`${caminho.replace(raiz, "")}  ${literal}`);
        }
      }
    }

    expect(
      perdidos,
      `o varredor comeu o literal e o que vinha depois dele:\n${perdidos.join("\n")}`,
    ).toEqual([]);
  });
});

describe("o varredor continua removendo o que é comentário", () => {
  it("comentário de linha e de bloco somem", () => {
    const fonte = "const a = 1; // NOTA_A\n/* NOTA_B */\nconst b = 2;";
    const saida = semComentarios(fonte);
    expect(saida).not.toContain("NOTA_A");
    expect(saida).not.toContain("NOTA_B");
    expect(saida).toContain("const b = 2;");
  });

  it('`accept="image/*"` não abre comentário falso (2026-08-28)', () => {
    const fonte = '<input accept="image/*" />\nconst sobrevivo = 1;\n/* NOTA */';
    const saida = semComentarios(fonte);
    expect(saida).toContain("sobrevivo");
    expect(saida).not.toContain("NOTA");
  });

  it("divisão não é confundida com literal", () => {
    const fonte =
      "const media = total / itens;\nconst resto = (a + b) / 2;\nconst sobrevivo = 1;";
    const saida = semComentarios(fonte);
    expect(saida).toContain("total / itens");
    expect(saida).toContain("(a + b) / 2");
    expect(saida).toContain("sobrevivo");
  });

  it("fechamento de tag JSX não é confundido com literal", () => {
    const fonte =
      'const el = <div className="a">{x}</div>;\nconst sobrevivo = 1;\nconst p = <p>y</p>;';
    const saida = semComentarios(fonte);
    expect(saida).toContain("</div>");
    expect(saida).toContain("sobrevivo");
    expect(saida).toContain("</p>");
  });

  it("barra que não fecha na linha não passa o dano para a seguinte", () => {
    // Não é código válido; é o para-choque. Se o varredor errar a leitura de
    // um `/`, o prejuízo tem que caber numa linha — que é onde o defeito de
    // 2026-09-05 já estava, e menos do que os ~700 do de 2026-08-28.
    const fonte = "const quebrado = [/;\nconst sobrevivo = 1;\n// NOTA";
    const saida = semComentarios(fonte);
    expect(saida).toContain("sobrevivo");
    expect(saida).not.toContain("NOTA");
  });
});
