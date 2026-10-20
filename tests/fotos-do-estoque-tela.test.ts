// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * A aba Fotos do Atendimento IA, montada (2026-10-20): o resumo do estoque, a
 * lista dos carros, a galeria com a camada de cada foto, a correção à mão e o
 * "classificar agora". Só o `fetch` é dublê.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const situacao = (parcial: Record<string, unknown>) => ({ total: 3, classificadas: 3, pendentes: 0, porCamada: {}, foraDoEnvio: 0, corrigidas: 0, ...parcial });
const LISTA = {
  carros: [
    { id: "7950008", nome: "Onix LT 2020", situacao: situacao({ classificadas: 1, pendentes: 2, porCamada: { externa: 1 } }) },
    { id: "7950009", nome: "HB20 Sense 2021", situacao: situacao({ porCamada: { externa: 2, interior: 1 } }) },
  ],
  resumo: { carros: 2, separados: 1, semFoto: 0, fotosNaFila: 2 },
  visao: true,
};
interface FotoDoDuble {
  url: string;
  posicao: number;
  camada: string | null;
  descricao: string | null;
  aproveitavel: boolean;
  corrigida: boolean;
}
const CARRO = {
  carro: { id: "7950008", nome: "Onix LT 2020" },
  fotos: [
    { url: "https://f.teste/1.jpg", posicao: 0, camada: "externa", descricao: "Frente", aproveitavel: true, corrigida: false },
    { url: "https://f.teste/2.jpg", posicao: 1, camada: null, descricao: null, aproveitavel: false, corrigida: false },
  ] as FotoDoDuble[],
  situacao: situacao({ classificadas: 1, pendentes: 1 }),
};

let chamadas: { metodo: string; url: string; corpo?: unknown }[];
/** O que o GET do carro devolve — o teste troca depois de classificar. */
let carroAtual: typeof CARRO;
/** O que o PATCH devolve. */
let respostaDoPatch: Record<string, unknown>;
/** A lista que o GET devolve — o teste troca depois de corrigir. */
let listaAtual: typeof LISTA;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  chamadas = [];
  carroAtual = CARRO;
  listaAtual = LISTA;
  respostaDoPatch = { ok: true, descricao: "Frente" };
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    const metodo = opcoes?.method ?? "GET";
    chamadas.push({ metodo, url, corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined });
    const corpo =
      metodo === "GET"
        ? url.includes("veiculo=")
          ? carroAtual
          : listaAtual
        : metodo === "POST"
          ? { ok: true, fotos_classificadas: 12, falhas: 0, restantes: 0 }
          : respostaDoPatch;
    return { ok: true, status: 200, json: async () => corpo };
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
  const { default: FotosDoEstoque } = await import("../src/components/admin/atendimento/FotosDoEstoque");
  await act(async () => {
    root.render(createElement(FotosDoEstoque));
  });
}

const texto = () => container.textContent ?? "";
const botao = (rotulo: string) => [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === rotulo)!;
const clicar = async (el: Element) => act(async () => (el as HTMLElement).click());

