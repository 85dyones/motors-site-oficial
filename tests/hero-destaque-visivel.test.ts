import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A placa "EM DESTAQUE" do hero da home some sem quebrar nada.
 *
 * Ela já sumiu de três formas diferentes: escondida por `lg:flex` (invisível
 * em tablet, e ninguém percebe porque não há erro), escondida por
 * `hidden sm:flex` (invisível no celular — e no celular ela é o preço E o
 * único link do hero para o PDP), e empurrada para fora da dobra porque a
 * tipografia fixa em px fazia o hero medir 758px numa janela que só tinha
 * 542px abaixo do header.
 *
 * Nenhuma das três aparece em build, lint ou teste de render — só olhando a
 * tela na resolução certa. Estas asserções seguram o mecanismo que corrigiu
 * todas: placa sem `hidden` em largura nenhuma e o `--hero-cabe` que amarra
 * o ritmo vertical à altura da janela.
 */

const raiz = join(__dirname, "..", "src", "components", "modernist");
const hero = readFileSync(join(raiz, "HeroHome.tsx"), "utf-8");
const primitivos = readFileSync(join(raiz, "primitivos.tsx"), "utf-8");

/** O bloco JSX da placa do veículo em destaque. */
const placa = hero.slice(hero.indexOf("getVeiculoPdpUrl(destaque)"));

describe("placa do veículo em destaque", () => {
  it("existe em toda largura — nenhum breakpoint a esconde", () => {
    expect(placa).not.toMatch(/\bhidden\b/);
    expect(placa).not.toMatch(/\blg:flex\b/);
  });

  it("no mobile vai em largura total; do tablet em diante volta aos 280px", () => {
    expect(placa).toContain("w-full");
    expect(placa).toContain("sm:w-auto");
    expect(placa).toContain("sm:min-w-[280px]");
  });
});

describe("--hero-cabe", () => {
  it("mede a altura útil abaixo do header", () => {
    expect(hero).toContain('"--hero-cabe": "min(840px, calc(100svh - 68px))"');
  });

  it("limita a altura do hero, e não só a proporção de 43vw", () => {
    expect(hero).toContain("lg:min-h-[min(43vw,var(--hero-cabe))]");
  });

  it("amarra todo o ritmo vertical do hero, não só um pedaço", () => {
    // Se um só destes voltar a ser px fixo, o conteúdo estoura a altura da
    // janela de novo e a placa é o primeiro elemento a cair fora da tela.
    const escalados = hero.match(/var\(--hero-cabe\)/g) ?? [];
    expect(escalados.length).toBeGreaterThanOrEqual(12);

    // Os valores de design continuam sendo o teto: em tela alta o `min()`
    // escolhe o número do doc e o hero fica idêntico ao desenhado.
    expect(hero).toContain("clamp(52px,calc(var(--hero-cabe)*0.1333),112px)");
    expect(hero).toContain("min(76px,calc(var(--hero-cabe)*0.0905))");
  });
});

describe("EstatisticasRegua", () => {
  it("aceita o ajuste do hero por variável", () => {
    expect(primitivos).toContain("pt-[var(--regua-pt,16px)]");
    expect(primitivos).toContain("text-[length:var(--regua-valor,34px)]");
  });

  it("mantém o valor do design como fallback para quem não define nada", () => {
    // A régua também vive em /sobre, fora do alcance do hero. Sem fallback,
    // os números apareceriam no tamanho herdado do texto corrido.
    expect(primitivos).toMatch(/--regua-pt,\s*16px/);
    expect(primitivos).toMatch(/--regua-valor,\s*34px/);
  });
});
