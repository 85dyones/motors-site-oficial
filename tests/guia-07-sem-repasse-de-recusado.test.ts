import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guia 07 ("carro reprovado na cautelar: como vender"), reescrito com o ok do
 * dono em 28/09/2026. Com o Repasse Motors no site, o guia não pode mais
 * sugerir que carro fora da vitrine vira repasse: o leitor ligaria a seção ao
 * carro reprovado, que ela não recebe (reprovado no laudo não entra; o carro
 * do repasse funciona e tem o estado declarado por escrito). Mesmo cuidado da
 * spec 2026-09-24 §10 com o `paginasGeo.ts`.
 *
 * O texto no ar sai da tabela `guias`; este arquivo é a origem do lote da
 * Onda 1, e a gravação no banco acontece no dia do merge do #156.
 */
const LOTE = join(__dirname, "..", "conteudo-seo", "guias-onda-1.json");
const SLUG = "carro-reprovado-cautelar-como-vender";

type Secao = { titulo?: string; paragrafos?: string[] };
type Guia = { slug: string; secoes?: Secao[] };

function textoDoGuia(): string {
  const bruto = JSON.parse(readFileSync(LOTE, "utf8")) as unknown;
  const lista: Guia[] = Array.isArray(bruto) ? (bruto as Guia[]) : ((bruto as { guias: Guia[] }).guias ?? []);
  const guia = lista.find((g) => g.slug === SLUG);
  if (!guia) throw new Error(`guia ${SLUG} não achado em ${LOTE}`);
  return JSON.stringify(guia);
}

describe("o guia 07 não liga o repasse ao carro recusado", () => {
  it("as duas frases antigas saíram", () => {
    const texto = textoDoGuia();
    expect(texto).not.toContain("repasse entre lojistas");
    expect(texto).not.toContain("outro caminho comercial");
  });

  it("o texto aprovado diz que o reprovado não entra no Repasse Motors", () => {
    const texto = textoDoGuia();
    expect(texto).toContain(
      "Carro reprovado na cautelar não entra na nossa vitrine nem no Repasse Motors, que só recebe carro funcionando e com o estado declarado por escrito.",
    );
    expect(texto).toContain(
      "Outro canal é o lojista que compra para revender no estado, com o preço ajustado ao que o laudo apontou.",
    );
  });
});
