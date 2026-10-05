// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * A tela da agenda para quem só lê, e o link do lead (05/10/2026).
 *
 * Decisão do dono: *"A agenda precisa ser vista por todos, o lead não. São
 * coisas diferentes."* A tela MONTADA, com a lista carregada, prova que:
 *   - Marketing (e SDR) não recebem nenhum controle de escrita: nem "Novo
 *     cadastro", nem Editar, Desativar ou Excluir, nem a coluna de ações;
 *   - o Financeiro gerencia como sempre, e os leads da agenda dele são
 *     contatos com a etiqueta "Lead": sem etapa, sem anotação e sem link;
 *   - o link para o lead aparece só na linha que quem abriu consegue abrir.
 *
 * O componente e `lib/agenda` são os de verdade; dublê só o `fetch`.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));
vi.mock("../src/components/admin/ConfirmDialog", () => ({
  useConfirm: () => ({ confirm: async () => true }),
}));

const { default: AgendaDePessoas } = await import("../src/components/admin/AgendaDePessoas");

const L_NO_ESCOPO = "11111111-1111-4111-8111-111111111111";
const L_FORA = "22222222-2222-4222-8222-222222222222";

/** O que `GET /api/pessoas` devolve a quem vê o primeiro lead e não o segundo. */
const PESSOAS = [
  { origem: "financeiro", id: "p-1", nome: "AutoPeças Curitiba", papel: "fornecedor", telefone: "4130000000", ativo: true },
  { origem: "lead", id: L_NO_ESCOPO, nome: "Carla", papel: "lead", especialidade: "Em negociação", telefone: "41911110000", ativo: true },
  { origem: "lead", id: L_FORA, nome: "Davi", papel: "lead", especialidade: null, observacoes: null, telefone: "41922220000", ativo: true },
];
/** O mesmo, para quem não vê lead nenhum: a rota já tirou etapa e anotação. */
const SEM_LEADS = PESSOAS.map((p) => (p.origem === "lead" ? { ...p, especialidade: null, observacoes: null } : p));

let raiz: Root;
let caixa: HTMLDivElement;
let pedidos: Array<{ url: string; metodo: string }>;

async function montar(props: { podeGerenciar: boolean; escopoDeLeads: "todos" | "designados" | "meus" | "nenhum" }, pessoas = PESSOAS) {
  pedidos = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    pedidos.push({ url, metodo: init?.method ?? "GET" });
    return new Response(JSON.stringify({ pessoas, total: pessoas.length, pagina: 1, limite: 50 }), { status: 200 });
  });
  caixa = document.createElement("div");
  document.body.appendChild(caixa);
  raiz = createRoot(caixa);
  await act(async () => {
    raiz.render(createElement(AgendaDePessoas, props));
  });
  // A busca espera a digitação parar antes de ir ao servidor.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });
}

const linhaDe = (nome: string) => [...caixa.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes(nome)) as HTMLElement;
const botoes = () => [...caixa.querySelectorAll("button")].map((b) => b.textContent?.trim());
const CONTROLES_DE_ESCRITA = ["+ Novo cadastro", "Editar", "Desativar", "Reativar", "Excluir"];

beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(async () => {
  await act(async () => raiz.unmount());
  vi.unstubAllGlobals();
});

describe("a tela para quem só lê", () => {
  it("Marketing: a lista inteira, e nenhum controle de escrita", async () => {
    await montar({ podeGerenciar: false, escopoDeLeads: "nenhum" }, SEM_LEADS);

    expect(caixa.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(linhaDe("AutoPeças Curitiba").textContent).toContain("4130000000");
    for (const controle of CONTROLES_DE_ESCRITA) expect(botoes(), controle).not.toContain(controle);
    expect([...caixa.querySelectorAll("th")].map((th) => th.textContent)).not.toContain("Ações");
    expect(caixa.querySelector('[data-agenda="so-leitura"]')).not.toBeNull();
    // Consultar continua inteiro: buscar, filtrar e conferir repetidos.
    expect(botoes()).toContain("Procurar cadastros repetidos");
    expect(pedidos.every((p) => p.metodo === "GET")).toBe(true);
  });

  it("SDR: lê, não escreve, e abre o lead que está no escopo dele", async () => {
    await montar({ podeGerenciar: false, escopoDeLeads: "designados" });

    for (const controle of CONTROLES_DE_ESCRITA) expect(botoes(), controle).not.toContain(controle);
    expect(linhaDe("Carla").querySelector("a")?.getAttribute("href")).toBe(`/admin/leads/${L_NO_ESCOPO}`);
    expect(linhaDe("Davi").querySelector("a")).toBeNull();
  });
});

describe("a tela para quem gerencia", () => {
  it("Financeiro: os controles de sempre no fornecedor; o lead é contato, com a etiqueta Lead e sem link", async () => {
    await montar({ podeGerenciar: true, escopoDeLeads: "nenhum" }, SEM_LEADS);

    expect(botoes()).toContain("+ Novo cadastro");
    const fornecedor = [...linhaDe("AutoPeças Curitiba").querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(fornecedor).toEqual(["Editar", "Desativar", "Excluir"]);

    for (const nome of ["Carla", "Davi"]) {
      const linha = linhaDe(nome);
      expect(linha.querySelector("a"), nome).toBeNull();
      expect(linha.querySelectorAll("button"), nome).toHaveLength(0);
      expect(linha.textContent, nome).toContain("Lead");
      expect(linha.textContent, nome).not.toContain("Em negociação");
    }
    expect(caixa.querySelector('[data-agenda="so-leitura"]')).toBeNull();
  });

  it("escopo nenhum não ganha link nem etapa, mesmo que a etapa chegue na resposta", async () => {
    // A rota já corta; a tela não depende disso para não anunciar o lead.
    await montar({ podeGerenciar: true, escopoDeLeads: "nenhum" }, PESSOAS);

    expect(caixa.querySelector('[data-agenda="abrir-lead"]')).toBeNull();
    expect(linhaDe("Carla").textContent).not.toContain("Em negociação");
  });

  it("Comercial: link e etapa só no lead do escopo dele", async () => {
    await montar({ podeGerenciar: true, escopoDeLeads: "meus" });

    const links = [...caixa.querySelectorAll('[data-agenda="abrir-lead"]')].map((a) => a.getAttribute("href"));
    expect(links).toEqual([`/admin/leads/${L_NO_ESCOPO}`]);
    expect(linhaDe("Carla").textContent).toContain("Em negociação");
    expect(linhaDe("Davi").querySelector("a")).toBeNull();
    expect(linhaDe("Davi").textContent).toContain("Lead");
    // O fornecedor nunca vira link para lead.
    expect(linhaDe("AutoPeças Curitiba").querySelector("a")).toBeNull();
  });
});
