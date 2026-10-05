// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ETAPAS_PADRAO } from "../src/lib/funil";
import {
  linhaDaOpcao,
  opcoesDoDetalhe,
  precoDeAntes,
  preverMudanca,
  resumoDoInteresseEmTexto,
} from "../src/lib/carrosDeInteresseNaTela";
import {
  MOTIVOS_DE_DESCARTE,
  ROTULO_DO_MOTIVO_DE_DESCARTE,
  type RelatorioDoVeiculo,
  type VeiculoDeInteresse,
} from "../src/lib/veiculosDeInteresse";
import { lerCodigo } from "./fonte";
import { assentar, clicar, definirLargura, detalheDeTeste, leadDeTeste, mudar, zerarRota } from "./quadroDeLeadsDeTeste";

/**
 * As telas dos veículos de interesse (pedido do dono em 05/10/2026): o bloco
 * "Carros de interesse" do detalhe do lead, a busca do carro, a caixa de
 * resolução depois do desfecho e o relatório "Interesse e objeções" do carro.
 *
 * O servidor é de mentira e GUARDA o que gravou, no contrato de
 * `docs/GESTAO_DO_LEAD.md`, seção 7. O detalhe, os blocos e as libs são os de
 * verdade.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));
vi.mock("next/navigation", async () => (await import("./quadroDeLeadsDeTeste")).navegacaoDeTeste);

// ── o servidor de mentira ────────────────────────────────────────────────
const ESTOQUE = [
  { id: 101, rotulo: "Chevrolet Onix LT 1.0 2020", ano: 2020, km: 45000, preco: 59900, placa_final: "1D23", vendido: false, publicado: true },
  { id: 102, rotulo: "Chevrolet Onix Plus Premier 2022", ano: 2022, km: 30000, preco: 84900, vendido: false, publicado: true },
  { id: 103, rotulo: "Chevrolet Onix Joy 2019", ano: 2019, km: 80000, preco: 49900, placa_final: "9Z88", vendido: true, publicado: true },
  { id: 104, rotulo: "Jeep Renegade Sport 2021", ano: 2021, km: 52000, preco: 92900, vendido: false, publicado: true },
];

const opcao = (id: string | null, veiculoId: number, extra: Partial<VeiculoDeInteresse> = {}): VeiculoDeInteresse => {
  const carro = ESTOQUE.find((c) => c.id === veiculoId)!;
  return {
    id,
    veiculo_id: veiculoId,
    rotulo: carro.rotulo,
    preco_na_epoca: carro.preco,
    preco_atual: carro.preco,
    km: carro.km,
    no_estoque: true,
    vendido: carro.vendido,
    situacao: "em_avaliacao",
    motivo_descarte: null,
    motivo_rotulo: null,
    nota: null,
    adicionado_por: "Ana",
    criado_em: new Date().toISOString(),
    resolvido_por: null,
    resolvido_em: null,
    principal: false,
    ...extra,
  };
};

let lead: Record<string, unknown>;
let opcoes: VeiculoDeInteresse[];
let disponivel: boolean;
let admin: boolean;
let relatorio: unknown;
let chamadas: Array<{ metodo: string; url: string; corpo?: unknown }>;
/** Respostas forçadas, por "MÉTODO caminho". */
let forcar: Record<string, { status: number; corpo: unknown }>;
let proximaOpcao: number;

const ETAPAS = ETAPAS_PADRAO;
const MOTIVOS = [
  { chave: "preco", rotulo: "Preço", tipo: "perdido", ativo: true, ordem: 1, escopo: "ambos" },
  { chave: "a_vista", rotulo: "Pagou à vista", tipo: "ganho", ativo: true, ordem: 1, escopo: "ambos" },
];

const pendentes = () =>
  opcoes.filter((o) => o.id && o.situacao === "em_avaliacao").map((o) => ({ opcao: o.id!, veiculo_id: o.veiculo_id, rotulo: o.rotulo }));
const principalDoLead = () => opcoes.find((o) => o.principal)?.veiculo_id ?? null;
const bloco = () => ({ ok: true, veiculos: opcoes, principal_veiculo_id: principalDoLead(), pendencias_de_veiculo: pendentes() });

function aplicarNoServidor(id: string, corpo: Record<string, unknown>) {
  opcoes = opcoes.map((o) => {
    if (o.id !== id) {
      return corpo.situacao === "escolhido"
        ? { ...o, principal: false, situacao: o.situacao === "escolhido" ? "em_avaliacao" : o.situacao }
        : corpo.principal
          ? { ...o, principal: false }
          : o;
    }
    const situacao = (corpo.situacao as VeiculoDeInteresse["situacao"] | undefined) ?? o.situacao;
    const motivo = situacao === "descartado" ? ((corpo.motivo_descarte as string | undefined) ?? o.motivo_descarte) : null;
    return {
      ...o,
      situacao,
      motivo_descarte: motivo,
      motivo_rotulo: motivo ? ROTULO_DO_MOTIVO_DE_DESCARTE[motivo as keyof typeof ROTULO_DO_MOTIVO_DE_DESCARTE] : null,
      nota: "nota" in corpo ? (corpo.nota as string | null) : o.nota,
      principal: situacao === "escolhido" || corpo.principal === true ? true : o.principal,
    };
  });
}

