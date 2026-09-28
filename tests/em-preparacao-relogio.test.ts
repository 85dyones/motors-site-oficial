// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import RelogioDaChegada from "../src/components/RelogioDaChegada";
import { lerCodigo } from "./fonte";

/**
 * O relógio da ficha — decisão do dono em 28/09: "card em dias, ficha em
 * relógio".
 *
 * O HTML servido traz só a DATA. Os números aparecem depois de montar: o
 * servidor e o navegador discordariam no segundo, e a hidratação reclamaria.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EM_PREPARACAO = { em_preparacao: true, previsao_chegada_em: "2026-10-03T17:00:00Z" };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T13:00:00Z")); // seg 28/09, 10h em SP
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const texto = () => (container.textContent ?? "").replace(/\s+/g, " ");

describe("no servidor", () => {
  it("a data, sem números de relógio", () => {
    const html = renderToString(createElement(RelogioDaChegada, { veiculo: EM_PREPARACAO }));
    expect(html).toContain("03/10 às 14h");
    expect(html).not.toMatch(/\d{2}d \d{2}h/);
  });
});

describe("no navegador", () => {
  it("monta e começa a contar", async () => {
    act(() => root.render(createElement(RelogioDaChegada, { veiculo: EM_PREPARACAO })));
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(texto()).toContain("05d 04h 00m 00s");
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(texto()).toContain("05d 03h 59m 59s");
    expect(texto()).toContain("03/10 às 14h");
  });

  it("data vencida: sem relógio, e sem prometer dia", async () => {
    act(() =>
      root.render(
        createElement(RelogioDaChegada, {
          veiculo: { em_preparacao: true, previsao_chegada_em: "2026-09-25T17:00:00Z" },
        }),
      ),
    );
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(texto()).toContain("CHEGA A QUALQUER MOMENTO");
    expect(texto()).not.toMatch(/\d{2}d \d{2}h/);
  });

  it("carro comum: nada", () => {
    act(() => root.render(createElement(RelogioDaChegada, { veiculo: { em_preparacao: false } })));
    expect(container.innerHTML).toBe("");
  });

  it("o relógio não fala a cada segundo para o leitor de tela", async () => {
    act(() => root.render(createElement(RelogioDaChegada, { veiculo: EM_PREPARACAO })));
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    const relogio = container.querySelector('[role="timer"]');
    expect(relogio).not.toBeNull();
    expect(relogio!.getAttribute("aria-live")).not.toBe("polite");
    expect(relogio!.getAttribute("aria-live")).not.toBe("assertive");
  });
});

describe("a ficha usa o relógio", () => {
  it("antes do preço, nas duas colunas (celular e desktop)", () => {
    // A ficha inteira não monta em teste (1.584 linhas, galeria, fetch); a
    // fiação é conferida na fonte e o comportamento, no componente acima.
    //
    // `{}`, não `{/* Preço */}`: o comentário JSX que marca o preço é o que
    // `lerCodigo` esvazia (ver `tests/fonte.ts` e o mesmo idioma em
    // `vitrine.test.ts`, "o alvo nasce montado…") — a chave sobrevive VAZIA,
    // o texto de dentro não.
    const fonte = lerCodigo("src/components/PDPClientWrapper.tsx");
    expect(fonte).toMatch(/<RelogioDaChegada veiculo=\{veiculo\} \/>\s*\{\}/);
  });
});
