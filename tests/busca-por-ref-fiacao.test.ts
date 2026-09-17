// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ETAPAS_PADRAO } from "../src/lib/funil";
import { AVISO_DE_REF_INVALIDA, SEM_DONO } from "../src/lib/leadsKanban";

/**
 * A FIAÇÃO da busca pela referência no kanban — o que só a tela montada prova.
 *
 * `busca-por-ref.test.ts` prova a regra (o que vira referência, o filtro que
 * o banco recebe, as recusas da rota). O que ele não alcança é a tela usando
 * tudo isso, e é aí que a busca de 26/08 guardava os seus três cuidados:
 *
 *   - o campo mora FORA do ramo que some quando não há lead — a busca que não
 *     acha nada não pode apagar o próprio campo;
 *   - "nenhum lead ainda" é verdade para a fila vazia e mentira para a busca
 *     vazia;
 *   - o botão Atualizar repete o que está na tela, e não entrega o clique como
 *     referência — o `ref=[object Object]` que aquela versão achou.
 *
 * Mais dois que o `main` de hoje trouxe: buscar tem de limpar os filtros da
 * fila, e o lead achado que já foi FECHADO não está no quadro — a tela precisa
 * dizer onde ele está.
 *
 * Nada do app é dublê: o componente de verdade, a lib de verdade, e só o
 * `fetch` (e o `next/link`, que fora do Next não tem roteador) substituídos.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

const UUID = "0dcb1cdc-fb39-4a39-99c9-923f025619f4";

const lead = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  telefone: "5541999990000",
  interesse: null,
  canal: "site",
  responsavel: null,
  observacoes: null,
  situacao: "novo",
  created_at: "2026-09-16T12:00:00.000Z",
  ag_uid: null,
  desfecho: null,
  ...extra,
});

const FILA = [lead("l1", "Ana da Fila", { responsavel: "Bruno" }), lead("l2", "Carlos da Fila")];
const ACHADO = lead("l9", "Dora Buscada", { ag_uid: UUID, responsavel: "Bruno" });

/** O corpo que `/api/leads/gerenciar` devolve a quem vê lead. */
const painel = (leads: unknown[], busca: { ref: string } | null) => ({
  leads,
  atendentes: [{ nome: "Bruno" }],
  etapas: ETAPAS_PADRAO,
  motivos: [],
  funilPendente: false,
  podeConfigurar: false,
  busca,
});

let chamadas: string[] = [];
/** Responde a cada GET. O padrão devolve a fila, ou o ACHADO para 0DCB1CDC. */
let responder: (url: string) => unknown;

function dublarFetch() {
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    chamadas.push(`${opcoes?.method ?? "GET"} ${url}`);
    const corpo = responder(String(url));
    return { ok: true, json: async () => corpo };
  }) as never;
}

const refDaUrl = (url: string) => new URL(url, "http://x").searchParams.get("ref");

let container: HTMLDivElement;
let root: Root;

