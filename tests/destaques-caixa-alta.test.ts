import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { slugifyTag, nomeEmFrase, nomeEmMinuscula } from "../src/lib/tagUtils";

/**
 * Nome de destaque rápido é sempre caixa alta na tela.
 *
 * O campo do painel tem `uppercase` na classe — CSS puro. Ele mostrava o nome
 * em caixa alta enquanto gravava exatamente o que foi digitado, então "pole
 * position motors" apareceu em caixa baixa no trilho da home ao lado de
 * "BAIXA QUILOMETRAGEM" e "PARCELA 1K", com o painel jurando o contrário.
 *
 * São dois consertos que precisam existir juntos: o painel passou a gravar em
 * caixa alta (resolve o que for salvo daqui pra frente) e as telas forçam a
 * caixa (resolve o que já está salvo no banco, sem escrever em produção).
 */

const raiz = join(__dirname, "..", "src");
const painel = readFileSync(join(raiz, "components", "ConfiguracoesClientWrapper.tsx"), "utf-8");
const home = readFileSync(join(raiz, "app", "page.tsx"), "utf-8");
const landing = readFileSync(join(raiz, "components", "modernist", "LandingDestaque.tsx"), "utf-8");
const catalogo = readFileSync(join(raiz, "components", "modernist", "Catalogo.tsx"), "utf-8");

describe("painel — nome do destaque", () => {
  it("grava em caixa alta, e não só exibe", () => {
    const campo = painel.slice(
      painel.indexOf('placeholder="EX: SUPER ESPORTIVOS"'),
      painel.indexOf('placeholder="EX: SUPER ESPORTIVOS"') + 900
    );
    expect(campo).toContain("e.target.value.toUpperCase()");
    // Sem isto o campo volta a mentir: mostra numa caixa, grava noutra.
    expect(campo).not.toMatch(/name:\s*e\.target\.value\b(?!\.toUpperCase)/);
  });
});

describe("telas — nome do destaque", () => {
  it("força caixa alta no trilho da home", () => {
    const chip = home.slice(home.indexOf("destaques_rapidos:"), home.indexOf("estoque_selecionado:"));
    expect(chip).toContain("{d.tag.name}");
    expect(chip).toMatch(/font-extrabold uppercase/);
  });

  it("força caixa alta na trilha e nos chips da landing", () => {
    expect(landing).toContain('<span className="uppercase text-mt-ink">{tag.name}</span>');
    expect(landing).toMatch(/font-extrabold uppercase[^"]*"\s*>\s*\n\s*\{d\.tag\.name\}/);
    expect(landing).toMatch(/uppercase[^"]*"\s*>\s*\n\s*POR QUE \{tag\.name\}/);
  });

  it("força caixa alta no filtro do catálogo", () => {
    expect(catalogo).toContain("rotulo: tag.name.toUpperCase()");
  });

  it("abre a <h1> da landing em maiúscula mesmo com o nome salvo em caixa baixa", () => {
    // A <h1> é a única peça em caixa de frase, de propósito — por isso ela não
    // ganha `uppercase` junto com o resto.
    expect(landing).toContain("nomeEmFrase(tag.name)");
  });
});

describe("caixa dos textos de SEO", () => {
  const rota = readFileSync(join(raiz, "app", "destaques", "[tag]", "page.tsx"), "utf-8");

  it("não manda caixa alta para o <title> nem para a description", () => {
    // Título todo em maiúscula é candidato a ser reescrito pelo Google, e o
    // nome cai no meio da frase ("Carros ___ em Curitiba").
    expect(rota).toContain("const nome = nomeEmMinuscula(tagName);");
    expect(rota).toContain("`Carros ${nome} em Curitiba | Motors Store`");
    // O que importa é que o nome em minúscula caia no meio da frase — a
    // redação da description mudou em 2026-08-25 (vocabulário), o invariante
    // de caixa não.
    expect(rota).toMatch(/description = `[^`]*\$\{nome\}/);
    expect(rota).not.toMatch(/tagName\)?\.toUpperCase\(\)/);
  });

  it("abre o nome do schema em maiúscula, porque vem depois de dois-pontos", () => {
    expect(rota).toContain("Catálogo de Veículos: ${nomeEmFrase(tagName)}");
  });

  it("normaliza qualquer caixa que a loja tenha digitado", () => {
    for (const digitado of ["BAIXA QUILOMETRAGEM", "baixa quilometragem", "Baixa Quilometragem"]) {
      expect(nomeEmMinuscula(digitado)).toBe("baixa quilometragem");
      expect(nomeEmFrase(digitado)).toBe("Baixa quilometragem");
    }
  });

  it("não quebra com nome vazio", () => {
    expect(nomeEmFrase("")).toBe("");
    expect(nomeEmMinuscula("")).toBe("");
  });
});

describe("slug do destaque", () => {
  it("não muda com a caixa, então nenhuma URL indexada quebra", () => {
    // É o que torna seguro normalizar o nome: /destaques/pole-position-motors
    // continua o mesmo endereço depois da mudança.
    expect(slugifyTag("pole position motors")).toBe("pole-position-motors");
    expect(slugifyTag("POLE POSITION MOTORS")).toBe("pole-position-motors");
    expect(slugifyTag("Baixa Quilometragem")).toBe(slugifyTag("BAIXA QUILOMETRAGEM"));
  });
});
