// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ETAPAS_PADRAO } from "../src/lib/funil";

/**
 * As etiquetas no card do kanban, na tela montada (2026-09-25).
 *
 * Decisão do dono: o SDR vê e edita as etiquetas no card; a passagem para o
 * Comercial garante "resgate" e "reaquecido" sozinha. O que só a tela montada
 * prova:
 *   - o × e o "+ etiqueta" mandam a lista INTEIRA certa — tirar uma não pode
 *     mandar a lista sem ela e sem as outras;
 *   - sem token no servidor, as etiquetas aparecem e a edição não é oferecida;
 *   - a passagem do SDR que volta com as etiquetas pinta o card, e a que volta
 *     com aviso mostra o aviso sem desfazer a passagem.
 *
 * Nada do app é dublê: o kanban e as libs de verdade; só o `fetch` e o
 * `next/link`, como em `busca-por-ref-fiacao.test.ts`.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
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
      return responder(200, { etiquetas: ["negociando", "origem-site", "reaquecido", "resgate"], daConta: true });
    }
    if (url === "/api/leads/etiquetas" && metodo === "POST") {
      return respostaDoPost
        ? responder(respostaDoPost.status, respostaDoPost.corpo)
        : responder(200, { ok: true, etiquetas: corpo.etiquetas });
    }
    if (metodo === "PATCH") return responder(respostaDoPatch.status, respostaDoPatch.corpo);
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

  it("o × tira SÓ aquela, e manda a lista com as outras", async () => {
    await montar();
    const tirar = container.querySelector<HTMLButtonElement>('[aria-label="Tirar a etiqueta origem-site de Joana"]')!;
    await act(async () => tirar.click());
    await assentar();

    expect(posts()).toEqual([
      { metodo: "POST", url: "/api/leads/etiquetas", corpo: { id: "l1", etiquetas: ["resgate"] } },
    ]);
    expect(chips("Joana")).toEqual(["resgate"]);
  });

  it("o + etiqueta oferece as da conta que faltam e acrescenta no fim", async () => {
    await montar();
    const pôr = container.querySelector<HTMLSelectElement>('[aria-label="Pôr etiqueta em Joana"]')!;
    const opcoes = [...pôr.options].map((o) => o.value).filter(Boolean);
    // As da conta (negociando) e as da passagem que faltam; nunca as que já estão.
    expect(opcoes).toEqual(["negociando", "reaquecido"]);

    await act(async () => mudar(pôr, "negociando"));
    await assentar();
    expect(posts()[0].corpo).toEqual({ id: "l1", etiquetas: ["origem-site", "resgate", "negociando"] });
    expect(chips("Joana")).toEqual(["origem-site", "resgate", "negociando"]);
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
    const tirar = container.querySelector<HTMLButtonElement>('[aria-label="Tirar a etiqueta resgate de Joana"]')!;
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
