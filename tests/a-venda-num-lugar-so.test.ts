import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Veiculo } from "../src/types";
import { disponiveisDe } from "../src/lib/regrasEstoque";
import { ler, semComentarios } from "./fonte";

/**
 * A regra de "à venda" mora num lugar só: `disponiveisDe`, em
 * `lib/regrasEstoque.ts`.
 *
 * Medido no `main` em 2026-09-17 (`beabce7`): além da própria definição, em
 * `hubsDeEstoque.ts`, a regra estava reescrita em 12 pontos.
 * `.filter((v) => !v.vendido)` aparecia 11 vezes em 9 arquivos (home,
 * `/vitrine`, `/vitrine/balcao`, `/sobre`, `/destaques/[tag]`, sitemap, título
 * de `/estoque`, painel e três vezes no `CarMatch`), e `similares.ts` a
 * carregava dentro de uma condição composta. O `llms-full.txt` já tinha saído
 * dessa lista no #112.
 *
 * Eram todas iguais, e por isso nada quebrava. O risco é o dia em que "à venda"
 * mudar: a mudança chegaria a um lugar só, e a vitrine, o sitemap e o
 * assistente passariam a discordar sobre o mesmo carro.
 *
 * ---------------------------------------------------------------------------
 * O que a varredura cobre, e o que não
 * ---------------------------------------------------------------------------
 * Ela procura a forma que se repetia (um `.filter` cujo corpo inteiro é
 * `!x.vendido`) em todo `.ts` e `.tsx` de `src/`, sem comentários. Uma condição
 * composta, como a antiga de `similares.ts` (`v.id === atual.id || v.vendido`),
 * passa por ela: regex não entende a lógica do filtro. Leitura de `vendido` de
 * UM carro (o selo na ficha, a divergência no painel) não é regra de lista e
 * fica fora de propósito.
 */

const carro = (id: string, vendido?: boolean): Veiculo => ({ id, vendido }) as unknown as Veiculo;

describe("`disponiveisDe`", () => {
  it("tira só o vendido, na ordem em que o estoque veio", () => {
    const estoque = [carro("a", false), carro("b", true), carro("c"), carro("d", true), carro("e", false)];
    expect(disponiveisDe(estoque).map((v) => v.id)).toEqual(["a", "c", "e"]);
  });

  it("devolve uma lista nova e não mexe na que recebeu", () => {
    const estoque = [carro("a", true), carro("b", false)];
    const resultado = disponiveisDe(estoque);
    expect(resultado).not.toBe(estoque);
    expect(estoque.map((v) => v.id)).toEqual(["a", "b"]);
  });
});

const RAIZ = join(__dirname, "..");
const REGRA = "src/lib/regrasEstoque.ts";

/** Todo `.ts` e `.tsx` de `src/`, com o caminho escrito como no repositório. */
function arquivosDeCodigo(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosDeCodigo(caminho, achados);
    else if (/\.tsx?$/.test(nome)) achados.push(relative(RAIZ, caminho).split(sep).join("/"));
  }
  return achados;
}

/** Um `.filter` cujo corpo inteiro é `!x.vendido`, com qualquer nome de parâmetro. */
const FILTRO_PROPRIO = /\.filter\(\s*\(?\s*([A-Za-z_$][\w$]*)\s*(?::[^)]*)?\)?\s*=>\s*!\s*\1\.vendido\b/;

describe("ninguém reescreve a regra fora de `lib/regrasEstoque.ts`", () => {
  const codigo = new Map(arquivosDeCodigo(join(RAIZ, "src")).map((c) => [c, semComentarios(ler(c))]));

  it("a varredura lê o código de verdade", () => {
    // Uma trava que não lê nada passa verde sem avisar (ver `fonte.ts`). Os
    // dois arquivos abaixo existem, e a lista tem de trazê-los.
    expect([...codigo.keys()]).toContain(REGRA);
    expect([...codigo.keys()]).toContain("src/components/CarMatch.tsx");
    // E o padrão reconhece as formas que existiam, e não a chamada nova.
    expect(FILTRO_PROPRIO.test("estoque.filter((v) => !v.vendido)")).toBe(true);
    expect(FILTRO_PROPRIO.test("lista.filter(carro => !carro.vendido)")).toBe(true);
    expect(FILTRO_PROPRIO.test("estoque.filter((v: Veiculo) => !v.vendido)")).toBe(true);
    expect(FILTRO_PROPRIO.test("disponiveisDe(estoque)")).toBe(false);
  });

  it("nenhum `.filter((v) => !v.vendido)` fora da própria regra", () => {
    const infratores = [...codigo]
      .filter(([caminho, fonte]) => caminho !== REGRA && FILTRO_PROPRIO.test(fonte))
      .map(([caminho]) => caminho);
    expect(infratores).toEqual([]);
  });

  it("e `disponiveisDe` é definido uma vez só, em `lib/regrasEstoque.ts`", () => {
    const definem = [...codigo]
      .filter(([, fonte]) => /\bfunction disponiveisDe\b|\bconst disponiveisDe\s*=/.test(fonte))
      .map(([caminho]) => caminho);
    expect(definem).toEqual([REGRA]);
  });
});
