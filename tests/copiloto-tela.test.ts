// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AcaoNaTela, Leitura, LeituraDoCopiloto } from "../src/lib/copilotoDeMidia-servidor";

/**
 * A tela do Copiloto de Mídia, montada. Prova que:
 *   - aprovar e recusar mandam à rota o id da proposta e a decisão certa;
 *   - o grupo inteiro se aprova de uma vez, com confirmação;
 *   - "Desfazer" só aparece no que foi aplicado e ainda não foi desfeito;
 *   - medição com problema, migração ausente e script parado viram aviso;
 *   - o pedido de verba mostra a verba de agora e o impacto, segura o teto e
 *     manda campanha, verba e motivo; o pedido aberto se aprova como proposta.
 *
 * Componentes de verdade; dublê só do `fetch`, do roteador e da confirmação.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const atualizou = vi.fn();
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) => createElement("a", { href, ...resto } as never, children as never),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: atualizou }) }));
vi.mock("../src/components/admin/ConfirmDialog", () => ({ useConfirm: () => ({ confirm: async () => true }) }));

const { default: CopilotoDeMidia } = await import("../src/components/marketing/copiloto/CopilotoDeMidia");

const A1 = "11111111-1111-4111-8111-111111111111";
const P1 = "22222222-2222-4222-8222-222222222222";
const P2 = "33333333-3333-4333-8333-333333333333";
const P3 = "44444444-4444-4444-8444-444444444444";
const H1 = "55555555-5555-4555-8555-555555555555";
const H2 = "66666666-6666-4666-8666-666666666666";
const V1 = "77777777-7777-4777-8777-777777777777";

const acao = (a: Partial<AcaoNaTela>): AcaoNaTela => ({
  id: P1,
  achadoId: A1,
  desfazAcaoId: null,
  tipo: "negativar",
  situacao: "proposta",
  campanhaNome: "Pesquisa",
  grupoNome: null,
  texto: "loja rival",
  correspondencia: "frase",
  verbaAtual: null,
  verbaNova: null,
  motivo: "Concorrente: gastou R$ 65,00 sem conversão.",
  economia7d: 65,
  evidencias: { termos: [{ termo: "loja rival seminovos", custo: 40, cliques: 12 }] },
  propostaEm: "2026-10-14T10:00:00Z",
  decididaPorNome: null,
  decididaEm: null,
  nota: null,
  concluidaEm: null,
  lidoDeVolta: null,
  erro: null,
  descartadaMotivo: null,
  pedido: false,
  pedidaPorNome: null,
  desfeita: false,
  ...a,
});

function leitura(mudar: (l: LeituraDoCopiloto) => void = () => {}): Leitura<LeituraDoCopiloto> {
  const l: LeituraDoCopiloto = {
    regras: {
      parametros: {
        gastoMinimoTermo: 10,
        gastoMinimoGrupo: 50,
        gastoMinimoCampanha: 100,
        ritmoAltoPct: 90,
        ritmoBaixoPct: 50,
        reducaoVerbaPct: 30,
        iqBaixo: 3,
        leadsGclidMinimos: 2,
        cliquesMinimosGclid: 30,
        perdaPorVerbaPct: 10,
        perdaPorRankingPct: 30,
        concorrentes: ["loja rival"],
        cidadesFora: [],
        palavrasInformativas: ["como"],
        horaDoDiagnostico: 7,
      },
      vigenciaDesde: "2026-10-14",
      criadoPorNome: null,
    },
    diagnostico: {
      id: "d1",
      recebidoEm: "2026-10-14T10:05:00Z",
      janela: { de: "2026-10-07", ate: "2026-10-13" },
      previa: false,
      resumo: {
        custo7: 357,
        cliques7: 110,
        impressoes7: 2000,
        conversoes7: 0,
        custoSemConversao: 180,
        leads: { total: 20, doSite: 14, comGclid: 0, comUtmGoogle: 0 },
        medicaoConfiavel: false,
        achados: { alta: 1, media: 0, baixa: 0 },
        propostas: 2,
        secoesComErro: [],
      },
      erros: {},
      termos: [
        { termo: "loja rival seminovos", status: "NONE", campanhaId: "111", campanha: "Pesquisa", grupoId: "222", grupo: "G", custo: 40, cliques: 12, impressoes: 90, conversoes: 0 },
        { termo: "como vender carro", status: "NONE", campanhaId: "111", campanha: "Pesquisa", grupoId: "222", grupo: "G", custo: 8, cliques: 3, impressoes: 30, conversoes: 0 },
      ],
    },
    achados: [
      { id: A1, regra: "termos_sem_conversao", grupo: "concorrente", gravidade: "alta", titulo: "Concorrente: 2 termos gastaram R$ 65,00 sem conversão", detalhe: "Gente procurando outra loja.", evidencias: { custo: 65 } },
    ],
    abertas: [
      acao({}),
      acao({ id: P2, texto: "rival", economia7d: 10 }),
      acao({ id: P3, situacao: "aprovada", tipo: "mudar_verba", texto: null, correspondencia: null, verbaAtual: 50, verbaNova: 35, decididaPorNome: "Ana", decididaEm: "2026-10-14T11:00:00Z" }),
    ],
    historico: [
      acao({ id: H1, situacao: "aplicada", texto: "emprego", correspondencia: "exata", concluidaEm: "2026-10-13T12:00:00Z", lidoDeVolta: { negativa: true }, decididaPorNome: "Ana" }),
      acao({ id: H2, situacao: "falhou", tipo: "mudar_verba", texto: null, correspondencia: null, verbaAtual: 50, verbaNova: 35, erro: "a verba mudou desde a proposta", concluidaEm: "2026-10-13T12:00:00Z" }),
    ],
    campanhas: [
      { id: "111", nome: "Pesquisa", verba: 50, situacao: "no_ar", sincronizadoEm: "2026-10-14T11:30:00Z" },
      { id: "333", nome: "Vender meu carro", verba: 5, situacao: "no_ar", sincronizadoEm: "2026-10-14T11:30:00Z" },
    ],
    ultimaSincronizacao: "2026-10-14T11:30:00Z",
    scriptParado: false,
    lidoEm: "2026-10-14T12:00:00Z",
  };
  mudar(l);
  return { ok: true, valor: l };
}

let raiz: Root;
let caixa: HTMLDivElement;
let pedidos: Array<{ url: string; corpo: unknown }>;

async function montar(l: Leitura<LeituraDoCopiloto>) {
  caixa = document.createElement("div");
  document.body.appendChild(caixa);
  raiz = createRoot(caixa);
  await act(async () => {
    raiz.render(createElement(CopilotoDeMidia, { leitura: l, migracao: "20261014150000_copiloto_de_midia" }));
  });
}

async function digitar(campo: Element | null, valor: string) {
  expect(campo).not.toBeNull();
  await act(async () => {
    const el = campo as HTMLInputElement | HTMLSelectElement;
    const prototipo = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototipo, "value")!.set!.call(el, valor);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

const clicar = async (el: Element | null) => {
  expect(el).not.toBeNull();
  await act(async () => {
    (el as HTMLElement).click();
  });
};

beforeEach(() => {
  pedidos = [];
  atualizou.mockReset();
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    pedidos.push({ url, corpo: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ pedidas: 1, mudaram: 1 }) };
  });
});

afterEach(() => {
  act(() => raiz.unmount());
  caixa.remove();
  vi.unstubAllGlobals();
});

describe("tela do Copiloto de Mídia", () => {
  it("o resumo diz que a medição está com problema e o que isso segura", async () => {
    await montar(leitura());
    const resumo = caixa.querySelector("[data-resumo]")!.textContent!;
    expect(resumo).toContain("Com problema");
    expect(resumo).toContain("Sem pausa nem corte de verba");
    expect(resumo).toMatch(/0 de 14/);
  });

  it("aprovar e recusar mandam o id e a decisão; depois, a tela recarrega", async () => {
    await montar(leitura());
    await clicar(caixa.querySelector(`[data-proposta="${P1}"] [data-aprovar]`));
    expect(pedidos).toEqual([{ url: "/api/marketing/copiloto/decisao", corpo: { ids: [P1], decisao: "aprovar" } }]);
    expect(atualizou).toHaveBeenCalled();
    await clicar(caixa.querySelector(`[data-proposta="${P2}"] [data-recusar]`));
    expect(pedidos[1].corpo).toEqual({ ids: [P2], decisao: "recusar" });
  });

  it("o grupo inteiro se aprova de uma vez", async () => {
    await montar(leitura());
    const grupo = caixa.querySelector(`[data-grupo-de-propostas="${A1}"]`)!;
    expect(grupo.textContent).toContain("Concorrente: 2 termos gastaram");
    await clicar(grupo.querySelector("[data-aprovar-grupo]"));
    expect(pedidos[0].corpo).toEqual({ ids: [P1, P2], decisao: "aprovar" });
  });

  it("a aprovada que o script ainda não pegou pode ser desistida", async () => {
    await montar(leitura());
    const linha = caixa.querySelector(`[data-a-caminho="${P3}"]`)!;
    // O `toLocaleString` separa "R$" do número com espaço não separável.
    expect(linha.textContent!.replace(/\u00a0/g, " ")).toContain("Verba de Pesquisa: R$ 50,00 → R$ 35,00 por dia");
    await clicar(linha.querySelector("[data-desistir]"));
    expect(pedidos[0].corpo).toEqual({ ids: [P3], decisao: "recusar" });
  });

  it("Desfazer só no que foi aplicado e não desfeito", async () => {
    await montar(leitura());
    expect(caixa.querySelector(`[data-historico-acao="${H1}"] [data-desfazer]`)).not.toBeNull();
    expect(caixa.querySelector(`[data-historico-acao="${H2}"] [data-desfazer]`)).toBeNull();
    expect(caixa.querySelector(`[data-historico-acao="${H2}"]`)!.textContent).toContain("a verba mudou desde a proposta");
    await clicar(caixa.querySelector(`[data-historico-acao="${H1}"] [data-desfazer]`));
    expect(pedidos[0]).toEqual({ url: "/api/marketing/copiloto/desfazer", corpo: { id: H1 } });

    act(() => raiz.unmount());
    caixa.remove();
    await montar(leitura((l) => (l.historico[0].desfeita = true)));
    expect(caixa.querySelector("[data-desfazer]")).toBeNull();
  });

  it("a tabela de termos classifica pelas regras da loja", async () => {
    await montar(leitura());
    const linhas = [...caixa.querySelectorAll("[data-termos] tbody tr")].map((tr) => tr.textContent);
    expect(linhas[0]).toContain("Concorrente");
    expect(linhas[1]).toContain("Informativo");
  });

  it("migração ausente e script parado viram aviso", async () => {
    await montar({ ok: false, faltaMigracao: true, motivo: "relation does not exist" });
    expect(caixa.querySelector('[data-aviso="migracao"]')!.textContent).toContain("20261014150000_copiloto_de_midia");
    act(() => raiz.unmount());
    caixa.remove();
    await montar(leitura((l) => ((l.scriptParado = true), (l.ultimaSincronizacao = null))));
    expect(caixa.querySelector('[data-aviso="script-parado"]')!.textContent).toContain("nunca sincronizou");
  });

  it("sem diagnóstico ainda, a tela diz como mandar o primeiro", async () => {
    await montar(leitura((l) => ((l.diagnostico = null), (l.achados = []), (l.abertas = []), (l.historico = []))));
    expect(caixa.querySelector('[data-aviso="sem-diagnostico"]')!.textContent).toContain("Visualizar");
    expect(caixa.querySelector("[data-sem-propostas]")).not.toBeNull();
  });

  it("pedido de verba: mostra a verba de agora e o impacto, e manda campanha, verba e motivo", async () => {
    await montar(leitura());
    const form = caixa.querySelector("[data-pedido-de-verba]")!;
    expect(form.textContent!.replace(/\u00a0/g, " ")).toContain("Vender meu carro — R$ 5,00 por dia");
    await digitar(form.querySelector('select[name="campanhaId"]'), "333");
    await digitar(form.querySelector('input[name="verbaNova"]'), "10");
    await digitar(form.querySelector('input[name="motivo"]'), "única que converte");
    // +R$ 5,00 por dia; o Google cobra no mês até 30,4 dias de verba.
    expect(form.querySelector("[data-impacto]")!.textContent!.replace(/\u00a0/g, " ")).toBe(
      "R$ 5,00 → R$ 10,00 por dia: +R$ 5,00 por dia, até +R$ 152,00 por mês.",
    );
    await clicar(form.querySelector("[data-pedir-verba]"));
    expect(pedidos).toEqual([
      { url: "/api/marketing/copiloto/verba", corpo: { campanhaId: "333", verbaNova: 10, motivo: "única que converte" } },
    ]);
    expect(atualizou).toHaveBeenCalled();
  });

  it("pedido de verba: igual à de agora ou acima de 10× não sai da tela", async () => {
    await montar(leitura());
    const form = caixa.querySelector("[data-pedido-de-verba]")!;
    await digitar(form.querySelector('input[name="verbaNova"]'), "500.01");
    expect(form.querySelector('[role="alert"]')!.textContent).toContain("10×");
    expect((form.querySelector("[data-pedir-verba]") as HTMLButtonElement).disabled).toBe(true);
    await digitar(form.querySelector('input[name="verbaNova"]'), "50");
    expect(form.querySelector('[role="alert"]')!.textContent).toContain("já é a verba");
    await clicar(form.querySelector("[data-pedir-verba]"));
    expect(pedidos).toEqual([]);
  });

  it("sem campanha sincronizada, não há formulário de pedido", async () => {
    await montar(leitura((l) => (l.campanhas = [])));
    expect(caixa.querySelector("[data-pedido-de-verba]")).toBeNull();
  });

  it("o pedido aberto fica em 'Pedidos de verba', sem economia, e se aprova como proposta", async () => {
    const pedido = acao({
      id: V1,
      achadoId: null,
      tipo: "mudar_verba",
      texto: null,
      correspondencia: null,
      verbaAtual: 5,
      verbaNova: 10,
      economia7d: null,
      evidencias: {},
      motivo: "Pedido de Dyones: única que converte",
      pedido: true,
      pedidaPorNome: "Dyones",
    });
    // Perfil sem nome: continua sendo pedido, no mesmo grupo.
    const semNome = { ...pedido, id: H2, campanhaNome: "Repasse", motivo: "Pedido de alguém da equipe.", pedidaPorNome: null };
    await montar(leitura((l) => l.abertas.push(pedido, semNome)));
    const grupo = caixa.querySelector('[data-grupo-de-propostas="pedidos"]')!;
    const texto = grupo.textContent!.replace(/\u00a0/g, " ");
    expect(texto).toContain("Pedidos de verba");
    expect(texto).toContain("2 pedidos");
    expect(texto).toContain("Verba de Repasse");
    expect(texto).not.toContain("em 7 dias");
    expect(texto).toContain("Verba de Pesquisa: R$ 5,00 → R$ 10,00 por dia");
    await clicar(grupo.querySelector(`[data-proposta="${V1}"] [data-aprovar]`));
    expect(pedidos).toEqual([{ url: "/api/marketing/copiloto/decisao", corpo: { ids: [V1], decisao: "aprovar" } }]);
  });
});
