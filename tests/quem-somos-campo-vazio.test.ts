import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Campo vazio na aba "Quem Somos" do painel não aparece na página /sobre.
 *
 * O painel marcava os 21 campos como `required`, então a loja não conseguia
 * apagar nada — para tirar um bloco do ar era preciso digitar um espaço ou
 * repetir o texto. E, mesmo apagando, metade dos campos tinha texto padrão
 * embutido no componente (`|| "NOSSOS VALORES"`), que voltava a aparecer no
 * lugar do que foi apagado.
 *
 * Os dois lados precisam andar juntos: tirar o `required` sem tirar o
 * fallback só troca o campo obrigatório por um texto fantasma.
 */

const painel = readFileSync(
  join(__dirname, "..", "src", "components", "ConfiguracoesClientWrapper.tsx"),
  "utf-8"
);
const sobre = readFileSync(
  join(__dirname, "..", "src", "components", "SobreClientWrapper.tsx"),
  "utf-8"
);

/** Só o formulário da aba "sobre" — as outras abas têm regra própria. */
const formularioSobre = painel.slice(
  painel.indexOf("handleSaveAboutSettings} className"),
  painel.indexOf("CONTEÚDO SALVO ✓")
);

describe("painel — aba Quem Somos", () => {
  it("delimita o formulário certo", () => {
    // Se a fatia acima escorregar, o teste passa a medir outra aba e vira
    // decoração. Estas âncoras só existem dentro do formulário do /sobre.
    expect(formularioSobre).toContain("aboutForm.heroTitle");
    expect(formularioSobre).toContain("aboutForm.ctaBtn2Text");
  });

  it("não tem nenhum campo obrigatório", () => {
    expect(formularioSobre).not.toMatch(/^\s*required\s*$/m);
  });
});

describe("/sobre — campo vazio some", () => {
  it("não substitui campo apagado por texto padrão", () => {
    for (const campo of [
      "valuesTitle",
      "ctaTitle",
      "ctaBtn1Text",
      "ctaBtn2Text",
    ]) {
      // `||` entre dois campos é a checagem de seção vazia, não um fallback.
      // O que não pode voltar é o literal no lugar do que foi apagado.
      expect(sobre).not.toMatch(new RegExp(`aboutSettings\\.${campo}\\s*\\|\\|\\s*["'\`]`));
    }
  });

  it("condiciona todo campo editável do painel", () => {
    // Sem a guarda, o campo apagado vira uma <h1> vazia ocupando margem —
    // dá para ver o buraco na página mesmo sem texto nenhum dentro.
    for (const campo of [
      "heroTitle",
      "heroSubtitle",
      "techTitle",
      "techSubtitle",
      "ctaTitle",
      "ctaDescription",
    ]) {
      expect(sobre).toContain(`{aboutSettings.${campo} && (`);
    }
  });

  it("some com a faixa de fechamento inteira quando não há o que dizer", () => {
    expect(sobre).toContain("{temFechamento && (");
    for (const campo of ["ctaTitle", "ctaDescription", "ctaBtn1Text", "ctaBtn2Text"]) {
      expect(sobre).toMatch(new RegExp(`temFechamento[\\s\\S]{0,240}aboutSettings\\.${campo}`));
    }
  });

  it("mantém os ids dos CTAs, que podem estar em uso por analytics", () => {
    expect(sobre).toContain('id="about-cta-match"');
    expect(sobre).toContain('id="about-cta-contact"');
  });
});
