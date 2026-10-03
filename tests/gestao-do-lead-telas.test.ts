// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ETAPAS_PADRAO } from "../src/lib/funil";
import { diaNaLoja, instanteNoFusoDaLoja, sugestoesDeProximoPasso } from "../src/lib/gestaoDoLead";
import { lerNomeNaTrilha } from "../src/lib/nomeNaTrilha";
import {
  assentar,
  cardDe,
  clicar,
  definirLargura,
  detalheDeTeste,
  filaDeTeste,
  gaveta,
  leadDaUrl,
  leadDeTeste,
  mudar,
  quemAbre,
  rota,
  teclar,
  zerarRota,
} from "./quadroDeLeadsDeTeste";

/**
 * As telas da gestão do lead, montadas (desenho de 23/09/2026, telas em 03/10):
 * a linha de controles, a Lista do dia e o detalhe nos dois layouts.
 *
 * O servidor é de mentira e GUARDA o que gravou: o detalhe relê o lead depois
 * de mover de etapa ou registrar a chegada, e tem de receber o que ficou. O
 * quadro, o detalhe e as libs são os de verdade.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));
vi.mock("next/navigation", async () => (await import("./quadroDeLeadsDeTeste")).navegacaoDeTeste);

const AGORA = Date.now();
const daqui = (horas: number) => new Date(AGORA + horas * 3_600_000).toISOString();

// A etapa "novo" cobra em 15 minutos: o lead de três dias está parado.
const ETAPAS = ETAPAS_PADRAO.map((e) => (e.chave === "novo" ? { ...e, estagnacao_minutos: 15 } : e));

type Lead = ReturnType<typeof leadDeTeste>;

function leadsDoDia(): Lead[] {
  return [
    leadDeTeste("l1", "Joana Atrasada", {
      responsavel: "Ana",
      interesse: "Renault Duster",
      telefone: "5541991176299",
      created_at: daqui(-72),
      proximo_passo: "Cobrar retorno da proposta",
      proximo_passo_vence_em: daqui(-50),
      proximo_passo_definido_em: daqui(-72),
      ultima_interacao: { tipo: "whatsapp", quando: daqui(-72), texto: "Pediu a simulação.", autor: "Ana" },
    }),
    leadDeTeste("l2", "Pedro de Hoje", {
      responsavel: "Bruno",
      situacao: "em_contato",
      proximo_passo: "Enviar proposta",
      proximo_passo_vence_em: new Date(AGORA + 60_000).toISOString(),
    }),
    leadDeTeste("l3", "Rita Próxima", {
      responsavel: "Ana",
      situacao: "proposta",
      proximo_passo: "Confirmar visita",
      proximo_passo_vence_em: daqui(24 * 20),
    }),
    leadDeTeste("l4", "Saulo Sem Passo", { responsavel: "Bruno" }),
    leadDeTeste("l5", "Tina Fechada", {
      responsavel: "Ana",
      situacao: "perdido",
      desfecho: "perdido",
      desfecho_em: daqui(-24),
      proximo_passo: "Ligar",
      proximo_passo_vence_em: daqui(-30),
    }),
  ];
}

// ── o servidor de mentira ────────────────────────────────────────────────
let servidor: Lead[];
let escopo: string;
let historico: Record<string, unknown[]>;
let chamadas: Array<{ metodo: string; url: string; corpo?: Record<string, unknown> }>;
/** Respostas forçadas, por "MÉTODO caminho". */
let forcar: Record<string, { status: number; corpo: unknown }>;

const umLead = (id: string) => servidor.find((l) => l.id === id)!;

