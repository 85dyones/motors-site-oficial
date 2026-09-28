import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Decisão 11 do plano do PR 4 (2026-09-25): o texto do repasse no cabeçalho e
 * no rodapé nasce em `repasseNaNavegacao.ts`, um módulo sem import, e é
 * reexportado por `paginaDoRepasse.ts`. `Header.tsx` e `Footer.tsx` são
 * montados em TODA página; se eles (ou os dois módulos de dados que eles
 * leem) importassem `paginaDoRepasse.ts`, o texto do `/repasse` inteiro iria
 * para o pacote de todas as páginas do site. Esta trava lê a fonte: nenhum
 * dos quatro importa `paginaDoRepasse`, e `repasseNaNavegacao.ts` não importa
 * nada.
 */
const RAIZ = join(__dirname, "..", "src");
const NAVEGACAO = [
  join(RAIZ, "components", "Header.tsx"),
  join(RAIZ, "components", "Footer.tsx"),
  join(RAIZ, "lib", "menuDoCabecalho.ts"),
  join(RAIZ, "lib", "colunasDoRodape.ts"),
];
const MODULO_DA_NAVEGACAO = join(RAIZ, "lib", "repasseNaNavegacao.ts");

/** Os especificadores de todo `import`/`export … from`/`import()` do arquivo. */
function especificadores(fonte: string): string[] {
  const achados: string[] = [];
  for (const m of fonte.matchAll(/\bfrom\s*["']([^"']+)["']/g)) achados.push(m[1]);
  for (const m of fonte.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) achados.push(m[1]);
  for (const m of fonte.matchAll(/^\s*import\s*["']([^"']+)["']/gm)) achados.push(m[1]);
  return achados;
}

describe("a navegação de toda página não carrega o texto do /repasse", () => {
  for (const arquivo of NAVEGACAO) {
    it(`${arquivo.split(/[\\/]/).slice(-2).join("/")} não importa paginaDoRepasse`, () => {
      const imports = especificadores(readFileSync(arquivo, "utf8"));
      expect(imports.length).toBeGreaterThan(0);
      expect(imports.filter((i) => /paginaDoRepasse/.test(i))).toEqual([]);
    });
  }

  it("repasseNaNavegacao.ts não importa nada", () => {
    expect(especificadores(readFileSync(MODULO_DA_NAVEGACAO, "utf8"))).toEqual([]);
  });

  it("o cabeçalho e o rodapé leem o repasse de repasseNaNavegacao", () => {
    const juntos = NAVEGACAO.map((a) => especificadores(readFileSync(a, "utf8"))).flat();
    expect(juntos.some((i) => /repasseNaNavegacao$/.test(i))).toBe(true);
  });
});
