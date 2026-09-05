import { describe, it, expect } from "vitest";
import { FAIXAS_DE_PRECO } from "../src/lib/faixasDePreco";
import { AREAS_DA_HOME, normalizarAreas, areasVisiveis } from "../src/lib/areasDoSite";

/**
 * As três faixas de preço, como NAVEGAÇÃO.
 *
 * A revisão da F1 apontou o buraco: apagar `faixas_de_preco` do objeto `blocos`
 * em `src/app/page.tsx` deixa a área registrada no catálogo (o dono continua
 * vendo o item na tela A3, ligando e desligando) e a home renderiza **nada** —
 * verde nos 2051 testes. O mesmo vale para o bloco da vitrine.
 *
 * Renderizar a home aqui não é viável: ela puxa Supabase, reputação do Google e
 * curadoria do Instagram. O que dá para amarrar sem isso, e é o que o defeito
 * exige, são as duas pontas: a área existe no catálogo e chega a `areasVisiveis`
 * com a config de produção, e o JSX que a monta existe nos dois arquivos. A
 * terceira ponta — os links realmente saírem no HTML — está medida no `next
 * start` desta entrega e anotada no commit.
 */

const ARQUIVOS = {
  home: "src/app/page.tsx",
  vitrine: "src/app/estoque/page.tsx",
} as const;

function fonte(qual: keyof typeof ARQUIVOS): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("node:fs").readFileSync(ARQUIVOS[qual], "utf8");
}

describe("as faixas de preço existem como recorte", () => {
  it("são três, e cada uma tem slug e nome", () => {
    expect(FAIXAS_DE_PRECO).toHaveLength(3);
    for (const faixa of FAIXAS_DE_PRECO) {
      expect(faixa.slug, "faixa sem slug").toBeTruthy();
      expect(faixa.nome, "faixa sem nome").toBeTruthy();
    }
  });
});

describe("a home leva às faixas", () => {
  it("a área está no catálogo da tela A3", () => {
    expect(AREAS_DA_HOME.map((a) => a.id)).toContain("faixas_de_preco");
  });

  it("a área chega a areasVisiveis mesmo com a config de produção", () => {
    // A ordem salva em produção não conhece `faixas_de_preco` — é o caso que
    // `normalizarAreas` precisa cobrir para a seção não sumir.
    const config = normalizarAreas({
      ordem: ["hero", "busca", "destaques_rapidos", "estoque_selecionado", "consultoria",
              "venda_troca", "reputacao", "instagram", "contato"],
      ocultas: [],
    });

    expect(areasVisiveis(config).map((a) => a.id)).toContain("faixas_de_preco");
  });

  it("o bloco que a monta existe, e monta um link por faixa", () => {
    const codigo = fonte("home");

    // O id do bloco e a fonte dos links. Sem os dois, a área aparece no painel
    // e a home não desenha nada.
    expect(codigo, "bloco `faixas_de_preco` sumiu de page.tsx").toMatch(/faixas_de_preco:/);
    expect(codigo, "os links não saem de hubsDeFaixa").toMatch(/hubsDeFaixa\(disponiveis\)/);
    expect(codigo).toMatch(/href=\{`\/estoque\/\$\{f\.slug\}`\}/);
  });
});

describe("a vitrine leva às faixas", () => {
  it("o índice do estoque tem a seção, e ela sai de hubsDeFaixa", () => {
    const codigo = fonte("vitrine");

    expect(codigo, "seção de faixa sumiu de /estoque").toMatch(/Seminovos por faixa de preço/);
    expect(codigo).toMatch(/hubsDeFaixa\(disponiveis\)/);
    expect(codigo).toMatch(/href=\{`\/estoque\/\$\{f\.slug\}`\}/);
  });

  it("as três faixas ficam ao lado de marca e carroceria, não em outro lugar", () => {
    const codigo = fonte("vitrine");
    const indice = codigo.indexOf("Índice do estoque");
    const faixa = codigo.indexOf("Seminovos por faixa de preço");
    const faq = codigo.indexOf("Perguntas frequentes");

    expect(indice).toBeGreaterThan(-1);
    expect(faixa).toBeGreaterThan(indice);
    expect(faixa, "a seção de faixa caiu fora do <nav> do índice").toBeLessThan(faq);
  });
});
