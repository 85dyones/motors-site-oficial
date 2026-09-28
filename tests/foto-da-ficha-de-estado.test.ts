// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import FichaDeEstadoNoEditor from "../src/components/admin/repasse/FichaDeEstadoNoEditor";
import { ITEM_VAZIO, comItem } from "../src/lib/fichaDeEstado";
import type { ItemDeEstado, Repasse } from "../src/lib/repasse";
import { fotoDeTeste } from "./repasseDeTeste";

/**
 * A FIAÇÃO do envio de foto da ficha de estado (revisão final, I2).
 *
 * O envio leva segundos (tratamento no navegador + upload). Antes do conserto,
 * `enviarFoto` aplicava a foto sobre o `itens` do render em que o arquivo foi
 * escolhido, e o que se digitou nesse meio-tempo sumia quando a foto chegava.
 * Aqui o upload fica pendente na mão do teste, a descrição muda no meio, e só
 * então o upload termina.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type RespostaDoUpload = { data: { path: string } | null; error: { message: string } | null };

const dubles = vi.hoisted(() => ({
  soltarUpload: null as null | ((r: RespostaDoUpload) => void),
  urlPublica: "",
}));

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
        upload: () =>
          new Promise<RespostaDoUpload>((resolver) => {
            dubles.soltarUpload = resolver;
          }),
        getPublicUrl: () => ({ data: { publicUrl: dubles.urlPublica } }),
      }),
    },
  }),
}));

type Ficha = Pick<Repasse, "itens_de_estado" | "sem_defeitos_conhecidos" | "oficina_do_orcamento" | "orcamento_em">;

/** Guarda a ficha como o `EditorDeRepasse` guarda: `mudar` e `aoMudarItem` iguais aos dele. */
function Harness({ inicial }: { inicial: Ficha }) {
  const [form, setForm] = useState<Ficha>(inicial);
  return createElement(FichaDeEstadoNoEditor, {
    repasseId: "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f",
    itens: form.itens_de_estado,
    semDefeitos: form.sem_defeitos_conhecidos,
    oficina: form.oficina_do_orcamento,
    orcamentoEm: form.orcamento_em,
    podeEditar: true,
    aoMudar: (parcial) => setForm((f) => ({ ...f, ...parcial })),
    aoMudarItem: (i: number, parcial: Partial<ItemDeEstado>) =>
      setForm((f) => ({ ...f, itens_de_estado: comItem(f.itens_de_estado, i, parcial) })),
  });
}

let container: HTMLDivElement;
let root: Root;

async function montar(inicial: Ficha) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(Harness, { inicial })));
}

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  dubles.soltarUpload = null;
});

/** O campo de texto sob o rótulo `rotulo`, na linha `linha` da ficha. */
function campo(rotulo: string, linha: number): HTMLInputElement {
  const achados = [...container.querySelectorAll("label")].filter(
    (l) => l.querySelector("span")?.textContent?.trim() === rotulo,
  );
  const input = achados[linha]?.querySelector("input");
  expect(input, `a linha ${linha} precisa ter o campo "${rotulo}"`).toBeTruthy();
  return input as HTMLInputElement;
}

function digitar(el: HTMLInputElement, valor: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, valor);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function escolherArquivo(el: HTMLInputElement, arquivo: File) {
  Object.defineProperty(el, "files", { value: [arquivo], configurable: true });
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

const botao = (texto: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === texto) as HTMLButtonElement;

const FICHA: Ficha = {
  itens_de_estado: [
    { ...ITEM_VAZIO, descricao: "Farol" },
    { ...ITEM_VAZIO, descricao: "Pneu" },
  ],
  sem_defeitos_conhecidos: false,
  oficina_do_orcamento: null,
  orcamento_em: null,
};

describe("FichaDeEstadoNoEditor: a foto do defeito", () => {
  it("cai sobre a lista atual: o que se digitou durante o envio fica", async () => {
    dubles.urlPublica = fotoDeTeste("novo");
    await montar(FICHA);

    const arquivoDaLinha0 = container.querySelector<HTMLInputElement>('input[type="file"][aria-label="Foto do defeito 1"]');
    expect(arquivoDaLinha0).toBeTruthy();
    await act(async () => escolherArquivo(arquivoDaLinha0!, new File(["x"], "defeito.jpg", { type: "image/jpeg" })));
    expect(dubles.soltarUpload, "o upload tem de estar pendente").not.toBeNull();

    await act(async () => digitar(campo("Defeito", 0), "Farol trincado"));
    expect(campo("Defeito", 0).value).toBe("Farol trincado");

    await act(async () => dubles.soltarUpload!({ data: { path: "x" }, error: null }));

    expect(campo("Defeito", 0).value).toBe("Farol trincado");
    expect(container.querySelector<HTMLImageElement>('img[alt="Foto do defeito 1"]')?.getAttribute("src")).toBe(
      fotoDeTeste("novo"),
    );
    expect(container.querySelector('img[alt="Foto do defeito 2"]')).toBeNull();
  });

  it("durante o envio, adicionar e remover ficam travados e a linha diz que envia", async () => {
    dubles.urlPublica = fotoDeTeste("novo");
    await montar(FICHA);
    expect(botao("Adicionar defeito").disabled).toBe(false);

    const arquivoDaLinha0 = container.querySelector<HTMLInputElement>('input[type="file"][aria-label="Foto do defeito 1"]');
    await act(async () => escolherArquivo(arquivoDaLinha0!, new File(["x"], "defeito.jpg", { type: "image/jpeg" })));

    expect(botao("Adicionar defeito").disabled).toBe(true);
    const remover = [...container.querySelectorAll<HTMLButtonElement>('button[aria-label^="Remover o defeito"]')];
    expect(remover).toHaveLength(2);
    expect(remover.every((b) => b.disabled)).toBe(true);
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(arquivoDaLinha0!.parentElement?.textContent).toContain("Enviando foto…");

    await act(async () => dubles.soltarUpload!({ data: { path: "x" }, error: null }));

    expect(botao("Adicionar defeito").disabled).toBe(false);
    expect(container.textContent).not.toContain("Enviando foto…");
  });
});
