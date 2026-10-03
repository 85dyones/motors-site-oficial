// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AVISO_DE_BUSCA_INVALIDA, filtroDaBusca } from "../src/lib/gestaoDoLead";
import { assentar, definirLargura, filaDeTeste, leadDeTeste, mudar, zerarRota } from "./quadroDeLeadsDeTeste";

/**
 * A FIAÇÃO da busca no funil — o que só a tela montada prova.
 *
 * Desde 03/10/2026 a busca é UMA: nome, telefone ou referência, no `?busca=`
 * da rota, com pausa de digitação. `busca-por-ref.test.ts` e
 * `gestao-do-lead.test.ts` provam a regra (o que vira referência, o filtro que
 * o banco recebe, as recusas da rota). O que eles não alcançam é a tela usando
 * tudo isso, e os cuidados da busca por referência de 26/08 continuam valendo:
 *
 *   - o campo mora FORA do ramo que some quando não há lead — a busca que não
 *     acha nada não pode apagar o próprio campo;
 *   - "nenhum lead ainda" é verdade para a fila vazia e mentira para a busca
 *     vazia;
 *   - o botão Atualizar repete o que está na tela, e não entrega o clique como
 *     termo — o `ref=[object Object]` que aquela versão achou;
 *   - buscar limpa o filtro da fila que esconderia o lead achado;
 *   - o lead achado que já foi FECHADO não está no quadro — a tela diz onde
 *     ele está.
 *
 * Nada do app é dublê: o componente de verdade, a lib de verdade, e só o
 * `fetch`, o `next/link` e o `next/navigation` substituídos.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));
vi.mock("next/navigation", async () => (await import("./quadroDeLeadsDeTeste")).navegacaoDeTeste);

const UUID = "0dcb1cdc-fb39-4a39-99c9-923f025619f4";
const ONTEM = new Date(Date.now() - 86_400_000).toISOString();

const FILA = [
  leadDeTeste("l1", "Ana da Fila", { responsavel: "Bruno" }),
  // Atrasado: é o que o chip "Atrasados" deixa à vista.
  leadDeTeste("l2", "Carlos da Fila", { proximo_passo: "Ligar", proximo_passo_vence_em: ONTEM }),
];
const ACHADO = leadDeTeste("l9", "Dora Buscada", { ag_uid: UUID, responsavel: "Bruno" });

let escopo: string;
let chamadas: string[] = [];
/** O que a busca devolve para um termo. O padrão acha a Dora pela referência e pelo nome. */
let achar: (termo: string) => unknown[];

function dublarFetch() {
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    chamadas.push(`${opcoes?.method ?? "GET"} ${url}`);
    const termo = new URL(String(url), "http://x").searchParams.get("busca");
    if (termo === null) return { ok: true, json: async () => filaDeTeste(FILA, { escopo }) };
    // A rota diz como entendeu o termo, com a mesma função.
    const filtro = filtroDaBusca(termo)!;
    const busca = { termo, tipo: filtro.tipo, ...(filtro.tipo === "ref" ? { ref: filtro.ref } : {}) };
    return { ok: true, json: async () => filaDeTeste(achar(termo), { escopo, busca }) };
  }) as never;
}

const buscaDaUrl = (chamada: string) => new URL(chamada.replace(/^GET /, ""), "http://x").searchParams.get("busca");

let container: HTMLDivElement;
let root: Root;

async function montar() {
  const { default: LeadsKanban } = await import("../src/components/admin/LeadsKanban");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(LeadsKanban, { meuNome: "Bruno" }));
  });
  await assentar();
}

const gets = () => chamadas.filter((c) => c.startsWith("GET "));
const campo = () => container.querySelector<HTMLInputElement>("#busca-de-leads");
const texto = () => container.textContent ?? "";

function botao(rotulo: string | RegExp): HTMLButtonElement {
  const achado = [...container.querySelectorAll("button")].find((b) => {
    const t = (b.textContent ?? "").trim();
    return typeof rotulo === "string" ? t === rotulo : rotulo.test(t);
  });
  expect(achado, `a tela precisa ter o botão "${rotulo}"`).toBeDefined();
  return achado as HTMLButtonElement;
}

