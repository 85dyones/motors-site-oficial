// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { lerParametrosDaCurva } from "../src/lib/avaliacaoRecomendacao";
import { lerRespostaDaApiBrasil } from "../src/lib/consultaDePlaca";
import { LEITORES_DA_PLACA, lerChamadaDaPlaca, montarRetratoPorNivel, type FragmentosDaPlaca } from "../src/lib/niveisDaPlaca";

/**
 * A tela da consulta de placa montada de verdade (06/10/2026; em NÍVEIS desde
 * 19/10/2026): só o `fetch`, o `next/navigation` e o diálogo de confirmação
 * são dublados.
 *
 * O que só a fiação prova: a tela pergunta PRIMEIRO pelo que está guardado;
 * placa nova abre os cartões dos níveis com o preço, e só chega à consulta
 * paga depois de alguém escolher o nível E confirmar; o aprofundar mostra o
 * preço só do que falta e manda o id da guardada; a repetição (409) pede uma
 * segunda confirmação; e o duplo clique não paga duas vezes. Um clique que
 * pagasse sem perguntar passaria verde em qualquer teste de função pura.
 */

vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => null, createAdminSupabaseClient: () => null }));
const { niveisComPreco, opcoesDeAprofundar } = await import("../src/lib/niveisDaPlaca-servidor");
type ConsultaGuardada = import("../src/lib/consultaDePlaca-servidor").ConsultaGuardada;

/** Os preços da semente da migração dos níveis. */
const MIGRACAO = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261019120000_niveis_da_consulta_de_placa.sql"), "utf8");
const PRECOS = JSON.parse(MIGRACAO.match(/-- A semente[\s\S]*?'(\{"estadual"[\s\S]*?\})'::jsonb/)![1]) as Record<string, number>;
const PARAMETROS = { precos: PRECOS, tabelaDePrecosEm: "2026-10-19", diasParaAprofundar: 7, minutosContraRepeticao: 30 };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

let resposta = true;
const confirm = vi.fn<(opcoes: Record<string, unknown>) => Promise<boolean>>(async () => resposta);
vi.mock("../src/components/admin/ConfirmDialog", () => ({ useConfirm: () => ({ confirm }) }));

const fixture = (nome: string, placa: string) => {
  const r = lerRespostaDaApiBrasil(
    JSON.parse(readFileSync(join(__dirname, "fixtures", "apibrasil", `${nome}.json`), "utf8")),
    placa,
  );
  if (!r.ok) throw new Error(r.motivo);
  return { id: "c1", placa, retrato: r.retrato, custo: 30, homologacao: false, criadoEm: new Date().toISOString(), consultadoPor: "Ana" };
};
const MG = fixture("veiculos-total-mg-com-alienacao", "ABC1D23");
const PR = fixture("veiculos-total-pr-sem-base-estadual", "BRA2E19");

/** Uma consulta BÁSICA guardada de QOZ7702, montada pelos leitores de verdade sobre as respostas da doc. */
const ID_DA_BASICA = "0f8fad5b-d9cb-469f-a165-70867728950e";
const BASICA: ConsultaGuardada = (() => {
  const respostas = JSON.parse(readFileSync(join(__dirname, "fixtures", "apibrasil", "placa-niveis.json"), "utf8")) as Record<string, unknown>;
  const fragmentos: Record<string, unknown> = {};
  for (const p of ["estadual", "recall", "fipe"] as const) {
    const r = lerChamadaDaPlaca(200, respostas[p], p);
    if (!r.ok) throw new Error(r.motivo);
    fragmentos[p] = LEITORES_DA_PLACA[p](r.dados);
  }
  return {
    id: ID_DA_BASICA,
    placa: "QOZ7702",
    retrato: montarRetratoPorNivel("QOZ7702", "basico", fragmentos as FragmentosDaPlaca),
    custo: 3.18,
    homologacao: false,
    criadoEm: new Date().toISOString(),
    consultadoPor: "Bia",
    nivel: "basico",
    produtos: ["estadual", "recall", "fipe"],
    fragmentos,
  };
})();

/** "R$ 7,40" com o espaço que o toLocaleString põe (não separável) trocado pelo comum. */
const texto = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ");

// A semente da curva (spec 11), como o andaime de testes do banco a grava.
const CURVA = lerParametrosDaCurva({
  id: "seed",
  vigencia_desde: "2026-09-24",
  base_pp: 20,
  estado_excepcional_pp: -5,
  piso_pct: 15,
  teto_pct: 40,
  km_por_ano: 15000,
  degraus_km: [
    { desvio_km_ate: 5000, pp: 0 },
    { desvio_km_ate: 15000, pp: 2 },
    { desvio_km_ate: 30000, pp: 4 },
    { desvio_km_ate: 50000, pp: 7 },
    { desvio_km_ate: null, pp: 10 },
  ],
  avaria_leve_pp: "[2,4]",
  avaria_seria_pp: "[8,12]",
  pendencia_pp: "[3,5]",
});

