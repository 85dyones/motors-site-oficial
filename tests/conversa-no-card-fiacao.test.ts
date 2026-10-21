// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { assentar, cardDe, clicar, definirLargura, filaDeTeste, leadDeTeste, zerarRota } from "./quadroDeLeadsDeTeste";

/**
 * A conversa e o Ney no card, na tela montada (21/10/2026). Pedido do dono:
 * "temos que ter uma visualização clara sobre leads que estão com o Ney,
 * assim como as mensagens, para não precisar abrir cada um, se tiver um botão
 * de enviar agora para o ney no card resumo, acho que seria interessante
 * também".
 *
 * O molde é o de `card-do-lead-compacto-fiacao.test.ts`: o quadro de verdade,
 * só o `fetch`, o `next/link` e o `next/navigation` dublados.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));
vi.mock("next/navigation", async () => (await import("./quadroDeLeadsDeTeste")).navegacaoDeTeste);

const antes = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

// Rafael escreveu há 15 minutos e ninguém respondeu.
const RAFAEL = leadDeTeste("l1", "Rafael", {
  situacao: "em_contato",
  responsavel: "Ana",
  tem_conversa: true,
  esperando_resposta_desde: antes(15),
  ultima_mensagem: { autor: "cliente", quem: "Cliente", texto: "qual o valor da entrada?", criado_em: antes(15) },
});
// Com o Ney, que está reaquecendo.
const SOFIA = leadDeTeste("l2", "Sofia", {
  situacao: "reaquecendo",
  responsavel: "Ana",
  tem_conversa: true,
  assistente_fase: "reaquecendo",
  cadencia: "follow_up",
  cadencia_passo: 1,
  ultima_mensagem: { autor: "assistente", quem: "Ney", texto: "Oi Sofia, o Onix ainda está aqui!", criado_em: antes(60 * 24) },
});
// Do formulário, sem conversa: o card não oferece o Ney.
const CAIO = leadDeTeste("l3", "Caio", { situacao: "novo" });

const ETAPAS = [
  { chave: "novo", rotulo: "Novo", ordem: 1, tipo: "aberta", estagnacao_minutos: null, transferencia_minutos: null, protegida: false, ativa: true },
  { chave: "em_contato", rotulo: "1º Contato", ordem: 2, tipo: "aberta", estagnacao_minutos: null, transferencia_minutos: null, protegida: false, ativa: true },
  { chave: "reaquecendo", rotulo: "Reaquecendo", ordem: 3, tipo: "aberta", estagnacao_minutos: null, transferencia_minutos: null, protegida: true, ativa: true },
];

let chamadas: Array<{ metodo: string; url: string; corpo?: Record<string, unknown> }>;
let respostaDoNey: { status: number; corpo: Record<string, unknown> };
let novidades: Record<string, unknown>;
let container: HTMLDivElement;
let root: Root;

async function montar() {
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    const metodo = opcoes?.method ?? "GET";
    chamadas.push({ metodo, url: String(url), corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined });
    const responder = (c: unknown, status = 200) => ({ ok: status < 400, status, json: async () => c });
    if (String(url).includes("/assistente")) return responder(respostaDoNey.corpo, respostaDoNey.status);
    if (String(url).startsWith("/api/leads/novidades")) return responder(novidades);
    return responder(filaDeTeste([RAFAEL, SOFIA, CAIO], { etapas: ETAPAS }));
  }) as never;
  const { default: LeadsKanban } = await import("../src/components/admin/LeadsKanban");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(LeadsKanban, { meuNome: "Ana" }));
  });
  await assentar();
}

const botao = (raiz: ParentNode, texto: string) =>
  [...raiz.querySelectorAll("button")].find((b) => (b.textContent ?? "").replace(/\s+/g, " ").includes(texto)) ?? null;

beforeEach(() => {
  chamadas = [];
  respostaDoNey = { status: 200, corpo: { ok: true, aviso: "Ney escreve na próxima rodada (até 15 minutos), depois de ler a conversa." } };
  novidades = { agora: new Date().toISOString(), conversas: {}, leads: [], avisos: [] };
  zerarRota();
  definirLargura(true);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("a conversa e o Ney no card, na tela", () => {
  it("o cliente esperando há mais de 10 minutos: selo vermelho, e a última mensagem à vista", async () => {
    await montar();
    const card = cardDe(container, "l1")!;
    const selo = card.querySelector('[data-espera="atrasada"]');
    expect(selo?.textContent).toContain("Cliente esperando · 15 min");
    expect(card.querySelector('[data-ultima-mensagem="cliente"]')!.textContent).toMatch(/^Cliente: qual o valor da entrada\? · 15 min$/);
  });

  it("o lead com o Ney: o selo diz o que ele está fazendo, e o card não oferece mandá-lo de novo", async () => {
    await montar();
    const card = cardDe(container, "l2")!;
    expect(card.querySelector('[data-ney="reaquecendo"]')!.textContent).toContain("Ney reaquecendo · 1 toque enviado");
    expect(card.textContent).toContain("Ney: Oi Sofia, o Onix ainda está aqui!");
    expect(botao(card, "Enviar ao Ney")).toBeNull();
    // Sem conversa pela loja, também não.
    expect(botao(cardDe(container, "l3")!, "Enviar ao Ney")).toBeNull();
  });

  it("\"Enviar ao Ney\": pede confirmação, manda o \"Ney retoma agora\" e mostra o que o servidor disse", async () => {
    await montar();
    const card = () => cardDe(container, "l1")!;
    await clicar(botao(card(), "Enviar ao Ney"));
    // Um toque só não envia: o tablet do balcão erra dedo.
    expect(chamadas.filter((c) => c.url.includes("/assistente"))).toEqual([]);
    expect(card().textContent).toContain("O Ney lê a conversa e escreve na próxima rodada");
    // E a confirmação não abre o detalhe.
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await clicar(botao(card(), "Confirmar"));
    expect(chamadas.filter((c) => c.url.includes("/assistente"))).toEqual([
      { metodo: "POST", url: "/api/leads/l1/assistente", corpo: { acao: "assumir" } },
    ]);
    expect(card().querySelector('[role="status"]')!.textContent).toBe("Ney escreve na próxima rodada (até 15 minutos), depois de ler a conversa.");
    expect(card().querySelector('[data-ney="reaquecendo"]')).not.toBeNull();
    expect(botao(card(), "Enviar ao Ney")).toBeNull();
  });

  it("a recusa do servidor aparece no card, e Cancelar não envia nada", async () => {
    respostaDoNey = { status: 409, corpo: { error: "O assistente está desligado na configuração." } };
    await montar();
    const card = () => cardDe(container, "l1")!;
    await clicar(botao(card(), "Enviar ao Ney"));
    await clicar(botao(card(), "Cancelar"));
    expect(chamadas.filter((c) => c.url.includes("/assistente"))).toEqual([]);
    await clicar(botao(card(), "Enviar ao Ney"));
    await clicar(botao(card(), "Confirmar"));
    expect(card().querySelector('[role="status"]')!.textContent).toBe("O assistente está desligado na configuração.");
    expect(botao(card(), "Enviar ao Ney")).not.toBeNull();
  });

  it("os filtros \"Esperando resposta\" e \"Com o Ney\" contam e filtram", async () => {
    await montar();
    expect(botao(container, "Esperando resposta (1)")).not.toBeNull();
    await clicar(botao(container, "Com o Ney (1)"));
    expect(cardDe(container, "l2")).not.toBeNull();
    expect(cardDe(container, "l1")).toBeNull();
    await clicar(botao(container, "Com o Ney (1)"));
    await clicar(botao(container, "Esperando resposta (1)"));
    expect(cardDe(container, "l1")).not.toBeNull();
    expect(cardDe(container, "l2")).toBeNull();
  });

  it("de volta à aba, o quadro pergunta o que mudou e o card acompanha: o cliente respondido perde o selo, o Ney aparece", async () => {
    await montar();
    expect(chamadas.some((c) => c.url.startsWith("/api/leads/novidades"))).toBe(false);
    novidades = {
      agora: new Date().toISOString(),
      conversas: {
        l1: { esperando_resposta_desde: null, ultima_mensagem: { autor: "vendedor", quem: "Ana", texto: "Entrada a partir de 10 mil", criado_em: antes(0) } },
      },
      leads: [{ id: "l3", assistente_fase: "qualificando", situacao: "novo" }],
      avisos: [],
    };
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await assentar();

    expect(chamadas.filter((c) => c.url.startsWith("/api/leads/novidades"))).toHaveLength(1);
    expect(cardDe(container, "l1")!.querySelector("[data-espera]")).toBeNull();
    expect(cardDe(container, "l1")!.textContent).toContain("Ana: Entrada a partir de 10 mil");
    expect(cardDe(container, "l3")!.querySelector('[data-ney="conversando"]')!.textContent).toContain("Ney conversando");
  });
});
