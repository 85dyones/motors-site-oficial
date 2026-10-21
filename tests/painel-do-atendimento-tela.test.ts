// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CONFIG_DE_FABRICA } from "../src/lib/configDoAtendimento";

/**
 * Leads → Atendimento IA, montado (2026-10-20): ligar o assistente.
 *
 * No primeiro teste no branch, o dono não achou onde ligar: era uma caixinha
 * no meio da aba Configuração, que só valia depois do GRAVAR no fim da tela —
 * e a aba sumia em silêncio quando a configuração não carregava. Este arquivo
 * segura o caminho: a faixa de "desligado" leva à aba, o botão grava na hora,
 * e a falha aparece (menos o 403 de quem não configura).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) => createElement("a", { href, ...resto } as never, children as never),
}));
vi.mock("../src/components/admin/atendimento/FotosDoEstoque", () => ({ default: () => createElement("div", { "data-fotos": true }) }));

const TODAS = { deepseek: true, evolution: true, n8n: true };
let respostaDaConfig: { status: number; corpo: unknown };
let chamadas: { metodo: string; url: string; corpo?: Record<string, unknown> }[];
let container: HTMLDivElement;
let root: Root;

const configDesligada = (integracoes = TODAS) => ({
  status: 200,
  corpo: { config: { ...CONFIG_DE_FABRICA, ativo: false }, fabrica: CONFIG_DE_FABRICA, integracoes },
});

beforeEach(() => {
  chamadas = [];
  respostaDaConfig = configDesligada();
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    const metodo = opcoes?.method ?? "GET";
    const corpo = opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined;
    chamadas.push({ metodo, url, corpo });
    if (url.startsWith("/api/atendimento/relatorio")) return { ok: false, status: 500, json: async () => ({ error: "sem relatório no teste" }) };
    if (url === "/api/atendimento/config" && metodo === "PUT") {
      return { ok: true, status: 200, json: async () => ({ ok: true, config: { ...CONFIG_DE_FABRICA, ativo: corpo.ativo }, integracoes: TODAS }) };
    }
    const { status, corpo: resposta } = respostaDaConfig;
    return { ok: status >= 200 && status < 300, status, json: async () => resposta };
  }) as never;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function montar() {
  const { default: PainelDoAtendimento } = await import("../src/components/admin/PainelDoAtendimento");
  await act(async () => {
    root.render(createElement(PainelDoAtendimento));
  });
}

const texto = () => container.textContent ?? "";
const botao = (rotulo: string) => [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === rotulo);
const clicar = async (el: Element | undefined) => {
  expect(el, "botão não encontrado").toBeTruthy();
  await act(async () => (el as HTMLElement).click());
};

describe("ligar o assistente", () => {
  it("desligado: a faixa diz que ele não responde ninguém e leva à aba Configuração", async () => {
    await montar();
    expect(container.querySelector("[data-assistente-desligado]")!.textContent).toContain("O assistente está desligado");
    await clicar(botao("Ligar em Configuração"));
    expect(container.querySelector("[data-ligar]")!.textContent).toContain("Desligado");
    expect(botao("Ligar o assistente")).toBeTruthy();
    // Na própria aba a faixa sai: o botão está ali.
    expect(container.querySelector("[data-assistente-desligado]")).toBeNull();
  });

  it("o botão grava na hora com ativo: true, e a tela passa a dizer ligado", async () => {
    await montar();
    await clicar(botao("Ligar em Configuração"));
    await clicar(botao("Ligar o assistente"));
    const put = chamadas.find((c) => c.metodo === "PUT");
    expect(put).toMatchObject({ url: "/api/atendimento/config", corpo: { ativo: true, nome_do_assistente: "Ney" } });
    expect(texto()).toContain("Assistente ligado. Ele responde a partir da próxima mensagem.");
    expect(container.querySelector("[data-ligar]")!.textContent).toContain("Ligado");
    expect(botao("Desligar o assistente")).toBeTruthy();
    expect(texto()).toContain("Assistente ligado");
  });

  it("sem as integrações na Vercel, ligar não grava e diz o que falta", async () => {
    respostaDaConfig = configDesligada({ deepseek: false, evolution: true, n8n: true });
    await montar();
    await clicar(botao("Ligar em Configuração"));
    await clicar(botao("Ligar o assistente"));
    expect(chamadas.some((c) => c.metodo === "PUT")).toBe(false);
    expect(texto()).toContain("Antes de ligar, configure na Vercel: DEEPSEEK_API_KEY");
  });

  it("a configuração que falha aparece para quem configura, em vez de a aba sumir", async () => {
    respostaDaConfig = { status: 500, corpo: { error: "Loja ilegível (org_padrao)." } };
    await montar();
    expect(container.querySelector("[data-erro-da-config]")!.textContent).toContain("Loja ilegível (org_padrao). (HTTP 500)");
    expect(botao("Configuração")).toBeUndefined();
  });

  it("quem não configura (403) não vê aba nem aviso", async () => {
    respostaDaConfig = { status: 403, corpo: { error: "Sem permissão." } };
    await montar();
    expect(container.querySelector("[data-erro-da-config]")).toBeNull();
    expect(container.querySelector("[data-assistente-desligado]")).toBeNull();
    expect(botao("Configuração")).toBeUndefined();
  });
});
