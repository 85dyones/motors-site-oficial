import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O que monta depois do primeiro paint já nasce com o lugar guardado.
 *
 * Medido em produção em 09/10/2026, Chromium headless, sem rolar: CLS 0,125
 * em /financiamento no desktop (a calculadora, `ssr: false`, chegava sem
 * placeholder e empurrava o bloco de baixo) e 0,088/0,124 em /contato no
 * desktop/celular (o widget do Turnstile crescia de 0 para 72 px aos ~4 s e
 * levava o botão e o rodapé junto). Os números e o porquê de cada valor estão
 * nos comentários dos componentes; aqui fica só a guarda.
 */

const raiz = join(__dirname, "..");
const ler = (relativo: string) => readFileSync(join(raiz, relativo), "utf8");

describe("sem deslocamento de layout no que monta tarde", () => {
  it("o contêiner do Turnstile reserva os 65 px do widget, sem o espaço da descendente", () => {
    const fonte = ler("src/components/Turnstile.tsx");
    const conteiner = fonte.slice(fonte.lastIndexOf("ref={containerRef}"));
    expect(conteiner).toMatch(/min-h-\[65px\]/);
    expect(conteiner).toMatch(/leading-\[0\]/);
  });

  it("a contenção do iframe só liga com o contêiner inteiro à vista", () => {
    // Ligada sempre, ela tiraria o iframe escondido do canto da janela também
    // quando o formulário está fora da tela — onde o navegador pode estrangular
    // iframe de outra origem e o desafio invisível nunca entregar o token.
    const fonte = ler("src/components/Turnstile.tsx");
    expect(fonte).toMatch(/inteiroNaTela \? "\[contain:layout\]" : ""/);
    expect(fonte).toMatch(/intersectionRatio >= 1/);
  });

  it("a calculadora de /financiamento tem um `loading` que ocupa a faixa dela", () => {
    const fonte = ler("src/components/SimuladorDeFinanciamento.tsx");
    expect(fonte).toMatch(/import\("\.\/CalculadoraFinanciamento"\),\s*\{[^}]*loading:/);
  });

  it("a linha de verificação de /contato some de vista sem desmontar", () => {
    const fonte = ler("src/components/ContatoClientWrapper.tsx");
    expect(fonte).not.toMatch(/\{!turnstileToken && status !== "sending" && \(/);
    expect(fonte).toMatch(/!turnstileToken && status !== "sending" \? "" : "invisible"/);
  });
});
