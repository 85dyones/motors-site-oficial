// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  assentar,
  cardDe,
  clicar,
  definirLargura,
  detalheDeTeste,
  filaDeTeste,
  gaveta,
  leadDaUrl,
  leadDeTeste,
  quemAbre,
  rota,
  teclar,
  urlDaTela,
  zerarRota,
} from "./quadroDeLeadsDeTeste";

/**
 * O card enxuto do quadro, na tela montada (desenho de 23/09/2026, tela em
 * 03/10). O card mostra o que se decide olhando o quadro e ABRE o detalhe; o
 * que era o card aberto (responsável, anotação, desfecho) mora na gaveta.
 *
 * O molde é o de `etiquetas-do-lead-fiacao.test.ts`: o quadro de verdade, só o
 * `fetch`, o `next/link` e o `next/navigation` dublados.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));
vi.mock("next/navigation", async () => (await import("./quadroDeLeadsDeTeste")).navegacaoDeTeste);

const HA_DOIS_DIAS = new Date(Date.now() - 2 * 86_400_000).toISOString();

const JOANA = leadDeTeste("l1", "Joana", {
  interesse: "Renault Duster",
  etiquetas: ["origem-site"],
  transferencias: 3,
  proximo_passo: "Cobrar retorno da proposta",
  proximo_passo_vence_em: HA_DOIS_DIAS,
  ultima_interacao: { tipo: "whatsapp", quando: HA_DOIS_DIAS, texto: "Pediu a simulação com entrada de dez mil.", autor: "Ana" },
});
const PEDRO = leadDeTeste("l2", "Pedro", { interesse: "Onix 2022", responsavel: "Ana", situacao: "em_contato" });

let escopo: string;
let chamadas: Array<{ metodo: string; url: string; corpo?: Record<string, unknown> }>;
let container: HTMLDivElement;
let root: Root;

async function montar() {
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    const metodo = opcoes?.method ?? "GET";
    chamadas.push({ metodo, url: String(url), corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined });
    const responder = (c: unknown) => ({ ok: true, status: 200, json: async () => c });
    const doLead = leadDaUrl(String(url));
    if (doLead) return responder(detalheDeTeste(doLead.id === "l1" ? JOANA : PEDRO));
    if (metodo === "PATCH") return responder({ ok: true });
    return responder(filaDeTeste([JOANA, PEDRO], { escopo }));
  }) as never;
  const { default: LeadsKanban } = await import("../src/components/admin/LeadsKanban");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(LeadsKanban, { meuNome: "Ana" }));
  });
  await assentar();
}

beforeEach(() => {
  escopo = "todos";
  chamadas = [];
  zerarRota();
  definirLargura(true);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const patches = () => chamadas.filter((c) => c.metodo === "PATCH");

describe("o card enxuto, na tela", () => {
  it("mostra nome, interesse, etiquetas, última interação, próximo passo, responsável e espera", async () => {
    await montar();
    const card = cardDe(container, "l1")!;
    const texto = card.textContent!;
    expect(texto).toContain("Joana");
    expect(texto).toContain("Renault Duster");
    // O resumo das etiquetas continua, só leitura.
    expect(card.querySelector('[aria-label="Etiquetas de Joana, resumo"]')!.textContent).toBe("origem-site");
    expect(card.querySelector('[aria-label="Etiquetas de Joana, resumo"] button')).toBeNull();
    // A última interação: "TIPO · HÁ X" e o texto.
    expect(texto).toContain("WHATSAPP · HÁ 2 D");
    expect(texto).toContain("Pediu a simulação com entrada de dez mil.");
    // O próximo passo, atrasado: a régua e o rótulo em acento.
    expect(texto).toContain("→ ATRASADO · 2 D");
    expect(texto).toContain("Cobrar retorno da proposta");
    expect(card.querySelector(".border-l-2.border-mt-accent")).not.toBeNull();
    // Responsável, transferências e o tempo de espera, na mesma linha.
    expect(texto).toContain("Sem responsável");
    expect(texto).toContain("3ª transf. · ");
    expect(cardDe(container, "l2")!.textContent).toContain("Ana");
  });

  it("não tem mais select de responsável, anotação nem desfecho", async () => {
    await montar();
    const card = cardDe(container, "l1")!;
    expect(card.querySelector("select")).toBeNull();
    expect(card.querySelector("textarea")).toBeNull();
    expect(card.textContent).not.toContain("+ anotação");
    expect(card.textContent).not.toMatch(/Ganho|Perdido|Não é oportunidade/);
    expect(container.querySelector('[aria-label="Responsável por Joana"]')).toBeNull();
  });

  it("o vendedor que só vê os próprios leads não lê o próprio nome em cada card", async () => {
    escopo = "meus";
    // Para ele a tela abre na Lista do dia; o card é o do Quadro.
    rota.query = "vista=quadro";
    await montar();
    expect(cardDe(container, "l2")!.textContent).not.toContain("Ana");
    expect(cardDe(container, "l1")!.textContent).not.toContain("Sem responsável");
  });

  it("as setas movem o lead e não abrem o detalhe", async () => {
    await montar();
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Voltar Joana uma etapa"]')!.disabled).toBe(true);
    await clicar(container.querySelector('[aria-label="Avançar Joana uma etapa"]'));

    expect(patches().map((p) => p.corpo)).toEqual([{ id: "l1", situacao: "em_contato" }]);
    expect(gaveta()).toBeNull();
    expect(urlDaTela()).toBe("/admin/leads");
  });

  it("o link da conversa registra o contato, não abre o detalhe e não rouba o arrasto", async () => {
    await montar();
    const link = cardDe(container, "l1")!.querySelector<HTMLAnchorElement>("a")!;
    expect(link.textContent).toContain("WhatsApp");
    expect(link.textContent).toContain("(41) 99999-0000");
    expect(link.getAttribute("draggable")).toBe("false");
    expect(cardDe(container, "l1")!.getAttribute("draggable")).toBe("true");

    link.addEventListener("click", (e) => e.preventDefault());
    await clicar(link);
    expect(patches().map((p) => p.corpo)).toEqual([{ id: "l1", contato: "whatsapp" }]);
    expect(gaveta()).toBeNull();
  });

  it("clicar no card abre a gaveta, marca o card e põe o lead na URL", async () => {
    await montar();
    await clicar(cardDe(container, "l1"));

    const aberta = gaveta()!;
    expect(aberta, "a gaveta precisa abrir").not.toBeNull();
    expect(aberta.getAttribute("aria-label")).toBe("Detalhe do lead Joana");
    // Sem véu: a gaveta não é modal, o quadro continua em uso.
    expect(aberta.getAttribute("aria-modal")).toBeNull();
    expect(cardDe(container, "l1")!.className).toContain("outline-2");
    expect(cardDe(container, "l2")!.className).not.toContain("outline-2");
    expect(quemAbre(container, "l1")!.getAttribute("aria-expanded")).toBe("true");
    expect(urlDaTela()).toBe("/admin/leads?lead=l1");
    // O foco entrou na gaveta.
    expect(aberta.contains(document.activeElement)).toBe(true);
    // E o que saiu do card está nela.
    expect(aberta.querySelector('[aria-label="Responsável por Joana"]')).not.toBeNull();
  });

  it("Esc fecha a gaveta e devolve o foco ao card", async () => {
    await montar();
    await clicar(quemAbre(container, "l1"));
    expect(gaveta()).not.toBeNull();

    await teclar("Escape");

    expect(gaveta()).toBeNull();
    expect(document.activeElement).toBe(quemAbre(container, "l1"));
    expect(urlDaTela()).toBe("/admin/leads");
  });

  it("o botão FECHAR também fecha, e trocar de card troca o lead da gaveta", async () => {
    await montar();
    await clicar(cardDe(container, "l1"));
    await clicar(cardDe(container, "l2"));
    expect(gaveta()!.getAttribute("aria-label")).toBe("Detalhe do lead Pedro");

    const fechar = [...gaveta()!.querySelectorAll("button")].find((b) => b.textContent === "FECHAR ✕");
    await clicar(fechar);
    expect(gaveta()).toBeNull();
    expect(document.activeElement).toBe(quemAbre(container, "l2"));
  });

  it("abaixo de 1024px, clicar no card leva à página do lead", async () => {
    definirLargura(false);
    await montar();
    await clicar(cardDe(container, "l1"));

    expect(rota.push).toHaveBeenCalledWith("/admin/leads/l1");
    expect(gaveta()).toBeNull();
  });

  it("abrir por ?lead= numa tela estreita redireciona para a página", async () => {
    definirLargura(false);
    rota.query = "lead=l2";
    await montar();

    expect(rota.replace.mock.calls.map((c) => c[0])).toEqual(["/admin/leads/l2"]);
    expect(gaveta()).toBeNull();
  });

  it("abrir por ?lead= numa tela larga já mostra a gaveta", async () => {
    rota.query = "lead=l2";
    await montar();
    expect(gaveta()!.getAttribute("aria-label")).toBe("Detalhe do lead Pedro");
  });
});
