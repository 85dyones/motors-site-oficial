import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, extname, relative, sep } from "node:path";

/**
 * O que `tsc`, `eslint` e `vitest` não veem: os bytes.
 *
 * ---------------------------------------------------------------------------
 * Por que esta trava existe
 * ---------------------------------------------------------------------------
 * Em 2026-09-10, `src/lib/observabilidade.ts` nasceu com um byte `0x00` no
 * lugar de um espaço, dentro de `partes.join(" ")`. O arquivo compilou, passou
 * no lint e passou nos 23 testes próprios — porque a função que dependia dele
 * só compara o resultado consigo mesma, e um separador inválido separa igual.
 *
 * O único sintoma foi o `git commit` registrar `Bin 0 -> 13487 bytes`: o git
 * decidiu que o arquivo era binário, e com isso o diff sumiria da revisão e o
 * `blame` por linha deixaria de existir. Foi sorte alguém ter lido a saída.
 *
 * Duas famílias entram aqui, porque as duas já apareceram neste projeto:
 *
 *  1. **BOM** (`EF BB BF`) — o que `Set-Content` do PowerShell injeta sozinho.
 *     Passa por tsc, eslint e vitest sem um pio.
 *  2. **Byte de controle** — o que sobra quando um escape é comido por camada
 *     de shell no caminho: `\0` vira `0x00`, `\b` vira `0x08`. Já produziu uma
 *     regex verde que casava com nada.
 *
 * Ambas são invisíveis no editor e invisíveis na revisão. A única defesa é
 * contar byte.
 *
 * ---------------------------------------------------------------------------
 * O que NÃO entra
 * ---------------------------------------------------------------------------
 * `\t` (9), `\n` (10) e `\r` (13) são legítimos. A varredura ignora `.md`
 * (documento tem símbolo estranho por direito) e qualquer coisa fora de
 * `src/`, `tests/` e `supabase/migrations/` — os três lugares em que um byte
 * torto vira comportamento de produção.
 */

const RAIZ = join(__dirname, "..");
const ALVOS = ["src", "tests", "supabase/migrations"];
const EXTENSOES = new Set([".ts", ".tsx", ".sql", ".css", ".mjs", ".json"]);

function arquivosDeCodigo(): string[] {
  const achados: string[] = [];

  function anda(dir: string) {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        // `node_modules` e diretórios ocultos não são nossos.
        if (entrada.name !== "node_modules" && !entrada.name.startsWith(".")) anda(caminho);
        continue;
      }
      if (EXTENSOES.has(extname(entrada.name))) achados.push(caminho);
    }
  }

  for (const alvo of ALVOS) anda(join(RAIZ, alvo));
  // O CI é Linux e a máquina de quem escreve é Windows: comparar caminho de
  // `join` com literal de barra falha silenciosamente sem esta normalização.
  return achados.map((c) => relative(RAIZ, c).split(sep).join("/"));
}

/** Descreve o primeiro byte proibido, ou `null` se o arquivo está limpo. */
function primeiroByteTorto(caminho: string): string | null {
  const bytes = readFileSync(join(RAIZ, caminho));

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "BOM (EF BB BF) no começo do arquivo";
  }

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    const permitido = b === 9 || b === 10 || b === 13;
    if ((b < 0x20 && !permitido) || b === 0x7f) {
      const perto = bytes
        .subarray(Math.max(0, i - 40), i)
        .toString("utf8")
        .split("\n")
        .pop();
      return `byte 0x${b.toString(16).padStart(2, "0")} na posição ${i}, logo depois de ${JSON.stringify(perto)}`;
    }
  }

  return null;
}

describe("os bytes do código", () => {
  const arquivos = arquivosDeCodigo();

  it("a varredura enxergou o repositório — sem vacuidade", () => {
    /* Trava que varre e não acha nada fica verde para sempre. Se este número
       desabar, o problema é o varredor, não o repositório. */
    expect(arquivos.length, "a varredura não achou código").toBeGreaterThan(200);

    /* Uma âncora POR ALVO, e não só duas no total.
       A primeira versão ancorava em `src/` e em `supabase/migrations/`, e
       sozinhos eles já passavam de 200 — então apagar `"tests"` de `ALVOS`
       deixava o teste VERDE varrendo um terço a menos. Provado por mutação na
       revisão de 2026-09-10.

       A régua: se um alvo pode sumir sem a trava reclamar, ele não está
       protegido — está só listado. */
    expect(arquivos, "src/ saiu da varredura").toContain("src/lib/observabilidade.ts");
    expect(arquivos, "tests/ saiu da varredura").toContain("tests/bytes-do-codigo.test.ts");
    expect(arquivos, "supabase/migrations/ saiu da varredura").toContain(
      "supabase/migrations/20260807210000_leads.sql",
    );
  });

  it("nenhum arquivo carrega BOM nem byte de controle", () => {
    const sujos = arquivos
      .map((a) => ({ arquivo: a, problema: primeiroByteTorto(a) }))
      .filter((r) => r.problema !== null)
      .map((r) => `${r.arquivo}: ${r.problema}`);

    expect(
      sujos,
      "byte invisível no código — passa por tsc, eslint e vitest, e o git passa a tratar o arquivo como binário",
    ).toEqual([]);
  });
});