function dublarFetch() {
  globalThis.fetch = (async (entrada: string, opcoesDoPedido?: RequestInit) => {
    const url = String(entrada);
    const metodo = opcoesDoPedido?.method ?? "GET";
    const corpo = opcoesDoPedido?.body ? JSON.parse(String(opcoesDoPedido.body)) : undefined;
    chamadas.push({ metodo, url, corpo });
    const responder = (status: number, c: unknown) => ({ ok: status < 400, status, json: async () => c });
    const forcada = forcar[`${metodo} ${url}`];
    if (forcada) return responder(forcada.status, forcada.corpo);

    if (url.startsWith("/api/estoque/busca?q=")) {
      const q = decodeURIComponent(url.split("q=")[1]).toLowerCase();
      return responder(200, { veiculos: ESTOQUE.filter((c) => c.rotulo.toLowerCase().includes(q)), termos: [q] });
    }
    if (/^\/api\/estoque\/\d+\/interesse$/.test(url)) return responder(200, relatorio);

    if (url === "/api/leads/l1" && metodo === "GET") {
      const principal = ESTOQUE.find((c) => c.id === lead.veiculo_id) ?? null;
      return responder(
        200,
        detalheDeTeste(lead, {
          etapas: ETAPAS,
          motivos: MOTIVOS,
          podeRemoverResponsavel: admin,
          veiculo: principal ? { id: principal.id, nome: principal.rotulo, km: principal.km, preco: principal.preco, vendido: principal.vendido } : null,
          veiculos: disponivel ? opcoes : opcoes.slice(0, 1).map((o) => ({ ...o, id: null })),
          veiculos_disponivel: disponivel,
          pendencias_de_veiculo: disponivel ? pendentes() : [],
        }),
      );
    }
    if (url === "/api/leads/l1/veiculos" && metodo === "POST") {
      const existente = opcoes.find((o) => o.veiculo_id === corpo.veiculo_id);
      if (existente && !existente.id) existente.id = `op-${proximaOpcao++}`;
      const id = existente?.id ?? `op-${proximaOpcao++}`;
      if (!existente) opcoes = [...opcoes, opcao(id, corpo.veiculo_id, { principal: opcoes.length === 0 })];
      return responder(200, { ...bloco(), criada: !existente, opcao: id });
    }
    if (url === "/api/leads/l1/veiculos/resolver" && metodo === "POST") {
      for (const item of corpo as Array<Record<string, unknown>>) aplicarNoServidor(String(item.opcao), item);
      return responder(200, { ...bloco(), resolvidas: corpo.length });
    }
    const daOpcao = /^\/api\/leads\/l1\/veiculos\/([^/]+)$/.exec(url);
    if (daOpcao && metodo === "PATCH") {
      aplicarNoServidor(daOpcao[1], corpo);
      return responder(200, { ...bloco(), opcao: daOpcao[1] });
    }
    if (daOpcao && metodo === "DELETE") {
      opcoes = opcoes.filter((o) => o.id !== daOpcao[1]);
      return responder(200, { ...bloco(), apagada: daOpcao[1] });
    }
    if (url === "/api/leads/l1/dados") {
      Object.assign(lead, corpo);
      if ("veiculo_id" in corpo) opcoes = corpo.veiculo_id === null ? [] : [opcao(null, corpo.veiculo_id, { principal: true })];
      return responder(200, { ok: true, dados: { id: "l1", ...corpo } });
    }
    if (url === "/api/leads/gerenciar" && metodo === "PATCH") {
      const tipo = ETAPAS.find((e) => e.chave === corpo.situacao)?.tipo;
      Object.assign(lead, { situacao: corpo.situacao, desfecho: tipo === "aberta" ? null : tipo });
      // Ganho com um carro só, ainda em avaliação: o servidor o escolhe.
      const unica = opcoes.length === 1 && opcoes[0].id && opcoes[0].situacao === "em_avaliacao" ? opcoes[0].id : null;
      if (tipo === "ganho" && unica) aplicarNoServidor(unica, { situacao: "escolhido" });
      const sobram = pendentes();
      return responder(200, { ok: true, ...(sobram.length > 0 ? { pendencias_de_veiculo: sobram } : {}) });
    }
    return responder(404, { error: `rota não dublada: ${metodo} ${url}` });
  }) as never;
}

let container: HTMLDivElement;
let root: Root;

async function montarDetalhe() {
  const { default: DetalheDoLead } = await import("../src/components/admin/DetalheDoLead");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(DetalheDoLead, { key: "l1", id: "l1", layout: "pagina" }));
  });
  await assentar();
}

async function montarRelatorio(veiculoId = 101) {
  const { default: InteresseDoVeiculo } = await import("../src/components/admin/InteresseDoVeiculo");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(InteresseDoVeiculo, { veiculoId }));
  });
  await assentar();
}

beforeEach(() => {
  lead = leadDeTeste("l1", "Joana Compradora", { responsavel: "Ana", veiculo_id: 101, interesse: "Chevrolet Onix LT 1.0 2020" });
  opcoes = [opcao("op-1", 101, { principal: true })];
  disponivel = true;
  admin = false;
  relatorio = null;
  chamadas = [];
  forcar = {};
  proximaOpcao = 2;
  zerarRota();
  definirLargura(true);
  dublarFetch();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const texto = (raiz: Element | null = container) => (raiz?.textContent ?? "").replace(/ /g, " ");
const carros = () => container.querySelector<HTMLElement>('[data-bloco="v"]')!;
const linha = (veiculoId: number) => carros().querySelector<HTMLElement>(`[data-carro="${veiculoId}"]`)!;
const botao = (rotulo: string | RegExp, raiz: ParentNode = container) =>
  [...raiz.querySelectorAll<HTMLButtonElement>("button")].find((b) => {
    const t = (b.textContent ?? "").trim();
    return typeof rotulo === "string" ? t === rotulo : rotulo.test(t);
  });
const campoDaBusca = () => carros().querySelector<HTMLInputElement>('input[role="combobox"]');
const achados = () => [...carros().querySelectorAll<HTMLElement>('[role="option"]')];
const escritas = () => chamadas.filter((c) => c.metodo !== "GET");
const buscas = () => chamadas.filter((c) => c.url.startsWith("/api/estoque/busca"));

/** Deixa a espera de 250 ms da busca vencer, e a resposta assentar. */
async function esperarABusca() {
  await act(async () => {
    await new Promise((pronto) => setTimeout(pronto, 300));
  });
  await assentar();
}

async function teclarNo(el: Element, tecla: string) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: tecla, bubbles: true, cancelable: true }));
  });
  await assentar(2);
}

async function fecharComo(desfecho: "Perdido" | "Ganho") {
  await clicar(container.querySelector(`[aria-label="Marcar Joana Compradora como ${desfecho}"]`));
  const caixa = document.querySelector('[aria-modal="true"]')!;
  await clicar(botao(desfecho === "Perdido" ? "Preço" : "Pagou à vista", caixa));
  await clicar(botao(desfecho === "Perdido" ? "Marcar como perdido" : "Marcar como ganho", caixa));
}

// ─────────────────────────────────────────────────────────────────────────────

