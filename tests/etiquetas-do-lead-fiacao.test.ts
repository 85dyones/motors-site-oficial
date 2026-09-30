// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ETAPAS_PADRAO } from "../src/lib/funil";
import { aplicarMudanca } from "../src/lib/etiquetas";

/**
 * As etiquetas no card do kanban, na tela montada (2026-09-25).
 *
 * Decisão do dono: o SDR vê e edita as etiquetas no card; a passagem para o
 * Comercial garante "resgate" e "reaquecido" sozinha. O que só a tela montada
 * prova:
 *   - o × e o "+ etiqueta" mandam só a MUDANÇA (esta sai, esta entra), nunca
 *     a lista que o card desenhou — ela vem do espelho e pode estar atrás
 *     (revisão de 25/09); e o card passa a mostrar o que o servidor devolveu;
 *   - resgate e reaquecido não têm ×;
 *   - enquanto o lead tem escrita no ar (etiqueta OU passagem), o select de
 *     responsável e as etiquetas dele travam;
 *   - sem token no servidor, as etiquetas aparecem e a edição não é oferecida;
 *   - a passagem do SDR que volta com as etiquetas pinta o card, e a que volta
 *     com aviso mostra o aviso sem desfazer a passagem.
 *
 * Nada do app é dublê: o kanban e as libs de verdade; só o `fetch` e o
 * `next/link`, como em `busca-por-ref-fiacao.test.ts`.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  // O card desenha `SinalDeAbertura`, que lê o estado do link.
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

const lead = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  telefone: "5541999990000",
  interesse: null,
  canal: "site",
  responsavel: null,
  observacoes: null,
  situacao: "novo",
  created_at: new Date().toISOString(),
  ag_uid: null,
  desfecho: null,
  ...extra,
});

const COM_CONVERSA = lead("l1", "Joana", {
  chatwoot_conversation_id: 4821,
  etiquetas: ["origem-site", "resgate"],
});
const SEM_CONVERSA = lead("l2", "Pedro", { chatwoot_conversation_id: null, etiquetas: [] });

let editaveis: boolean;
/** O que a conversa tem de fato no Chatwoot — pode estar À FRENTE do card. */
let naConversa: string[];
let faltamNaConta: string[];
/** Quando não nulo, o PATCH só responde quando o teste soltar. */
let segurarPatch: Promise<void> | null;
let chamadas: Array<{ metodo: string; url: string; corpo?: Record<string, unknown> }>;
/** O que o PATCH e o POST respondem — cada teste troca. */
let respostaDoPatch: { status: number; corpo: unknown };
let respostaDoPost: { status: number; corpo: unknown } | null;

function dublarFetch() {
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    const metodo = opcoes?.method ?? "GET";
    const corpo = opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined;
    chamadas.push({ metodo, url: String(url), corpo });
    const responder = (status: number, c: unknown) => ({ ok: status < 400, status, json: async () => c });

    if (url === "/api/leads/etiquetas" && metodo === "GET") {
      return responder(200, {
        etiquetas: ["negociando", "origem-site", "reaquecido", "resgate"],
        daConta: true,
        faltamNaConta,
      });
    }
    if (url === "/api/leads/etiquetas" && metodo === "POST") {
      if (respostaDoPost) return responder(respostaDoPost.status, respostaDoPost.corpo);
      naConversa = aplicarMudanca(naConversa, corpo);
      return responder(200, { ok: true, etiquetas: naConversa });
    }
    if (metodo === "PATCH") {
      if (segurarPatch) await segurarPatch;
      return responder(respostaDoPatch.status, respostaDoPatch.corpo);
    }
    return responder(200, {
      leads: [COM_CONVERSA, SEM_CONVERSA],
      atendentes: [{ nome: "Ana" }],
      etapas: ETAPAS_PADRAO,
      motivos: [],
      funilPendente: false,
      podeConfigurar: false,
      busca: null,
      etiquetasDisponiveis: ["origem-site", "reaquecido", "resgate"],
      etiquetasEditaveis: editaveis,
    });
  }) as never;
}

