// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ETAPAS_PADRAO } from "../src/lib/funil";
import { diaNaLoja, instanteNoFusoDaLoja, sugestoesDeProximoPasso } from "../src/lib/gestaoDoLead";
import { diaNoCalendarioDaLoja } from "../src/lib/filaDoFunil";
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
  urlDaTela,
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

const SUGESTOES_VELHAS = [
  { texto: "Sugestão velha da leitura", quando: "hoje 08:00", vence_em: new Date(AGORA - 6 * 3_600_000).toISOString() },
];

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
          // De propósito, as sugestões da leitura estão VELHAS e são de outra
          // etapa: a tela tem de calcular as dela, na hora em que desenha a caixa.
          sugestoes: SUGESTOES_VELHAS,
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
        // Um id por registro: dois registros seguidos no mesmo teste repetiriam a chave do React.
        id: `interacao:nova-${(historico[lead.id] ?? []).length}`,
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
    expect(urlDaTela()).toBe("/admin/leads?escopo=minha");
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
    expect(urlDaTela()).toBe("/admin/leads?vista=quadro");
  });

  it("o chip Hoje deixa só o grupo de hoje", async () => {
    await montarQuadro("Ana");
    await clicar(botao(/^Hoje/));
    expect([...container.querySelectorAll("section[aria-label]")].map((s) => s.getAttribute("aria-label"))).toEqual(["Hoje"]);
  });

  it("vazia e sem busca: diz que falta marcar o próximo passo, e não manda limpar busca nenhuma", async () => {
    servidor = [leadDeTeste("l4", "Saulo Sem Passo", { responsavel: "Bruno" })];
    await montarQuadro("Ana");
    expect(texto()).toContain("Nenhum próximo passo marcado. Abra um lead no Quadro e registre o primeiro.");
    expect(texto()).not.toContain("Limpe a busca");
  });

  it("vazia com busca ativa: manda limpar a busca, com a variante de quem tem Equipe", async () => {
    servidor = [leadDeTeste("l4", "Saulo Sem Passo", { responsavel: "Bruno" })];
    const original = globalThis.fetch as (u: string, o?: RequestInit) => Promise<{ ok: boolean; status: number; json: () => Promise<Record<string, unknown>> }>;
    globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
      const r = await original(url, opcoes);
      if (!String(url).includes("?busca=")) return r;
      const corpo = await r.json();
      return { ...r, json: async () => ({ ...corpo, busca: { termo: "Saulo", tipo: "nome" } }) };
    }) as never;
    const buscar = async () => {
      const campo = container.querySelector<HTMLInputElement>("#busca-de-leads")!;
      await mudar(campo, "Saulo");
      await act(async () => {
        campo.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      await assentar();
    };

    await montarQuadro("Ana");
    await buscar();
    expect(texto()).toContain("Nada por aqui. Limpe a busca ou troque para Equipe.");

    await act(async () => root.unmount());
    container.remove();
    escopo = "meus";
    await montarQuadro("Ana");
    await buscar();
    expect(texto()).toContain("Nada por aqui. Limpe a busca.");
    expect(texto()).not.toContain("troque para Equipe");
  });

  it("clicar numa linha abre a gaveta e marca a linha", async () => {
    await montarQuadro("Ana");
    await clicar(quemAbre(container, "l1"));
    expect(gaveta()!.getAttribute("aria-label")).toBe("Detalhe do lead Joana Atrasada");
    expect(quemAbre(container, "l1")!.className).toContain("border-l-mt-ink");
    expect(urlDaTela()).toBe("/admin/leads?vista=lista&lead=l1");

    await teclar("Escape");
    expect(gaveta()).toBeNull();
    expect(document.activeElement).toBe(quemAbre(container, "l1"));
  });
});