describe("o bloco 'Carros de interesse' lista as opções do lead", () => {
  it("cada linha traz o nome, a linha do estoque, a situação, o motivo, a nota e a marca de principal", async () => {
    opcoes = [
      opcao("op-1", 101, { principal: true, preco_na_epoca: 62900 }),
      opcao("op-2", 102, { situacao: "descartado", motivo_descarte: "preco", motivo_rotulo: "Preço acima do que queria", nota: "queria 5 mil a menos" }),
      opcao("op-3", 103),
      opcao("op-4", 104, { no_estoque: false, km: null, preco_atual: null, vendido: null }),
    ];
    await montarDetalhe();

    expect(carros().querySelector("h2")!.textContent).toBe("Carros de interesse");
    expect(texto(linha(101))).toContain("Chevrolet Onix LT 1.0 2020");
    expect(texto(linha(101))).toContain("Estoque · 45.000 km · R$ 59.900 · era R$ 62.900");
    expect(texto(linha(101))).toContain("Principal");
    expect(texto(linha(101))).toContain("Em avaliação");

    expect(texto(linha(102))).not.toContain("Principal");
    expect(texto(linha(102))).not.toContain("era R$");
    expect(texto(linha(102))).toContain("Descartado");
    expect(texto(linha(102))).toContain("Preço acima do que queria");
    expect(texto(linha(102))).toContain("Nota: queria 5 mil a menos");

    expect(texto(linha(103))).toContain("Vendido · 80.000 km");
    expect(texto(linha(104))).toContain("Fora do estoque");
  });

  it("as ações de cada linha seguem a situação: em avaliação escolhe ou descarta, resolvida reabre", async () => {
    opcoes = [opcao("op-1", 101, { principal: true }), opcao("op-2", 102), opcao("op-3", 104, { situacao: "descartado", motivo_descarte: "cor", motivo_rotulo: "Cor" })];
    await montarDetalhe();
    const rotulos = (id: number) => [...linha(id).querySelectorAll("button")].map((b) => b.textContent);

    expect(rotulos(101)).toEqual(["Escolher", "Descartar"]);
    expect(rotulos(102)).toEqual(["Escolher", "Descartar", "Tornar principal"]);
    // Carro descartado não vira principal.
    expect(rotulos(104)).toEqual(["Reabrir"]);

    await clicar(botao("Escolher", linha(102)));
    expect(escritas().at(-1)).toMatchObject({ metodo: "PATCH", url: "/api/leads/l1/veiculos/op-2", corpo: { situacao: "escolhido" } });
    expect(texto(linha(102))).toContain("Escolhido");
    expect(texto(linha(102))).toContain("Principal");
    expect(texto(linha(101))).not.toContain("Principal");
    // Com um carro escolhido, ninguém mais vira principal.
    expect(botao("Tornar principal", carros())).toBeUndefined();

    await clicar(botao("Reabrir", linha(102)));
    expect(escritas().at(-1)).toMatchObject({ url: "/api/leads/l1/veiculos/op-2", corpo: { situacao: "em_avaliacao" } });
    await clicar(botao("Tornar principal", linha(101)));
    expect(escritas().at(-1)).toMatchObject({ url: "/api/leads/l1/veiculos/op-1", corpo: { principal: true } });
  });

  it("a opção sem linha no banco (id nulo) é criada como principal antes do gesto", async () => {
    opcoes = [opcao(null, 101, { principal: true, preco_na_epoca: null })];
    await montarDetalhe();
    await clicar(botao("Escolher", linha(101)));

    expect(escritas().map((c) => [c.metodo, c.url, c.corpo])).toEqual([
      ["POST", "/api/leads/l1/veiculos", { veiculo_id: 101, principal: true }],
      ["PATCH", "/api/leads/l1/veiculos/op-2", { situacao: "escolhido" }],
    ]);
    expect(texto(linha(101))).toContain("Escolhido");
  });

  it("gravação recusada: a lista volta ao que o servidor tem e a faixa de erro diz por quê", async () => {
    opcoes = [opcao("op-1", 101, { principal: true }), opcao("op-2", 102)];
    forcar["PATCH /api/leads/l1/veiculos/op-2"] = {
      status: 409,
      corpo: { error: "O lead já tem um carro escolhido. Reabra o escolhido antes de escolher outro.", codigo: "ja_ha_escolhido" },
    };
    await montarDetalhe();
    await clicar(botao("Escolher", linha(102)));

    expect(texto(container.querySelector('[role="alert"]'))).toContain("O lead já tem um carro escolhido.");
    expect(texto(linha(102))).toContain("Em avaliação");
    expect(texto(linha(101))).toContain("Principal");
    // Releu o lead depois da falha.
    expect(chamadas.filter((c) => c.metodo === "GET" && c.url === "/api/leads/l1")).toHaveLength(2);
  });
});

