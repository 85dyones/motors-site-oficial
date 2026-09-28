// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import FichaDeEstadoNoEditor from "../src/components/admin/repasse/FichaDeEstadoNoEditor";
import { ITEM_VAZIO } from "../src/lib/fichaDeEstado";
import type { ItemDeEstado } from "../src/lib/repasse";
import { fotoDeTeste } from "./repasseDeTeste";

/**
 * O quadro da foto do defeito (spec "quadro da foto à esquerda", 28/09).
 *
 * Antes: `<input type="file">` cru, espremido numa coluna estreita, com "Sem
 * foto" escrito em cima — ninguém reconhecia ali "é aqui que eu boto a foto".
 * Agora: um quadro grande à esquerda de cada linha, clicável e que recebe o
 * arquivo arrastado; "Trocar"/"Tirar" quando já tem foto; e o status/erro do
 * envio moram DENTRO do quadro do próprio item — nunca só no rodapé da ficha,
 * que misturaria o item 1 com o item 2.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dubles = vi.hoisted(() => ({ urlPublica: "" }));

vi.mock("../src/lib/imageProcessor", () => ({
  processarFotoDeVeiculo: async () => ({
    web: new File(["x"], "a.webp", { type: "image/webp" }),
    zap: new File(["x"], "a.jpg", { type: "image/jpeg" }),
  }),
}));

vi.mock("../src/lib/supabase-browser", () => ({
  createBrowserSupabaseClient: () => ({
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: "x" }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: dubles.urlPublica } }),
      }),
    },
  }),
}));

let container: HTMLDivElement;
let root: Root;

const ITENS: ItemDeEstado[] = [
  { ...ITEM_VAZIO, descricao: "Farol" },
  { ...ITEM_VAZIO, descricao: "Pneu" },
];

type Props = Parameters<typeof FichaDeEstadoNoEditor>[0];

async function montar(props: Partial<Props> = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const base: Props = {
    repasseId: "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f",
    itens: ITENS,
    semDefeitos: false,
    oficina: null,
    orcamentoEm: null,
    podeEditar: true,
    aoMudar: () => {},
    aoMudarItem: () => {},
    ...props,
  };
  await act(async () => root.render(createElement(FichaDeEstadoNoEditor, base)));
}

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  dubles.urlPublica = "";
});

/** Solta `arquivo` em `el`, como o navegador faz ao arrastar um arquivo. */
function soltarArquivo(el: Element, arquivo: File) {
  const evento = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(evento, "dataTransfer", { value: { files: [arquivo] } });
  el.dispatchEvent(evento);
}

const rotuloComTexto = (texto: string) =>
  [...container.querySelectorAll("label")].find((l) => l.textContent?.includes(texto));

const botaoComTexto = (texto: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === texto);

describe("FichaDeEstadoNoEditor: o quadro da foto do defeito", () => {
  it("quadro vazio: 'Adicionar foto' + 'ou arraste a imagem', preso ao input 'Foto do defeito 1'", async () => {
    await montar();

    const input = container.querySelector<HTMLInputElement>('input[type="file"][aria-label="Foto do defeito 1"]');
    expect(input, "tem de existir o input do item 1").toBeTruthy();
    expect(input!.id, "o input precisa de um id para o rótulo apontar").toBeTruthy();

    const quadro = rotuloComTexto("Adicionar foto");
    expect(quadro, "tem de ter o rótulo 'Adicionar foto'").toBeTruthy();
    expect(quadro!.tagName).toBe("LABEL");
    expect(quadro!.getAttribute("for")).toBe(input!.id);
    expect(quadro!.textContent).toContain("ou arraste a imagem");
  });

  it("item preenchido: foto + 'Trocar' + 'Tirar' — 'Tirar' chama aoMudarItem(0, { foto: null })", async () => {
    const aoMudarItem = vi.fn();
    await montar({
      itens: [{ ...ITENS[0], foto: fotoDeTeste("d1") }, ITENS[1]],
      aoMudarItem,
    });

    const img = container.querySelector<HTMLImageElement>('img[alt="Foto do defeito 1"]');
    expect(img?.getAttribute("src")).toBe(fotoDeTeste("d1"));

    const input = container.querySelector<HTMLInputElement>('input[type="file"][aria-label="Foto do defeito 1"]');
    const trocar = rotuloComTexto("Trocar");
    expect(trocar, "tem de ter o rótulo 'Trocar'").toBeTruthy();
    expect(trocar!.getAttribute("for")).toBe(input!.id);

    const tirar = botaoComTexto("Tirar");
    expect(tirar, "tem de ter o botão 'Tirar'").toBeTruthy();
    await act(async () => tirar!.click());
    expect(aoMudarItem).toHaveBeenCalledWith(0, { foto: null });
  });

  it("soltar uma imagem no quadro: validarFoto passa, processarFotoDeVeiculo roda, e aoMudarItem recebe a URL pública", async () => {
    dubles.urlPublica = fotoDeTeste("novo");
    const aoMudarItem = vi.fn();
    await montar({ aoMudarItem });

    const quadro = rotuloComTexto("Adicionar foto")!;
    await act(async () => soltarArquivo(quadro, new File(["x"], "defeito.jpg", { type: "image/jpeg" })));

    expect(aoMudarItem).toHaveBeenCalledWith(0, { foto: fotoDeTeste("novo") });
  });

  it("arquivo que não é imagem: a mensagem do validarFoto aparece DENTRO do quadro daquele item, não só no rodapé", async () => {
    await montar();

    const quadroItem1 = rotuloComTexto("Adicionar foto")!;
    await act(async () =>
      soltarArquivo(quadroItem1, new File(["x"], "laudo.pdf", { type: "application/pdf" })),
    );

    const alertas = container.querySelectorAll('[role="alert"]');
    expect(alertas).toHaveLength(1);
    expect(alertas[0].textContent).toContain("Envie uma imagem");
    // o alerta mora no bloco da foto do PRÓPRIO item, não solto no rodapé da ficha
    expect(quadroItem1.closest("div")?.textContent).toContain("Envie uma imagem");
  });

  it("podeEditar=false: sem input de arquivo e sem 'Trocar'/'Tirar' — só a foto ou 'Sem foto'", async () => {
    await montar({
      itens: [{ ...ITENS[0], foto: fotoDeTeste("d1") }, ITENS[1]],
      podeEditar: false,
    });

    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(botaoComTexto("Trocar")).toBeUndefined();
    expect(botaoComTexto("Tirar")).toBeUndefined();
    expect(rotuloComTexto("Trocar")).toBeUndefined();

    expect(container.querySelector<HTMLImageElement>('img[alt="Foto do defeito 1"]')?.getAttribute("src")).toBe(
      fotoDeTeste("d1"),
    );
    expect(container.textContent).toContain("Sem foto");
  });
});
