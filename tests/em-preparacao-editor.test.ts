// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import EditorDeVeiculo from "../src/components/admin/EditorDeVeiculo";

/**
 * A caixa "em preparação" no editor do veículo — spec
 * 2026-09-28-em-preparacao-design, seção "Painel".
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let chamadas: { url: string; metodo: string; corpo?: Record<string, unknown> }[] = [];

function dublarFetch() {
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    chamadas.push({
      url: String(url),
      metodo: opcoes?.method ?? "GET",
      corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined,
    });
    return { ok: true, status: 200, json: async () => ({ mudancasRegistradas: 1 }) };
  }) as unknown as typeof fetch;
}

let container: HTMLDivElement;
let root: Root;
const fetchOriginal = globalThis.fetch;

beforeEach(() => {
  chamadas = [];
  dublarFetch();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.fetch = fetchOriginal;
});

const COM_COLUNA = {
  id: 8497421,
  marca: "fiat",
  modelo: "argo",
  versao: "drive 1.0",
  preco: 79900,
  estado_cadastro: "rascunho",
  origem: "sync",
  whatsapp_images: ["https://cdn.exemplo/f.jpg"],
  em_preparacao: false,
  previsao_chegada_em: null,
};

async function abrir(inicial: Record<string, unknown>, perfil: string[] = ["comercial"]) {
  await act(async () => {
    root.render(
      createElement(EditorDeVeiculo as never, { inicial: inicial as never, visitas30Dias: null, perfil: perfil as never }),
    );
  });
  const aba = Array.from(container.querySelectorAll("button")).find((b) =>
    /preço e (margem|destaque)/i.test(b.textContent ?? ""),
  );
  await act(async () => aba!.click());
}

const caixa = () =>
  Array.from(container.querySelectorAll("label")).find((l) => /em preparação/i.test(l.textContent ?? ""))
    ?.querySelector('input[type="checkbox"]') as HTMLInputElement | undefined;

const campoDaData = () => container.querySelector("#f-previsao") as HTMLInputElement | null;

async function digitar(campo: HTMLInputElement, valor: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(campo, valor);
    campo.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function salvar() {
  const botao = Array.from(container.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === "Salvar");
  await act(async () => botao!.click());
}

const patches = () => chamadas.filter((c) => c.metodo === "PATCH");

describe("a caixa no editor", () => {
  it("marcar pede a data, e salvar manda os dois campos", async () => {
    await abrir(COM_COLUNA);
    await act(async () => caixa()!.click());
    expect(campoDaData()).not.toBeNull();
    await digitar(campoDaData()!, "2026-10-03T14:00");
    await salvar();
    expect(patches()).toHaveLength(1);
    expect(patches()[0].corpo).toMatchObject({
      em_preparacao: true,
      previsao_chegada_em: "2026-10-03T17:00:00.000Z",
    });
  });

  it("marcada sem data não salva, e diz por quê", async () => {
    await abrir(COM_COLUNA);
    await act(async () => caixa()!.click());
    await salvar();
    expect(patches()).toHaveLength(0);
    expect(container.textContent).toContain("Em preparação precisa da previsão de chegada ao pátio.");
  });

  it("coluna ausente (migração por aplicar): sem caixa, e o salvamento não manda os campos", async () => {
    const { em_preparacao: _e, previsao_chegada_em: _p, ...semColuna } = COM_COLUNA;
    await abrir({ ...semColuna, status_tag: "" });
    expect(caixa()).toBeUndefined();
    const tag = container.querySelector("#f-tag") as HTMLInputElement;
    await digitar(tag, "ÚNICO DONO");
    await salvar();
    expect(patches()[0].corpo).not.toHaveProperty("em_preparacao");
    expect(patches()[0].corpo).not.toHaveProperty("previsao_chegada_em");
  });

  it("quem não tem a linha da matriz não vê a caixa", async () => {
    await abrir(COM_COLUNA, ["financeiro"]);
    expect(caixa()).toBeUndefined();
  });
});