describe("a busca do carro: escolher buscando, sem digitar código", () => {
  it("é um combobox: o campo, a dica do mínimo, a espera de 250 ms e a contagem em região viva", async () => {
    await montarDetalhe();
    expect(campoDaBusca()).toBeNull();
    await clicar(botao("+ Adicionar carro", carros()));

    const campo = campoDaBusca()!;
    expect(document.activeElement).toBe(campo);
    expect(campo.placeholder).toBe("Buscar por modelo, placa ou código");
    expect(campo.getAttribute("aria-expanded")).toBe("false");
    expect(campo.getAttribute("aria-autocomplete")).toBe("list");
    const lista = carros().querySelector<HTMLElement>(`#${CSS.escape(campo.getAttribute("aria-controls")!)}`)!;
    expect(lista.getAttribute("role")).toBe("listbox");
    const dica = carros().querySelector<HTMLElement>('[data-busca-de-carro] [role="status"]')!;
    expect(dica.textContent).toBe("Digite pelo menos 2 letras ou números.");

    // Uma letra não busca.
    await mudar(campo, "o");
    await esperarABusca();
    expect(buscas()).toHaveLength(0);

    // Duas teclas seguidas: uma busca só, com o texto final.
    await mudar(campo, "on");
    await mudar(campo, "onix");
    expect(buscas()).toHaveLength(0);
    expect(dica.textContent).toBe("Buscando…");
    await esperarABusca();
    expect(buscas().map((c) => c.url)).toEqual(["/api/estoque/busca?q=onix"]);

    expect(campo.getAttribute("aria-expanded")).toBe("true");
    expect(dica.textContent).toBe("3 carros encontrados.");
    expect(achados().map((o) => o.parentElement)).toEqual([lista, lista, lista]);
  });

  it("cada carro mostra nome, ano, km, preço, final da placa e 'Vendido'; o que já está no lead vem desabilitado", async () => {
    await montarDetalhe();
    await clicar(botao("+ Adicionar carro", carros()));
    await mudar(campoDaBusca()!, "onix");
    await esperarABusca();

    const [jaNoLead, plus, vendido] = achados();
    expect(texto(jaNoLead)).toContain("Chevrolet Onix LT 1.0 2020");
    expect(texto(jaNoLead)).toContain("2020 · 45.000 km · R$ 59.900 · placa final 1D23 · já está na lista");
    expect(jaNoLead.getAttribute("aria-disabled")).toBe("true");
    expect(plus.getAttribute("aria-disabled")).toBeNull();
    expect(texto(plus)).toContain("2022 · 30.000 km · R$ 84.900");
    expect(texto(plus)).not.toContain("placa");
    expect(texto(vendido)).toContain("Vendido");
    expect(texto(plus)).not.toContain("Vendido");

    // Tocar no carro que já está na lista não grava nada, e a busca continua aberta.
    await clicar(jaNoLead);
    expect(escritas()).toHaveLength(0);
    expect(campoDaBusca()).not.toBeNull();
  });

  it("setas e Enter escolhem pelo teclado, pulando o carro desabilitado; o carro entra na lista", async () => {
    await montarDetalhe();
    await clicar(botao("+ Adicionar carro", carros()));
    const campo = campoDaBusca()!;
    await mudar(campo, "onix");
    await esperarABusca();

    // Enter sem carro marcado não escolhe nada.
    await teclarNo(campo, "Enter");
    expect(escritas()).toHaveLength(0);

    await teclarNo(campo, "ArrowDown");
    const [, plus, vendido] = achados();
    expect(campo.getAttribute("aria-activedescendant")).toBe(plus.id);
    expect(plus.getAttribute("aria-selected")).toBe("true");
    await teclarNo(campo, "ArrowDown");
    expect(campo.getAttribute("aria-activedescendant")).toBe(vendido.id);
    // Do último, a seta volta ao primeiro que dá para escolher.
    await teclarNo(campo, "ArrowDown");
    expect(campo.getAttribute("aria-activedescendant")).toBe(plus.id);
    await teclarNo(campo, "ArrowUp");
    expect(campo.getAttribute("aria-activedescendant")).toBe(vendido.id);
    await teclarNo(campo, "ArrowUp");

    await teclarNo(campo, "Enter");
    expect(escritas().map((c) => [c.metodo, c.url, c.corpo])).toEqual([["POST", "/api/leads/l1/veiculos", { veiculo_id: 102 }]]);
    expect(texto(linha(102))).toContain("Chevrolet Onix Plus Premier 2022");
    expect(texto(linha(102))).toContain("Em avaliação");
    // A busca fechou e o foco voltou a quem a abriu.
    expect(campoDaBusca()).toBeNull();
    expect(document.activeElement).toBe(botao("+ Adicionar carro", carros()));
  });

  it("Esc fecha a busca e devolve o foco, sem gravar", async () => {
    await montarDetalhe();
    await clicar(botao("+ Adicionar carro", carros()));
    await mudar(campoDaBusca()!, "onix");
    await esperarABusca();
    await teclarNo(campoDaBusca()!, "Escape");

    expect(campoDaBusca()).toBeNull();
    expect(document.activeElement).toBe(botao("+ Adicionar carro", carros()));
    expect(escritas()).toHaveLength(0);
  });

  it("busca sem resultado diz 'Nenhum carro encontrado.'; busca que falha mostra a faixa de erro e tenta de novo", async () => {
    await montarDetalhe();
    await clicar(botao("+ Adicionar carro", carros()));
    const campo = campoDaBusca()!;
    const dica = carros().querySelector<HTMLElement>('[data-busca-de-carro] [role="status"]')!;

    await mudar(campo, "fusca");
    await esperarABusca();
    expect(dica.textContent).toBe("Nenhum carro encontrado.");
    expect(campo.getAttribute("aria-expanded")).toBe("false");
    expect(achados()).toHaveLength(0);

    forcar["GET /api/estoque/busca?q=jeep"] = { status: 500, corpo: { error: "O estoque não respondeu." } };
    await mudar(campo, "jeep");
    await esperarABusca();
    const faixa = carros().querySelector<HTMLElement>('[data-busca-de-carro] [role="alert"]')!;
    expect(texto(faixa)).toContain("O estoque não respondeu.");
    expect(faixa.className).toContain("border-l-[3px]");
    expect(faixa.className).toContain("bg-mt-accent-100");

    delete forcar["GET /api/estoque/busca?q=jeep"];
    await clicar(botao("Tentar de novo", faixa));
    await esperarABusca();
    expect(carros().querySelector('[data-busca-de-carro] [role="alert"]')).toBeNull();
    expect(dica.textContent).toBe("1 carro encontrado.");
  });
});