describe("o detalhe: um componente, dois layouts", () => {
  it("na gaveta, uma coluna na ordem h p v c t d (os carros logo depois do próximo passo), com o nome em h2", async () => {
    await montarQuadro("Ana");
    await clicar(cardDe(container, "l1"));
    const g = gaveta()!;

    expect(blocos(g)).toEqual(["h", "p", "v", "c", "t", "d"]);
    expect(g.querySelector("[data-blocos]")!.className).toBe("flex flex-col");
    expect(g.querySelector("h2")!.textContent).toBe("Joana Atrasada");
    expect(g.querySelector("h1")).toBeNull();
    expect([...g.querySelectorAll("h3")].map((h) => h.textContent)).toEqual([
      "Próximo passo",
      "Carro de interesse",
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

    // Os carros de interesse ficam no alto da coluna dos dados.
    expect(blocos(pagina)).toEqual(["h", "p", "c", "t", "v", "d"]);
    const grade = pagina.querySelector("[data-blocos]")!.className;
    expect(grade).toContain("xl:grid-cols-[320px_minmax(0,1fr)_320px]");
    expect(grade).toContain("xl:[grid-template-areas:'h_h_h'_'d_c_p'_'d_t_p']");
    for (const b of ["h", "p", "c", "t"]) {
      expect(pagina.querySelector(`[data-bloco="${b}"]`)!.className, b).toContain(`xl:[grid-area:${b}]`);
    }
    const colunaDosDados = pagina.querySelector<HTMLElement>('[data-coluna="d"]')!;
    expect(colunaDosDados.className).toContain("xl:[grid-area:d]");
    expect(blocos(colunaDosDados)).toEqual(["v", "d"]);
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
    // O passo é opcional desde 2026-10-09, com o lead aberto também.
    expect(texto(container.querySelector('[data-bloco="c"] legend'))).toBe("Próximo passo · opcional");

    // Só o que aconteceu já registra: a nota de atendimento não pede passo.
    await mudar(campoDoTexto(), "Falei com ela, quer a proposta por escrito.");
    expect(registrar().disabled).toBe(false);
    expect(dica()).toBe("Pronto para registrar.");

    // Começou um passo? Aí ele vem inteiro.
    await mudar(campoDoPasso(), "Enviar proposta");
    expect(registrar().disabled).toBe(true);
    expect(dica()).toBe("Falta o dia e a hora do próximo passo, ou apague o passo.");

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
    expect(dica()).toBe("Pronto para registrar.");
    expect(registrar().disabled).toBe(false);

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
    expect(texto()).not.toContain("Sugestão velha da leitura");

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
    // Sem passo novo, registra e tira o passo feito do card.
    expect(registrar().disabled).toBe(false);
    expect(dica()).toBe("Pronto para registrar. O passo concluído sai do card.");

    await clicar(botao("Remarcar"));
    expect(campoDoTexto().value).toBe("Remarcado: ");
    expect(campoDoPasso().value).toBe("Cobrar retorno da proposta");
    expect(dica()).toBe("Falta o dia e a hora do próximo passo, ou apague o passo.");
  });

  it("CONCLUIR sem passo novo manda o carimbo do passo feito; a nota comum, não", async () => {
    await montarPagina("l1");
    const carimbo = (umLead("l1") as Record<string, unknown>).proximo_passo_definido_em;
    expect(carimbo).toBeTruthy();
    await clicar(botao("CONCLUIR"));
    await clicar(registrar());
    await assentar();
    const concluir = chamadas.filter((c) => c.metodo === "POST" && c.url === "/api/leads/l1/interacoes").at(-1)!;
    expect(concluir.corpo).toMatchObject({ tipo: "nota", texto: "Feito: Cobrar retorno da proposta.", passo_concluido: carimbo });
    expect(concluir.corpo).not.toHaveProperty("proximo_passo_vence_em");

    await mudar(campoDoTexto(), "Mandei as fotos do carro.");
    await clicar(registrar());
    await assentar();
    const nota = chamadas.filter((c) => c.metodo === "POST" && c.url === "/api/leads/l1/interacoes").at(-1)!;
    expect(nota.corpo).toMatchObject({ tipo: "nota", texto: "Mandei as fotos do carro." });
    expect(nota.corpo).not.toHaveProperty("passo_concluido");
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
    for (const campo of ["E-mail", "Faixa de entrada", "Forma de pagamento pretendida"]) {
      expect(texto(d), campo).toContain(campo);
    }
    // O carro de interesse saiu dos dados: tem bloco próprio (05/10/2026).
    expect(texto(d)).not.toContain("Carro de interesse");
    expect(d.querySelector('input[name="codigo"]')).toBeNull();
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

describe("os filtros que voltaram: Parados, para todos; Sem responsável, para o Administrador", () => {
  beforeEach(() => {
    servidor.push(leadDeTeste("l6", "Ugo Sem Dono", { responsavel: null }));
  });

  it("o Administrador tem o chip 'Sem responsável (n)', e ele deixa só os sem dono no quadro", async () => {
    await montarQuadro("Ana");
    const chip = botao(/^Sem responsável \(1\)$/)!;
    expect(chip, "o Admin precisa do caminho até o lead sem dono").toBeDefined();
    expect(chip.getAttribute("aria-pressed")).toBe("false");

    await clicar(chip);

    expect(pressionado(/^Sem responsável/)).toBe("true");
    expect(cardDe(container, "l6")).not.toBeNull();
    for (const id of ["l1", "l2", "l3", "l4"]) expect(cardDe(container, id), id).toBeNull();

    await clicar(botao(/^Sem responsável/));
    expect(cardDe(container, "l1")).not.toBeNull();
  });

  it("ligado na Lista do dia, leva ao Quadro: lead sem dono não tem próximo passo", async () => {
    rota.query = "vista=lista";
    await montarQuadro("Ana");
    expect(pressionado("Lista do dia")).toBe("true");

    await clicar(botao(/^Sem responsável/));

    expect(pressionado("Quadro")).toBe("true");
    expect(urlDaTela()).toBe("/admin/leads?vista=quadro");
    expect(cardDe(container, "l6")).not.toBeNull();
    // Voltar para a Lista desliga o filtro, em vez de deixar a tela vazia.
    await clicar(botao("Lista do dia"));
    expect(pressionado(/^Sem responsável/)).toBe("false");
    expect(quemAbre(container, "l1")).not.toBeNull();
  });

  it("Gestor, SDR e vendedor não têm o chip: o servidor nem entrega lead sem dono a eles", async () => {
    for (const quem of ["designados", "meus"]) {
      escopo = quem;
      rota.query = "vista=quadro";
      await montarQuadro("Ana");
      expect(botao(/^Sem responsável/), quem).toBeUndefined();
      // "Parados" é de todos.
      expect(botao(/^Parados \(\d+\)$/), quem).toBeDefined();
      await act(async () => root.unmount());
      container.remove();
    }
    await montarQuadro("Ana");
  });

  it("'Parados (n)' conta e deixa só quem a régua já cobra, depois de Atrasados e Hoje", async () => {
    await montarQuadro("Ana");
    const chips = [...container.querySelectorAll("button[aria-pressed]")].map((b) => (b.textContent ?? "").replace(/ \(\d+\)$/, ""));
    expect(chips.slice(chips.indexOf("Atrasados"), chips.indexOf("Atrasados") + 3)).toEqual(["Atrasados", "Hoje", "Parados"]);
    // Três dias em "novo", que cobra em 15 minutos: só a Joana está parada.
    await clicar(botao(/^Parados \(1\)$/));

    expect(pressionado(/^Parados/)).toBe("true");
    expect(cardDe(container, "l1")).not.toBeNull();
    for (const id of ["l2", "l3", "l4", "l6"]) expect(cardDe(container, id), id).toBeNull();
  });

  it("os dois filtros somam com os chips de data, e a busca os desliga", async () => {
    await montarQuadro("Ana");
    await clicar(botao(/^Parados/));
    await clicar(botao(/^Hoje/));
    expect(container.querySelectorAll("[data-lead]")).toHaveLength(0);

    const campo = container.querySelector<HTMLInputElement>("#busca-de-leads")!;
    await mudar(campo, "Pedro");
    expect(pressionado(/^Parados/)).toBe("false");
    expect(pressionado(/^Hoje/)).toBe("false");
  });
});

describe("as sugestões de próximo passo saem da etapa e da hora em que a caixa é desenhada", () => {
  const sugestoes = (raiz: ParentNode) =>
    [...raiz.querySelectorAll<HTMLButtonElement>('[data-bloco="c"] fieldset button')]
      .map((b) => b.textContent ?? "")
      .filter((t) => t.startsWith("+ "));

  it("não usa as da leitura do lead, que já estão velhas", async () => {
    await montarPagina("l4");
    expect(sugestoes(container)).toEqual(
      sugestoesDeProximoPasso("novo", Date.now()).map((s) => `+ ${s.texto} · ${s.quando}`),
    );
    expect(texto()).not.toContain("Sugestão velha da leitura");
  });

  it("mover de etapa troca as sugestões, mesmo com a releitura trazendo as velhas", async () => {
    await montarQuadro("Ana");
    await clicar(cardDe(container, "l4"));
    expect(sugestoes(gaveta()!)[0]).toContain("Primeiro contato pelo WhatsApp");

    await clicar(botao("Proposta", grupo("Etapa de Saulo Sem Passo", gaveta()!)!));

    expect(sugestoes(gaveta()!).map((t) => t.replace(/ · .*$/, ""))).toEqual([
      "+ Cobrar retorno da proposta",
      "+ Enviar simulação de financiamento",
    ]);
  });

  it("'hoje +15 min' conta a partir do toque", async () => {
    await montarPagina("l4");
    const antes = Date.now();
    await clicar([...container.querySelectorAll<HTMLButtonElement>('[data-bloco="c"] fieldset button')].find((b) => (b.textContent ?? "").includes("+15 min")));
    const hora = container.querySelector<HTMLInputElement>('[data-bloco="c"] input[type="time"]')!.value;
    const dia = container.querySelector<HTMLInputElement>('[data-bloco="c"] input[type="date"]')!.value;
    const vence = new Date(instanteNoFusoDaLoja(dia, hora)!).getTime();
    // O campo guarda minutos: o instante cai entre 14 e 15 minutos depois do toque.
    expect(vence).toBeGreaterThan(antes + 13.9 * 60_000);
    expect(vence).toBeLessThanOrEqual(Date.now() + 15 * 60_000);
  });
});

describe("registro começado não se perde ao fechar a gaveta", () => {
  const campoDoTexto = () => gaveta()!.querySelector<HTMLTextAreaElement>('[data-bloco="c"] textarea')!;
  const pergunta = () => gaveta()?.querySelector<HTMLElement>("[data-descarte]") ?? null;
  const fechar = () => botao("FECHAR ✕", gaveta()!)!;

  async function abrirEEscrever() {
    await montarQuadro("Ana");
    await clicar(cardDe(container, "l1"));
    await mudar(campoDoTexto(), "Falei com ela, quer a proposta");
  }

  it("Esc não fecha a gaveta com algo escrito", async () => {
    await abrirEEscrever();
    await teclar("Escape");
    expect(gaveta(), "uma tecla não pode apagar o que foi escrito").not.toBeNull();
    expect(campoDoTexto().value).toBe("Falei com ela, quer a proposta");
    expect(urlDaTela()).toBe("/admin/leads?lead=l1");
  });

  it("FECHAR pergunta na própria gaveta, sem a caixa do navegador; continuar mantém o texto", async () => {
    const confirmar = vi.fn(() => true);
    (window as unknown as { confirm: unknown }).confirm = confirmar;
    await abrirEEscrever();
    expect(pergunta()).toBeNull();

    await clicar(fechar());

    expect(texto(pergunta())).toContain("Há um registro não salvo. Descartar?");
    expect([...pergunta()!.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Descartar", "Continuar escrevendo"]);
    expect(gaveta()).not.toBeNull();
    expect(confirmar).not.toHaveBeenCalled();

    await clicar(botao("Continuar escrevendo", pergunta()!));
    expect(pergunta()).toBeNull();
    expect(gaveta()).not.toBeNull();
    expect(campoDoTexto().value).toBe("Falei com ela, quer a proposta");
    expect(document.activeElement).toBe(campoDoTexto());
  });

  it("FECHAR e Descartar fecha, e o foco volta ao card", async () => {
    await abrirEEscrever();
    await clicar(fechar());
    await clicar(botao("Descartar", pergunta()!));
    expect(gaveta()).toBeNull();
    expect(document.activeElement).toBe(quemAbre(container, "l1"));
    // E a gaveta seguinte abre limpa, sem pergunta pendente.
    await clicar(cardDe(container, "l2"));
    expect(gaveta()!.getAttribute("aria-label")).toBe("Detalhe do lead Pedro de Hoje");
    expect(pergunta()).toBeNull();
  });

  it("clicar em outro card pergunta antes de trocar; Continuar fica, Descartar troca", async () => {
    await abrirEEscrever();
    await clicar(cardDe(container, "l2"));

    expect(gaveta()!.getAttribute("aria-label"), "a gaveta não troca sem perguntar").toBe("Detalhe do lead Joana Atrasada");
    expect(texto(pergunta())).toContain("Há um registro não salvo. Descartar?");

    await clicar(botao("Continuar escrevendo", pergunta()!));
    expect(pergunta()).toBeNull();
    expect(campoDoTexto().value).toBe("Falei com ela, quer a proposta");

    await clicar(cardDe(container, "l2"));
    await clicar(botao("Descartar", pergunta()!));
    expect(gaveta()!.getAttribute("aria-label")).toBe("Detalhe do lead Pedro de Hoje");
    expect(urlDaTela()).toBe("/admin/leads?lead=l2");
    expect(campoDoTexto().value).toBe("");
  });

  it("sem nada escrito, nada disso pergunta: Esc fecha, e outro card troca na hora", async () => {
    await montarQuadro("Ana");
    await clicar(cardDe(container, "l1"));
    // LIGAR só pré-seleciona o tipo: não é registro começado.
    const ligar = [...gaveta()!.querySelectorAll<HTMLAnchorElement>("a")].find((a) => a.textContent === "LIGAR")!;
    ligar.addEventListener("click", (e) => e.preventDefault());
    await clicar(ligar);
    await clicar(cardDe(container, "l2"));
    expect(gaveta()!.getAttribute("aria-label")).toBe("Detalhe do lead Pedro de Hoje");
    await teclar("Escape");
    expect(gaveta()).toBeNull();
  });

  it("registrar limpa o rascunho: depois de gravar, Esc volta a fechar", async () => {
    await abrirEEscrever();
    await mudar(gaveta()!.querySelector<HTMLInputElement>('[data-bloco="c"] input[type="text"]')!, "Enviar proposta");
    await clicar(botao("Amanhã", grupo("Dia do próximo passo", gaveta()!)!));
    await clicar(botao("REGISTRAR →", gaveta()!));
    expect(posts("interacoes")).toHaveLength(1);

    await teclar("Escape");
    expect(gaveta()).toBeNull();
  });

  it("com uma caixa modal aberta por cima (a de motivos do quadro), o Esc é dela e a gaveta fica", async () => {
    // A caixa de motivos do QUADRO só abre por arrasto até uma etapa terminal,
    // que o quadro não desenha; aqui ela é representada por um elemento com
    // `aria-modal`, que é o que a gaveta consulta antes de fechar.
    await montarQuadro("Ana");
    await clicar(cardDe(container, "l1"));
    const caixa = document.createElement("div");
    caixa.setAttribute("role", "dialog");
    caixa.setAttribute("aria-modal", "true");
    document.body.appendChild(caixa);

    await teclar("Escape");
    expect(gaveta(), "o Esc da caixa modal não fecha a gaveta").not.toBeNull();

    caixa.remove();
    await teclar("Escape");
    expect(gaveta()).toBeNull();
  });
});

describe("a URL é escrita sem ida ao servidor, e o voltar do navegador vale", () => {
  it("abrir, trocar de vista e de escopo não chamam o roteador nem releem a fila", async () => {
    await montarQuadro("Ana");
    const filas = () => chamadas.filter((c) => c.url === "/api/leads/gerenciar").length;
    const antes = filas();

    await clicar(cardDe(container, "l1"));
    await clicar(botao("Lista do dia"));
    await clicar(botao(/^Minha fila/));

    expect(urlDaTela()).toBe("/admin/leads?vista=lista&escopo=minha&lead=l1");
    expect(rota.replace).not.toHaveBeenCalled();
    expect(rota.push).not.toHaveBeenCalled();
    expect(filas()).toBe(antes);
  });

  it("não cria entrada no histórico: é replaceState, e não pushState", async () => {
    await montarQuadro("Ana");
    const antes = window.history.length;
    await clicar(cardDe(container, "l1"));
    await clicar(cardDe(container, "l2"));
    expect(window.history.length).toBe(antes);
  });

  it("popstate: a tela adota o que a barra de endereços passou a mostrar", async () => {
    await montarQuadro("Ana");
    await clicar(cardDe(container, "l1"));
    expect(gaveta()!.getAttribute("aria-label")).toBe("Detalhe do lead Joana Atrasada");

    // O navegador voltou para uma entrada com outro lead e outra vista.
    await act(async () => {
      window.history.replaceState(null, "", "/admin/leads?vista=lista&lead=l2");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await assentar();
    expect(gaveta()!.getAttribute("aria-label")).toBe("Detalhe do lead Pedro de Hoje");
    expect(pressionado("Lista do dia")).toBe("true");

    await act(async () => {
      window.history.replaceState(null, "", "/admin/leads");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await assentar();
    expect(gaveta()).toBeNull();
    expect(pressionado("Quadro")).toBe("true");
  });
});

describe("a gaveta abaixo da barra de topo, o lead que saiu da fila e a data dos fechados", () => {
  it("a gaveta começa a 64px do topo: 'VER O SITE' continua à vista", async () => {
    await montarQuadro("Ana");
    await clicar(cardDe(container, "l1"));
    const classes = gaveta()!.className.split(" ");
    expect(classes).toContain("top-16");
    expect(classes).not.toContain("top-0");
  });

  it("a releitura respondeu 404 (o vendedor passou o lead adiante): a gaveta fecha, a fila é relida e a tela diz", async () => {
    await montarQuadro("Ana");
    await clicar(cardDe(container, "l1"));
    const filas = () => chamadas.filter((c) => c.metodo === "GET" && c.url === "/api/leads/gerenciar").length;
    const antes = filas();
    // Depois da passagem, o lead não é mais dele: a rota do detalhe responde 404.
    forcar["GET /api/leads/l1"] = { status: 404, corpo: { error: "Lead não encontrado" } };

    await mudar(gaveta()!.querySelector<HTMLSelectElement>('[aria-label="Responsável por Joana Atrasada"]')!, "Bruno");
    await assentar();

    expect(chamadas.find((c) => c.metodo === "PATCH")!.corpo).toEqual({ id: "l1", responsavel: "Bruno" });
    expect(gaveta(), "a gaveta não fica aberta num lead que não é mais dele").toBeNull();
    expect(urlDaTela()).toBe("/admin/leads");
    expect(filas()).toBe(antes + 1);
    const status = container.querySelector('[role="status"]')!;
    expect(status.textContent).toContain("Este lead saiu da sua fila.");
    // É aviso, e não erro.
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("404 já na primeira leitura não é 'saiu da fila': a gaveta diz que não achou", async () => {
    forcar["GET /api/leads/l1"] = { status: 404, corpo: { error: "Lead não encontrado" } };
    await montarQuadro("Ana");
    await clicar(cardDe(container, "l1"));
    expect(gaveta()!.querySelector('[role="alert"]')!.textContent).toBe("Lead não encontrado");
    expect(texto()).not.toContain("Este lead saiu da sua fila.");
  });

  it("a data do desfecho, na lista de Fechados, é a do calendário de São Paulo", async () => {
    // 01:30 UTC de 04/10 ainda é 03/10 na loja.
    Object.assign(umLead("l5"), { desfecho_em: "2026-10-04T01:30:00.000Z" });
    await montarQuadro("Ana");
    await clicar(botao(/^Fechados/));
    const linha = [...container.querySelectorAll("tbody tr")].find((tr) => texto(tr).includes("Tina Fechada"))!;
    expect(texto(linha)).toContain("03/10/2026");
    expect(texto(linha)).toContain(diaNoCalendarioDaLoja("2026-10-04T01:30:00.000Z"));
    expect(texto(linha)).not.toContain("04/10/2026");
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
