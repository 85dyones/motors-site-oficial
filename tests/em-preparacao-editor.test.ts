// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import EditorDeVeiculo from "../src/components/admin/EditorDeVeiculo";
import { MINIMO_DE_FOTOS, MINIMO_DE_FOTOS_EM_PREPARACAO } from "../src/lib/coerenciaDoCadastro";

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

/**
 * O item do checklist cujo RÓTULO contém `trecho`, e o selo ao lado dele.
 *
 * Mede no DOM, não no código-fonte (achado da revisão da Tarefa 6,
 * 2026-09-28): a fonte só prova que `minimoDeFotos` vem das constantes
 * certas, não que o item certo lê o valor certo em tela. `"libera a
 * publicação"` está nos dois textos do primeiro degrau (o cheio e o de
 * preparação), então serve para achar a linha em qualquer um dos dois ramos.
 */
function itemDoChecklist(trecho: string): { rotulo: string; estado: string } | undefined {
  const linha = Array.from(container.querySelectorAll("div")).find(
    (d) =>
      d.className === "flex gap-3 border-b border-mt-regua-fina py-2.5" &&
      (d.textContent ?? "").includes(trecho),
  );
  if (!linha) return undefined;
  return {
    rotulo: linha.querySelector("div.min-w-0 > div")?.textContent ?? "",
    estado: linha.querySelectorAll("span")[1]?.textContent ?? "",
  };
}

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

/**
 * O primeiro degrau do checklist reage à régua condicional — achado da
 * revisão da Tarefa 6 (2026-09-28). A fonte prova que `minimoDeFotos` vem de
 * `MINIMO_DE_FOTOS`/`MINIMO_DE_FOTOS_EM_PREPARACAO` (ver
 * `tests/fotos-do-veiculo.test.ts`); este bloco prova que o carro CERTO cai
 * no ramo CERTO em tela, com o mesmo veículo nos dois testes — só a caixa e a
 * data mudam.
 */
describe("o checklist reage à régua de em preparação", () => {
  const UMA_FOTO_EM_PREPARACAO = {
    id: 8497423,
    marca: "fiat",
    modelo: "argo",
    versao: "drive 1.0",
    preco: 79900,
    estado_cadastro: "rascunho",
    origem: "sync",
    whatsapp_images: ["https://cdn.exemplo/f.jpg"],
    em_preparacao: true,
    previsao_chegada_em: "2026-10-03T17:00:00.000Z",
  };

  it("em preparação liberada: uma foto já libera, e o degrau some — OK", async () => {
    await abrir(UMA_FOTO_EM_PREPARACAO);
    const item = itemDoChecklist("libera a publicação");
    expect(item?.rotulo).toBe(
      `${MINIMO_DE_FOTOS_EM_PREPARACAO} foto — em preparação, libera a publicação`,
    );
    expect(item?.estado).toBe("OK");
  });

  it("o mesmo carro sem a caixa marcada: a régua cheia cobra as fotos que faltam", async () => {
    await abrir({ ...UMA_FOTO_EM_PREPARACAO, em_preparacao: false, previsao_chegada_em: null });
    const item = itemDoChecklist("libera a publicação");
    expect(item?.rotulo).toBe(`${MINIMO_DE_FOTOS} fotos — libera a publicação`);
    expect(item?.estado).toBe(`FALTAM ${MINIMO_DE_FOTOS - 1}`);
  });
});
