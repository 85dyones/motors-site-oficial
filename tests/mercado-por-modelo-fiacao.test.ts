// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { lerParametrosDaCurva } from "../src/lib/avaliacaoRecomendacao";
import type { MercadoDoModelo } from "../src/lib/mercadoPorModelo";

/**
 * As abas de `/admin/consulta-veiculos` montadas de verdade (06 e 08/10/2026):
 * só o `fetch`, a cascata da FIPE, o `next/navigation` e o diálogo são
 * dublados.
 *
 * O que só a fiação prova: a tela ABRE na aba grátis; a grátis pede só o
 * modo pontual; a paga pergunta o custo ANTES de cobrar e não cobra sem o
 * "sim"; e o alerta de tendência chega com forma e rótulo, e não só com cor.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const confirm = vi.fn<(o: unknown) => Promise<boolean>>(async () => true);
vi.mock("../src/components/admin/ConfirmDialog", () => ({ useConfirm: () => ({ confirm }) }));
vi.mock("../src/lib/consultaFipe", () => ({
  listarMarcas: async () => [{ codigo: "59", nome: "VW - VolksWagen" }],
  listarModelos: async () => [{ codigo: "5940", nome: "T-Cross Highline 1.4 TSI" }],
  listarAnos: async () => [
    { codigo: "32000-1", nome: "Zero KM Flex" },
    { codigo: "2023-1", nome: "2023 Flex" },
    { codigo: "2022-1", nome: "2022 Flex" },
    { codigo: "2021-1", nome: "2021 Flex" },
  ],
}));

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
    { desvio_km_ate: null, pp: 10 },
  ],
  avaria_leve_pp: "[2,4]",
  avaria_seria_pp: "[8,12]",
  pendencia_pp: "[3,5]",
});

/** 25 meses terminando em out/2026: cai devagar no primeiro ano e depressa nos últimos seis meses. */
function mercado(): MercadoDoModelo {
  const valores: number[] = [];
  let v = 150000;
  for (let i = 0; i < 25; i++) {
    valores.push(v);
    v -= i >= 18 ? 2500 : 500;
  }
  const historico = valores.map((valor, i) => {
    const indice = 2026 * 12 + 9 - (24 - i);
    return { ano: Math.floor(indice / 12), mes: (indice % 12) + 1, valor };
  });
  const fipeAtual = valores[24];
  return {
    tipo: "carros",
    marcaCodigo: "59",
    modeloCodigo: "5940",
    ano: "2022-1",
    marca: "VW - VolksWagen",
    modelo: "T-Cross Highline 1.4 TSI",
    anoModelo: 2022,
    combustivel: "Flex",
    codigoFipe: "005510-1",
    referencia: "2026-10",
    fipeAtual,
    historico,
    porAno: [
      { ano: "2023-1", anoModelo: 2023, valor: 138000, escolhido: false, abaixoDoSeguintePct: null },
      { ano: "2022-1", anoModelo: 2022, valor: fipeAtual, escolhido: true, abaixoDoSeguintePct: -8.3 },
      { ano: "2021-1", anoModelo: 2021, valor: 115000, escolhido: false, abaixoDoSeguintePct: -9.1 },
    ],
    mesesQueFaltaram: 0,
    mesesForaDoPlano: 0,
  };
}

let chamadas: Array<{ url: string; corpo: Record<string, unknown> }>;
let resposta: { status: number; corpo: unknown };
let estimativa: Record<string, unknown>;
let container: HTMLDivElement;
let root: Root;

let historico: unknown = { ok: true, itens: [], semRegistroDeModelo: false };
let respostaDoGuardado: { status: number; corpo: unknown };
let respostaDaPesquisa: unknown;

async function montar(modelos: unknown = { ok: true, modelos: [] }) {
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    if (url.startsWith("/api/consulta-placa/historico")) {
      chamadas.push({ url, corpo: {} });
      return { ok: true, status: 200, json: async () => respostaDaPesquisa };
    }
    const corpo = JSON.parse(String(opcoes?.body)) as Record<string, unknown>;
    chamadas.push({ url, corpo });
    if (url === "/api/consulta-placa") return { ok: true, status: 200, json: async () => ({ consulta: null }) };
    if (corpo.estimar) return { ok: true, status: 200, json: async () => estimativa };
    if (corpo.modo === "guardado") return { ok: respostaDoGuardado.status < 400, status: respostaDoGuardado.status, json: async () => respostaDoGuardado.corpo };
    return { ok: resposta.status < 400, status: resposta.status, json: async () => resposta.corpo };
  }) as never;
  const { default: AbasDaConsulta } = await import("../src/components/admin/consulta/AbasDaConsulta");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(AbasDaConsulta, { recentes: { ok: true, consultas: [] }, modelos, curva: CURVA, temToken: true, homologacao: false, historico } as never));
  });
  await esperar();
}