describe("a aba Fotos", () => {
  it("abre com o resumo e os carros que têm foto na fila", async () => {
    await montar();
    expect(chamadas[0]).toEqual({ metodo: "GET", url: "/api/atendimento/fotos/estoque", corpo: undefined });
    expect(container.querySelector("[data-resumo]")!.textContent).toBe("1 de 2 carros com as fotos separadas · 2 foto(s) na fila");
    expect([...container.querySelectorAll("li[data-carro]")].map((li) => li.getAttribute("data-carro"))).toEqual(["7950008"]);
    expect(texto()).toContain("fora 1 · 2 na fila");
    await clicar(botao("Todos os carros"));
    expect(container.querySelectorAll("li[data-carro]")).toHaveLength(2);
    expect(texto()).toContain("fora 2 · interior 1");
  });

  it("classificar a fila agora: POST e o resultado numa frase", async () => {
    await montar();
    await clicar(botao("Classificar a fila agora"));
    expect(chamadas.find((c) => c.metodo === "POST")).toEqual({ metodo: "POST", url: "/api/atendimento/fotos/estoque", corpo: {} });
    expect(container.querySelector("[data-resultado]")!.textContent).toBe("12 fotos classificadas.");
  });

  it("a galeria do carro: trocar a camada grava na hora, com o carro e a foto", async () => {
    await montar();
    await clicar(botao("Ver fotos"));
    expect(chamadas.at(-1)).toMatchObject({ metodo: "GET", url: "/api/atendimento/fotos/estoque?veiculo=7950008" });
    const imgs = [...container.querySelectorAll("li[data-foto] img")].map((i) => i.getAttribute("src"));
    expect(imgs).toEqual(["https://f.teste/1.jpg", "https://f.teste/2.jpg"]);
    expect(texto()).toContain("Foto 2 · na fila");
    const seletor = container.querySelector('select[aria-label="Camada da foto 1"]') as HTMLSelectElement;
    expect(seletor.value).toBe("externa");
    await act(async () => {
      seletor.value = "outra";
      seletor.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(chamadas.find((c) => c.metodo === "PATCH")).toEqual({
      metodo: "PATCH",
      url: "/api/atendimento/fotos/estoque",
      corpo: { veiculo: "7950008", url: "https://f.teste/1.jpg", camada: "outra", descricao: "Frente" },
    });
    expect(texto()).toContain("corrigida à mão");
  });

  it("refazer a classificação do carro manda refazer: true", async () => {
    await montar();
    await clicar(botao("Ver fotos"));
    await clicar(botao("Refazer a classificação"));
    expect(chamadas.find((c) => c.metodo === "POST")).toEqual({ metodo: "POST", url: "/api/atendimento/fotos/estoque", corpo: { veiculo: "7950008", refazer: true } });
  });

  it("B-2: depois de classificar, cada foto mostra o que o servidor diz agora — e a legenda não grava a camada velha", async () => {
    await montar();
    await clicar(botao("Ver fotos"));
    carroAtual = {
      ...CARRO,
      fotos: [
        { ...CARRO.fotos[0], camada: "interior" },
        { ...CARRO.fotos[1], camada: "externa", aproveitavel: true },
      ],
    };
    await clicar(botao("Refazer a classificação"));
    const primeira = container.querySelector('select[aria-label="Camada da foto 1"]') as HTMLSelectElement;
    const segunda = container.querySelector('select[aria-label="Camada da foto 2"]') as HTMLSelectElement;
    expect(primeira.value).toBe("interior");
    expect(segunda.value).toBe("externa");
    expect(texto()).not.toContain("Foto 2 · na fila");
    const legenda = container.querySelector('input[aria-label="Legenda da foto 1"]') as HTMLInputElement;
    await act(async () => {
      const definir = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      definir.call(legenda, "Banco traseiro");
      legenda.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      legenda.focus();
      legenda.blur();
    });
    expect(chamadas.filter((c) => c.metodo === "PATCH").at(-1)!.corpo).toEqual({ veiculo: "7950008", url: "https://f.teste/1.jpg", camada: "interior", descricao: "Banco traseiro" });
  });

  it("a legenda recusada (preço, placa, contato) volta vazia, com o aviso", async () => {
    await montar();
    await clicar(botao("Ver fotos"));
    respostaDoPatch = { ok: true, descricao: null };
    const seletor = container.querySelector('select[aria-label="Camada da foto 1"]') as HTMLSelectElement;
    const legenda = container.querySelector('input[aria-label="Legenda da foto 1"]') as HTMLInputElement;
    await act(async () => {
      const definir = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      definir.call(legenda, "Etiqueta R$ 79.900");
      legenda.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      seletor.value = "detalhes";
      seletor.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(legenda.value).toBe("");
    expect(texto()).toContain("A legenda não foi gravada");
  });

  it("corrigir a última foto da fila não fecha a galeria aberta", async () => {
    await montar();
    await clicar(botao("Ver fotos"));
    listaAtual = { ...LISTA, carros: [{ ...LISTA.carros[0], situacao: situacao({ porCamada: { externa: 2 } }) }, LISTA.carros[1]] };
    const seletor = container.querySelector('select[aria-label="Camada da foto 1"]') as HTMLSelectElement;
    await act(async () => {
      seletor.value = "outra";
      seletor.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector('li[data-carro="7950008"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="Camada da foto 1"]')).not.toBeNull();
  });
});
