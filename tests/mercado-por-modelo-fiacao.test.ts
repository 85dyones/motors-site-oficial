// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { lerParametrosDaCurva } from "../src/lib/avaliacaoRecomendacao";
import type { MercadoDoModelo } from "../src/lib/mercadoPorModelo";

/**
 * As abas de `/admin/consulta-placa` montadas de verdade (06/10/2026): só o
 * `fetch`, a cascata da FIPE, o `next/navigation` e o diálogo são dublados.
 *
 * O que só a fiação prova: a tela ABRE na aba sem custo, a análise por modelo
 * nunca bate na rota paga, e o alerta de tendência chega com forma e rótulo,
 * e não só com cor.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../src/components/admin/ConfirmDialog", () => ({ useConfirm: () => ({ confirm: vi.fn(async () => true) }) }));
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
let container: HTMLDivElement;
let root: Root;

async function montar(modelos: unknown = { ok: true, modelos: [] }) {
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    chamadas.push({ url, corpo: JSON.parse(String(opcoes?.body)) });
    return { ok: resposta.status < 400, status: resposta.status, json: async () => resposta.corpo };
  }) as never;
  const { default: AbasDaConsulta } = await import("../src/components/admin/consulta/AbasDaConsulta");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(AbasDaConsulta, { recentes: { ok: true, consultas: [] }, modelos, curva: CURVA, temToken: true, homologacao: false } as never));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const aba = () => container.querySelector("[data-aba='modelo']") as HTMLElement;
const seletores = () => [...aba().querySelectorAll("select")] as HTMLSelectElement[];

async function escolher(indice: number, valor: string) {
  const campo = seletores()[indice];
  await act(async () => {
    campo.value = valor;
    campo.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function analisar() {
  await escolher(0, "59");
  await escolher(1, "5940");
  await escolher(2, "2022-1");
  await act(async () => {
    (aba().querySelector("form") as HTMLFormElement).requestSubmit();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  chamadas = [];
  resposta = { status: 200, corpo: { mercado: mercado(), avisos: [] } };
  refresh.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("as duas abas", () => {
  it("a tela abre na aba sem custo, e a da placa fica montada e escondida", async () => {
    await montar();
    expect(aba().hidden).toBe(false);
    expect((container.querySelector("[data-aba='placa']") as HTMLElement).hidden).toBe(true);
    expect(container.querySelector("[data-descricao-da-aba]")?.textContent).toContain("Não gasta consulta");
    await act(async () => {
      (container.querySelector("input[value='placa']") as HTMLInputElement).click();
    });
    expect(aba().hidden).toBe(true);
    expect(container.querySelector("[data-descricao-da-aba]")?.textContent).toContain("consulta paga");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });
});

describe("a análise por modelo", () => {
  it("a cascata tira o zero-km e manda os anos do modelo para a comparação, só na rota gratuita", async () => {
    await montar();
    await escolher(0, "59");
    await escolher(1, "5940");
    expect([...seletores()[2].options].map((o) => o.value)).toEqual(["", "2023-1", "2022-1", "2021-1"]);
    await analisar();
    expect(chamadas).toEqual([
      { url: "/api/consulta-placa/modelo", corpo: { tipo: "carros", marca: "59", modelo: "5940", ano: "2022-1", anos: ["2023-1", "2022-1", "2021-1"] } },
    ]);
    expect(refresh).toHaveBeenCalled();
  });

  it("o alerta de tendência vem com forma, rótulo escrito e as frases que o sustentam", async () => {
    await montar();
    await analisar();
    const alerta = container.querySelector("[data-tendencia]")!;
    expect(alerta.getAttribute("data-tendencia")).toBe("acelerando");
    expect(alerta.querySelector("svg[data-estado='impeditivo']")).toBeTruthy();
    expect(alerta.textContent).toContain("ALERTA");
    expect(alerta.textContent).toContain("Desvalorizando cada vez mais rápido");
    expect(alerta.textContent).toContain("ganhando velocidade");
    // E diz o que NÃO é: a tabela, e não o carro.
    expect(alerta.textContent).toContain("Por placa");
    expect(container.querySelector("[data-meses-de-queda]")?.textContent).toBe("24");
  });

  it("a faixa de compra sai da mesma curva da aba da placa", async () => {
    await montar();
    await analisar();
    const fipe = mercado().fipeAtual;
    const esperado = Math.round(fipe * 0.8).toLocaleString("pt-BR");
    expect(aba().querySelector("[data-faixa-de-compra]")?.textContent).toContain(esperado);
  });

  it("três gráficos, cada um com os mesmos números em tabela ou em texto", async () => {
    await montar();
    await analisar();
    expect(aba().querySelector("svg[aria-label^='FIPE']")).toBeTruthy();
    expect(aba().querySelector("svg[aria-label^='Variação percentual']")).toBeTruthy();
    expect(aba().querySelector("svg[aria-label^='Valor FIPE de hoje']")).toBeTruthy();
    const anos = [...aba().querySelectorAll("tr[data-ano]")];
    expect(anos.map((l) => l.getAttribute("data-ano"))).toEqual(["2023", "2022", "2021"]);
    expect(anos[1].textContent).toContain("escolhido");
    expect(anos[1].textContent).toContain("-8,3%");
  });

  it("limite da FIPE vira aviso na tela, e não tela em branco", async () => {
    resposta = { status: 429, corpo: { error: "A FIPE atingiu o limite de consultas de hoje." } };
    await montar();
    await analisar();
    expect(aba().querySelector("[role=alert]")?.textContent).toContain("limite de consultas de hoje");
    expect(container.querySelector("[data-tendencia]")).toBeNull();
  });

  it("modelo já consultado reabre com um clique", async () => {
    await montar({ ok: true, modelos: [{ tipo: "carros", marcaCodigo: "59", modeloCodigo: "5940", ano: "2022-1", rotulo: "T-Cross Highline 1.4 TSI 2022" }] });
    const botao = [...aba().querySelectorAll("button")].find((b) => b.textContent?.includes("T-Cross"))!;
    await act(async () => {
      botao.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].corpo).toMatchObject({ marca: "59", modelo: "5940", ano: "2022-1" });
    expect(container.querySelector("[data-tendencia]")).toBeTruthy();
    expect(seletores()[2].value).toBe("2022-1");
  });

  it("sem a tabela no banco, a aba avisa da migração e continua funcionando", async () => {
    await montar({ ok: false, faltaMigracao: true, motivo: "relation does not exist" });
    expect(aba().textContent).toContain("20261006190000_fipe_historico");
    await analisar();
    expect(container.querySelector("[data-tendencia]")).toBeTruthy();
  });
});
