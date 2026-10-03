// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ETAPAS_PADRAO } from "../src/lib/funil";

/**
 * O card do lead abre e fecha, na tela montada (03/10/2026). O molde é o de
 * `etiquetas-do-lead-fiacao.test.ts`: o quadro de verdade, só o `fetch` e o
 * `next/link` dublados.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

const lead = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  telefone: "5541999990000",
  interesse: "Renault Duster",
  canal: "site",
  responsavel: null,
  observacoes: null,
  situacao: "novo",
  created_at: new Date().toISOString(),
  ag_uid: null,
  desfecho: null,
  chatwoot_conversation_id: null,
  etiquetas: [],
  ...extra,
});

let container: HTMLDivElement;
let root: Root;

async function assentar() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((pronto) => setTimeout(pronto, 0));
    });
  }
}

beforeEach(async () => {
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    const responder = (c: unknown) => ({ ok: true, status: 200, json: async () => c });
    if (url === "/api/leads/etiquetas") return responder({ etiquetas: [], daConta: true, faltamNaConta: [] });
    if (opcoes?.method === "PATCH") return responder({ ok: true });
    return responder({
      leads: [lead("l1", "Joana"), lead("l2", "Pedro", { responsavel: "Ana" })],
      atendentes: [{ nome: "Ana" }],
      etapas: ETAPAS_PADRAO,
      motivos: [],
      funilPendente: false,
      podeConfigurar: false,
      busca: null,
      etiquetasDisponiveis: [],
      etiquetasEditaveis: false,
    });
  }) as never;
  const { default: LeadsKanban } = await import("../src/components/admin/LeadsKanban");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(LeadsKanban));
  });
  await assentar();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const botao = (id: string) => container.querySelector<HTMLButtonElement>(`button[aria-controls="lead-${id}"]`)!;
const detalhe = (id: string) => container.querySelector<HTMLElement>(`#lead-${id}`)!;
const clicar = async (el: HTMLElement) => {
  await act(async () => {
    el.click();
  });
  await assentar();
};

describe("o card do lead, na tela", () => {
  it("nasce fechado: nome, responsável e espera à vista; o resto escondido", () => {
    expect(botao("l1").getAttribute("aria-expanded")).toBe("false");
    expect(botao("l1").textContent).toContain("Joana");
    expect(detalhe("l1").hidden).toBe(true);
    const card = botao("l1").closest("[draggable]")!;
    const resumo = card.textContent!.replace(detalhe("l1").textContent!, "");
    expect(resumo).toContain("Sem responsável");
    expect(resumo).not.toContain("Renault Duster");
    // O responsável do outro card aparece pelo nome.
    const resumoDoPedro = botao("l2").closest("[draggable]")!.textContent!.replace(detalhe("l2").textContent!, "");
    expect(resumoDoPedro).toContain("Ana");
    // A troca de responsável está no detalhe, fora do alcance enquanto fechado.
    expect(container.querySelector('[aria-label="Responsável por Joana"]')!.closest("[hidden]")).not.toBeNull();
  });

  it("clicar no nome abre só aquele card, e clicar de novo fecha", async () => {
    await clicar(botao("l1"));
    expect(botao("l1").getAttribute("aria-expanded")).toBe("true");
    expect(detalhe("l1").hidden).toBe(false);
    expect(detalhe("l1").textContent).toContain("Renault Duster");
    expect(container.querySelector('[aria-label="Responsável por Joana"]')!.closest("[hidden]")).toBeNull();
    expect(detalhe("l2").hidden).toBe(true);

    await clicar(botao("l1"));
    expect(detalhe("l1").hidden).toBe(true);
  });

  it("o card aberto continua aberto depois de avançar de etapa", async () => {
    await clicar(botao("l1"));
    await clicar(container.querySelector<HTMLElement>('[aria-label="Avançar Joana uma etapa"]')!);
    expect(detalhe("l1").hidden).toBe(false);
  });
});