/** Deixa a cadeia `fetch` → `json` → `setState` terminar, e os efeitos que ela dispara. */
async function assentar() {
  for (let i = 0; i < 3; i++) {
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

const gets = () => chamadas.filter((c) => c.startsWith("GET "));
const campo = () => container.querySelector<HTMLInputElement>("#busca-ref");
const texto = () => container.textContent ?? "";

function botao(rotulo: string): HTMLButtonElement {
  const achado = [...container.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").trim() === rotulo,
  );
  expect(achado, `a tela precisa ter o botão "${rotulo}"`).toBeDefined();
  return achado as HTMLButtonElement;
}

/**
 * Mudar o valor de um controle do React de verdade: pelo setter NATIVO do
 * protótipo, que é o que o React substituiu, e só então o evento que ele
 * escuta. `campo.value = "x"` sozinho não dispara o `onChange`.
 */
function mudar(el: HTMLInputElement | HTMLSelectElement, valor: string, evento: "input" | "change") {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, valor);
  el.dispatchEvent(new Event(evento, { bubbles: true }));
}

async function buscarNaTela(entrada: string) {
  const c = campo();
  expect(c, "o campo de busca sumiu da tela").not.toBeNull();
  await act(async () => {
    mudar(c!, entrada, "input");
  });
  await act(async () => {
    c!.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await assentar();
}

async function clicar(rotulo: string) {
  await act(async () => {
    botao(rotulo).click();
  });
  await assentar();
}

beforeEach(() => {
  chamadas = [];
  responder = (url) => {
    const ref = refDaUrl(url);
    if (ref === null) return painel(FILA, null);
    return painel(ref === "0DCB1CDC" ? [ACHADO] : [], { ref });
  };
  dublarFetch();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("a busca pela referência, na tela montada", () => {
  it("pede ao servidor a referência lida do que foi colado, e mostra o que voltou", async () => {
    await montar();
    expect(gets()).toEqual(["GET /api/leads/gerenciar"]);
    expect(texto()).toContain("Ana da Fila");

    await buscarNaTela("Olá! Vi o carro no site. (Ref: 0dcb1cdc)");

    expect(gets().at(-1)).toBe("GET /api/leads/gerenciar?ref=0DCB1CDC");
    expect(texto()).toContain("Dora Buscada");
    expect(texto()).not.toContain("Ana da Fila");
    expect(texto()).toContain("1 lead com a referência 0DCB1CDC.");
  });

  it("a busca vazia não apaga o campo, não diz 'nenhum lead ainda', e tem volta", async () => {
    await montar();
    await buscarNaTela("1234abcd");

    expect(gets().at(-1)).toBe("GET /api/leads/gerenciar?ref=1234ABCD");
    expect(campo(), "a busca vazia apagou o próprio campo").not.toBeNull();
    expect(texto()).toContain("Nenhum lead com a referência 1234ABCD");
    expect(texto()).not.toContain("Nenhum lead ainda");

    await clicar("voltar para a fila");

    expect(gets().at(-1)).toBe("GET /api/leads/gerenciar");
    expect(texto()).toContain("Ana da Fila");
    expect(campo()!.value).toBe("");
  });

  it("o que não é referência é recusado na tela, sem viagem ao servidor", async () => {
    await montar();
    const antes = gets().length;

    await buscarNaTela("41999990000");

    expect(gets()).toHaveLength(antes);
    expect(texto()).toContain(AVISO_DE_REF_INVALIDA);
  });

  it("Atualizar repete a busca — e não entrega o clique como referência", async () => {
    await montar();
    await buscarNaTela("0DCB1CDC");

    await clicar("Atualizar");

    expect(gets().slice(-2)).toEqual([
      "GET /api/leads/gerenciar?ref=0DCB1CDC",
      "GET /api/leads/gerenciar?ref=0DCB1CDC",
    ]);
    expect(chamadas.join("\n")).not.toContain("object");
    expect(texto()).toContain("Dora Buscada");
  });

  it("buscar de novo a mesma referência busca de novo", async () => {
    // O pedido igual não muda estado, e sem mudança o efeito não roda — o lead
    // que não existia há um minuto pode ter acabado de chegar.
    await montar();
    await buscarNaTela("0DCB1CDC");
    const antes = gets().length;

    await buscarNaTela("0dcb1cdc");

    expect(gets()).toHaveLength(antes + 1);
  });

  it("buscar limpa o filtro de responsável que esconderia o lead achado", async () => {
    await montar();
    const filtro = container.querySelector<HTMLSelectElement>("#filtro-responsavel");
    expect(filtro, "o filtro de responsável sumiu da fila").not.toBeNull();
    await act(async () => {
      mudar(filtro!, SEM_DONO, "change");
    });
    // Contraprova: o filtro pegou — quem tem dono saiu do quadro.
    expect(texto()).not.toContain("Ana da Fila");
    expect(texto()).toContain("Carlos da Fila");

    // O achado tem dono. Com o filtro de "sem responsável" de pé, ele não apareceria.
    await buscarNaTela("0DCB1CDC");

    expect(texto()).toContain("Dora Buscada");
    expect(container.querySelector<HTMLSelectElement>("#filtro-responsavel")!.value).toBe("");
  });

  it("o lead achado que já foi fechado é apontado, com o caminho até ele", async () => {
    responder = (url) => {
      const ref = refDaUrl(url);
      if (ref === null) return painel(FILA, null);
      return painel(
        [{ ...ACHADO, situacao: "perdido", desfecho: "perdido", desfecho_em: "2026-09-16T13:00:00.000Z" }],
        { ref },
      );
    };
    await montar();
    await buscarNaTela("0DCB1CDC");

    // Fechado não mora no quadro: sem o aviso, a busca que achou parece vazia.
    expect(texto()).not.toContain("Dora Buscada");
    expect(texto()).toContain("Ele já foi fechado e está na lista de Fechados");

    await clicar("ver os fechados");

    expect(texto()).toContain("Dora Buscada");
  });

  it("quem fica no agregado não vê o campo — a rota recusaria a busca", async () => {
    responder = () => ({ somenteAgregado: true, total: 2, porSituacao: { novo: 2 } });
    await montar();

    expect(texto()).toContain("Volume por etapa");
    expect(campo()).toBeNull();
  });
});