function dublarFetch() {
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    const metodo = opcoes?.method ?? "GET";
    const corpo = opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined;
    chamadas.push({ metodo, url: String(url), corpo });
    const responder = (status: number, c: unknown) => ({ ok: status < 400, status, json: async () => c });
    const forcada = forcar[`${metodo} ${url}`];
    if (forcada) return responder(forcada.status, forcada.corpo);

    const doLead = leadDaUrl(String(url));
    if (doLead && metodo === "GET") {
      const lead = umLead(doLead.id);
      return responder(
        200,
        detalheDeTeste(lead, {
          etapas: ETAPAS,
          historico: historico[lead.id] ?? [],
          sugestoes: lead.desfecho ? [] : sugestoesDeProximoPasso(String(lead.situacao), Date.now()),
          vizinhos: { anterior: lead.id === "l1" ? null : "l1", proximo: lead.id === "l1" ? "l4" : null },
          motivos: [{ chave: "preco", rotulo: "Preço", tipo: "perdido", ativo: true, ordem: 1, escopo: "ambos" }],
        }),
      );
    }
    if (doLead?.acao === "interacoes") {
      const lead = umLead(doLead.id);
      const quando = new Date().toISOString();
      Object.assign(lead, {
        proximo_passo: corpo.proximo_passo || null,
        proximo_passo_vence_em: corpo.proximo_passo_vence_em ?? null,
        proximo_passo_definido_em: quando,
        ultimo_contato_em: quando,
        ultima_interacao: { tipo: corpo.tipo, quando, texto: corpo.texto || "Atendeu", autor: "Ana" },
      });
      const item = {
        id: "interacao:nova",
        origem: "humana",
        tipo: corpo.tipo,
        rotulo: "Anotação",
        autor: "Ana",
        quando,
        texto: corpo.texto,
        proximoPasso: { texto: corpo.proximo_passo, vence_em: corpo.proximo_passo_vence_em },
      };
      historico[lead.id] = [item, ...(historico[lead.id] ?? [])];
      return responder(200, { ok: true, interacao_id: "nova", lead: { ...resumo(lead) }, item });
    }
    if (doLead?.acao === "chegou") {
      const lead = umLead(doLead.id);
      const quando = new Date().toISOString();
      const movido = lead.situacao !== "visita" && lead.situacao !== "negociacao";
      Object.assign(lead, {
        situacao: movido ? "visita" : lead.situacao,
        proximo_passo: "Atender na loja",
        proximo_passo_vence_em: quando,
        ultimo_contato_em: quando,
        ultima_interacao: { tipo: "visita", quando, texto: "Chegou na loja.", autor: "Ana" },
      });
      const item = { id: "interacao:visita", origem: "humana", tipo: "visita", rotulo: "Visita à loja", autor: "Ana", quando, texto: "Chegou na loja." };
      historico[lead.id] = [
        item,
        ...(movido ? [{ id: "evento:mov", origem: "sistema", tipo: "etapa", rotulo: "Etapa", autor: "Ana", quando, texto: "Movido de Novo para Visita agendada." }] : []),
        ...(historico[lead.id] ?? []),
      ];
      return responder(200, { ok: true, interacao_id: "visita", movido, situacao: lead.situacao, responsavel_avisado: false, lead: resumo(lead), item });
    }
    if (doLead?.acao === "dados") {
      Object.assign(umLead(doLead.id), corpo);
      return responder(200, { ok: true, dados: { id: doLead.id, ...corpo } });
    }
    if (metodo === "PATCH") {
      const lead = umLead(String(corpo.id));
      if (typeof corpo.situacao === "string") {
        const tipo = ETAPAS.find((e) => e.chave === corpo.situacao)?.tipo;
        Object.assign(lead, { situacao: corpo.situacao, desfecho: tipo === "aberta" ? null : tipo, desfecho_motivo: corpo.desfecho_motivo ?? null });
      }
      if ("responsavel" in corpo) lead.responsavel = corpo.responsavel;
      return responder(200, { ok: true });
    }
    return responder(200, filaDeTeste(servidor, { escopo, etapas: ETAPAS }));
  }) as never;
}

const resumo = (lead: Lead) => {
  const l = lead as Record<string, unknown>;
  return {
    id: l.id,
    situacao: l.situacao,
    responsavel: l.responsavel,
    desfecho: l.desfecho,
    proximo_passo: l.proximo_passo,
    proximo_passo_vence_em: l.proximo_passo_vence_em,
    proximo_passo_definido_em: l.proximo_passo_definido_em ?? null,
    proximo_passo_definido_por: "Ana",
    ultimo_contato_em: l.ultimo_contato_em ?? null,
    ultimo_movimento_em: null,
    ultima_interacao: l.ultima_interacao,
  };
};

let container: HTMLDivElement;
let root: Root;

async function montarQuadro(meuNome: string | null = "Ana") {
  const { default: LeadsKanban } = await import("../src/components/admin/LeadsKanban");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(LeadsKanban, { meuNome }));
  });
  await assentar();
}

async function montarPagina(id: string) {
  const { default: DetalheDoLead } = await import("../src/components/admin/DetalheDoLead");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(DetalheDoLead, { key: id, id, layout: "pagina" }));
  });
  await assentar();
}