let chamadas: Array<Record<string, unknown>>;
let guardadas: Record<string, ConsultaGuardada>;
/** Como a rota responde à consulta PAGA; por padrão, a consulta nova da placa. */
let pago: (corpo: Record<string, unknown>) => { status: number; json: unknown };
const pagos = () => chamadas.filter((c) => !c.soGuardada);
let container: HTMLDivElement;
let root: Root;

async function montar(props: Record<string, unknown> = {}) {
  globalThis.fetch = (async (_url: string, opcoes?: RequestInit) => {
    const corpo = JSON.parse(String(opcoes?.body)) as { placa: string; soGuardada?: boolean };
    chamadas.push(corpo);
    if (corpo.soGuardada) {
      const consulta = guardadas[corpo.placa] ?? null;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          consulta,
          guardada: true,
          niveis: niveisComPreco(PRECOS),
          aprofundar: consulta ? opcoesDeAprofundar(consulta, PARAMETROS, false) : [],
          tabelaDePrecosEm: "2026-10-19",
          avisoDosNiveis: null,
        }),
      };
    }
    const r = pago(corpo);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json };
  }) as never;
  const { default: ConsultaDePlaca } = await import("../src/components/admin/consulta/ConsultaDePlaca");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(ConsultaDePlaca, {
        recentes: { ok: true, consultas: [] },
        curva: CURVA,
        temToken: true,
        homologacao: false,
        ...props,
      } as never),
    );
  });
}