/** Digita e aperta Enter: a busca sai na hora, sem esperar a pausa. */
async function buscarNaTela(entrada: string) {
  const c = campo();
  expect(c, "o campo de busca sumiu da tela").not.toBeNull();
  await mudar(c!, entrada);
  await act(async () => {
    c!.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await assentar();
}

async function clicar(rotulo: string | RegExp) {
  await act(async () => {
    botao(rotulo).click();
  });
  await assentar();
}

beforeEach(() => {
  escopo = "todos";
  chamadas = [];
  achar = (termo) => (/0dcb1cdc|dora/i.test(termo) ? [ACHADO] : []);
  zerarRota();
  definirLargura(true);
  dublarFetch();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("a busca única, na tela montada", () => {
  it("é um campo só, com o rótulo e o texto do desenho", async () => {
    await montar();
    expect(campo()!.placeholder).toBe("Buscar por nome, telefone ou referência");
    expect(container.querySelector('label[for="busca-de-leads"]')).not.toBeNull();
    // A busca por referência à parte saiu.
    expect(container.querySelector("#busca-ref")).toBeNull();
  });

  it("manda o que foi colado no ?busca=, e mostra o que voltou", async () => {
    await montar();
    expect(gets()).toEqual(["GET /api/leads/gerenciar"]);
    expect(texto()).toContain("Ana da Fila");

    await buscarNaTela("Olá! Vi o carro no site. (Ref: 0dcb1cdc)");

    expect(buscaDaUrl(gets().at(-1)!)).toBe("Olá! Vi o carro no site. (Ref: 0dcb1cdc)");
    expect(texto()).toContain("Dora Buscada");
    expect(texto()).not.toContain("Ana da Fila");
    expect(texto()).toContain("1 encontrado na equipe inteira");
    expect(texto()).toContain("1 lead com a referência 0DCB1CDC.");
  });

  it("busca por nome depois de uma pausa na digitação, sem Enter", async () => {
    await montar();
    await mudar(campo()!, "Dora");
    // Ainda não: a busca espera a pessoa parar de digitar.
    expect(gets()).toHaveLength(1);

    await act(async () => {
      await new Promise((pronto) => setTimeout(pronto, 450));
    });
    await assentar();

    expect(buscaDaUrl(gets().at(-1)!)).toBe("Dora");
    expect(texto()).toContain("Dora Buscada");
    // O campo continua lá, com o que foi digitado: reler não desmonta a tela.
    expect(campo()!.value).toBe("Dora");
  });

  it("a busca vazia não apaga o campo, não diz 'nenhum lead ainda', e tem volta", async () => {
    await montar();
    await buscarNaTela("1234abcd");

    expect(buscaDaUrl(gets().at(-1)!)).toBe("1234abcd");
    expect(campo(), "a busca vazia apagou o próprio campo").not.toBeNull();
    expect(texto()).toContain("Nenhum lead com a referência 1234ABCD");
    expect(texto()).toContain("Nenhum encontrado na equipe inteira");
    expect(texto()).not.toContain("Nenhum lead ainda");

    await clicar("limpar");

    expect(gets().at(-1)).toBe("GET /api/leads/gerenciar");
    expect(texto()).toContain("Ana da Fila");
    expect(campo()!.value).toBe("");
  });

  it("busca por nome que não acha diz que não achou, e avisa do acento", async () => {
    await montar();
    await buscarNaTela("Joao");

    expect(texto()).toContain("Nenhum lead encontrado");
    expect(texto()).toContain("“Joao” não acha “João”");
    expect(texto()).not.toContain("Nenhum lead ainda");
  });

  it("termo curto demais não viaja: a tela diz o que falta", async () => {
    await montar();
    const antes = gets().length;

    await buscarNaTela("J");

    expect(gets()).toHaveLength(antes);
    expect(texto()).toContain(AVISO_DE_BUSCA_INVALIDA);
    // E a fila continua na tela.
    expect(texto()).toContain("Ana da Fila");
  });

  it("Atualizar repete a busca — e não entrega o clique como termo", async () => {
    await montar();
    await buscarNaTela("0DCB1CDC");

    await clicar("Atualizar");

    expect(gets().slice(-2)).toEqual([
      "GET /api/leads/gerenciar?busca=0DCB1CDC",
      "GET /api/leads/gerenciar?busca=0DCB1CDC",
    ]);
    expect(chamadas.join("\n")).not.toContain("object");
    expect(texto()).toContain("Dora Buscada");
  });

  it("Enter de novo no mesmo termo busca de novo", async () => {
    // O pedido igual não muda estado, e sem mudança o efeito não roda — o lead
    // que não existia há um minuto pode ter acabado de chegar.
    await montar();
    await buscarNaTela("0DCB1CDC");
    const antes = gets().length;

    await buscarNaTela("0DCB1CDC");

    expect(gets()).toHaveLength(antes + 1);
  });

  it("buscar limpa o filtro que esconderia o lead achado", async () => {
    await montar();
    await clicar(/^Atrasados \(1\)$/);
    // Contraprova: o filtro pegou — quem não está atrasado saiu do quadro.
    expect(texto()).not.toContain("Ana da Fila");
    expect(texto()).toContain("Carlos da Fila");
    expect(botao(/^Atrasados/).getAttribute("aria-pressed")).toBe("true");

    // A achada não tem passo atrasado. Com o filtro de pé, ela não apareceria.
    await buscarNaTela("0DCB1CDC");

    expect(texto()).toContain("Dora Buscada");
    expect(botao(/^Atrasados/).getAttribute("aria-pressed")).toBe("false");
  });

  it("buscando, o escopo é ignorado: a busca acha o lead de outro vendedor", async () => {
    achar = () => [leadDeTeste("l7", "Elis de Outro", { responsavel: "Ana" })];
    await montar();
    await clicar(/^Minha fila/);
    expect(texto()).toContain("Ana da Fila");
    expect(texto()).not.toContain("Carlos da Fila");

    await buscarNaTela("Elis");

    expect(texto()).toContain("Elis de Outro");
    expect(texto()).toContain("1 encontrado na equipe inteira");
    expect(botao(/^Minha fila/).disabled).toBe(true);
  });

  it("o vendedor que só vê os próprios leads não lê 'na equipe inteira'", async () => {
    escopo = "meus";
    await montar();
    await buscarNaTela("Dora");

    expect(texto()).toContain("1 encontrado");
    expect(texto()).not.toContain("na equipe inteira");
  });

  it("o lead achado que já foi fechado é apontado, com o caminho até ele", async () => {
    achar = () => [{ ...ACHADO, situacao: "perdido", desfecho: "perdido", desfecho_em: "2026-09-16T13:00:00.000Z" }];
    await montar();
    await buscarNaTela("0DCB1CDC");

    // Fechado não mora no quadro: sem o aviso, a busca que achou parece vazia.
    expect(texto()).not.toContain("Dora Buscada");
    expect(texto()).toContain("Ele já foi fechado e está na lista de Fechados");

    await clicar("ver os fechados");

    expect(texto()).toContain("Dora Buscada");
  });

  it("o mesmo aviso vale para a busca por nome", async () => {
    achar = () => [{ ...ACHADO, situacao: "perdido", desfecho: "perdido", desfecho_em: "2026-09-16T13:00:00.000Z" }];
    await montar();
    await buscarNaTela("Dora");

    expect(texto()).toContain("Ele já foi fechado e está na lista de Fechados");
    // A frase da referência não aparece em busca por nome.
    expect(texto()).not.toContain("com a referência");
  });

  it("quem fica no agregado não vê o campo — a rota recusaria a busca", async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({ somenteAgregado: true, total: 2, porSituacao: { novo: 2 } }),
    })) as never;
    await montar();

    expect(texto()).toContain("Volume por etapa");
    expect(campo()).toBeNull();
  });
});