beforeEach(() => {
  servidor = leadsDoDia();
  escopo = "todos";
  historico = {
    l1: [
      { id: "interacao:1", origem: "humana", tipo: "whatsapp", rotulo: "WhatsApp", autor: "Ana", quando: daqui(-72), texto: "Pediu a simulação." },
      { id: "evento:1", origem: "sistema", tipo: "entrada", rotulo: "Entrada", autor: "Sistema", quando: daqui(-73), texto: "Lead recebido na etapa Novo." },
      { id: "evento:2", origem: "sistema", tipo: "responsavel", rotulo: "Responsável", autor: "Dyones", quando: daqui(-73), texto: "Atribuído a Ana." },
    ],
  };
  chamadas = [];
  forcar = {};
  zerarRota();
  definirLargura(true);
  dublarFetch();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const texto = (raiz: Element | null = container) => (raiz?.textContent ?? "").replace(/ /g, " ");
const grupo = (rotulo: string, raiz: ParentNode = container) =>
  raiz.querySelector<HTMLElement>(`[role="group"][aria-label="${rotulo}"]`);
const botao = (rotulo: string | RegExp, raiz: ParentNode = container) =>
  [...raiz.querySelectorAll<HTMLButtonElement>("button")].find((b) => {
    const t = (b.textContent ?? "").trim();
    return typeof rotulo === "string" ? t === rotulo : rotulo.test(t);
  });
const pressionado = (rotulo: string | RegExp, raiz: ParentNode = container) => botao(rotulo, raiz)?.getAttribute("aria-pressed");
const blocos = (raiz: ParentNode) => [...raiz.querySelectorAll<HTMLElement>("[data-bloco]")].map((b) => b.dataset.bloco);
const posts = (acao: string) => chamadas.filter((c) => c.metodo === "POST" && c.url.endsWith(`/${acao}`));

// ─────────────────────────────────────────────────────────────────────────────

describe("a linha de controles: escopo e vista por papel", () => {
  it("quem vê a equipe abre no Quadro, em Equipe, com as contagens", async () => {
    await montarQuadro("Ana");

    expect(grupo("Escopo"), "Admin, Gestor e SDR têm o escopo para alternar").not.toBeNull();
    expect(pressionado(/^Equipe \(4\)$/)).toBe("true");
    expect(pressionado(/^Minha fila \(2\)$/)).toBe("false");
    expect(pressionado("Quadro")).toBe("true");
    expect(pressionado("Lista do dia")).toBe("false");
    // O quadro está na tela: os cards.
    expect(cardDe(container, "l4")).not.toBeNull();
    // "Só os parados" e o trilho de etapas clicável saíram.
    expect(texto()).not.toContain("Só os parados");
  });

  it("o Comercial puro abre na Lista do dia e não tem escopo para alternar", async () => {
    escopo = "meus";
    await montarQuadro("Ana");

    expect(grupo("Escopo")).toBeNull();
    expect(pressionado("Lista do dia")).toBe("true");
    expect(pressionado("Quadro")).toBe("false");
    expect(cardDe(container, "l1")).toBeNull();
    expect(container.querySelector('section[aria-label="Atrasados"]')).not.toBeNull();
  });

  it("os chips contam sobre o escopo: trocar para Minha fila muda os números", async () => {
    await montarQuadro("Ana");
    expect(botao(/^Atrasados \(1\)$/)).toBeDefined();
    expect(botao(/^Hoje \(1\)$/)).toBeDefined();
    // Fechado com passo vencido não conta como atrasado; conta em Fechados.
    expect(botao(/^Fechados \(1\)$/)).toBeDefined();

    await clicar(botao(/^Minha fila/));

    expect(pressionado(/^Minha fila/)).toBe("true");
    expect(botao(/^Atrasados \(1\)$/)).toBeDefined();
    expect(botao(/^Hoje \(0\)$/), "o lead de hoje é do Bruno").toBeDefined();
    expect(cardDe(container, "l2")).toBeNull();
    expect(rota.replace).toHaveBeenLastCalledWith("/admin/leads?escopo=minha", { scroll: false });
  });

  it("o chip Atrasados deixa só os atrasados no quadro, e desliga no segundo toque", async () => {
    await montarQuadro("Ana");
    await clicar(botao(/^Atrasados/));
    expect(cardDe(container, "l1")).not.toBeNull();
    expect(cardDe(container, "l2")).toBeNull();
    expect(cardDe(container, "l4")).toBeNull();

    await clicar(botao(/^Atrasados/));
    expect(cardDe(container, "l2")).not.toBeNull();
  });

  it("a vista e o escopo da URL valem sobre o padrão do papel", async () => {
    rota.query = "vista=lista&escopo=minha";
    await montarQuadro("Ana");
    expect(pressionado("Lista do dia")).toBe("true");
    expect(pressionado(/^Minha fila/)).toBe("true");
  });

  it("sem nome no perfil, quem vê a equipe fica sem 'Minha fila' (não há como dizer quais são dele)", async () => {
    await montarQuadro(null);
    expect(grupo("Escopo")).toBeNull();
    expect(cardDe(container, "l2")).not.toBeNull();
  });
});

describe("a Lista do dia", () => {
  beforeEach(() => {
    rota.query = "vista=lista";
  });

  it("agrupa em Atrasados, Hoje e Próximos, com a hora, o passo, o lead e a etapa", async () => {
    await montarQuadro("Ana");
    const secoes = [...container.querySelectorAll<HTMLElement>("section[aria-label]")];
    expect(secoes.map((s) => s.getAttribute("aria-label"))).toEqual(["Atrasados", "Hoje", "Próximos"]);

    const [atrasados, hoje, proximos] = secoes;
    expect(texto(atrasados.querySelector("h2"))).toBe("Atrasados1");
    expect(atrasados.querySelector("h2")!.className).toContain("text-mt-accent-800");

    const linha = quemAbre(atrasados, "l1")!;
    expect(texto(linha)).toContain("2 d");
    expect(texto(linha)).toContain("→ Cobrar retorno da proposta");
    expect(texto(linha)).toContain("Joana Atrasada · Renault Duster");
    expect(texto(linha)).toContain("Pediu a simulação.");
    expect(texto(linha)).toContain("Novo");
    expect(linha.className).toContain("border-l-mt-accent");

    expect(texto(quemAbre(hoje, "l2"))).toMatch(/^\d{2}:\d{2}→ Enviar proposta/);
    expect(texto(quemAbre(proximos, "l3"))).toContain("→ Confirmar visita");
    // Fechado não entra, mesmo com passo vencido.
    expect(texto()).not.toContain("Tina Fechada");
  });

  it("lead sem próximo passo fica fora dos grupos, e a linha discreta leva ao Quadro", async () => {
    await montarQuadro("Ana");
    expect(quemAbre(container, "l4")).toBeNull();
    const linha = botao(/^1 lead sem próximo passo/)!;
    expect(linha).toBeDefined();

    await clicar(linha);

    expect(pressionado("Quadro")).toBe("true");
    expect(cardDe(container, "l4")).not.toBeNull();
    expect(rota.replace).toHaveBeenLastCalledWith("/admin/leads?vista=quadro", { scroll: false });
  });

  it("o chip Hoje deixa só o grupo de hoje", async () => {
    await montarQuadro("Ana");
    await clicar(botao(/^Hoje/));
    expect([...container.querySelectorAll("section[aria-label]")].map((s) => s.getAttribute("aria-label"))).toEqual(["Hoje"]);
  });

  it("vazia, diz o que fazer: com o texto de quem tem Equipe, e o de quem não tem", async () => {
    servidor = [leadDeTeste("l4", "Saulo Sem Passo", { responsavel: "Bruno" })];
    await montarQuadro("Ana");
    expect(texto()).toContain("Nada por aqui. Limpe a busca ou troque para Equipe.");

    await act(async () => root.unmount());
    container.remove();
    escopo = "meus";
    await montarQuadro("Ana");
    expect(texto()).toContain("Nada por aqui. Limpe a busca.");
    expect(texto()).not.toContain("troque para Equipe");
  });

  it("clicar numa linha abre a gaveta e marca a linha", async () => {
    await montarQuadro("Ana");
    await clicar(quemAbre(container, "l1"));
    expect(gaveta()!.getAttribute("aria-label")).toBe("Detalhe do lead Joana Atrasada");
    expect(quemAbre(container, "l1")!.className).toContain("border-l-mt-ink");
    expect(rota.replace).toHaveBeenLastCalledWith("/admin/leads?vista=lista&lead=l1", { scroll: false });

    await teclar("Escape");
    expect(gaveta()).toBeNull();
    expect(document.activeElement).toBe(quemAbre(container, "l1"));
  });
});

describe("o detalhe: um componente, dois layouts", () => {
  it("na gaveta, uma coluna na ordem h p c t d, com o nome em h2", async () => {
    await montarQuadro("Ana");
    await clicar(cardDe(container, "l1"));
    const g = gaveta()!;

    expect(blocos(g)).toEqual(["h", "p", "c", "t", "d"]);
    expect(g.querySelector("[data-blocos]")!.className).toBe("flex flex-col");
    expect(g.querySelector("h2")!.textContent).toBe("Joana Atrasada");
    expect(g.querySelector("h1")).toBeNull();
    expect([...g.querySelectorAll("h3")].map((h) => h.textContent)).toEqual([
      "Próximo passo",
      "Registrar interação",
      "Histórico",
      "Dados do negócio",
    ]);
    // A gaveta: 600px, à direita, com rolagem própria e a única sombra da tela.
    for (const classe of ["fixed", "right-0", "w-[600px]", "overflow-y-auto", "border-l-2", "border-mt-ink", "shadow-[var(--mt-shadow-lg)]"]) {
      expect(g.className, classe).toContain(classe);
    }
    expect(botao("FECHAR ✕", g)).toBeDefined();
  });

  it("na página, os mesmos blocos se reposicionam por grid-template-areas, com o nome em h1", async () => {
    await montarPagina("l1");
    const pagina = container.querySelector<HTMLElement>('[data-layout="pagina"]')!;

    expect(blocos(pagina)).toEqual(["h", "p", "c", "t", "d"]);
    const grade = pagina.querySelector("[data-blocos]")!.className;
    expect(grade).toContain("xl:grid-cols-[320px_minmax(0,1fr)_320px]");
    expect(grade).toContain("xl:[grid-template-areas:'h_h_h'_'d_c_p'_'d_t_p']");
    for (const b of ["h", "p", "c", "t", "d"]) {
      expect(pagina.querySelector(`[data-bloco="${b}"]`)!.className, b).toContain(`xl:[grid-area:${b}]`);
    }
    expect(pagina.querySelector("h1")!.textContent).toBe("Joana Atrasada");
    expect([...pagina.querySelectorAll("h2")].map((h) => h.textContent)).toContain("Histórico");
    // Não é diálogo, e não tem FECHAR.
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(botao("FECHAR ✕")).toBeUndefined();
  });

  it("a página tem a volta para o quadro e os vizinhos da coluna, e põe o nome na trilha", async () => {
    await montarPagina("l1");
    const links = [...container.querySelectorAll<HTMLAnchorElement>("nav a")].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["← voltar para o quadro", "/admin/leads"],
      ["próximo lead da coluna →", "/admin/leads/l4"],
    ]);
    expect(lerNomeNaTrilha()).toBe("Joana Atrasada");

    await act(async () => root.unmount());
    expect(lerNomeNaTrilha(), "ao sair da página o nome sai da trilha").toBeNull();
    root = createRoot(container);
  });

  it("lead fora do escopo ou inexistente: a página diz, em vez de ficar carregando", async () => {
    forcar["GET /api/leads/l1"] = { status: 404, corpo: { error: "Lead não encontrado" } };
    await montarPagina("l1");
    expect(container.querySelector('[role="alert"]')!.textContent).toBe("Lead não encontrado");
    expect(texto()).not.toContain("Carregando");
  });

  it("o cabeçalho traz a etapa, o canal, o tempo no funil e o aviso de parado", async () => {
    await montarPagina("l1");
    const h = container.querySelector('[data-bloco="h"]')!;
    expect(texto(h)).toContain("Novo · site · 3 d no funil");
    expect(texto(h)).toMatch(/vai passar para outro vendedor há|parado há/);
    expect(texto(h)).toContain("Renault Duster");
  });
});