async function digitar(seletor: string, valor: string) {
  const campo = container.querySelector(seletor) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(campo, valor);
    campo.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function consultar(placa: string) {
  await digitar("input[placeholder='ABC1D23']", placa);
  await act(async () => {
    (container.querySelector("form") as HTMLFormElement).requestSubmit();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function clicar(el: Element | null) {
  if (!el) throw new Error("elemento não achado");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const cartoes = () => [...container.querySelectorAll("[data-nivel-da-placa]")];
const botaoConsultar = () => container.querySelector("[data-consultar-nivel]") as HTMLButtonElement | null;
const escolher = (nivel: string) => clicar(container.querySelector(`input[type=radio][value="${nivel}"]`));

beforeEach(() => {
  chamadas = [];
  guardadas = {};
  resposta = true;
  pago = (corpo) => ({ status: 200, json: { consulta: corpo.placa === "ABC1D23" ? MG : PR, guardada: false, saldo: 970, aprofundar: [] } });
  confirm.mockReset();
  confirm.mockImplementation(async () => resposta);
  refresh.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("o caminho do dinheiro", () => {
  it("placa já consultada reabre sem perguntar e sem pagar", async () => {
    guardadas = { ABC1D23: MG };
    await montar();
    await consultar("abc1d23");
    expect(chamadas).toEqual([{ placa: "ABC1D23", soGuardada: true }]);
    expect(confirm).not.toHaveBeenCalled();
    expect(container.querySelector("[data-nivel]")?.getAttribute("data-nivel")).toBe("nao_comprar");
  });

  it("placa nova: pergunta primeiro pelo guardado, abre os níveis, e só paga depois da escolha e da confirmação", async () => {
    await montar();
    await consultar("BRA2E19");
    // Nada foi pago ainda: só a pergunta pelo guardado, e os cartões abertos.
    expect(chamadas).toEqual([{ placa: "BRA2E19", soGuardada: true }]);
    expect(confirm).not.toHaveBeenCalled();
    expect(cartoes()).toHaveLength(4);
    await escolher("completo");
    await clicar(botaoConsultar());
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(chamadas).toEqual([
      { placa: "BRA2E19", soGuardada: true },
      { placa: "BRA2E19", nivel: "completo", aprofundarDe: null },
    ]);
    expect(container.querySelector("[data-nivel]")?.getAttribute("data-nivel")).toBe("ressalvas");
    // Depois de pagar, os cartões fecham.
    expect(cartoes()).toHaveLength(0);
    expect(refresh).toHaveBeenCalled();
  });

  it("quem cancela a confirmação não paga", async () => {
    resposta = false;
    await montar();
    await consultar("BRA2E19");
    await escolher("basico");
    await clicar(botaoConsultar());
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(chamadas).toEqual([{ placa: "BRA2E19", soGuardada: true }]);
    expect(container.querySelector("[data-nivel]")).toBeNull();
  });

  it("sem token, a placa nova abre os níveis, mas o botão de pagar não chega à confirmação", async () => {
    await montar({ temToken: false });
    await consultar("BRA2E19");
    expect(cartoes()).toHaveLength(4);
    await escolher("basico");
    expect(botaoConsultar()!.disabled).toBe(true);
    await clicar(botaoConsultar());
    expect(confirm).not.toHaveBeenCalled();
    expect(chamadas).toHaveLength(1);
  });

  it("placa inválida não sai da tela", async () => {
    await montar();
    await consultar("AB12");
    expect(chamadas).toEqual([]);
    expect(container.querySelector("[role=alert]")?.textContent).toContain("Placa inválida");
  });
});

describe("o aviso que se lê de longe", () => {
  it("o quadro traz as dez checagens, cada uma com sinal e rótulo escrito", async () => {
    guardadas = { BRA2E19: PR };
    await montar();
    await consultar("BRA2E19");
    const linhas = [...container.querySelectorAll("[data-checagem]")];
    expect(linhas).toHaveLength(10);
    for (const l of linhas) {
      const estado = l.getAttribute("data-estado")!;
      // Forma e texto, e não só a cor da borda.
      expect(l.querySelector(`svg[data-estado="${estado}"]`), l.getAttribute("data-checagem")!).toBeTruthy();
      expect(l.textContent).toMatch(/Ok|Atenção|Impeditivo|Não conferido/);
    }
    const estado = (chave: string) => container.querySelector(`[data-checagem="${chave}"]`)?.getAttribute("data-estado");
    expect(estado("debitos")).toBe("nao_conferido");
    expect(estado("leilao")).toBe("ok");
  });

  it("a faixa de compra sai da curva e acompanha o km digitado", async () => {
    guardadas = { BRA2E19: PR };
    await montar();
    await consultar("BRA2E19");
    const faixa = () => container.querySelector("[data-faixa-de-compra]")?.textContent?.replace(/\s/g, " ");
    // Sem km: só a base de 20 p.p. sobre R$ 128.430.
    expect(faixa()).toBe("R$ 102.744");
    await digitar("input[placeholder='0']", "250000");
    // Km muito acima do esperado: o último degrau da curva soma 10 p.p.
    expect(faixa()).toBe("R$ 89.901");
  });

  it("km abaixo de uma leitura anterior vira recusa na faixa do topo", async () => {
    guardadas = { BRA2E19: PR };
    await montar();
    await consultar("BRA2E19");
    await digitar("input[placeholder='0']", "20000");
    expect(container.querySelector("[data-nivel]")?.getAttribute("data-nivel")).toBe("nao_comprar");
    expect(container.textContent).toContain("Hodômetro não anda para trás");
  });

  it("o gráfico vem com a tabela dos mesmos números", async () => {
    guardadas = { BRA2E19: PR };
    await montar();
    await consultar("BRA2E19");
    expect(container.querySelector("svg[aria-label^='FIPE']")).toBeTruthy();
    // 36 meses de tabela e 3 de projeção.
    expect(container.querySelectorAll("details tbody tr")).toHaveLength(39);
    expect(container.querySelector("details")?.textContent).toContain("(projeção)");
  });
});

describe("os níveis e o aprofundar", () => {
  it("placa sem guardada abre os quatro cartões com o preço da semente", async () => {
    await montar();
    await consultar("BRA2E19");
    expect(cartoes().map((c) => c.getAttribute("data-nivel-da-placa"))).toEqual(["basico", "intermediario", "economico", "completo"]);
    expect(cartoes().map((c) => texto(c).match(/R\$ [\d.,]+/)?.[0])).toEqual(["R$ 3,18", "R$ 5,58", "R$ 10,58", "R$ 30,00"]);
    // O que cada nível deixa de fora está escrito no cartão.
    expect(texto(cartoes()[0])).toContain("Fica de fora: Leilão, sinistro e donos anteriores.");
    expect(texto(container.querySelector("[data-escolher-nivel]"))).toContain("19/10/2026");
  });

  it("o botão 'Consultar' só se acende com um nível escolhido, e diz o preço dele", async () => {
    await montar();
    await consultar("BRA2E19");
    expect(botaoConsultar()!.disabled).toBe(true);
    expect(texto(botaoConsultar())).toBe("Escolha o nível");
    await clicar(botaoConsultar());
    expect(confirm).not.toHaveBeenCalled();
    await escolher("intermediario");
    expect(botaoConsultar()!.disabled).toBe(false);
    expect(texto(botaoConsultar())).toBe("Consultar · R$ 5,58");
  });

  it("a confirmação diz os produtos e o preço do nível escolhido", async () => {
    await montar();
    await consultar("BRA2E19");
    await escolher("basico");
    await clicar(botaoConsultar());
    const pedido = confirm.mock.calls[0][0] as unknown as { title: string; message: string };
    expect(pedido.title).toBe("Consulta Básico");
    expect(pedido.message.replace(/\s+/g, " ")).toContain("BRA2E19: Base Estadual (Detran) + Recall + FIPE. Cerca de R$ 3,18");
  });

  it("guardada básica: o aprofundar para o econômico mostra '+R$ 7,40' e manda o id da guardada", async () => {
    guardadas = { QOZ7702: BASICA };
    pago = () => ({ status: 200, json: { consulta: { ...BASICA, id: "novo", nivel: "economico" }, guardada: false, saldo: null, aprofundar: [] } });
    await montar();
    await consultar("QOZ7702");
    const botoes = [...container.querySelectorAll("[data-aprofundar]")];
    expect(botoes.map((b) => [b.getAttribute("data-aprofundar"), texto(b), b.getAttribute("data-reaproveita")])).toEqual([
      ["intermediario", "Aprofundar: Intermediário · +R$ 2,40", "sim"],
      ["economico", "Aprofundar: Econômico 10/10 · +R$ 7,40", "sim"],
      ["completo", "Aprofundar: Completo · +R$ 30,00", "nao"],
    ]);
    // Reabrir a guardada não custou nada.
    expect(chamadas).toEqual([{ placa: "QOZ7702", soGuardada: true }]);
    await clicar(container.querySelector('[data-aprofundar="economico"]'));
    expect((confirm.mock.calls[0][0] as unknown as { title: string }).title).toBe("Aprofundar para Econômico 10/10");
    expect(pagos()).toEqual([{ placa: "QOZ7702", nivel: "economico", aprofundarDe: ID_DA_BASICA }]);
  });

  it("guardada velha: o aprofundar paga o nível inteiro e não manda id nenhum", async () => {
    guardadas = { QOZ7702: { ...BASICA, criadoEm: new Date(Date.now() - 10 * 86_400_000).toISOString() } };
    await montar();
    await consultar("QOZ7702");
    const economico = container.querySelector('[data-aprofundar="economico"]');
    expect(texto(economico)).toBe("Aprofundar: Econômico 10/10 · +R$ 10,58");
    await clicar(economico);
    expect(pagos()).toEqual([{ placa: "QOZ7702", nivel: "economico", aprofundarDe: null }]);
  });

  describe("a repetição (409)", () => {
    const anterior = { ...BASICA, consultadoPor: "Carla" };
    const comRepeticao = () => {
      pago = (corpo) =>
        corpo.repetir
          ? { status: 200, json: { consulta: { ...BASICA, id: "repetida" }, guardada: false, saldo: null, aprofundar: [] } }
          : { status: 409, json: { error: "QOZ7702 foi consultada no nível Básico há menos de 30 minutos.", repeticao: anterior } };
    };

    it("abre uma segunda confirmação; confirmando, paga de novo com `repetir`", async () => {
      comRepeticao();
      await montar();
      await consultar("QOZ7702");
      await escolher("basico");
      await clicar(botaoConsultar());
      expect(confirm).toHaveBeenCalledTimes(2);
      const segunda = confirm.mock.calls[1][0] as unknown as { title: string; message: string; confirmLabel: string; cancelLabel: string };
      expect(segunda.title).toBe("Consultada há pouco");
      expect(segunda.message).toContain("há menos de 30 minutos");
      expect(segunda.message).toContain("Carla");
      expect(segunda.cancelLabel).toBe("Abrir a guardada");
      expect(pagos()).toEqual([
        { placa: "QOZ7702", nivel: "basico", aprofundarDe: null },
        { placa: "QOZ7702", nivel: "basico", aprofundarDe: null, repetir: true },
      ]);
      expect(container.querySelector("[data-nivel]")).not.toBeNull();
    });

    it("cancelando a segunda, abre a anterior e não paga", async () => {
      comRepeticao();
      await montar();
      await consultar("QOZ7702");
      await escolher("basico");
      confirm.mockImplementationOnce(async () => true).mockImplementationOnce(async () => false);
      await clicar(botaoConsultar());
      expect(confirm).toHaveBeenCalledTimes(2);
      expect(pagos()).toHaveLength(1);
      expect(texto(container.querySelector("footer"))).toContain("Consulta guardada");
      expect(texto(container.querySelector("footer"))).toContain("por Carla");
      expect(cartoes()).toHaveLength(0);
    });
  });

  it("duplo clique em 'Consultar' manda UM pedido pago", async () => {
    let liberar: (v: boolean) => void = () => undefined;
    confirm.mockImplementation(() => new Promise<boolean>((r) => (liberar = r)));
    await montar();
    await consultar("BRA2E19");
    await escolher("basico");
    const botao = botaoConsultar()!;
    await act(async () => {
      botao.click();
      botao.click();
    });
    await act(async () => {
      liberar(true);
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(pagos()).toHaveLength(1);
  });
});