describe("descartar um carro: na própria linha, com motivo", () => {
  it("abre sem modal, com os 13 motivos em chips, e o foco vai ao primeiro", async () => {
    await montarDetalhe();
    await clicar(botao("Descartar", linha(101)));

    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
    const caixa = linha(101).querySelector<HTMLElement>("[data-descarte]")!;
    const chips = [...caixa.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Motivo do descarte"] button')];
    expect(chips.map((c) => c.textContent)).toEqual(MOTIVOS_DE_DESCARTE.map((m) => ROTULO_DO_MOTIVO_DE_DESCARTE[m]));
    expect(chips).toHaveLength(13);
    expect(chips.every((c) => c.getAttribute("aria-pressed") === "false")).toBe(true);
    expect(document.activeElement).toBe(chips[0]);
    expect(botao("Descartar", linha(101))!.getAttribute("aria-expanded")).toBe("true");
  });

  it("sem motivo não confirma; 'Outro' só confirma com a nota escrita", async () => {
    await montarDetalhe();
    await clicar(botao("Descartar", linha(101)));
    const caixa = linha(101).querySelector<HTMLElement>("[data-descarte]")!;
    const confirmar = () => botao("Confirmar", caixa)!;
    const dica = () => texto(caixa.querySelector('[role="status"]'));

    expect(confirmar().disabled).toBe(true);
    expect(dica()).toBe("Escolha o motivo.");

    await clicar(botao("Cor", caixa));
    expect(botao("Cor", caixa)!.getAttribute("aria-pressed")).toBe("true");
    expect(confirmar().disabled).toBe(false);
    expect(texto(caixa)).toContain("Nota (opcional)");

    await clicar(botao("Outro", caixa));
    expect(botao("Cor", caixa)!.getAttribute("aria-pressed")).toBe("false");
    expect(confirmar().disabled).toBe(true);
    expect(dica()).toBe('O motivo "Outro" pede a nota dizendo qual foi.');
    const nota = caixa.querySelector("textarea")!;
    expect(nota.required).toBe(true);
    expect(texto(caixa)).toContain("Nota (obrigatória)");

    await mudar(nota, "   ");
    expect(confirmar().disabled).toBe(true);
    await mudar(nota, "a esposa não gostou do porta-malas");
    expect(confirmar().disabled).toBe(false);

    await clicar(confirmar());
    expect(escritas().map((c) => [c.metodo, c.url, c.corpo])).toEqual([
      ["PATCH", "/api/leads/l1/veiculos/op-1", { situacao: "descartado", motivo_descarte: "outro", nota: "a esposa não gostou do porta-malas" }],
    ]);
    expect(linha(101).querySelector("[data-descarte]")).toBeNull();
    expect(texto(linha(101))).toContain("Descartado");
    expect(texto(linha(101))).toContain("Outro");
    expect(texto(linha(101))).toContain("Nota: a esposa não gostou do porta-malas");
    expect(botao("Reabrir", linha(101))).toBeDefined();
    // O botão "Descartar" deixou de existir: o foco fica na linha do carro.
    expect(document.activeElement).toBe(linha(101));
  });

  it("Cancelar e Esc fecham sem gravar, e o foco volta ao 'Descartar'", async () => {
    await montarDetalhe();
    await clicar(botao("Descartar", linha(101)));
    await clicar(botao("Cancelar", linha(101).querySelector<HTMLElement>("[data-descarte]")!));
    expect(linha(101).querySelector("[data-descarte]")).toBeNull();
    expect(document.activeElement).toBe(botao("Descartar", linha(101)));

    await clicar(botao("Descartar", linha(101)));
    await teclarNo(linha(101).querySelector("[data-descarte] button")!, "Escape");
    expect(linha(101).querySelector("[data-descarte]")).toBeNull();
    expect(document.activeElement).toBe(botao("Descartar", linha(101)));
    expect(escritas()).toHaveLength(0);
  });
});

describe("'Remover' é só do Administrador", () => {
  beforeEach(() => {
    opcoes = [opcao("op-1", 101, { principal: true }), opcao("op-2", 102)];
  });

  it("os outros perfis não têm o botão", async () => {
    await montarDetalhe();
    expect(botao("Remover", carros())).toBeUndefined();
    expect(botao("Descartar", linha(102))).toBeDefined();
  });

  it("o Administrador tem, e a confirmação é na linha, sem a caixa do navegador", async () => {
    admin = true;
    const confirmacao = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmacao);
    await montarDetalhe();

    await clicar(botao("Remover", linha(102)));
    expect(confirmacao).not.toHaveBeenCalled();
    expect(escritas()).toHaveLength(0);
    const caixa = linha(102).querySelector<HTMLElement>("[data-remocao]")!;
    expect(texto(caixa)).toContain("sai do relatório");

    await clicar(botao("Cancelar", caixa));
    expect(linha(102).querySelector("[data-remocao]")).toBeNull();
    expect(escritas()).toHaveLength(0);

    await clicar(botao("Remover", linha(102)));
    await clicar(botao("Remover do lead", linha(102)));
    expect(escritas().map((c) => [c.metodo, c.url])).toEqual([["DELETE", "/api/leads/l1/veiculos/op-2"]]);
    expect(carros().querySelector('[data-carro="102"]')).toBeNull();
    vi.unstubAllGlobals();
  });

  it("a opção sem linha no banco não tem o que remover, nem para o Administrador", async () => {
    admin = true;
    opcoes = [opcao(null, 101, { principal: true })];
    await montarDetalhe();
    expect(botao("Remover", carros())).toBeUndefined();
  });
});