describe("o cabeçalho do detalhe: etapa, responsável e desfecho", () => {
  it("o segmentado de etapas move o lead, e o card do quadro acompanha", async () => {
    await montarQuadro("Ana");
    await clicar(cardDe(container, "l4"));
    const etapas = grupo("Etapa de Saulo Sem Passo", gaveta()!)!;
    expect(pressionado("Novo", etapas)).toBe("true");

    await clicar(botao("Proposta", etapas));

    expect(chamadas.filter((c) => c.metodo === "PATCH").map((c) => c.corpo)).toEqual([{ id: "l4", situacao: "proposta" }]);
    expect(pressionado("Proposta", grupo("Etapa de Saulo Sem Passo", gaveta()!)!)).toBe("true");
    // O card mudou de coluna: agora a seta de voltar está habilitada.
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Voltar Saulo Sem Passo uma etapa"]')!.disabled).toBe(false);
  });

  it("Perdido pede o motivo antes de gravar, e Esc fecha a caixa de motivos, não a gaveta", async () => {
    await montarQuadro("Ana");
    await clicar(cardDe(container, "l4"));
    await clicar(gaveta()!.querySelector('[aria-label="Marcar Saulo Sem Passo como Perdido"]'));

    const caixa = document.querySelector('[role="dialog"][aria-modal="true"]')!;
    expect(caixa, "a caixa de motivos precisa abrir").not.toBeNull();
    expect(chamadas.filter((c) => c.metodo === "PATCH")).toHaveLength(0);

    await teclar("Escape");
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
    expect(gaveta(), "o Esc da caixa não fecha a gaveta").not.toBeNull();

    // Com o motivo, grava; o lead sai do quadro e entra nos Fechados.
    await clicar(gaveta()!.querySelector('[aria-label="Marcar Saulo Sem Passo como Perdido"]'));
    await clicar(botao("Preço", document.querySelector('[aria-modal="true"]')!));
    await clicar(botao("Marcar como perdido", document.querySelector('[aria-modal="true"]')!));

    expect(chamadas.filter((c) => c.metodo === "PATCH").at(-1)!.corpo).toMatchObject({
      id: "l4",
      situacao: "perdido",
      desfecho_motivo: "preco",
    });
    expect(cardDe(container, "l4")).toBeNull();
    expect(botao(/^Fechados \(2\)$/)).toBeDefined();
  });

  it("quem não é Administrador não tem a opção 'Sem responsável'", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
      const r = await (original as (u: string, o?: RequestInit) => Promise<{ ok: boolean; status: number; json: () => Promise<Record<string, unknown>> }>)(url, opcoes);
      if (leadDaUrl(String(url)) && !opcoes?.method) {
        const corpo = await r.json();
        return { ...r, json: async () => ({ ...corpo, podeRemoverResponsavel: false }) };
      }
      return r;
    }) as never;
    await montarPagina("l1");
    const select = container.querySelector<HTMLSelectElement>('[aria-label="Responsável por Joana Atrasada"]')!;
    expect([...select.options].map((o) => o.value)).toEqual(["Ana", "Bruno"]);
  });

  it("o Administrador tem, e trocar o responsável grava pelo PATCH de sempre", async () => {
    await montarPagina("l1");
    const select = container.querySelector<HTMLSelectElement>('[aria-label="Responsável por Joana Atrasada"]')!;
    expect([...select.options].map((o) => o.value)).toEqual(["", "Ana", "Bruno"]);

    await mudar(select, "Bruno");
    await assentar();
    expect(chamadas.find((c) => c.metodo === "PATCH")!.corpo).toEqual({ id: "l1", responsavel: "Bruno" });
  });
});

