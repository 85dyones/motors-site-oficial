// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Fragment, act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * O bloco de atendimento do lead, montado (2026-10-20): as duas abas, a
 * conversa, a resposta pelo painel e os botões do assistente — e o bloco do
 * aquecimento, sempre à vista, lendo a mesma conversa. Só o `fetch` é dublê.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RESPOSTA = {
  atendimento: {
    aquecimento: 80,
    temperatura: "quente",
    qualificacao: {
      ficha: { interesse: "Onix LT 2020", interesse_especifico: true, troca: "Uno 2014", prazo: "imediato" },
      motivos: [
        { chave: "quer_visitar", pontos: 25, texto: "Quer visitar a loja ou fazer test-drive" },
        { chave: "so_pesquisando", pontos: -15, texto: "Disse que só está pesquisando" },
      ],
    },
    resumo_ia: "Rafael quer o Onix, com o Uno na troca.",
    resumo_ia_em: new Date(Date.now() - 60_000).toISOString(),
    assistente_fase: "qualificando",
    entregue_em: null,
    entregue_motivo: null,
    aviso_de_entrega_em: null,
    aviso_de_entrega_para: null,
    entrega_confirmada_em: null,
    cadencia: "follow_up",
    cadencia_passo: 0,
    cadencia_proximo_em: new Date(Date.now() + 3600_000).toISOString(),
    optout_em: null,
    origem_conversa: { tipo: "ad", titulo: "SUVs a partir de 79 mil" },
  },
  mensagens: [
    { id: "m1", direcao: "entrada", autor: "cliente", autor_nome: "Rafael", conteudo: "texto", texto: "Oi, tem Onix?", situacao: "recebida", gatilho: null, erro: null, criado_em: new Date().toISOString() },
    { id: "m2", direcao: "saida", autor: "assistente", autor_nome: "Ney", conteudo: "texto", texto: "Tenho sim!", situacao: "enviada", gatilho: "resposta", erro: null, criado_em: new Date().toISOString() },
    { id: "m3", direcao: "saida", autor: "assistente", autor_nome: "Ney", conteudo: "texto", texto: "Ainda quer?", situacao: "falhou", gatilho: "cadencia", erro: "número sem WhatsApp", criado_em: new Date().toISOString() },
  ],
  retratos: [],
  assistente: { ativo: true, nome: "Ney", limiares: { morno: 35, quente: 65 }, whatsapp_ligado: true, passos: { follow_up: 3 } },
};

let chamadas: { metodo: string; url: string; corpo?: unknown }[];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  chamadas = [];
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    const metodo = opcoes?.method ?? "GET";
    chamadas.push({ metodo, url, corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined });
    return { ok: true, status: 200, json: async () => (metodo === "GET" ? RESPOSTA : { ok: true }) };
  }) as never;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Como o detalhe monta: uma leitura da conversa para os dois blocos. */
async function montar() {
  const { default: AtendimentoDoLead } = await import("../src/components/admin/lead/AtendimentoDoLead");
  const { default: AquecimentoDoLead } = await import("../src/components/admin/lead/AquecimentoDoLead");
  const { useConversaDoLead } = await import("../src/components/admin/lead/useConversaDoLead");
  function Blocos() {
    const conversa = useConversaDoLead("lead-1");
    return createElement(
      Fragment,
      null,
      createElement(AtendimentoDoLead, { leadId: "lead-1", conversa }),
      createElement(AquecimentoDoLead, { conversa }),
    );
  }
  await act(async () => {
    root.render(createElement(Blocos));
  });
}

const texto = () => container.textContent ?? "";
const botao = (rotulo: string) => [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === rotulo)!;
const clicar = async (el: Element) => act(async () => (el as HTMLElement).click());