describe("antes da migração (veiculos_disponivel: false): o carro único, escolhido pela busca", () => {
  beforeEach(() => {
    disponivel = false;
  });

  it("mostra o carro de sempre, sem situação, sem ações de várias opções e sem aviso", async () => {
    await montarDetalhe();

    expect(carros().querySelector("h2")!.textContent).toBe("Carro de interesse");
    expect(carros().querySelectorAll("[data-carro]")).toHaveLength(1);
    expect(texto(linha(101))).toContain("Chevrolet Onix LT 1.0 2020");
    expect(texto(linha(101))).toContain("Estoque · 45.000 km · R$ 59.900");
    for (const ausente of ["Em avaliação", "Principal", "Escolher", "Descartar", "Reabrir", "Tornar principal", "Remover", "+ Adicionar carro", "sem resolução"]) {
      expect(texto(carros()), ausente).not.toContain(ausente);
    }
    expect([...linha(101).querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Trocar", "Desvincular"]);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(texto()).not.toContain("ainda não está ativa");
  });

  it("'Trocar' abre a busca, e o carro escolhido grava pelo PATCH dos dados, não pelas rotas de veículos", async () => {
    await montarDetalhe();
    await clicar(botao("Trocar", linha(101)));
    await mudar(campoDaBusca()!, "jeep");
    await esperarABusca();
    await clicar(achados()[0]);

    expect(escritas().map((c) => [c.metodo, c.url, c.corpo])).toEqual([["PATCH", "/api/leads/l1/dados", { veiculo_id: 104 }]]);
    expect(carros().querySelectorAll("[data-carro]")).toHaveLength(1);
    expect(texto(linha(104))).toContain("Jeep Renegade Sport 2021");
  });

  it("lead sem carro: '+ Adicionar carro' abre a mesma busca; 'Desvincular' tira o carro", async () => {
    await montarDetalhe();
    await clicar(botao("Desvincular", linha(101)));
    expect(escritas().at(-1)).toMatchObject({ url: "/api/leads/l1/dados", corpo: { veiculo_id: null } });
    expect(carros().querySelectorAll("[data-carro]")).toHaveLength(0);

    await clicar(botao("+ Adicionar carro", carros()));
    await mudar(campoDaBusca()!, "renegade");
    await esperarABusca();
    await clicar(achados()[0]);
    expect(escritas().at(-1)).toMatchObject({ url: "/api/leads/l1/dados", corpo: { veiculo_id: 104 } });
  });

  it("fechar o lead não abre caixa de resolução nenhuma", async () => {
    await montarDetalhe();
    await fecharComo("Perdido");
    expect(texto()).not.toContain("Feche os carros deste atendimento");
    expect(texto()).not.toContain("sem resolução");
  });
});

describe("fechar o lead com carros em avaliação: 'Feche os carros deste atendimento'", () => {
  beforeEach(() => {
    opcoes = [opcao("op-1", 101, { principal: true }), opcao("op-2", 102), opcao("op-3", 104)];
  });
  const caixa = () => carros().querySelector<HTMLElement>("[data-resolucao]");
  const pendencia = (id: string) => caixa()!.querySelector<HTMLElement>(`[data-pendencia="${id}"]`)!;

  it("lead aberto não tem caixa nem linha de pendência", async () => {
    await montarDetalhe();
    expect(caixa()).toBeNull();
    expect(texto(carros())).not.toContain("sem resolução");
  });

  it("Perdido: o desfecho grava primeiro, e a caixa aparece com os carros e os motivos, sem 'Foi o escolhido'", async () => {
    await montarDetalhe();
    await fecharComo("Perdido");

    // O desfecho não esperou os carros.
    expect(escritas().map((c) => c.url)).toEqual(["/api/leads/gerenciar"]);
    expect(texto(caixa())).toContain("Feche os carros deste atendimento");
    expect(caixa()!.querySelectorAll("[data-pendencia]")).toHaveLength(3);
    expect(pendencia("op-2").querySelectorAll("button")).toHaveLength(13);
    expect(botao("Foi o escolhido", caixa()!)).toBeUndefined();
    expect(document.activeElement?.textContent).toBe("Feche os carros deste atendimento");
    expect(botao("Salvar", caixa()!)!.disabled).toBe(true);
  });

  it("salva num pedido só o que foi marcado; o que ficou sem marcação continua pendente", async () => {
    await montarDetalhe();
    await fecharComo("Perdido");

    await clicar(botao("Preço acima do que queria", pendencia("op-1")));
    await clicar(botao("Outro", pendencia("op-2")));
    // "Outro" sem nota trava o lote inteiro.
    expect(botao("Salvar", caixa()!)!.disabled).toBe(true);
    await mudar(pendencia("op-2").querySelector("textarea")!, "achou o banco baixo");
    expect(botao("Salvar", caixa()!)!.disabled).toBe(false);

    await clicar(botao("Salvar", caixa()!));
    expect(escritas().at(-1)).toEqual({
      metodo: "POST",
      url: "/api/leads/l1/veiculos/resolver",
      corpo: [
        { opcao: "op-1", situacao: "descartado", motivo_descarte: "preco" },
        { opcao: "op-2", situacao: "descartado", motivo_descarte: "outro", nota: "achou o banco baixo" },
      ],
    });
    expect(caixa()!.querySelectorAll("[data-pendencia]")).toHaveLength(1);
    expect(texto(linha(101))).toContain("Descartado");
    expect(texto(linha(104))).toContain("Em avaliação");
  });

  it("'Depois' fecha a caixa, e a linha discreta 'N carros sem resolução' a reabre, com singular e plural", async () => {
    await montarDetalhe();
    await fecharComo("Perdido");
    await clicar(botao("Depois", caixa()!));

    expect(caixa()).toBeNull();
    const linhaDiscreta = botao("3 carros sem resolução", carros())!;
    expect(linhaDiscreta).toBeDefined();
    expect(document.activeElement).toBe(linhaDiscreta);
    expect(escritas().map((c) => c.url)).toEqual(["/api/leads/gerenciar"]);

    await clicar(linhaDiscreta);
    await clicar(botao("Cor", pendencia("op-1")));
    await clicar(botao("Cor", pendencia("op-2")));
    await clicar(botao("Salvar", caixa()!));
    await clicar(botao("Depois", caixa()!));
    expect(botao("1 carro sem resolução", carros())).toBeDefined();
  });

  it("lead que já chega fechado com pendência mostra só a linha discreta", async () => {
    Object.assign(lead, { situacao: "perdido", desfecho: "perdido" });
    await montarDetalhe();
    expect(caixa()).toBeNull();
    expect(botao("3 carros sem resolução", carros())).toBeDefined();
  });

  it("Ganho: cada carro ganha 'Foi o escolhido', e só um pode ser", async () => {
    await montarDetalhe();
    await fecharComo("Ganho");

    const escolhido = (id: string) => botao("Foi o escolhido", pendencia(id))!;
    await clicar(escolhido("op-1"));
    expect(escolhido("op-1").getAttribute("aria-pressed")).toBe("true");
    await clicar(escolhido("op-2"));
    expect(escolhido("op-1").getAttribute("aria-pressed")).toBe("false");
    expect(escolhido("op-2").getAttribute("aria-pressed")).toBe("true");
    await clicar(botao("Preferiu outro carro da loja", pendencia("op-1")));
    await clicar(botao("Preferiu outro carro da loja", pendencia("op-3")));

    await clicar(botao("Salvar", caixa()!));
    expect(escritas().at(-1)!.corpo).toEqual([
      { opcao: "op-1", situacao: "descartado", motivo_descarte: "outro_da_loja" },
      { opcao: "op-2", situacao: "escolhido" },
      { opcao: "op-3", situacao: "descartado", motivo_descarte: "outro_da_loja" },
    ]);
    // Tudo resolvido: a caixa e a linha somem.
    expect(caixa()).toBeNull();
    expect(texto(carros())).not.toContain("sem resolução");
    expect(texto(linha(102))).toContain("Escolhido");
    expect(texto(linha(102))).toContain("Principal");
  });

  it("Ganho com um carro só: o servidor escolhe sozinho, e a caixa não aparece", async () => {
    opcoes = [opcao("op-1", 101, { principal: true })];
    await montarDetalhe();
    await fecharComo("Ganho");
    expect(caixa()).toBeNull();
    expect(texto(carros())).not.toContain("sem resolução");
    expect(texto(linha(101))).toContain("Escolhido");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const RELATORIO: RelatorioDoVeiculo = {
  veiculo_id: 101,
  total: 8,
  em_avaliacao: 3,
  sem_resolucao: 1,
  escolhido: 1,
  descartado: 4,
  percentuais: { em_avaliacao: 37.5, sem_resolucao: 12.5, escolhido: 12.5, descartado: 50 },
  motivo_principal: { motivo: "preco", rotulo: "Preço acima do que queria", total: 2, percentual: 50 },
  motivos: [
    { motivo: "preco", rotulo: "Preço acima do que queria", total: 2, percentual: 50 },
    { motivo: "cor", rotulo: "Cor", total: 1, percentual: 25 },
    { motivo: "outro", rotulo: "Outro", total: 1, percentual: 25 },
  ],
  notas: [
    { texto: "a Marina (41) 99999-1234 queria 5 mil a menos", motivo: "preco", motivo_rotulo: "Preço acima do que queria", em: "2026-10-01T15:00:00.000Z" },
    { texto: "achou o banco baixo", motivo: "outro", motivo_rotulo: "Outro", em: "2026-09-20T15:00:00.000Z" },
  ],
  primeiro_interesse_em: "2026-09-02T12:00:00.000Z",
  ultimo_interesse_em: "2026-10-01T15:00:00.000Z",
};

describe("o relatório 'Interesse e objeções' do carro", () => {
  const corpo = (r: RelatorioDoVeiculo | null, ok = true) => ({
    veiculos_disponivel: ok,
    veiculo: { id: 101, rotulo: "Chevrolet Onix LT 1.0 2020", km: 45000, preco: 59900, vendido: false },
    relatorio: r,
  });

  it("lê a rota do carro e mostra os quatro números, com a parte de cada um", async () => {
    relatorio = corpo(RELATORIO);
    await montarRelatorio(101);

    expect(chamadas.map((c) => c.url)).toEqual(["/api/estoque/101/interesse"]);
    expect(container.querySelector("h2")!.textContent).toBe("Interesse e objeções");
    const numeros = [...container.querySelectorAll("dl > div")].map((d) => [texto(d.querySelector("dt")), texto(d.querySelector("dd"))]);
    expect(numeros).toEqual([
      ["Consideraram", "8"],
      ["Em avaliação", "337,5%"],
      ["Escolhido", "112,5%"],
      ["Descartado", "450%"],
    ]);
    expect(texto()).toContain("8 atendimentos consideraram este carro, de 02/09/2026 a 01/10/2026.");
    expect(texto()).toContain("1 dos que estão em avaliação é de um atendimento já encerrado");
  });

  it("os motivos são uma lista com rótulo, contagem e percentual em texto, e a barra na largura do percentual", async () => {
    relatorio = corpo(RELATORIO);
    await montarRelatorio();

    const lista = container.querySelector<HTMLElement>("ul[data-motivos]")!;
    expect(lista.getAttribute("role")).toBe("list");
    const itens = [...lista.querySelectorAll<HTMLElement>("li")];
    expect(itens.map((li) => texto(li))).toEqual([
      "Preço acima do que queria2 · , 50% dos descartes",
      "Cor1 · , 25% dos descartes",
      "Outro1 · , 25% dos descartes",
    ]);
    const barras = itens.map((li) => li.querySelector<HTMLElement>("[data-barra]")!);
    expect(barras.map((b) => b.style.width)).toEqual(["50%", "25%", "25%"]);
    for (const b of barras) {
      expect(b.className).toContain("bg-mt-ink");
      // A barra é enfeite: o valor está no texto ao lado.
      expect(b.parentElement!.getAttribute("aria-hidden")).toBe("true");
    }
    // Sem biblioteca de gráfico: nem svg nem canvas.
    expect(container.querySelector("svg, canvas")).toBeNull();
  });

  it("as notas trazem o motivo, a data e o texto", async () => {
    relatorio = corpo(RELATORIO);
    await montarRelatorio();
    const notas = [...container.querySelectorAll<HTMLElement>("ul[data-notas] li")].map((li) => texto(li));
    expect(notas).toEqual([
      "Preço acima do que queria01/10/2026a Marina (41) 99999-1234 queria 5 mil a menos",
      "Outro20/09/2026achou o banco baixo",
    ]);
  });

  it("'Copiar resumo' leva números e motivos em texto simples, sem as notas e sem dado de pessoa", async () => {
    relatorio = corpo(RELATORIO);
    const copiado = vi.fn<(texto: string) => Promise<void>>(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copiado } });
    await montarRelatorio();
    await clicar(botao("Copiar resumo"));

    expect(copiado).toHaveBeenCalledTimes(1);
    const resumo = copiado.mock.calls[0][0];
    expect(resumo).toBe(
      [
        "Interesse no Chevrolet Onix LT 1.0 2020",
        "Atendimentos registrados de 02/09/2026 a 01/10/2026",
        "",
        "Atendimentos em que o carro foi considerado: 8",
        "Ainda em avaliação: 3",
        "Escolheram este carro: 1",
        "Descartaram este carro: 4",
        "",
        "Motivos de quem descartou:",
        "- Preço acima do que queria: 2 (50%)",
        "- Cor: 1 (25%)",
        "- Outro: 1 (25%)",
      ].join("\n"),
    );
    // A nota do vendedor trazia nome e telefone: nada dela vai para fora.
    for (const proibido of ["Marina", "99999", "queria 5 mil", "banco baixo", "—", "–", "lead", "Lead"]) {
      expect(resumo, proibido).not.toContain(proibido);
    }
    expect(resumo).not.toMatch(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}/);
    expect(texto(container.querySelector('p[role="status"]'))).toContain("Resumo copiado.");
  });

  it("sem acesso à área de transferência, o resumo fica à vista para copiar à mão", async () => {
    relatorio = corpo(RELATORIO);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("negado");
        },
      },
    });
    await montarRelatorio();
    await clicar(botao("Copiar resumo"));
    const caixa = container.querySelector<HTMLTextAreaElement>("textarea[readonly]")!;
    expect(caixa.value).toBe(resumoDoInteresseEmTexto("Chevrolet Onix LT 1.0 2020", RELATORIO));
  });

  it("carro sem atendimento: o estado vazio, sem botão de copiar", async () => {
    relatorio = corpo({ ...RELATORIO, total: 0, em_avaliacao: 0, sem_resolucao: 0, escolhido: 0, descartado: 0, motivos: [], notas: [], motivo_principal: null });
    await montarRelatorio();
    expect(texto()).toContain("Ainda não há atendimento registrado para este carro.");
    expect(botao("Copiar resumo")).toBeUndefined();
    expect(container.querySelector("dl")).toBeNull();
  });

  it("antes da migração (veiculos_disponivel: false) não desenha nada", async () => {
    relatorio = corpo(null, false);
    await montarRelatorio();
    expect(container.innerHTML).toBe("");
  });

  it("leitura que falha: a faixa de erro, e 'Tentar de novo' relê", async () => {
    forcar["GET /api/estoque/101/interesse"] = { status: 500, corpo: { error: "O banco não respondeu." } };
    relatorio = corpo(RELATORIO);
    await montarRelatorio();
    const faixa = container.querySelector<HTMLElement>('[role="alert"]')!;
    expect(texto(faixa)).toContain("O banco não respondeu.");

    forcar = {};
    await clicar(botao("Tentar de novo", faixa));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(texto()).toContain("8 atendimentos consideraram este carro");
  });
});

