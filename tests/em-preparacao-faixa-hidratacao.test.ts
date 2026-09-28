// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import FaixaEmPreparacao from "../src/components/modernist/FaixaEmPreparacao";
import { chegadaAoPatio, faixaDaChegada } from "../src/lib/emPreparacao";

/**
 * A faixa "EM PREPARAÇÃO · CHEGA EM N DIAS" não pode derrubar a hidratação.
 *
 * Achado da revisão final (28/09): a faixa é desenhada dentro de componentes
 * cliente que o servidor renderiza com ISR (`revalidate = 60`) — o catálogo,
 * os similares da ficha, o resultado do Profiler, a TV e o balcão. O HTML
 * gerado às 23h59 de São Paulo diz "5 DIAS"; o navegador que hidrata às 00h01
 * calcula "4 DIAS", e o React 19 acusa o erro recuperável #418 — o mesmo que o
 * `layout.tsx` mede em produção.
 *
 * Renderiza no servidor e hidrata no navegador de verdade, com o relógio
 * mudando entre os dois, e conta os erros que o React devolve.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Sábado 03/10, 14h em São Paulo.
const VEICULO = { em_preparacao: true, previsao_chegada_em: "2026-10-03T17:00:00Z" };
// Segunda 28/09, 23h59 em São Paulo (UTC-3), e terça 29/09, 00h01.
const SERVIDOR = new Date("2026-09-29T02:59:00Z");
const NAVEGADOR = new Date("2026-09-29T03:01:00Z");

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
  vi.useRealTimers();
});

describe("a faixa hidrata sem erro na virada do dia", () => {
  it("servidor às 23h59, navegador às 00h01: nenhum erro de hidratação", async () => {
    vi.setSystemTime(SERVIDOR);
    const html = renderToString(createElement(FaixaEmPreparacao, { veiculo: VEICULO }));
    // O cenário é o do defeito: servidor e navegador discordam no texto.
    expect(html).toContain("CHEGA EM 5 DIAS");
    vi.setSystemTime(NAVEGADOR);
    expect(faixaDaChegada(chegadaAoPatio(VEICULO)!)).toBe("EM PREPARAÇÃO · CHEGA EM 4 DIAS");

    container.innerHTML = html;
    const erros: unknown[] = [];
    await act(async () => {
      root = hydrateRoot(container, createElement(FaixaEmPreparacao, { veiculo: VEICULO }), {
        onRecoverableError: (erro) => erros.push(erro),
      });
    });

    expect(erros).toHaveLength(0);
    // A faixa continua na tela — hidratou, não foi descartada.
    expect(container.textContent).toContain("EM PREPARAÇÃO · CHEGA EM");
  });
});
