// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Repasse } from "../src/lib/repasse";
import { repasseDeTeste } from "./repasseDeTeste";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, sizes: _sizes, priority: _priority, unoptimized: _uo, ...resto } = props;
    return createElement("img", resto as never);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

const { default: LoteDoRepasse } = await import("../src/components/repasse/LoteDoRepasse");

/**
 * A ilha do lote (spec §7.1): o HTML inicial traz TODOS os cards com seus
 * links; os filtros e a ordem agem no cliente; no celular, dois cards e o
 * botão dos outros.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
});

async function montar(lote: Repasse[]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root.render(createElement(LoteDoRepasse, { lote, whatsappDaLoja: { whatsappRaw: "5541997372165", whatsapp: "" } })),
  );
}

/** O link de cada ficha, uma vez só (a foto e o nome do card apontam para a mesma). */
const fichas = () => [
  ...new Set(
    [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "").filter((h) => /^\/repasse\/[^#]+$/.test(h)),
  ),
];
const botao = (texto: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(texto)) as HTMLButtonElement;

const base = { situacao: "publicado" as const, lojistas_desde: "2026-09-22T12:00:00Z", aberto_ao_publico_em: "2026-09-24T12:00:00Z" };
const COM_REPARO = repasseDeTeste({ ...base, id: "a1000000-0000-4000-8000-000000000001", slug: "com-reparo-a10000" });
const SEM_LAUDO = repasseDeTeste({ ...base, id: "a2000000-0000-4000-8000-000000000002", slug: "sem-laudo-a20000", laudo: "nao_feito", itens_de_estado: [], sem_defeitos_conhecidos: true, preco: 27500 });
const COM_LAUDO = repasseDeTeste({ ...base, id: "a3000000-0000-4000-8000-000000000003", slug: "com-laudo-a30000", itens_de_estado: [], sem_defeitos_conhecidos: true, preco: 52900 });

describe("LoteDoRepasse", () => {
  it("todos os cards chegam com o link da ficha", async () => {
    await montar([COM_REPARO, SEM_LAUDO, COM_LAUDO]);
    expect(fichas().sort()).toEqual(["/repasse/com-laudo-a30000", "/repasse/com-reparo-a10000", "/repasse/sem-laudo-a20000"]);
  });

  it("o filtro tira os outros da grade", async () => {
    await montar([COM_REPARO, SEM_LAUDO, COM_LAUDO]);
    await act(async () => botao("SEM LAUDO").click());
    expect(fichas()).toEqual(["/repasse/sem-laudo-a20000"]);
    await act(async () => botao("TODOS").click());
    expect(fichas()).toHaveLength(3);
  });

  it("filtro sem carro fica desligado", async () => {
    await montar([COM_LAUDO]);
    expect(botao("SEM LAUDO").disabled).toBe(true);
    expect(botao("REPARO ORÇADO").disabled).toBe(true);
  });

  it("menor preço reordena a grade", async () => {
    await montar([COM_REPARO, SEM_LAUDO, COM_LAUDO]);
    const select = container.querySelector("select") as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "preco");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(fichas()).toEqual(["/repasse/sem-laudo-a20000", "/repasse/com-reparo-a10000", "/repasse/com-laudo-a30000"]);
  });

  it("no celular, do terceiro em diante fica escondido até o botão", async () => {
    await montar([COM_REPARO, SEM_LAUDO, COM_LAUDO]);
    const itens = [...container.querySelectorAll("li")];
    expect(itens[2].className).toContain("hidden");
    await act(async () => botao("VER O OUTRO CARRO").click());
    expect([...container.querySelectorAll("li")][2].className).not.toContain("hidden");
  });
});