async function esperar() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

const abaDe = (chave: "fipe" | "modelo" | "placa" | "historico") => container.querySelector(`[data-aba='${chave}']`) as HTMLElement;
const seletores = (chave: "fipe" | "modelo") => [...abaDe(chave).querySelectorAll("select")] as HTMLSelectElement[];

async function irPara(chave: "fipe" | "modelo" | "placa" | "historico") {
  await act(async () => {
    (container.querySelector(`input[value='${chave}']`) as HTMLInputElement).click();
  });
}

async function escolher(chave: "fipe" | "modelo", indice: number, valor: string) {
  const campo = seletores(chave)[indice];
  await act(async () => {
    campo.value = valor;
    campo.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await esperar();
}

async function analisar(chave: "fipe" | "modelo") {
  await escolher(chave, 0, "59");
  await escolher(chave, 1, "5940");
  await escolher(chave, 2, "2022-1");
  await act(async () => {
    (abaDe(chave).querySelector("form") as HTMLFormElement).requestSubmit();
  });
  await esperar();
}

const PEDIDO = { tipo: "carros", marca: "59", modelo: "5940", ano: "2022-1", anos: ["2023-1", "2022-1", "2021-1"] };

beforeEach(() => {
  chamadas = [];
  resposta = { status: 200, corpo: { mercado: mercado(), avisos: [], chamadasPagas: 22, mesesPagosGuardados: 22, custo: 1.32 } };
  estimativa = { mesesPagosNoMaximo: 22, precoPorMes: 0.06, temToken: true, homologacao: false };
  historico = { ok: true, itens: [], semRegistroDeModelo: false };
  respostaDoGuardado = { status: 200, corpo: { mercado: mercado(), avisos: [], modo: "guardado", guardadoAte: "2026-10", mesesNovos: 0, chamadasPagas: 0, custo: 0 } };
  respostaDaPesquisa = { ok: true, itens: [], semRegistroDeModelo: false };
  refresh.mockClear();
  confirm.mockClear();
  confirm.mockImplementation(async () => true);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("as três abas", () => {
  it("a tela abre na FIPE grátis; a paga e a da placa ficam montadas e escondidas", async () => {
    await montar();
    expect(container.querySelector("h1")?.textContent).toBe("Consulta de veículos");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(abaDe("fipe").hidden).toBe(false);
    expect(abaDe("modelo").hidden).toBe(true);
    expect(abaDe("placa").hidden).toBe(true);
    expect(container.querySelector("[data-descricao-da-aba]")?.textContent).toContain("Não gasta nada");
    await irPara("placa");
    expect(abaDe("fipe").hidden).toBe(true);
    expect(container.querySelector("[data-descricao-da-aba]")?.textContent).toContain("consulta paga");
  });
});

describe("a FIPE grátis", () => {
  it("a cascata tira o zero-km e pede só o modo pontual, uma chamada, sem estimar custo", async () => {
    await montar();
    await escolher("fipe", 0, "59");
    await escolher("fipe", 1, "5940");
    expect([...seletores("fipe")[2].options].map((o) => o.value)).toEqual(["", "2023-1", "2022-1", "2021-1"]);
    await analisar("fipe");
    expect(chamadas).toEqual([{ url: "/api/consulta-placa/modelo", corpo: { ...PEDIDO, modo: "pontual" } }]);
    expect(confirm).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it("mostra a FIPE de hoje, a faixa de compra e o ano a ano, e não a série nem a tendência", async () => {
    await montar();
    await analisar("fipe");
    const fipe = mercado().fipeAtual;
    expect(abaDe("fipe").querySelector("[data-fipe-atual]")?.textContent).toContain(fipe.toLocaleString("pt-BR"));
    expect(abaDe("fipe").querySelector("[data-faixa-de-compra]")?.textContent).toContain(Math.round(fipe * 0.8).toLocaleString("pt-BR"));
    expect([...abaDe("fipe").querySelectorAll("tr[data-ano]")].map((l) => l.getAttribute("data-ano"))).toEqual(["2023", "2022", "2021"]);
    expect(abaDe("fipe").querySelector("[data-tendencia]")).toBeNull();
    expect(abaDe("fipe").querySelector("svg[aria-label^='Variação percentual']")).toBeNull();
  });

  it("limite da FIPE vira aviso na tela, e não tela em branco", async () => {
    resposta = { status: 429, corpo: { error: "A FIPE atingiu o limite de consultas de hoje." } };
    await montar();
    await analisar("fipe");
    expect(abaDe("fipe").querySelector("[role=alert]")?.textContent).toContain("limite de consultas de hoje");
  });

  it("'Ver histórico e tendência' leva à aba paga o modelo que está NA TELA, e ela pergunta o custo antes de consultar", async () => {
    await montar();
    await analisar("fipe");
    // Trocar o ano depois de consultar não muda o que o botão leva: leva o que está na tela.
    await escolher("fipe", 2, "2021-1");
    chamadas = [];
    const botao = [...abaDe("fipe").querySelectorAll("button")].find((b) => b.textContent?.includes("Ver histórico"))!;
    await act(async () => {
      botao.click();
    });
    await esperar();
    expect(abaDe("modelo").hidden).toBe(false);
    expect(chamadas.map((c) => c.corpo)).toEqual([
      { ...PEDIDO, modo: "completa", estimar: true },
      { ...PEDIDO, modo: "completa" },
    ]);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(abaDe("modelo").querySelector("[data-tendencia]")).toBeTruthy();
    expect(seletores("modelo")[2].value).toBe("2022-1");
  });

  it("modo de teste (custo zero): o rodapé de custo não aparece; quem fala é o aviso", async () => {
    resposta = { status: 200, corpo: { mercado: mercado(), avisos: ["A APIBrasil está em modo de teste"], chamadasPagas: 22, mesesPagosGuardados: 0, custo: 0 } };
    estimativa = { ...estimativa, homologacao: true };
    await montar();
    await irPara("modelo");
    await analisar("modelo");
    expect(confirm).not.toHaveBeenCalled();
    expect(abaDe("modelo").querySelector("[data-custo-da-consulta]")).toBeNull();
    expect(abaDe("modelo").textContent).toContain("modo de teste");
  });
});

describe("a consulta Por modelo, paga", () => {
  it("diz quantos meses e quanto pode custar, e sem o 'sim' não consulta", async () => {
    confirm.mockImplementation(async () => false);
    await montar();
    await irPara("modelo");
    await analisar("modelo");
    const pergunta = confirm.mock.calls[0][0] as { message: string };
    expect(pergunta.message).toContain("T-Cross Highline 1.4 TSI 2022: até 22 meses");
    expect(pergunta.message).toContain("R$\u00a01,32");
    expect(chamadas.map((c) => c.corpo)).toEqual([{ ...PEDIDO, modo: "completa", estimar: true }]);
    expect(abaDe("modelo").querySelector("[data-tendencia]")).toBeNull();
  });

  it("nada a cobrar (tudo guardado): consulta direto, sem perguntar", async () => {
    estimativa = { ...estimativa, mesesPagosNoMaximo: 0 };
    resposta = { status: 200, corpo: { mercado: mercado(), avisos: [], chamadasPagas: 0, custo: 0 } };
    await montar();
    await irPara("modelo");
    await analisar("modelo");
    expect(confirm).not.toHaveBeenCalled();
    expect(chamadas).toHaveLength(2);
    expect(abaDe("modelo").querySelector("[data-custo-da-consulta]")).toBeNull();
  });

  it("depois de consultar, diz quantos meses foram pagos e quanto custou", async () => {
    await montar();
    await irPara("modelo");
    await analisar("modelo");
    const custo = abaDe("modelo").querySelector("[data-custo-da-consulta]")?.textContent ?? "";
    expect(custo).toContain("22 consultas pagas");
    expect(custo).toContain("1,32");
    expect(custo).toContain("22 meses ficaram guardados");
  });

  it("o alerta de tendência vem com forma, rótulo escrito e as frases que o sustentam", async () => {
    await montar();
    await irPara("modelo");
    await analisar("modelo");
    const alerta = abaDe("modelo").querySelector("[data-tendencia]")!;
    expect(alerta.getAttribute("data-tendencia")).toBe("acelerando");
    expect(alerta.querySelector("svg[data-estado='impeditivo']")).toBeTruthy();
    expect(alerta.textContent).toContain("ALERTA");
    expect(alerta.textContent).toContain("Desvalorizando cada vez mais rápido");
    expect(alerta.textContent).toContain("ganhando velocidade");
    expect(alerta.textContent).toContain("Por placa");
    expect(abaDe("modelo").querySelector("[data-meses-de-queda]")?.textContent).toBe("24");
  });

  it("três gráficos, cada um com os mesmos números em tabela ou em texto, e a faixa da mesma curva", async () => {
    await montar();
    await irPara("modelo");
    await analisar("modelo");
    const aba = abaDe("modelo");
    expect(aba.querySelector("svg[aria-label^='FIPE']")).toBeTruthy();
    expect(aba.querySelector("svg[aria-label^='Variação percentual']")).toBeTruthy();
    expect(aba.querySelector("svg[aria-label^='Valor FIPE de hoje']")).toBeTruthy();
    const anos = [...aba.querySelectorAll("tr[data-ano]")];
    expect(anos[1].textContent).toContain("escolhido");
    expect(anos[1].textContent).toContain("-8,3%");
    expect(aba.querySelector("[data-faixa-de-compra]")?.textContent).toContain(Math.round(mercado().fipeAtual * 0.8).toLocaleString("pt-BR"));
  });
});

describe("os modelos já consultados", () => {
  it("reabrem com um clique, na aba em que se clicou", async () => {
    await montar({ ok: true, modelos: [{ tipo: "carros", marcaCodigo: "59", modeloCodigo: "5940", ano: "2022-1", rotulo: "T-Cross Highline 1.4 TSI 2022" }] });
    const botao = [...abaDe("fipe").querySelectorAll("button")].find((b) => b.textContent?.includes("T-Cross"))!;
    await act(async () => {
      botao.click();
    });
    await esperar();
    // Do guardado: nenhuma chamada à FIPE nem à paga, e a tela diz isso.
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].corpo).toMatchObject({ marca: "59", modelo: "5940", ano: "2022-1", modo: "guardado" });
    expect(seletores("fipe")[2].value).toBe("2022-1");
    expect(abaDe("fipe").querySelector("[data-aberto-do-guardado]")?.textContent).toContain("sem nenhuma consulta");
    expect(abaDe("fipe").querySelector("[data-aberto-do-guardado]")?.textContent).toContain("Já é o mês mais novo");
  });

  it("sem a tabela no banco, a aba avisa da migração e continua funcionando", async () => {
    await montar({ ok: false, faltaMigracao: true, motivo: "relation does not exist" });
    expect(abaDe("fipe").textContent).toContain("20261006190000_fipe_historico");
    await analisar("fipe");
    expect(abaDe("fipe").querySelector("[data-fipe-atual]")).toBeTruthy();
  });
});

const ITEM_MODELO = {
  chave: "m:1",
  tipo: "modelo",
  quando: "2026-10-08T17:25:00Z",
  quem: "Dyones Oliveira",
  titulo: "VW - VolksWagen T-Cross Highline 1.4 TSI 2022",
  detalhe: "FIPE R$ 126.000 · out/2026 · 25 meses",
  custo: 1.32,
  homologacao: false,
  abrir: { tipo: "modelo", modo: "completa", marca: "59", modelo: "5940", ano: "2022-1" },
};
const ITEM_PLACA = { chave: "p:1", tipo: "placa", quando: "2026-10-07T12:00:00Z", quem: "Dyones Oliveira", titulo: "ABC1D23", detalhe: "VW T-CROSS", custo: 30, homologacao: false, abrir: { tipo: "placa", placa: "ABC1D23" } };

describe("o histórico de consultas", () => {
  it("lista as consultas da equipe, com tipo, resultado, custo e quem", async () => {
    historico = { ok: true, itens: [ITEM_MODELO, ITEM_PLACA], semRegistroDeModelo: false };
    await montar();
    await irPara("historico");
    const linhas = [...abaDe("historico").querySelectorAll("tr[data-item-do-historico]")];
    expect(linhas.map((l) => l.getAttribute("data-item-do-historico"))).toEqual(["modelo", "placa"]);
    expect(linhas[0].textContent).toContain("T-Cross");
    expect(linhas[0].textContent).toMatch(/R\$\s1,32/);
    expect(linhas[0].textContent).toContain("Dyones");
    expect(chamadas).toEqual([]);
  });

  it("abrir um modelo pago do histórico: vai à aba Por modelo, do guardado, sem perguntar custo; 'Atualizar dados' pergunta", async () => {
    historico = { ok: true, itens: [ITEM_MODELO], semRegistroDeModelo: false };
    respostaDoGuardado = { status: 200, corpo: { ...(respostaDoGuardado.corpo as object), mesesNovos: 1 } };
    await montar();
    await irPara("historico");
    const abrir = [...abaDe("historico").querySelectorAll("button")].find((b) => b.textContent === "Abrir")!;
    await act(async () => {
      abrir.click();
    });
    await esperar();
    expect(abaDe("modelo").hidden).toBe(false);
    expect(chamadas.map((c) => c.corpo)).toEqual([{ ...PEDIDO, modo: "guardado" }]);
    expect(confirm).not.toHaveBeenCalled();
    expect(abaDe("modelo").querySelector("[data-tendencia]")).toBeTruthy();
    expect(abaDe("modelo").querySelector("[data-aberto-do-guardado]")?.textContent).toContain("1 mês mais novo");

    chamadas = [];
    await act(async () => {
      (abaDe("modelo").querySelector("[data-atualizar-dados]") as HTMLButtonElement).click();
    });
    await esperar();
    expect(chamadas.map((c) => c.corpo)).toEqual([
      { ...PEDIDO, modo: "completa", estimar: true },
      { ...PEDIDO, modo: "completa" },
    ]);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(abaDe("modelo").querySelector("[data-aberto-do-guardado]")).toBeNull();
  });

  it("nada guardado ainda: abrir cai na consulta de sempre (na paga, com a pergunta do custo)", async () => {
    historico = { ok: true, itens: [ITEM_MODELO], semRegistroDeModelo: false };
    respostaDoGuardado = { status: 404, corpo: { error: "nada" } };
    await montar();
    await irPara("historico");
    await act(async () => {
      [...abaDe("historico").querySelectorAll("button")].find((b) => b.textContent === "Abrir")!.click();
    });
    await esperar();
    expect(chamadas.map((c) => c.corpo.modo)).toEqual(["guardado", "completa", "completa"]);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("abrir uma placa do histórico vai à aba da placa e pede só a guardada", async () => {
    historico = { ok: true, itens: [ITEM_PLACA], semRegistroDeModelo: false };
    await montar();
    await irPara("historico");
    await act(async () => {
      [...abaDe("historico").querySelectorAll("button")].find((b) => b.textContent === "Abrir")!.click();
    });
    await esperar();
    expect(abaDe("placa").hidden).toBe(false);
    expect(chamadas[0]).toEqual({ url: "/api/consulta-placa", corpo: { placa: "ABC1D23", soGuardada: true } });
  });

  it("a pesquisa vai ao banco com o termo e o filtro, e mostra o que voltou", async () => {
    respostaDaPesquisa = { ok: true, itens: [ITEM_PLACA], semRegistroDeModelo: false };
    await montar();
    await irPara("historico");
    const campo = abaDe("historico").querySelector("[data-pesquisa-do-historico]") as HTMLInputElement;
    await act(async () => {
      const definir = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      definir.call(campo, "t-cross");
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    await esperar();
    expect(chamadas.map((c) => c.url)).toEqual(["/api/consulta-placa/historico?q=t-cross&tipo=todas"]);
    expect(abaDe("historico").querySelectorAll("tr[data-item-do-historico]")).toHaveLength(1);
  });

  it("sem o registro no banco, avisa da migração", async () => {
    historico = { ok: true, itens: [], semRegistroDeModelo: true };
    await montar();
    expect(abaDe("historico").querySelector("[data-sem-registro]")?.textContent).toContain("20261008120000_consultas_de_modelo");
  });
});

describe("a impressão", () => {
  it("o botão abre a impressão do navegador, com o cabeçalho da loja e sem o que é só da tela", async () => {
    const imprimir = vi.fn();
    window.print = imprimir;
    await montar();
    await act(async () => {
      (container.querySelector("[data-imprimir]") as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(imprimir).toHaveBeenCalledTimes(1);
    const relatorio = container.querySelector("[data-relatorio]")!;
    expect(relatorio.querySelector("[data-cabecalho-da-impressao]")?.textContent).toContain("Motors Store · Consulta de veículos · FIPE · GRÁTIS");
    // Formulário, abas e botões não vão para o papel.
    expect(abaDe("fipe").querySelector("form")?.classList.contains("nao-imprimir")).toBe(true);
    expect(container.querySelector("[role=radiogroup]")?.classList.contains("nao-imprimir")).toBe(true);
  });
});
