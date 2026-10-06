// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { lerParametrosDaCurva } from "../src/lib/avaliacaoRecomendacao";
import { lerRespostaDaApiBrasil } from "../src/lib/consultaDePlaca";

/**
 * A tela da consulta de placa montada de verdade (06/10/2026): só o `fetch`,
 * o `next/navigation` e o diálogo de confirmação são dublados.
 *
 * O que só a fiação prova: a tela pergunta PRIMEIRO pelo que está guardado,
 * e só chega à consulta paga depois de alguém confirmar. Um clique que
 * pagasse sem perguntar passaria verde em qualquer teste de função pura.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

let resposta = true;
const confirm = vi.fn(async () => resposta);
vi.mock("../src/components/admin/ConfirmDialog", () => ({ useConfirm: () => ({ confirm }) }));

const fixture = (nome: string, placa: string) => {
  const r = lerRespostaDaApiBrasil(
    JSON.parse(readFileSync(join(__dirname, "fixtures", "apibrasil", `${nome}.json`), "utf8")),
    placa,
  );
  if (!r.ok) throw new Error(r.motivo);
  return { id: "c1", placa, retrato: r.retrato, custo: 30, homologacao: false, criadoEm: new Date().toISOString(), consultadoPor: "Ana" };
};
const MG = fixture("veiculos-total-mg-com-alienacao", "ABC1D23");
const PR = fixture("veiculos-total-pr-sem-base-estadual", "BRA2E19");

// A semente da curva (spec 11), como o andaime de testes do banco a grava.
const CURVA = lerParametrosDaCurva({
  id: "seed",
  vigencia_desde: "2026-09-24",
  base_pp: 20,
  estado_excepcional_pp: -5,
  piso_pct: 15,
  teto_pct: 40,
  km_por_ano: 15000,
  degraus_km: [
    { desvio_km_ate: 5000, pp: 0 },
    { desvio_km_ate: 15000, pp: 2 },
    { desvio_km_ate: 30000, pp: 4 },
    { desvio_km_ate: 50000, pp: 7 },
    { desvio_km_ate: null, pp: 10 },
  ],
  avaria_leve_pp: "[2,4]",
  avaria_seria_pp: "[8,12]",
  pendencia_pp: "[3,5]",
});

let chamadas: Array<Record<string, unknown>>;
let guardadas: Record<string, unknown>;
let container: HTMLDivElement;
let root: Root;

async function montar(props: Record<string, unknown> = {}) {
  globalThis.fetch = (async (_url: string, opcoes?: RequestInit) => {
    const corpo = JSON.parse(String(opcoes?.body)) as { placa: string; soGuardada?: boolean; refazer?: boolean };
    chamadas.push(corpo);
    if (corpo.soGuardada) {
      return { ok: true, status: 200, json: async () => ({ consulta: guardadas[corpo.placa] ?? null, guardada: true }) };
    }
    return { ok: true, status: 200, json: async () => ({ consulta: corpo.placa === "ABC1D23" ? MG : PR, guardada: false, saldo: 970 }) };
  }) as never;
  const { default: ConsultaDePlaca } = await import("../src/components/admin/consulta/ConsultaDePlaca");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(ConsultaDePlaca, {
        recentes: { ok: true, consultas: [] },
        curva: CURVA,
        temToken: true,
        homologacao: false,
        ...props,
      } as never),
    );
  });
}

async function digitar(seletor: string, valor: string) {
  const campo = container.querySelector(seletor) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(campo, valor);
    campo.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function consultar(placa: string) {
  await digitar("input[placeholder='ABC1D23']", placa);
  await act(async () => {
    (container.querySelector("form") as HTMLFormElement).requestSubmit();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  chamadas = [];
  guardadas = {};
  resposta = true;
  confirm.mockClear();
  refresh.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("o caminho do dinheiro", () => {
  it("placa já consultada reabre sem perguntar e sem pagar", async () => {
    guardadas = { ABC1D23: MG };
    await montar();
    await consultar("abc1d23");
    expect(chamadas).toEqual([{ placa: "ABC1D23", soGuardada: true }]);
    expect(confirm).not.toHaveBeenCalled();
    expect(container.querySelector("[data-nivel]")?.getAttribute("data-nivel")).toBe("nao_comprar");
  });

  it("placa nova: pergunta primeiro pelo guardado, pede confirmação e só então paga", async () => {
    await montar();
    await consultar("BRA2E19");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(chamadas).toEqual([
      { placa: "BRA2E19", soGuardada: true },
      { placa: "BRA2E19", refazer: true },
    ]);
    expect(container.querySelector("[data-nivel]")?.getAttribute("data-nivel")).toBe("ressalvas");
    expect(refresh).toHaveBeenCalled();
  });

  it("quem cancela a confirmação não paga", async () => {
    resposta = false;
    await montar();
    await consultar("BRA2E19");
    expect(chamadas).toEqual([{ placa: "BRA2E19", soGuardada: true }]);
    expect(container.querySelector("[data-nivel]")).toBeNull();
  });

  it("sem token, a placa nova nem chega à confirmação", async () => {
    await montar({ temToken: false });
    await consultar("BRA2E19");
    expect(confirm).not.toHaveBeenCalled();
    expect(chamadas).toHaveLength(1);
    expect(container.querySelector("[role=alert]")?.textContent).toContain("APIBRASIL_TOKEN");
  });

  it("placa inválida não sai da tela", async () => {
    await montar();
    await consultar("AB12");
    expect(chamadas).toEqual([]);
    expect(container.querySelector("[role=alert]")?.textContent).toContain("Placa inválida");
  });
});

describe("o aviso que se lê de longe", () => {
  it("o quadro traz as dez checagens, cada uma com sinal e rótulo escrito", async () => {
    guardadas = { BRA2E19: PR };
    await montar();
    await consultar("BRA2E19");
    const linhas = [...container.querySelectorAll("[data-checagem]")];
    expect(linhas).toHaveLength(10);
    for (const l of linhas) {
      const estado = l.getAttribute("data-estado")!;
      // Forma e texto, e não só a cor da borda.
      expect(l.querySelector(`svg[data-estado="${estado}"]`), l.getAttribute("data-checagem")!).toBeTruthy();
      expect(l.textContent).toMatch(/Ok|Atenção|Impeditivo|Não conferido/);
    }
    const estado = (chave: string) => container.querySelector(`[data-checagem="${chave}"]`)?.getAttribute("data-estado");
    expect(estado("debitos")).toBe("nao_conferido");
    expect(estado("leilao")).toBe("ok");
  });

  it("a faixa de compra sai da curva e acompanha o km digitado", async () => {
    guardadas = { BRA2E19: PR };
    await montar();
    await consultar("BRA2E19");
    const faixa = () => container.querySelector("[data-faixa-de-compra]")?.textContent?.replace(/\s/g, " ");
    // Sem km: só a base de 20 p.p. sobre R$ 128.430.
    expect(faixa()).toBe("R$ 102.744");
    await digitar("input[placeholder='0']", "250000");
    // Km muito acima do esperado: o último degrau da curva soma 10 p.p.
    expect(faixa()).toBe("R$ 89.901");
  });

  it("km abaixo de uma leitura anterior vira recusa na faixa do topo", async () => {
    guardadas = { BRA2E19: PR };
    await montar();
    await consultar("BRA2E19");
    await digitar("input[placeholder='0']", "20000");
    expect(container.querySelector("[data-nivel]")?.getAttribute("data-nivel")).toBe("nao_comprar");
    expect(container.textContent).toContain("Hodômetro não anda para trás");
  });

  it("o gráfico vem com a tabela dos mesmos números", async () => {
    guardadas = { BRA2E19: PR };
    await montar();
    await consultar("BRA2E19");
    expect(container.querySelector("svg[aria-label^='FIPE']")).toBeTruthy();
    // 36 meses de tabela e 3 de projeção.
    expect(container.querySelectorAll("details tbody tr")).toHaveLength(39);
    expect(container.querySelector("details")?.textContent).toContain("(projeção)");
  });
});