let container: HTMLDivElement;
let root: Root;

async function assentar() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((pronto) => setTimeout(pronto, 0));
    });
  }
}

async function montar() {
  const { default: LeadsKanban } = await import("../src/components/admin/LeadsKanban");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(LeadsKanban));
  });
  await assentar();
}

function mudar(el: HTMLSelectElement, valor: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, valor);
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

const grupo = (nome: string) =>
  container.querySelector<HTMLElement>(`[role="group"][aria-label="Etiquetas de ${nome}"]`);
const chips = (nome: string) =>
  [...(grupo(nome)?.querySelectorAll("span") ?? [])].map((s) => (s.firstChild?.textContent ?? "").trim());
const posts = () => chamadas.filter((c) => c.metodo === "POST");

beforeEach(() => {
  editaveis = true;
  naConversa = ["origem-site", "resgate"];
  faltamNaConta = [];
  segurarPatch = null;
  chamadas = [];
  respostaDoPatch = { status: 200, corpo: { ok: true } };
  respostaDoPost = null;
  vi.stubEnv("NEXT_PUBLIC_CHATWOOT_URL", "https://chat.exemplo.com.br");
  vi.stubEnv("NEXT_PUBLIC_CHATWOOT_CONTA_ID", "3");
  dublarFetch();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllEnvs();
});

describe("as etiquetas no card", () => {
  it("aparecem, e resgate tem a régua de destaque", async () => {
    await montar();
    expect(chips("Joana")).toEqual(["origem-site", "resgate"]);
    const resgate = [...grupo("Joana")!.querySelectorAll("span")].find((s) => s.textContent?.startsWith("resgate"));
    expect(resgate!.className).toContain("border-mt-accent");
  });

  it("lead sem conversa e sem etiqueta não ganha bloco", async () => {
    await montar();
    expect(grupo("Pedro")).toBeNull();
  });

  it("o × manda só a que sai — e o card mostra o que ficou na conversa", async () => {
    // A conversa está À FRENTE do card: a passagem já pôs reaquecido lá.
    naConversa = ["origem-site", "resgate", "reaquecido"];
    await montar();
    const tirar = container.querySelector<HTMLButtonElement>('[aria-label="Tirar a etiqueta origem-site de Joana"]')!;
    await act(async () => tirar.click());
    await assentar();

    expect(posts()).toEqual([
      { metodo: "POST", url: "/api/leads/etiquetas", corpo: { id: "l1", retirar: ["origem-site"] } },
    ]);
    // O que o servidor devolveu, e não o que o card calculou sozinho.
    expect(chips("Joana")).toEqual(["resgate", "reaquecido"]);
  });

  it("resgate e reaquecido não têm ×", async () => {
    await montar();
    expect(container.querySelector('[aria-label="Tirar a etiqueta resgate de Joana"]')).toBeNull();
    expect(container.querySelector('[aria-label="Tirar a etiqueta origem-site de Joana"]')).not.toBeNull();
  });

  it("o + etiqueta oferece as da conta que faltam e manda só a que entra", async () => {
    await montar();
    const pôr = container.querySelector<HTMLSelectElement>('[aria-label="Pôr etiqueta em Joana"]')!;
    const opcoes = [...pôr.options].map((o) => o.value).filter(Boolean);
    // As da conta que faltam — nunca as que já estão, nem as duas da passagem,
    // que entram sozinhas (a rota as devolve na lista e o card as filtra).
    expect(opcoes).toEqual(["negociando"]);

    await act(async () => mudar(pôr, "negociando"));
    await assentar();
    expect(posts()[0].corpo).toEqual({ id: "l1", incluir: ["negociando"] });
    expect(chips("Joana")).toEqual(["origem-site", "resgate", "negociando"]);
  });

  it("etiqueta da passagem que falta na conta do Chatwoot vira aviso na tela", async () => {
    faltamNaConta = ["reaquecido"];
    await montar();
    expect(container.textContent).toContain("No Chatwoot, falta criar a etiqueta reaquecido na conta.");
  });

  it("sem token no servidor: mostra, não oferece editar, e nem pergunta as da conta", async () => {
    editaveis = false;
    await montar();
    expect(chips("Joana")).toEqual(["origem-site", "resgate"]);
    expect(grupo("Joana")!.querySelector("button")).toBeNull();
    expect(grupo("Joana")!.querySelector("select")).toBeNull();
    expect(chamadas.some((c) => c.url === "/api/leads/etiquetas")).toBe(false);
  });

  it("gravação recusada: mostra o erro e relê a fila", async () => {
    respostaDoPost = { status: 502, corpo: { error: "o Chatwoot respondeu 500" } };
    await montar();
    const antes = chamadas.filter((c) => c.url === "/api/leads/gerenciar").length;
    const tirar = container.querySelector<HTMLButtonElement>('[aria-label="Tirar a etiqueta origem-site de Joana"]')!;
    await act(async () => tirar.click());
    await assentar();

    expect(container.textContent).toContain("o Chatwoot respondeu 500");
    expect(chamadas.filter((c) => c.url === "/api/leads/gerenciar").length).toBe(antes + 1);
  });
});