describe("o bloco de atendimento", () => {
  it("abre na conversa, com a temperatura, quem está atendendo e as mensagens", async () => {
    await montar();
    expect(chamadas[0]).toEqual({ metodo: "GET", url: "/api/leads/lead-1/conversa", corpo: undefined });
    expect(container.querySelector('[data-bloco="a"]')).not.toBeNull();
    expect(container.querySelector('[data-temperatura="quente"]')!.textContent).toBe("Quente · 80");
    expect(texto()).toContain("Ney está atendendo");
    expect([...container.querySelectorAll("li[data-autor]")].map((li) => li.getAttribute("data-autor"))).toEqual(["cliente", "assistente", "assistente"]);
    expect(texto()).toContain("cadência · não saiu");
  });

  it("a foto do carro que o assistente mandou aparece na conversa, com a legenda e a camada", async () => {
    const original = RESPOSTA.mensagens;
    RESPOSTA.mensagens = [
      ...original,
      { id: "m4", direcao: "saida", autor: "assistente", autor_nome: "Ney", conteudo: "imagem", texto: "Painel digital", situacao: "enviada", gatilho: "resposta", erro: null, criado_em: new Date().toISOString(), midia_url: "https://f.teste/onix-6.jpg", camada: "interior" } as (typeof original)[number],
    ];
    try {
      await montar();
      const img = container.querySelector('li[data-autor="assistente"] img') as HTMLImageElement;
      expect(img.getAttribute("src")).toBe("https://f.teste/onix-6.jpg");
      expect(img.getAttribute("alt")).toBe("Painel digital");
      expect(img.closest("a")!.getAttribute("target")).toBe("_blank");
      expect(texto()).toContain("foto · interior");
      expect(texto()).toContain("Painel digital");
    } finally {
      RESPOSTA.mensagens = original;
    }
  });

  it("responder pelo painel manda POST com o texto e relê a conversa", async () => {
    await montar();
    const caixa = container.querySelector("textarea")!;
    await act(async () => {
      const definir = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      definir.call(caixa, "Oi Rafael, aqui é a Carla!");
      caixa.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clicar(botao("ENVIAR →"));
    expect(chamadas.find((c) => c.metodo === "POST")).toEqual({ metodo: "POST", url: "/api/leads/lead-1/conversa", corpo: { texto: "Oi Rafael, aqui é a Carla!" } });
    expect(chamadas.at(-1)!.metodo).toBe("GET");
  });

  it("os botões do assistente chamam a rota com a ação", async () => {
    await montar();
    await clicar(botao("Entregar ao vendedor agora"));
    expect(chamadas.find((c) => c.url === "/api/leads/lead-1/assistente")).toMatchObject({ metodo: "POST", corpo: { acao: "entregar" } });
  });

  it("aba Resumo: o resumo, a ficha com o não dito e a origem do anúncio", async () => {
    await montar();
    await clicar(botao("Resumo"));
    expect(texto()).toContain("Rafael quer o Onix, com o Uno na troca.");
    expect(texto()).toContain("ProcuraOnix LT 2020");
    expect(texto()).toContain("Quer investirnão disse");
    expect(texto()).toContain("Veio do anúncio: SUVs a partir de 79 mil");
  });

  it("o aquecimento fica à vista, sem aba: a nota, a régua, os motivos com sinal e a cadência", async () => {
    await montar();
    // Uma leitura serve aos dois blocos.
    expect(chamadas.filter((c) => c.url === "/api/leads/lead-1/conversa")).toHaveLength(1);
    expect(botao("Aquecimento")).toBeUndefined();
    const q = () => container.querySelector('[data-bloco="q"]')!.textContent ?? "";
    expect(q()).toContain("80de 100 · Quente");
    expect(q()).toContain("Morno a partir de 35 · quente a partir de 65");
    const motivos = [...container.querySelectorAll('[data-bloco="q"] [aria-label="Por que esta nota"] li')].map((li) => li.textContent);
    expect(motivos).toEqual(["+25Quer visitar a loja ou fazer test-drive", "-15Disse que só está pesquisando"]);
    expect(q()).toContain("Follow-up · toque 1 de 3");
    // Trocar a aba do atendimento não esconde o aquecimento.
    await clicar(botao("Resumo"));
    expect(q()).toContain("80de 100 · Quente");
  });

  it("antes de a conversa chegar, o aquecimento diz que está lendo", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => new Promise(() => {})) as never;
    try {
      await montar();
      expect(container.querySelector('[data-bloco="q"]')!.textContent).toContain("Lendo o aquecimento…");
    } finally {
      globalThis.fetch = original;
    }
  });
});
