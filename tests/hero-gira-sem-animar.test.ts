// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import HeroHome from "../src/components/modernist/HeroHome";
import type { Veiculo } from "../src/types";

/**
 * O carrossel do hero não girava para quem desliga as animações do sistema.
 *
 * ---------------------------------------------------------------------------
 * O que foi medido, em 2026-09-23
 * ---------------------------------------------------------------------------
 * Na máquina do dono, `HKCU:\Control Panel\Desktop\WindowMetrics\MinAnimate`
 * está em `0` — efeitos de animação desligados no Windows. Com isso o
 * navegador responde `prefers-reduced-motion: reduce`, e o hero desligava o
 * autoplay INTEIRO. Conferido no site no ar: quatro slides montados, e o
 * índice parado em 0 depois de 13 segundos.
 *
 * O custo era de vitrine: quem está nessa condição via **um** dos quatro
 * carros curados. Os outros três só apareciam por clique.
 *
 * ---------------------------------------------------------------------------
 * A decisão do dono (23/09): o conteúdo gira, a animação não
 * ---------------------------------------------------------------------------
 * `prefers-reduced-motion` é um pedido sobre MOVIMENTO — deslizar, esmaecer,
 * paralaxe —, e não sobre conteúdo. Trocar a foto sem animar a troca atende o
 * pedido pela letra e pelo espírito: nada se move na tela, e mesmo assim os
 * quatro carros aparecem para todo mundo.
 *
 * Por isso os testes abaixo medem as duas coisas separadas: que o índice
 * AVANÇA mesmo com `reduce`, e que a transição some quando `reduce`.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** `jsdom` não implementa `matchMedia` — sem este dublê o componente estoura. */
function dublarMatchMedia(reduzir: boolean) {
  (window as unknown as { matchMedia: unknown }).matchMedia = (consulta: string) => ({
    matches: consulta.includes("prefers-reduced-motion") ? reduzir : false,
    media: consulta,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
}

/** Só o que o hero lê: id, foto, marca, modelo e os campos de preço. */
const carro = (id: string, marca: string, modelo: string): Veiculo =>
  ({
    id,
    marca,
    modelo,
    versao: "",
    web_full_images: [`https://exemplo.test/${id}.jpg`],
    whatsapp_images: [`https://exemplo.test/${id}.jpg`],
    preco_original: 100000,
    preco_promocional: 0,
    ano: 2022,
    quilometragem: 30000,
  }) as unknown as Veiculo;

const QUATRO = [
  carro("1", "Fiat", "Titano"),
  carro("2", "Volkswagen", "Spacefox"),
  carro("3", "Volkswagen", "Saveiro"),
  carro("4", "Fiat", "Toro"),
];

let container: HTMLDivElement;
let root: Root;

async function montar(slides: Veiculo[]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(HeroHome, { slides, totalEstoque: 37, totalMarcas: 12 }),
    );
  });
}

/** Qual indicador está marcado como o atual. */
function indiceAtual(): number {
  const botoes = [...container.querySelectorAll('button[aria-label^="Ver "]')];
  return botoes.findIndex((b) => b.getAttribute("aria-current") === "true");
}

/** A foto visível — é nela que a transição de opacidade vive. */
function classeDaFoto(): string {
  const foto = container.querySelector('[class*="opacity"], [class*="transition-opacity"]');
  return foto?.getAttribute("class") ?? "";
}

async function avancar(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  vi.useRealTimers();
});

describe("o hero gira mesmo para quem pediu menos movimento", () => {
  it("avança sozinho com prefers-reduced-motion ligado", async () => {
    dublarMatchMedia(true);
    await montar(QUATRO);

    expect(indiceAtual()).toBe(0);

    await avancar(7000);
    expect(indiceAtual()).toBe(1);

    await avancar(7000);
    expect(indiceAtual()).toBe(2);
  });

  it("dá a volta completa nos quatro, passo a passo, e recomeça", async () => {
    // Passo a passo de propósito: só conferir o fim (voltar ao 0) passaria
    // também num carrossel PARADO, que é exatamente o defeito medido.
    dublarMatchMedia(true);
    await montar(QUATRO);

    const visitados = [indiceAtual()];
    for (let i = 0; i < 4; i++) {
      await avancar(7000);
      visitados.push(indiceAtual());
    }

    expect(visitados).toEqual([0, 1, 2, 3, 0]);
  });

  it("com um slide só, não desenha régua de indicadores", async () => {
    // A régua só existe a partir de dois slides (`slides.length > 1`), então
    // aqui a asserção é sobre a ausência dela — e sobre o relógio não estourar.
    dublarMatchMedia(true);
    await montar([QUATRO[0]]);

    expect(container.querySelectorAll('button[aria-label^="Ver "]')).toHaveLength(0);
    await avancar(7000 * 3);
    expect(container.querySelectorAll('button[aria-label^="Ver "]')).toHaveLength(0);
  });
});

describe("o temporizador é de sete segundos", () => {
  it("aos 5,2 segundos ainda não trocou — o valor antigo não vale mais", async () => {
    dublarMatchMedia(false);
    await montar(QUATRO);

    await avancar(5200);
    expect(indiceAtual()).toBe(0);
  });

  it("aos 7 segundos trocou, e só uma vez", async () => {
    dublarMatchMedia(false);
    await montar(QUATRO);

    await avancar(7000);
    expect(indiceAtual()).toBe(1);
  });

  it("às vésperas dos 14 segundos ainda está no segundo carro", async () => {
    // Esta é a asserção que distingue 7s de 5,2s no limite de cima: com o
    // intervalo antigo, 13,999s já teriam disparado DUAS trocas (10,4s) e o
    // índice seria 2. Sozinho, o teste dos 7s não separa os dois valores.
    dublarMatchMedia(false);
    await montar(QUATRO);

    await avancar(13999);
    expect(indiceAtual()).toBe(1);

    await avancar(1);
    expect(indiceAtual()).toBe(2);
  });
});

describe("a animação é que some, não o rodízio", () => {
  it("com menos movimento, a troca de foto não tem duração", async () => {
    dublarMatchMedia(true);
    await montar(QUATRO);

    expect(classeDaFoto()).not.toMatch(/duration-\[900ms\]/);
  });

  it("sem menos movimento, a troca de foto continua esmaecendo", async () => {
    dublarMatchMedia(false);
    await montar(QUATRO);

    expect(classeDaFoto()).toMatch(/duration-\[900ms\]/);
  });
});