describe("a passagem do SDR no card", () => {
  const passarPara = async (nome: string) => {
    const select = container.querySelector<HTMLSelectElement>('[aria-label="Responsável por Joana"]')!;
    await act(async () => mudar(select, nome));
    await assentar();
  };

  it("volta com resgate e reaquecido, e o card mostra as duas", async () => {
    respostaDoPatch = { status: 200, corpo: { ok: true, etiquetas: ["origem-site", "resgate", "reaquecido"] } };
    await montar();
    await passarPara("Ana");

    expect(chamadas.find((c) => c.metodo === "PATCH")?.corpo).toEqual({ id: "l1", responsavel: "Ana" });
    expect(chips("Joana")).toEqual(["origem-site", "resgate", "reaquecido"]);
  });

  it("enquanto a passagem está no ar, o responsável e as etiquetas do lead travam", async () => {
    let soltar!: () => void;
    segurarPatch = new Promise<void>((pronto) => {
      soltar = pronto;
    });
    respostaDoPatch = { status: 200, corpo: { ok: true, etiquetas: ["origem-site", "resgate", "reaquecido"] } };
    await montar();
    await passarPara("Ana");

    const select = container.querySelector<HTMLSelectElement>('[aria-label="Responsável por Joana"]')!;
    const pôr = container.querySelector<HTMLSelectElement>('[aria-label="Pôr etiqueta em Joana"]')!;
    const tirar = container.querySelector<HTMLButtonElement>('[aria-label="Tirar a etiqueta origem-site de Joana"]')!;
    expect(select.disabled).toBe(true);
    expect(pôr.disabled).toBe(true);
    expect(tirar.disabled).toBe(true);
    // O lead ao lado não trava.
    expect(container.querySelector<HTMLSelectElement>('[aria-label="Responsável por Pedro"]')!.disabled).toBe(false);

    await act(async () => soltar());
    await assentar();
    expect(select.disabled).toBe(false);
    expect(chips("Joana")).toEqual(["origem-site", "resgate", "reaquecido"]);
  });

  it("volta com aviso: mostra o aviso, como status, e a passagem fica", async () => {
    const aviso =
      "Resgate e reaquecido não foram para o Chatwoot: falta configurar CHATWOOT_API_TOKEN. O crédito do SDR ficou registrado no lead.";
    respostaDoPatch = { status: 200, corpo: { ok: true, aviso } };
    await montar();
    await passarPara("Ana");

    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toContain(aviso);
    const select = container.querySelector<HTMLSelectElement>('[aria-label="Responsável por Joana"]')!;
    expect(select.value).toBe("Ana");

    // E o aviso se fecha.
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Fechar o aviso"]')!.click());
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