describe("as frases e as previsões da tela (lib pura)", () => {
  const base = opcao("op-1", 101, { principal: true });

  it("a linha da opção: estoque, vendido, fora do estoque e estoque não lido", () => {
    expect(linhaDaOpcao(base)).toBe("Estoque · 45.000 km · R$ 59.900");
    expect(linhaDaOpcao({ ...base, vendido: true })).toBe("Vendido · 45.000 km · R$ 59.900");
    expect(linhaDaOpcao({ ...base, no_estoque: false, km: null, preco_atual: null, vendido: null })).toBe("Fora do estoque");
    expect(linhaDaOpcao({ ...base, no_estoque: null, km: null, preco_atual: null, vendido: null })).toBe("Não deu para consultar o estoque agora");
  });

  it("'era R$ X' só quando o preço mudou e o carro segue no estoque", () => {
    expect(precoDeAntes(base)).toBeNull();
    expect(precoDeAntes({ ...base, preco_na_epoca: 62900 })).toBe("era R$ 62.900");
    expect(precoDeAntes({ ...base, preco_na_epoca: null })).toBeNull();
    expect(precoDeAntes({ ...base, preco_na_epoca: 62900, no_estoque: false, preco_atual: null })).toBeNull();
  });

  it("escolher torna o carro o principal e reabre o outro escolhido", () => {
    const lista = [opcao("op-1", 101, { principal: true, situacao: "escolhido" }), opcao("op-2", 102)];
    const depois = preverMudanca(lista, 102, { situacao: "escolhido" });
    expect(depois.map((o) => [o.veiculo_id, o.situacao, o.principal])).toEqual([
      [101, "em_avaliacao", false],
      [102, "escolhido", true],
    ]);
  });

  it("reabrir limpa o motivo e mantém a nota", () => {
    const lista = [opcao("op-1", 101, { situacao: "descartado", motivo_descarte: "cor", motivo_rotulo: "Cor", nota: "queria prata" })];
    expect(preverMudanca(lista, 101, { situacao: "em_avaliacao" })[0]).toMatchObject({
      situacao: "em_avaliacao",
      motivo_descarte: null,
      motivo_rotulo: null,
      nota: "queria prata",
    });
  });

  it("resposta sem `veiculos` (rota antiga): o carro único sai de `veiculo`, e a lista conta como indisponível", () => {
    const d = detalheDeTeste(leadDeTeste("l9", "Fulano", { veiculo_id: 101 }), {
      veiculo: { id: 101, nome: "Chevrolet Onix LT 1.0 2020", km: 45000, preco: 59900, vendido: false },
    });
    const { veiculos, disponivel: tem } = opcoesDoDetalhe(d as never);
    expect(tem).toBe(false);
    expect(veiculos).toHaveLength(1);
    expect(veiculos[0]).toMatchObject({ id: null, veiculo_id: 101, rotulo: "Chevrolet Onix LT 1.0 2020", principal: true, no_estoque: true });

    const semCarro = detalheDeTeste(leadDeTeste("l9", "Fulano", { veiculo_id: 777 }));
    expect(opcoesDoDetalhe(semCarro as never).veiculos[0]).toMatchObject({ veiculo_id: 777, no_estoque: false });
  });

  it("o resumo de um carro com um atendimento só não tem período nem lista de motivos", () => {
    const um = { ...RELATORIO, total: 1, em_avaliacao: 1, escolhido: 0, descartado: 0, motivos: [], ultimo_interesse_em: RELATORIO.primeiro_interesse_em };
    expect(resumoDoInteresseEmTexto(null, um)).toBe(
      ["Interesse no carro", "Atendimentos registrados em 02/09/2026", "", "Atendimentos em que o carro foi considerado: 1", "Ainda em avaliação: 1", "Escolheram este carro: 0", "Descartaram este carro: 0"].join("\n"),
    );
  });
});

