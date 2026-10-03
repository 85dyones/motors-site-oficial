// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ETAPAS_PADRAO } from "../src/lib/funil";
import { montarAvaliacaoDoLead } from "../src/lib/avaliacaoDoLead";
import { lerParametrosDaCurva, recomendarAvaliacao } from "../src/lib/avaliacaoRecomendacao";
import { cardDe, definirLargura, detalheDeTeste, gaveta, leadDaUrl, zerarRota } from "./quadroDeLeadsDeTeste";

/**
 * O lead de avaliação, na tela montada.
 *
 * Até 24/09/2026 o card mostrava só "Fiat Argo … 2021". Desde 03/10 (card
 * enxuto) o bloco da avaliação mora no DETALHE do lead, nos dados do negócio:
 * cada teste abre a gaveta antes de olhar. O que se trava aqui:
 *   - o que o cliente preencheu (FIPE, km, estado, faixa sugerida, o que ele
 *     escreveu) aparece no detalhe, e lead sem retrato não ganha bloco vazio;
 *   - digitar o ofertado e sair do campo manda UM PATCH, com o número lido;
 *   - valor ilegível avisa e não manda nada;
 *   - gravar um valor não "reinicia" o relógio de estagnação na tela — o
 *     gatilho do banco não conta isso como toque no lead, e o card que
 *     esfriasse só na tela mentiria até a próxima recarga.
 *
 * Nada do app é dublê: o kanban e as libs de verdade; só o `fetch` e o
 * `next/link`, como em `busca-por-ref-fiacao.test.ts`.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  // O card desenha `SinalDeAbertura`, que lê o estado do link.
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));
vi.mock("next/navigation", async () => (await import("./quadroDeLeadsDeTeste")).navegacaoDeTeste);

const TRES_DIAS_ATRAS = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

/** A curva vigente, como o banco a guarda (semente da f0f + `km_por_ano`). */
const PARAMETROS = lerParametrosDaCurva({
  id: "69838e3c-0ec2-4092-94c7-fda9bdd26727",
  base_pp: "20.00",
  estado_excepcional_pp: "-5.00",
  piso_pct: "15.00",
  teto_pct: "40.00",
  km_por_ano: 15000,
  degraus_km: [
    { pp: 0, desvio_km_ate: 5000 },
    { pp: 2, desvio_km_ate: 15000 },
    { pp: 4, desvio_km_ate: 30000 },
    { pp: 7, desvio_km_ate: 50000 },
    { pp: 10, desvio_km_ate: null },
  ],
  avaria_leve_pp: "[2,4]",
  avaria_seria_pp: "[8,12]",
  pendencia_pp: "[3,5]",
  vigencia_desde: "2026-08-30",
});

const recomendacao = recomendarAvaliacao({
  estadoMecanico: "bom",
  estadoConservacao: "riscos",
  quilometragem: 180000,
  anoModelo: 2021,
  fipeValor: "R$ 68.000,00",
  parametros: PARAMETROS,
  hoje: new Date(Date.UTC(2026, 8, 24, 15)),
})!;

const lead = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  telefone: "5541999990000",
  interesse: "Fiat Argo Drive 1.0 2021",
  canal: "Avaliação",
  responsavel: "Bruno",
  observacoes: null,
  situacao: "novo",
  created_at: TRES_DIAS_ATRAS,
  ag_uid: null,
  desfecho: null,
  ...extra,
});

const COM_AVALIACAO = lead("l1", "Ana Vende", {
  avaliacao: montarAvaliacaoDoLead(
    {
      marca: "Fiat",
      modelo: "Argo Drive 1.0",
      ano: 2021,
      quilometragem: 180000,
      estado_mecanico: "bom",
      estado_conservacao: "riscos",
      observacoes: "pneus novos",
      fipe_valor: "R$ 68.000,00",
      fipe_mes_referencia: "setembro de 2026",
    },
    recomendacao,
  ),
  avaliacao_valor_ofertado: null,
  avaliacao_valor_pago: null,
});
const SEM_AVALIACAO = lead("l2", "Carlos Compra", { canal: "WhatsApp", interesse: "Onix 2022" });

// As etapas da semente não têm prazo; a de produção dá 15 minutos ao lead
// novo. Sem prazo, nada fica parado e o último teste não provaria nada.
const ETAPAS = ETAPAS_PADRAO.map((e) => (e.chave === "novo" ? { ...e, estagnacao_minutos: 15 } : e));

let chamadas: { metodo: string; url: string; corpo?: Record<string, unknown> }[] = [];

