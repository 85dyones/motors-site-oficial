// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Fragment, act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * O bloco de atendimento do lead, montado (2026-10-20): a conversa, a
 * resposta pelo painel e os botões do assistente — e o bloco do aquecimento,
 * sempre à vista, com o resumo para o comercial, lendo a mesma conversa. Só o
 * `fetch` é dublê.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** O upload direto para o bucket: o Storage não existe no teste. */
const subidas: { caminho: string; token: string; nome: string }[] = [];
let falhaDaSubida: string | null = null;
vi.mock("../src/lib/anexoDoPainel-navegador", () => ({
  subirAnexo: async (caminho: string, token: string, arquivo: File) => {
    subidas.push({ caminho, token, nome: arquivo.name });
    return falhaDaSubida ? { ok: false, erro: falhaDaSubida } : { ok: true };
  },
}));

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
      createElement(AtendimentoDoLead, { leadId: "lead-1", conversa, nomeDoCliente: "Rafael Souza" }),
      createElement(AquecimentoDoLead, { conversa, nomeDoLead: "Rafael" }),
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
    expect(container.querySelector('[data-temperatura="quente"]')!.textContent).toBe("🔥 Quente · 80");
    // O cliente aparece pelo nome do lead, não como "Cliente".
    expect(container.querySelector('li[data-autor="cliente"] span')!.textContent).toMatch(/^Rafael Souza · /);
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

  it("o resumo para o comercial fica junto do aquecimento, sem aba: onde está no método, o resumo, a ficha com o não dito e a origem", async () => {
    await montar();
    expect(botao("Resumo")).toBeUndefined();
    const resumo = container.querySelector('[data-bloco="q"] [data-resumo]')!;
    const t = resumo.textContent ?? "";
    expect(resumo.querySelector("[data-metodo]")!.textContent).toBe("Falta: se paga à vista, financiado ou no consórcio; o dia e a hora da visita ou do test-drive");
    expect(t).toContain("Rafael quer o Onix, com o Uno na troca.");
    expect(t).toContain("ProcuraOnix LT 2020");
    expect(t).toContain("Carro na trocaUno 2014");
    expect(t).toContain("Quer investirnão disse");
    expect(t).toContain("Veio do anúncio: SUVs a partir de 79 mil");
  });

  it("visita marcada aparece como pronta, e Copiar leva o resumo em texto", async () => {
    const original = RESPOSTA.atendimento;
    RESPOSTA.atendimento = {
      ...original,
      entregue_motivo: "agendou",
      qualificacao: { ...original.qualificacao, ficha: { ...original.qualificacao.ficha, visita_data: "2026-10-24", visita_hora: "10:00" } },
    } as unknown as typeof original;
    let copiado = "";
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (v: string) => void (copiado = v) }, configurable: true });
    try {
      await montar();
      const metodo = container.querySelector('[data-bloco="q"] [data-metodo]')!;
      expect(metodo.getAttribute("data-metodo")).toBe("pronto");
      expect(metodo.textContent).toBe("✓ Visita marcada: sábado, 24/10, às 10h");
      await clicar(botao("Copiar"));
      expect(botao("Copiado ✓")).toBeTruthy();
      expect(copiado.split("\n").slice(0, 3)).toEqual(["Aquecimento: 80/100 (Quente)", "Visita marcada: sábado, 24/10, às 10h", "Procura: Onix LT 2020"]);
      expect(copiado).toContain("Resumo: Rafael quer o Onix, com o Uno na troca.");
    } finally {
      RESPOSTA.atendimento = original;
    }
  });

  it("o aquecimento fica à vista, sem aba: a nota, a régua, os motivos com sinal e a cadência", async () => {
    await montar();
    // Uma leitura serve aos dois blocos.
    expect(chamadas.filter((c) => c.url === "/api/leads/lead-1/conversa")).toHaveLength(1);
    expect(botao("Aquecimento")).toBeUndefined();
    const q = () => container.querySelector('[data-bloco="q"]')!.textContent ?? "";
    expect(q()).toContain("🔥80de 100 · Quente");
    // Quente: a barra vai do âmbar ao vermelho, e o rótulo pega a cor do acento.
    const barra = container.querySelector<HTMLElement>('[data-bloco="q"] [data-barra="quente"]')!;
    expect(barra.style.background).toContain("linear-gradient");
    expect(barra.style.width).toBe("80%");
    expect(container.querySelector('[data-temperatura-do-bloco="quente"]')!.className).toContain("text-mt-accent-800");
    expect(q()).toContain("Morno a partir de 35 · quente a partir de 65");
    const motivos = [...container.querySelectorAll('[data-bloco="q"] [aria-label="Por que esta nota"] li')].map((li) => li.textContent);
    expect(motivos).toEqual(["+25Quer visitar a loja ou fazer test-drive", "-15Disse que só está pesquisando"]);
    expect(q()).toContain("Follow-up · toque 1 de 3");
  });

  it("frio: barra azul e o gelo no lugar da chama", async () => {
    const original = RESPOSTA.atendimento;
    RESPOSTA.atendimento = { ...original, aquecimento: 20, temperatura: "frio" } as unknown as typeof original;
    try {
      await montar();
      expect(container.querySelector('[data-temperatura="frio"]')!.textContent).toBe("🧊 Frio · 20");
      expect(container.querySelector<HTMLElement>('[data-bloco="q"] [data-barra="frio"]')!.style.background).toBe("var(--mt-frio-vivo)");
      expect(container.querySelector('[data-temperatura-do-bloco="frio"]')!.className).toContain("text-mt-frio");
    } finally {
      RESPOSTA.atendimento = original;
    }
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

describe("os anexos na conversa", () => {
  const LEAD = "lead-1";
  const comMensagens = async (extras: Record<string, unknown>[], corpo: () => Promise<void>) => {
    const original = RESPOSTA.mensagens;
    RESPOSTA.mensagens = [...original, ...(extras as (typeof original)[number][])];
    try {
      await montar();
      await corpo();
    } finally {
      RESPOSTA.mensagens = original;
    }
  };
  const doCliente = (id: string, conteudo: string, extra: Record<string, unknown>) => ({
    id,
    direcao: "entrada",
    autor: "cliente",
    autor_nome: "Rafael",
    conteudo,
    texto: null,
    situacao: "recebida",
    gatilho: null,
    erro: null,
    criado_em: new Date().toISOString(),
    ...extra,
  });

  it("foto, vídeo, áudio e documento do cliente aparecem como arquivo, pela porta do painel", async () => {
    await comMensagens(
      [
        doCliente("f1", "imagem", { texto: "minha CNH", midia_caminho: `${LEAD}/f1.jpg`, midia_tipo: "image/jpeg" }),
        doCliente("v1", "video", { midia_caminho: `${LEAD}/v1.mp4`, midia_tipo: "video/mp4" }),
        doCliente("a1", "audio", { midia_caminho: `${LEAD}/a1.m4a`, midia_tipo: "audio/mp4" }),
        doCliente("d1", "documento", { texto: "holerite.pdf", midia_caminho: `${LEAD}/d1.pdf`, midia_nome: "holerite.pdf", midia_bytes: 204800 }),
        doCliente("x1", "video", { texto: "olha", midia_erro: "a Evolution não entregou o arquivo" }),
      ],
      async () => {
        const porta = (id: string) => `/api/leads/${LEAD}/conversa/midia/${id}`;
        expect(container.querySelector(`img[src="${porta("f1")}"]`)!.getAttribute("alt")).toBe("minha CNH");
        expect(container.querySelector("video")!.getAttribute("src")).toBe(porta("v1"));
        expect(container.querySelector("audio")!.getAttribute("src")).toBe(porta("a1"));
        const doc = container.querySelector(`a[href="${porta("d1")}?baixar=1"]`)!;
        expect(doc.textContent).toContain("holerite.pdf");
        expect(doc.textContent).toContain("200 KB");
        // O arquivo que não veio: o rótulo e onde ele está.
        expect(texto()).toContain("[Vídeo] olha");
        expect(texto()).toContain("arquivo só no celular da loja");
      },
    );
  });

  it("o clipe: escolhe, confere, sobe direto ao bucket e manda o caminho com a legenda", async () => {
    subidas.length = 0;
    falhaDaSubida = null;
    await montar();
    globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
      const metodo = opcoes?.method ?? "GET";
      chamadas.push({ metodo, url, corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined });
      if (url.endsWith("/conversa/anexo")) return { ok: true, status: 200, json: async () => ({ ok: true, caminho: `${LEAD}/painel-abc12345.pdf`, token: "tok-1" }) };
      return { ok: true, status: 200, json: async () => (metodo === "GET" ? RESPOSTA : { ok: true }) };
    }) as never;

    const campo = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(campo.getAttribute("accept")).toContain("application/pdf");
    const arquivo = new File(["%PDF-1.7"], "Proposta Onix.pdf", { type: "application/pdf" });
    await act(async () => {
      Object.defineProperty(campo, "files", { value: [arquivo], configurable: true });
      campo.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector("[data-anexo-escolhido]")!.textContent).toContain("Proposta Onix.pdf");
    // Com o anexo, o texto é legenda e o ENVIAR já vale sem texto.
    expect(container.querySelector("textarea")!.getAttribute("placeholder")).toBe("Legenda (opcional)…");
    expect(botao("ENVIAR →").disabled).toBe(false);

    const caixa = container.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(caixa, "Segue a proposta");
      caixa.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clicar(botao("ENVIAR →"));

    const posts = chamadas.filter((c) => c.metodo === "POST");
    expect(posts).toEqual([
      { metodo: "POST", url: `/api/leads/${LEAD}/conversa/anexo`, corpo: { nome: "Proposta Onix.pdf", tipo: "application/pdf", bytes: 8 } },
      { metodo: "POST", url: `/api/leads/${LEAD}/conversa`, corpo: { texto: "Segue a proposta", anexo: { caminho: `${LEAD}/painel-abc12345.pdf`, nome: "Proposta Onix.pdf" } } },
    ]);
    expect(subidas).toEqual([{ caminho: `${LEAD}/painel-abc12345.pdf`, token: "tok-1", nome: "Proposta Onix.pdf" }]);
    // Saiu: o anexo e a legenda somem da caixa.
    expect(container.querySelector("[data-anexo-escolhido]")).toBeNull();
  });

  it("arquivo que o WhatsApp não aceita é recusado na escolha, sem subir nada", async () => {
    subidas.length = 0;
    await montar();
    const campo = container.querySelector('input[type="file"]') as HTMLInputElement;
    const grande = new File([new Uint8Array(17 * 1024 * 1024)], "test-drive.mp4", { type: "video/mp4" });
    await act(async () => {
      Object.defineProperty(campo, "files", { value: [grande], configurable: true });
      campo.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("O vídeo passa de 16 MB");
    expect(container.querySelector("[data-anexo-escolhido]")).toBeNull();
    expect(chamadas.filter((c) => c.metodo === "POST")).toHaveLength(0);
    expect(subidas).toHaveLength(0);
  });

  it("o upload falhou: o erro aparece e a mensagem não é enviada", async () => {
    subidas.length = 0;
    falhaDaSubida = "The object exceeded the maximum allowed size";
    await montar();
    globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
      const metodo = opcoes?.method ?? "GET";
      chamadas.push({ metodo, url, corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined });
      if (url.endsWith("/conversa/anexo")) return { ok: true, status: 200, json: async () => ({ ok: true, caminho: `${LEAD}/painel-abc12345.jpg`, token: "t" }) };
      return { ok: true, status: 200, json: async () => (metodo === "GET" ? RESPOSTA : { ok: true }) };
    }) as never;
    const campo = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      Object.defineProperty(campo, "files", { value: [new File(["jpg"], "carro.jpg", { type: "image/jpeg" })], configurable: true });
      campo.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await clicar(botao("ENVIAR →"));
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("O anexo não subiu: The object exceeded");
    expect(chamadas.filter((c) => c.metodo === "POST").map((c) => c.url)).toEqual([`/api/leads/${LEAD}/conversa/anexo`]);
    // O anexo continua escolhido, para tentar de novo.
    expect(container.querySelector("[data-anexo-escolhido]")!.textContent).toContain("carro.jpg");
    falhaDaSubida = null;
  });
});