describe("registrar interação", () => {
  const registrar = (raiz: ParentNode = container) => botao("REGISTRAR →", raiz)!;
  const dica = (raiz: ParentNode = container) => texto(raiz.querySelector('[data-bloco="c"] p[aria-live]'));
  const campoDoTexto = (raiz: ParentNode = container) => raiz.querySelector<HTMLTextAreaElement>('[data-bloco="c"] textarea')!;
  const campoDoPasso = (raiz: ParentNode = container) =>
    raiz.querySelector<HTMLInputElement>('[data-bloco="c"] input[type="text"]')!;

  it("o botão nasce desabilitado, e a dica muda a cada passo do preenchimento", async () => {
    await montarPagina("l1");
    expect(pressionado("Anotação")).toBe("true");
    expect(registrar().disabled).toBe(true);
    expect(dica()).toBe("Escreva o que aconteceu.");
    expect(campoDoTexto().placeholder).toBe("O que foi combinado…");
    expect(texto(container.querySelector('[data-bloco="c"] legend'))).toBe("Próximo passo · obrigatório");

    await mudar(campoDoTexto(), "Falei com ela, quer a proposta por escrito.");
    expect(registrar().disabled).toBe(true);
    expect(dica()).toBe("Falta o próximo passo: toque numa sugestão ou escreva.");

    await mudar(campoDoPasso(), "Enviar proposta");
    expect(registrar().disabled).toBe(true);
    expect(dica()).toBe("Falta o dia e a hora do próximo passo.");

    await clicar(botao("Amanhã", grupo("Dia do próximo passo")!));
    expect(registrar().disabled).toBe(false);
    expect(dica()).toBe("O card passa a mostrar “Enviar proposta” · Amanhã 10:00.");
  });

  it("Ligação: os chips de resultado aparecem, e o texto vira opcional", async () => {
    await montarPagina("l1");
    await clicar(botao("Ligação"));
    expect(dica()).toBe("Marque se atendeu.");
    expect(campoDoTexto().placeholder).toBe("Opcional: o que ficou combinado?");
    const resultado = grupo("Resultado da ligação")!;
    expect([...resultado.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Atendeu", "Não atendeu", "Caixa postal"]);

    await clicar(botao("Não atendeu", resultado));
    expect(dica()).toBe("Falta o próximo passo: toque numa sugestão ou escreva.");

    // As outras duas trocam o placeholder; o resultado some fora da ligação.
    await clicar(botao("WhatsApp", grupo("Tipo de registro")!));
    expect(campoDoTexto().placeholder).toBe("Resumo da conversa no WhatsApp…");
    expect(grupo("Resultado da ligação")).toBeNull();
    await clicar(botao("Visita à loja"));
    expect(campoDoTexto().placeholder).toBe("Veio à loja? Viu qual carro? Fez test drive?");
  });

  it("as duas sugestões da etapa preenchem o passo, o dia e a hora, e somem quando o passo está escrito", async () => {
    await montarPagina("l1");
    const sugestoes = [...container.querySelectorAll<HTMLButtonElement>('[data-bloco="c"] fieldset button')].filter((b) =>
      (b.textContent ?? "").startsWith("+ "),
    );
    expect(sugestoes.map((b) => b.textContent)).toEqual([
      "+ Primeiro contato pelo WhatsApp · hoje +15 min",
      "+ Ligar para qualificar · hoje +1 h",
    ]);

    await clicar(sugestoes[1]);
    expect(campoDoPasso().value).toBe("Ligar para qualificar");
    expect(container.querySelector<HTMLInputElement>('[data-bloco="c"] input[type="time"]')!.value).toMatch(/^\d{2}:\d{2}$/);
    expect(texto(container.querySelector('[data-bloco="c"]'))).not.toContain("+ Primeiro contato");
  });

  it("registrar manda o corpo que a rota espera, põe o registro no topo do histórico e atualiza o card", async () => {
    await montarQuadro("Ana");
    // Antes: o card está parado e atrasado.
    expect(texto(cardDe(container, "l1"))).toMatch(/vai passar para outro vendedor há|parado há/);
    expect(texto(cardDe(container, "l1"))).toContain("ATRASADO");
    await clicar(cardDe(container, "l1"));
    const g = gaveta()!;

    await mudar(campoDoTexto(g), "Falei com ela, quer a proposta por escrito.");
    await mudar(campoDoPasso(g), "Enviar proposta");
    await clicar(botao("Amanhã", grupo("Dia do próximo passo", g)!));
    await clicar(registrar(g));

    const amanha = instanteNoFusoDaLoja(diaNaLoja(Date.now(), 1), "10:00");
    expect(posts("interacoes").map((c) => c.corpo)).toEqual([
      {
        tipo: "nota",
        texto: "Falei com ela, quer a proposta por escrito.",
        proximo_passo: "Enviar proposta",
        proximo_passo_vence_em: amanha,
      },
    ]);

    // O histórico ganhou o registro, no topo.
    const itens = [...gaveta()!.querySelectorAll('[data-bloco="t"] li')];
    expect(texto(itens[0])).toContain("Falei com ela, quer a proposta por escrito.");
    expect(texto(itens[0])).toContain("→ Próximo passo: Enviar proposta");
    expect(itens).toHaveLength(4);
    // O bloco do próximo passo mostra o novo.
    expect(texto(gaveta()!.querySelector('[data-bloco="p"]'))).toContain("Enviar proposta");
    expect(texto(gaveta()!.querySelector('[data-bloco="p"]'))).toContain("AMANHÃ · 10:00");
    // O formulário voltou ao começo.
    expect(campoDoTexto(gaveta()!).value).toBe("");
    expect(registrar(gaveta()!).disabled).toBe(true);

    // E o card do quadro: última interação, próximo passo, e o relógio reiniciado.
    const card = texto(cardDe(container, "l1"));
    expect(card).toContain("ANOTAÇÃO · AGORA");
    expect(card).toContain("Falei com ela, quer a proposta por escrito.");
    expect(card).toContain("→ AMANHÃ · 10:00");
    expect(card).toContain("Enviar proposta");
    expect(card).not.toContain("ATRASADO");
    expect(card).not.toMatch(/vai passar para outro vendedor há|parado há|esfriando há/);
    // Sem reler a fila: quem atualizou o card foi a resposta do registro.
    expect(chamadas.filter((c) => c.metodo === "GET" && c.url === "/api/leads/gerenciar")).toHaveLength(1);
  });

  it("registro recusado: a faixa de erro aparece, o lead é relido, e o que foi escrito fica", async () => {
    forcar["POST /api/leads/l1/interacoes"] = { status: 400, corpo: { error: "O banco recusou o registro.", codigo: null } };
    await montarQuadro("Ana");
    await clicar(cardDe(container, "l1"));
    const leituras = () => chamadas.filter((c) => c.metodo === "GET" && c.url === "/api/leads/l1").length;
    const antes = leituras();
    const antesDaFila = chamadas.filter((c) => c.metodo === "GET" && c.url === "/api/leads/gerenciar").length;

    await mudar(campoDoTexto(gaveta()!), "Falei com ela.");
    await mudar(campoDoPasso(gaveta()!), "Enviar proposta");
    await clicar(botao("Amanhã", grupo("Dia do próximo passo", gaveta()!)!));
    await clicar(registrar(gaveta()!));

    const faixa = gaveta()!.querySelector('[role="alert"]')!;
    expect(faixa.textContent).toBe("O banco recusou o registro.");
    expect(faixa.className).toContain("border-l-[3px]");
    expect(faixa.className).toContain("bg-mt-accent-100");
    expect(leituras()).toBe(antes + 1);
    expect(chamadas.filter((c) => c.metodo === "GET" && c.url === "/api/leads/gerenciar")).toHaveLength(antesDaFila + 1);
    expect(campoDoTexto(gaveta()!).value).toBe("Falei com ela.");
    // A gaveta continua aberta: reler a fila não desmonta a tela.
    expect(gaveta()).not.toBeNull();
  });

  it("CONCLUIR abre o registro com 'Feito: ...' e o passo vazio; Remarcar, com o mesmo passo", async () => {
    await montarPagina("l1");
    await clicar(botao("CONCLUIR"));
    expect(campoDoTexto().value).toBe("Feito: Cobrar retorno da proposta. ");
    expect(campoDoPasso().value).toBe("");
    expect(document.activeElement).toBe(campoDoTexto());

    await clicar(botao("Remarcar"));
    expect(campoDoTexto().value).toBe("Remarcado: ");
    expect(campoDoPasso().value).toBe("Cobrar retorno da proposta");
    expect(dica()).toBe("Falta o dia e a hora do próximo passo.");
  });

  it("LIGAR é um link tel: e pré-seleciona Ligação; a conversa pré-seleciona WhatsApp e registra o contato", async () => {
    await montarPagina("l1");
    const ligar = [...container.querySelectorAll<HTMLAnchorElement>("a")].find((a) => a.textContent === "LIGAR")!;
    expect(ligar.getAttribute("href")).toBe("tel:+5541991176299");
    ligar.addEventListener("click", (e) => e.preventDefault());
    await clicar(ligar);
    expect(pressionado("Ligação")).toBe("true");

    const conversa = [...container.querySelectorAll<HTMLAnchorElement>("a")].find((a) => (a.textContent ?? "").startsWith("WhatsApp"))!;
    expect(conversa.textContent).toContain("(41) 99117-6299");
    conversa.addEventListener("click", (e) => e.preventDefault());
    await clicar(conversa);
    expect(pressionado("WhatsApp", grupo("Tipo de registro")!)).toBe("true");
    expect(chamadas.find((c) => c.metodo === "PATCH")!.corpo).toEqual({ id: "l1", contato: "whatsapp" });
  });

  it("lead fechado: o próximo passo é opcional e não há sugestões", async () => {
    await montarPagina("l5");
    expect(texto(container.querySelector('[data-bloco="c"] legend'))).toBe("Próximo passo · opcional");
    await mudar(campoDoTexto(), "Cliente voltou a escrever.");
    expect(registrar().disabled).toBe(false);
    expect(dica()).toBe("Pronto para registrar.");
  });
});

describe("o histórico", () => {
  it("filtra em Tudo, Interações e Sistema, com as contagens", async () => {
    await montarPagina("l1");
    const filtros = grupo("Filtrar o histórico")!;
    expect([...filtros.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Tudo (3)", "Interações (1)", "Sistema (2)"]);
    const itens = () => [...container.querySelectorAll<HTMLElement>('[data-bloco="t"] li')];
    expect(itens()).toHaveLength(3);

    await clicar(botao("Interações (1)", filtros));
    expect(itens().map((i) => i.dataset.origem)).toEqual(["humana"]);
    expect(texto(itens()[0])).toContain("Pediu a simulação.");

    await clicar(botao("Sistema (2)", filtros));
    expect(itens().map((i) => i.dataset.origem)).toEqual(["sistema", "sistema"]);
  });
});

describe("'Chegou na loja'", () => {
  const chegou = (raiz: ParentNode = container) => botao("CHEGOU NA LOJA", raiz)!;
  const NADA_DE_AVISO = /avisad|notificad|foi avisad|WhatsApp enviad/i;
  /** O rótulo da etapa de visita, como o funil o tem. */
  const VISITA = ETAPAS.find((e) => e.chave === "visita")!.rotulo;

  it("registra a visita, move o lead e diz o que aconteceu, sem prometer aviso a ninguém", async () => {
    await montarQuadro("Ana");
    await clicar(cardDe(container, "l1"));
    await clicar(chegou(gaveta()!));

    expect(posts("chegou")).toHaveLength(1);
    const status = gaveta()!.querySelector('[role="status"]')!;
    expect(status.textContent).toContain(`Chegada registrada. O lead foi para ${VISITA},`);
    expect(status.textContent).not.toMatch(NADA_DE_AVISO);
    expect(texto(gaveta())).not.toMatch(NADA_DE_AVISO);
    // O detalhe releu: a etapa nova e o movimento que o banco anotou.
    expect(pressionado(VISITA, grupo("Etapa de Joana Atrasada", gaveta()!)!)).toBe("true");
    expect(texto(gaveta()!.querySelector('[data-bloco="t"]'))).toContain("Movido de Novo para Visita agendada.");
    // E o card: o passo "Atender na loja", agora.
    const card = texto(cardDe(container, "l1"));
    expect(card).toContain("→ AGORA");
    expect(card).toContain("Atender na loja");
    expect(card).toContain("VISITA À LOJA · AGORA");
  });

  it("quem já estava na visita não muda de coluna, e a tela diz isso", async () => {
    umLead("l1").situacao = "visita";
    await montarPagina("l1");
    await clicar(chegou());

    const status = container.querySelector('[role="status"]')!;
    expect(status.textContent).toContain("continua onde está");
    expect(status.textContent).not.toMatch(NADA_DE_AVISO);
  });

  it("lead fechado (409): mensagem simples, sem faixa de erro", async () => {
    forcar["POST /api/leads/l5/chegou"] = {
      status: 409,
      corpo: { error: "O lead tem desfecho.", codigo: "lead_fechado" },
    };
    await montarPagina("l5");
    await clicar(chegou());

    expect(container.querySelector('[role="status"]')!.textContent).toContain("Este lead já foi fechado.");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("a visita gravou e o movimento não (500): a faixa de erro diz, e o lead é relido", async () => {
    forcar["POST /api/leads/l1/chegou"] = {
      status: 500,
      corpo: { error: "A visita foi registrada, mas o lead não mudou de etapa.", codigo: "movimento_falhou" },
    };
    await montarPagina("l1");
    const antes = chamadas.filter((c) => c.metodo === "GET" && c.url === "/api/leads/l1").length;
    await clicar(chegou());

    expect(container.querySelector('[role="alert"]')!.textContent).toBe("A visita foi registrada, mas o lead não mudou de etapa.");
    expect(chamadas.filter((c) => c.metodo === "GET" && c.url === "/api/leads/l1")).toHaveLength(antes + 1);
  });
});

describe("os dados do negócio", () => {
  it("mostra só o que está preenchido; o resto fica atrás de '+ adicionar dado'", async () => {
    Object.assign(umLead("l1"), { carro_na_troca: "Gol 2015", ag_uid: null });
    await montarPagina("l1");
    const d = container.querySelector<HTMLElement>('[data-bloco="d"]')!;
    expect(texto(d)).toContain("(41) 99117-6299");
    expect(texto(d)).toContain("Carro na troca");
    expect(texto(d)).not.toContain("Faixa de entrada");
    expect(texto(d)).not.toContain("E-mail");

    await clicar(botao("+ adicionar dado", d));
    for (const campo of ["E-mail", "Carro de interesse", "Faixa de entrada", "Forma de pagamento pretendida"]) {
      expect(texto(d), campo).toContain(campo);
    }
    expect([...grupo("Forma de pagamento pretendida", d)!.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "À vista",
      "Financiado",
      "Com troca",
      "Consórcio",
    ]);
  });

  it("grava pelo PATCH dos dados: a lista na escolha, o texto ao sair do campo", async () => {
    await montarPagina("l1");
    const d = container.querySelector<HTMLElement>('[data-bloco="d"]')!;
    await clicar(botao("+ adicionar dado", d));

    await clicar(botao("Financiado", d));
    const troca = [...d.querySelectorAll<HTMLInputElement>("label")].find((l) => texto(l).startsWith("Carro na troca"))!.querySelector("input")!;
    await mudar(troca, "Gol 2015");
    await act(async () => {
      troca.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    await assentar();

    const gravacoes = chamadas.filter((c) => c.metodo === "PATCH" && c.url === "/api/leads/l1/dados").map((c) => c.corpo);
    expect(gravacoes).toEqual([{ pagamento_pretendido: "financiado" }, { carro_na_troca: "Gol 2015" }]);
    expect(pressionado("Financiado", d)).toBe("true");
  });
});

describe("nada nas telas promete um aviso de WhatsApp que não existe", () => {
  // A rota de "Chegou na loja" responde `responsavel_avisado: false`: o aviso
  // ao responsável ainda não existe (docs/GESTAO_DO_LEAD.md §5). O desenho
  // previa "{responsável} avisado no WhatsApp"; a tela não pode dizer isso.
  const raiz = join(__dirname, "..", "src");
  const telas = [
    ...["CardDoLead", "ControlesDoFunil", "DetalheDoLead", "FechadosDoFunil", "LeadsKanban", "ListaDoDia", "SegmentadoDoPainel"].map(
      (n) => join(raiz, "components", "admin", `${n}.tsx`),
    ),
    ...readdirSync(join(raiz, "components", "admin", "lead")).map((n) => join(raiz, "components", "admin", "lead", n)),
    join(raiz, "lib", "filaDoFunil.ts"),
  ];

  it("a varredura lê as telas de verdade", () => {
    expect(telas.length).toBeGreaterThanOrEqual(13);
    for (const arquivo of telas) expect(readFileSync(arquivo, "utf8").length, arquivo).toBeGreaterThan(200);
  });

  it("nenhum texto diz que alguém foi avisado ou notificado", () => {
    const semComentarios = (fonte: string) =>
      fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    for (const arquivo of telas) {
      const codigo = semComentarios(readFileSync(arquivo, "utf8"));
      expect(codigo, arquivo).not.toMatch(/avisad[oa]s?\s+(no|pelo|por)\s+WhatsApp/i);
      expect(codigo, arquivo).not.toMatch(/(foi|será|é)\s+(avisad|notificad)/i);
      expect(codigo, arquivo).not.toContain("responsavel_avisado");
      // E nenhuma mensagem manda recarregar: a recarga leva à Visão geral.
      expect(codigo, arquivo).not.toMatch(/Recarregue|e recarregue/);
    }
  });

  it("o bloco do próximo passo não promete o aviso de vencimento, que é da Fase 4", async () => {
    await montarPagina("l1");
    const p = texto(container.querySelector('[data-bloco="p"]'));
    expect(p).toContain("É o que aparece no card e na Lista do dia.");
    expect(p).not.toMatch(/dispara|aviso/i);
  });
});
