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
const CARRO = {
  carro: { id: "7950008", nome: "Onix LT 2020" },
  fotos: [
    { url: "https://f.teste/1.jpg", posicao: 0, camada: "externa", descricao: "Frente", aproveitavel: true, corrigida: false },
    { url: "https://f.teste/2.jpg", posicao: 1, camada: null, descricao: null, aproveitavel: false, corrigida: false },
  ],
  situacao: situacao({ classificadas: 1, pendentes: 1 }),
};

let chamadas: { metodo: string; url: string; corpo?: unknown }[];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  chamadas = [];
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    const metodo = opcoes?.method ?? "GET";
    chamadas.push({ metodo, url, corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined });
    const corpo =
      metodo === "GET"
        ? url.includes("veiculo=")
          ? CARRO
          : LISTA
        : metodo === "POST"
          ? { ok: true, fotos_classificadas: 12, falhas: 0, restantes: 0 }
          : { ok: true };
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
});