function dublarFetch() {
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    const metodo = opcoes?.method ?? "GET";
    chamadas.push({ metodo, url: String(url), corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined });
    if (metodo === "PATCH") return { ok: true, json: async () => ({ ok: true }) };
    const doLead = leadDaUrl(String(url));
    if (doLead) {
      return {
        ok: true,
        json: async () => detalheDeTeste(doLead.id === "l1" ? COM_AVALIACAO : SEM_AVALIACAO, { etapas: ETAPAS }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        leads: [COM_AVALIACAO, SEM_AVALIACAO],
        atendentes: [{ nome: "Bruno" }],
        etapas: ETAPAS,
        motivos: [],
        funilPendente: false,
        podeConfigurar: false,
        busca: null,
      }),
    };
  }) as never;
}

let container: HTMLDivElement;
let root: Root;

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

/** Texto do card com o espaço não separável do `Intl` virado espaço comum. */
const textoDoCard = (nome: string) => (card(nome).textContent ?? "").replace(/\u00a0/g, " ");
/** O mesmo, do detalhe aberto na gaveta: é lá que o bloco de avaliação mora. */
const textoDoDetalhe = () => (gaveta()?.textContent ?? "").replace(/\u00a0/g, " ");

async function abrir(id: string) {
  await act(async () => cardDe(container, id)!.click());
  await assentar();
}

function card(nome: string): HTMLElement {
  const achado = [...container.querySelectorAll<HTMLElement>("[draggable='true']")].find((c) =>
    (c.textContent ?? "").includes(nome),
  );
  expect(achado, `o card de ${nome} precisa estar na tela`).toBeDefined();
  return achado!;
}

const campoDoValor = (rotulo: "Ofertado" | "Pago", nome: string) =>
  container.querySelector<HTMLInputElement>(`input[aria-label="${rotulo} pelo carro de ${nome}"]`);

async function preencherESair(el: HTMLInputElement, valor: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, valor);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    // `blur` não borbulha; o React escuta `focusout`.
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  await assentar();
}

const patches = () => chamadas.filter((c) => c.metodo === "PATCH");
const AVISO_DE_PARADO = /esfriando há|parado há|vai passar para outro vendedor há/;

beforeEach(() => {
  chamadas = [];
  zerarRota();
  definirLargura(true);
  dublarFetch();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("o bloco da avaliação no detalhe do lead", () => {
  it("mostra o que o cliente preencheu, e só no lead de avaliação", async () => {
    await montar();
    // O card enxuto não carrega o bloco: ele mora no detalhe.
    expect(textoDoCard("Ana Vende")).not.toContain("Avaliação do site");
    await abrir("l1");

    const doAna = textoDoDetalhe();
    expect(doAna).toContain("Avaliação do site");
    expect(doAna).toContain("FIPE R$ 68.000");
    expect(doAna).toContain("180.000 km");
    expect(doAna).toContain("mecânica boa · pequenos riscos de uso");
    expect(doAna).toContain(recomendacao.resumo.replace(/\u00a0/g, " "));
    // A conta da curva, componente por componente — o número se explica.
    expect(doAna).toMatch(/\+20\s*base/);
    expect(doAna, "180 mil km num 2021 é o último degrau").toMatch(/\+10\s*km — 180\.000 km/);
    expect(doAna, "o aviso da pendência de documento").toContain("documento e procedência");
    expect(doAna).toContain("Curva de deságio vigente desde 30/08/2026");
    expect(doAna).toContain("pneus novos");

    await abrir("l2");
    expect(gaveta()!.getAttribute("aria-label")).toBe("Detalhe do lead Carlos Compra");
    expect(textoDoDetalhe()).not.toContain("Avaliação do site");
  });

  it("o ofertado digitado vira um PATCH com o número lido", async () => {
    await montar();
    await abrir("l1");
    await preencherESair(campoDoValor("Ofertado", "Ana Vende")!, "52.000");

    expect(patches()).toHaveLength(1);
    expect(patches()[0].corpo).toEqual({ id: "l1", avaliacao_valor_ofertado: 52000 });
  });

  it("valor ilegível avisa e não manda nada", async () => {
    await montar();
    await abrir("l1");
    await preencherESair(campoDoValor("Pago", "Ana Vende")!, "cinquenta mil");

    expect(patches()).toHaveLength(0);
    expect(textoDoDetalhe()).toContain("Só o número");
  });

  it("gravar um valor não esconde que o lead está parado", async () => {
    await montar();
    expect(textoDoCard("Ana Vende"), "o lead de três dias precisa começar parado").toMatch(AVISO_DE_PARADO);
    await abrir("l1");
    expect(textoDoDetalhe(), "o detalhe diz o mesmo que o card").toMatch(AVISO_DE_PARADO);

    await preencherESair(campoDoValor("Ofertado", "Ana Vende")!, "52.000");
    expect(patches()).toHaveLength(1);

    // Nem no card, nem no cabeçalho do detalhe.
    expect(textoDoCard("Ana Vende")).toMatch(AVISO_DE_PARADO);
    expect(textoDoDetalhe()).toMatch(AVISO_DE_PARADO);
  });
});
