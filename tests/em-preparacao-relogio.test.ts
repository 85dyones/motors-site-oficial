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
    expect(html).toContain("EM PREPARAÇÃO");
    expect(html).toContain("03/10 às 14h");
    expect(html).not.toMatch(/\d{2}d \d{2}h/);
    // O rótulo do relógio só vem com o relógio: sem os números, "CHEGA AO
    // PÁTIO EM" ficaria pendurado sobre o nada (revisão final, 28/09).
    expect(html).not.toContain("CHEGA AO PÁTIO EM");
  });
});

/**
 * O temporizador de 1 s só roda onde há relógio — achado da revisão final
 * (28/09): ele ligava em toda ficha, até na do carro comum, e seguia batendo
 * depois da data.
 */
describe("os temporizadores", () => {
  it("carro comum: nenhum temporizador agendado", async () => {
    await act(async () => {
      root.render(createElement(RelogioDaChegada, { veiculo: { em_preparacao: false, previsao_chegada_em: null } }));
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("data vencida: depois da primeira batida, nada fica ligado", async () => {
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
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a caminho: bate até a data, e para quando ela chega", async () => {
    // Três segundos antes da previsão.
    const veiculo = { em_preparacao: true, previsao_chegada_em: "2026-09-28T13:00:03Z" };
    act(() => root.render(createElement(RelogioDaChegada, { veiculo })));
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(texto()).toContain("00d 00h 00m 03s");
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(texto()).toContain("CHEGA A QUALQUER MOMENTO");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("no navegador", () => {
  it("monta e começa a contar", async () => {
    act(() => root.render(createElement(RelogioDaChegada, { veiculo: EM_PREPARACAO })));
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(texto()).toContain("05d 04h 00m 00s");
    expect(texto()).toContain("CHEGA AO PÁTIO EM");
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
    // A âncora É o ternário do preço (`hasDiscount ? "PREÇO PROMOCIONAL" :
    // "À VISTA"`), não o comentário `{/* Preço */}`: comentário é o que
    // `lerCodigo` esvazia para `{}` (ver `tests/fonte.ts`), e `{}` sozinho
    // só prova "veio antes de ALGUM comentário JSX qualquer" — passaria
    // igual se o relógio fosse posto antes de outro bloco comentado do
    // arquivo, e quebraria por motivo incidental se alguém só reescrevesse
    // o texto do comentário do preço. O ternário é string literal dentro de
    // JSX: `lerCodigo` não mexe em string, então ele sobrevive por inteiro e
    // é o preço de verdade, não um marcador.
    //
    // A janela de proximidade (140 caracteres) é medida na fonte já
    // esvaziada: a distância real entre o fim da tag e o começo do ternário
    // é 136 — o comentário `{/* Preço */}` virou `{}` no meio do caminho —,
    // e a folga de +4 cobre variação de quebra de linha (CRLF) sem abrir
    // espaço para outro bloco de preço do arquivo (há mais de um "À VISTA"
    // fora da ficha; a janela curta é o que mantém a asserção posicional).
    const fonte = lerCodigo("src/components/PDPClientWrapper.tsx");
    expect(fonte).toMatch(
      /<RelogioDaChegada veiculo=\{veiculo\} \/>[\s\S]{0,140}hasDiscount \? "PREÇO PROMOCIONAL" : "À VISTA"/,
    );
    // `renderSidebar` é uma função só, chamada duas vezes (celular e
    // desktop) — o relógio precisa estar escrito UMA vez na fonte, não uma
    // por coluna, ou a segunda cópia é sinal de renderSidebar duplicada.
    expect(fonte.match(/<RelogioDaChegada\b/g)).toHaveLength(1);
  });
});