describe("as regras de texto e de fiação, lidas na fonte", () => {
  const TELAS = [
    "src/components/admin/lead/CarrosDeInteresse.tsx",
    "src/components/admin/lead/BuscaDeCarro.tsx",
    "src/components/admin/lead/ResolucaoDosCarros.tsx",
    "src/components/admin/InteresseDoVeiculo.tsx",
    "src/lib/carrosDeInteresseNaTela.ts",
  ];

  it("nenhum texto com travessão, '(s)' ou 'Recarregue', e nenhuma caixa do navegador", () => {
    for (const caminho of TELAS) {
      const codigo = lerCodigo(caminho);
      expect(codigo, caminho).not.toMatch(/[—–]/);
      expect(codigo, caminho).not.toContain("(s)");
      expect(codigo, caminho).not.toMatch(/recarregue/i);
      expect(codigo, caminho).not.toMatch(/\b(alert|confirm|prompt)\(/);
    }
  });

  it("os motivos e os rótulos vêm da lib, e não são reescritos na tela", () => {
    for (const caminho of TELAS.slice(0, 4)) {
      expect(lerCodigo(caminho), caminho).not.toContain("Preço acima do que queria");
    }
    expect(lerCodigo("src/components/admin/lead/CarrosDeInteresse.tsx")).toContain("ROTULO_DA_SITUACAO_DA_OPCAO[v.situacao]");
    expect(lerCodigo("src/components/admin/lead/ResolucaoDosCarros.tsx")).toContain("MOTIVOS_DE_DESCARTE.map");
  });

  it("o relatório mora na visão do veículo do estoque; o carro de repasse (id uuid) não o tem", () => {
    expect(lerCodigo("src/components/admin/VisaoDoVeiculo.tsx")).toContain("<InteresseDoVeiculo veiculoId={v.id} />");
    expect(lerCodigo("src/app/admin/repasse/[id]/page.tsx")).not.toContain("InteresseDoVeiculo");
    expect(lerCodigo("src/components/admin/repasse/VisaoDoRepasse.tsx")).not.toContain("InteresseDoVeiculo");
  });

  it("o detalhe não busca nada a mais por card: o '+N' do quadro ficou de fora", () => {
    expect(lerCodigo("src/components/admin/CardDoLead.tsx")).not.toMatch(/veiculos|\/api\/estoque/);
  });
});
