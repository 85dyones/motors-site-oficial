import { describe, it, expect, beforeEach } from "vitest";
import { tendenciaDaFipe, type PontoDaFipe } from "../src/lib/consultaDePlaca";
import {
  ANOS_NA_COMPARACAO,
  MESES_DE_HISTORICO,
  alertaDeMercado,
  chaveDaReferencia,
  lerPedidoDeModelo,
  lerReferencias,
  lerValorDaFipe,
  mesDeReferencia,
  mesesSeguidosDeQueda,
  montarMercado,
  planoDeBusca,
  ritmoMensalEmReais,
  variacaoMesAMes,
  type LinhaDoHistorico,
  type MercadoDoModelo,
  type PedidoDeModelo,
} from "../src/lib/mercadoPorModelo";
import { consultarMercado, esquecerReferencias, type BancoDoHistorico } from "../src/lib/mercadoPorModelo-servidor";

/**
 * O mercado por modelo — a aba sem custo de `/admin/consulta-placa`
 * (06/10/2026).
 *
 * Dois riscos moram aqui. Um é a tela afirmar uma tendência que a série não
 * sustenta: por isso cada estado do alerta é testado contra uma série
 * desenhada à mão. O outro é o custo em chamadas: o token gratuito da FIPE
 * tem teto diário e é o mesmo da `/avaliacao` do site, então o que já está
 * guardado NÃO pode ser buscado de novo.
 */

const NOMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** `/references` como a FIPE devolve: do mês mais novo (out/2026) para trás. */
function referenciasCruas(quantas = 30) {
  return Array.from({ length: quantas }, (_, i) => {
    const indice = 2026 * 12 + 9 - i;
    return { code: String(330 - i), month: `${NOMES[indice % 12]}/${Math.floor(indice / 12)}` };
  });
}
const REFERENCIAS = lerReferencias(referenciasCruas());

const PEDIDO: PedidoDeModelo = { tipo: "carros", marca: "59", modelo: "5940", ano: "2022-1", outrosAnos: ["2023-1", "2021-1"] };

const linha = (ano: string, referencia: string, valor: number | null): LinhaDoHistorico => ({
  ano,
  referencia,
  valor,
  marca: "VW - VolksWagen",
  modelo: "T-Cross Highline 1.4 TSI",
  combustivel: "Flex",
  codigoFipe: "005510-1",
});

/** Uma série mensal terminando em out/2026, do mais antigo para o mais novo. */
function serie(valores: number[]): PontoDaFipe[] {
  return valores.map((valor, i) => {
    const indice = 2026 * 12 + 9 - (valores.length - 1 - i);
    return { ano: Math.floor(indice / 12), mes: (indice % 12) + 1, valor };
  });
}

const mercadoCom = (historico: PontoDaFipe[], porAno: MercadoDoModelo["porAno"] = []): MercadoDoModelo => ({
  tipo: "carros",
  marcaCodigo: "59",
  modeloCodigo: "5940",
  ano: "2022-1",
  marca: "VW",
  modelo: "T-Cross",
  anoModelo: 2022,
  combustivel: "Flex",
  codigoFipe: "005510-1",
  referencia: "2026-10",
  fipeAtual: historico[historico.length - 1].valor,
  historico,
  porAno,
  mesesQueFaltaram: 0,
  mesesForaDoPlano: 0,
});

describe("o pedido", () => {
  it("só passa código com forma de código: ele vira pedaço de URL", () => {
    expect(lerPedidoDeModelo({ tipo: "carros", marca: "59", modelo: "5940", ano: "2022-1" })).toEqual({
      tipo: "carros",
      marca: "59",
      modelo: "5940",
      ano: "2022-1",
      outrosAnos: [],
    });
    for (const torto of [
      null,
      "texto",
      { tipo: "barcos", marca: "59", modelo: "5940", ano: "2022-1" },
      { tipo: "carros", marca: "59/../x", modelo: "5940", ano: "2022-1" },
      { tipo: "carros", marca: "59", modelo: "5940?reference=1", ano: "2022-1" },
      { tipo: "carros", marca: "59", modelo: "5940", ano: "2022" },
    ]) {
      expect(lerPedidoDeModelo(torto), JSON.stringify(torto)).toBeNull();
    }
  });

  it("compara só o mesmo combustível, os anos mais próximos, sem zero-km e sem repetir", () => {
    const anos = ["32000-1", "2026-1", "2025-1", "2024-1", "2023-1", "2022-1", "2022-3", "2021-1", "2020-1", "2019-1", "2018-1", "2017-1", "2016-1", "2023-1", 7, "x"];
    const pedido = lerPedidoDeModelo({ tipo: "carros", marca: "59", modelo: "5940", ano: "2022-1", anos })!;
    expect(pedido.outrosAnos).toHaveLength(ANOS_NA_COMPARACAO - 1);
    expect(pedido.outrosAnos).not.toContain("2022-1");
    expect(pedido.outrosAnos).not.toContain("2022-3");
    expect(pedido.outrosAnos).not.toContain("32000-1");
    // Os vizinhos primeiro; os mais distantes são os que sobram de fora.
    expect(pedido.outrosAnos.slice(0, 2).sort()).toEqual(["2021-1", "2023-1"]);
    expect(pedido.outrosAnos).not.toContain("2016-1");
  });
});

describe("as respostas da FIPE", () => {
  it("lê o mês nos dois formatos: 'outubro/2026' (v2) e 'outubro de 2026'", () => {
    // O formato real da v2, conferido na API em 07/10/2026.
    expect(mesDeReferencia("outubro/2026")).toEqual({ ano: 2026, mes: 10 });
    expect(mesDeReferencia("setembro/2005")).toEqual({ ano: 2005, mes: 9 });
    expect(mesDeReferencia("outubro de 2026 ")).toEqual({ ano: 2026, mes: 10 });
    expect(mesDeReferencia("Marco de 2025")).toEqual({ ano: 2025, mes: 3 });
    expect(mesDeReferencia("março de 2025")).toEqual({ ano: 2025, mes: 3 });
    expect(mesDeReferencia("10/2026")).toBeNull();
    expect(mesDeReferencia(null)).toBeNull();
  });

  it("ordena as referências do mês mais novo para trás e larga item torto", () => {
    const lidas = lerReferencias([{ code: "300", month: "abril/2024" }, { code: "x", month: "maio/2024" }, null, { code: "330", month: "outubro/2026" }]);
    expect(lidas).toEqual([
      { codigo: 330, ano: 2026, mes: 10 },
      { codigo: 300, ano: 2024, mes: 4 },
    ]);
    expect(lerReferencias({ erro: "limite" })).toEqual([]);
  });

  it("lê o valor em reais e centavos", () => {
    expect(lerValorDaFipe({ price: "R$ 128.430,00", brand: "VW", model: "T-Cross", modelYear: 2022, fuel: "Flex", codeFipe: "005510-1" })).toEqual({
      valor: 128430,
      marca: "VW",
      modelo: "T-Cross",
      anoModelo: 2022,
      combustivel: "Flex",
      codigoFipe: "005510-1",
    });
    expect(lerValorDaFipe({ price: "R$ 0,00" })).toBeNull();
    expect(lerValorDaFipe({ error: "not found" })).toBeNull();
    expect(lerValorDaFipe([])).toBeNull();
  });
});

describe("o que falta buscar", () => {
  it("sem nada guardado: o mês corrente primeiro, depois os anos da comparação, depois a série", () => {
    const plano = planoDeBusca(PEDIDO, REFERENCIAS, []);
    // 25 meses do ano escolhido (o corrente e os 24 anteriores) e o corrente de cada outro ano.
    expect(plano).toHaveLength(MESES_DE_HISTORICO + 1 + PEDIDO.outrosAnos.length);
    expect(plano[0]).toEqual({ ano: "2022-1", referencia: REFERENCIAS[0] });
    expect(plano.slice(1, 3).map((b) => b.ano)).toEqual(["2023-1", "2021-1"]);
    expect(plano.slice(3).every((b) => b.ano === "2022-1")).toBe(true);
  });

  it("o que está guardado não é pedido de novo, nem o mês em que a FIPE não tinha o carro", () => {
    const guardadas = [
      linha("2022-1", chaveDaReferencia(REFERENCIAS[0]), 128430),
      linha("2022-1", chaveDaReferencia(REFERENCIAS[5]), null),
      linha("2023-1", chaveDaReferencia(REFERENCIAS[0]), 140000),
    ];
    const plano = planoDeBusca(PEDIDO, REFERENCIAS, guardadas);
    expect(plano).toHaveLength(MESES_DE_HISTORICO + 1 + 2 - 3);
    expect(plano.some((b) => b.ano === "2022-1" && b.referencia.codigo === REFERENCIAS[5].codigo)).toBe(false);
  });

  it("no mês seguinte, um modelo já consultado custa só o que é novo", () => {
    const tudo = [
      ...REFERENCIAS.slice(1, MESES_DE_HISTORICO + 2).map((r) => linha("2022-1", chaveDaReferencia(r), 100000)),
      ...PEDIDO.outrosAnos.map((a) => linha(a, chaveDaReferencia(REFERENCIAS[1]), 100000)),
    ];
    // Só o mês novo do escolhido e o mês novo de cada ano da comparação.
    expect(planoDeBusca(PEDIDO, REFERENCIAS, tudo)).toHaveLength(1 + PEDIDO.outrosAnos.length);
  });
});

describe("o retrato do mercado", () => {
  const linhas = [
    ...REFERENCIAS.slice(0, 13).map((r, i) => linha("2022-1", chaveDaReferencia(r), 120000 + i * 1000)),
    linha("2022-1", chaveDaReferencia(REFERENCIAS[13]), null),
    linha("2023-1", chaveDaReferencia(REFERENCIAS[0]), 132000),
    linha("2021-1", chaveDaReferencia(REFERENCIAS[0]), 108000),
  ];

  it("sem o valor do mês corrente não há retrato", () => {
    expect(montarMercado(PEDIDO, REFERENCIAS, linhas.slice(1))).toBeNull();
    expect(montarMercado(PEDIDO, [], linhas)).toBeNull();
  });

  it("monta a série em ordem, conta o que faltou e não conta como falta o mês sem tabela", () => {
    const m = montarMercado(PEDIDO, REFERENCIAS, linhas)!;
    expect(m.fipeAtual).toBe(120000);
    expect(m.referencia).toBe("2026-10");
    expect(m.historico).toHaveLength(13);
    expect(m.historico[0]).toEqual({ ano: 2025, mes: 10, valor: 132000 });
    expect(m.historico[12]).toEqual({ ano: 2026, mes: 10, valor: 120000 });
    // 25 meses no recorte: 13 com valor, 1 respondido "não tinha", 11 sem leitura.
    expect(m.mesesQueFaltaram).toBe(11);
    expect(m.marca).toBe("VW - VolksWagen");
  });

  it("compara cada ano com o ano-modelo seguinte, e só com o vizinho", () => {
    const m = montarMercado(PEDIDO, REFERENCIAS, linhas)!;
    expect(m.porAno.map((a) => [a.anoModelo, a.escolhido, a.abaixoDoSeguintePct])).toEqual([
      [2023, false, null],
      [2022, true, -9.1],
      [2021, false, -10],
    ]);
    // Sem o 2023, o 2022 vira o mais novo; sem o 2022 não há retrato, então tira-se o 2021 do meio.
    const semVizinho = montarMercado({ ...PEDIDO, outrosAnos: ["2020-1"] }, REFERENCIAS, [...linhas, linha("2020-1", chaveDaReferencia(REFERENCIAS[0]), 99000)])!;
    expect(semVizinho.porAno.find((a) => a.anoModelo === 2020)?.abaixoDoSeguintePct).toBeNull();
  });
});

describe("a leitura da série", () => {
  it("variação mês a mês só entre meses vizinhos de calendário", () => {
    const s = serie([100000, 99000, 99000, 101000]);
    expect(variacaoMesAMes(s)).toEqual([
      { ano: 2026, mes: 8, pct: -1, reais: -1000 },
      { ano: 2026, mes: 9, pct: 0, reais: 0 },
      { ano: 2026, mes: 10, pct: 2, reais: 2000 },
    ]);
    // Com buraco em ago/2026, set não é comparado com jul.
    const comBuraco = [s[0], s[2], s[3]];
    expect(variacaoMesAMes(comBuraco).map((v) => v.mes)).toEqual([10]);
  });

  it("conta os meses seguidos de queda do mês atual para trás", () => {
    expect(mesesSeguidosDeQueda(serie([100, 101, 100, 99, 98]))).toBe(3);
    expect(mesesSeguidosDeQueda(serie([100, 99, 98, 98]))).toBe(0);
    expect(mesesSeguidosDeQueda(serie([100]))).toBe(0);
  });

  it("o ritmo em reais é a média de seis meses, e não existe sem a série", () => {
    expect(ritmoMensalEmReais(serie([106000, 105000, 104000, 103000, 102000, 101000, 100000]))).toBe(-1000);
    expect(ritmoMensalEmReais(serie([103000, 102000, 101000, 100000]))).toBeNull();
    expect(ritmoMensalEmReais([])).toBeNull();
  });
});

describe("o alerta de desvalorização", () => {
  const alerta = (valores: number[], porAno: MercadoDoModelo["porAno"] = []) => {
    const m = mercadoCom(serie(valores), porAno);
    return alertaDeMercado(m, tendenciaDaFipe(m.historico));
  };
  /** 13 meses: `antes` de variação total nos seis primeiros, `depois` nos seis últimos. */
  const doisTempos = (antes: number, depois: number) => {
    const valores = [100000];
    for (let i = 0; i < 6; i++) valores.push(valores[valores.length - 1] + antes / 6);
    for (let i = 0; i < 6; i++) valores.push(valores[valores.length - 1] + depois / 6);
    return valores;
  };

  it("menos de seis meses de tabela: não afirma nada", () => {
    const a = alerta([100000, 99000, 98000]);
    expect(a.estado).toBe("sem_serie");
  });

  it("tabela que não caiu em seis meses é estável, mesmo tendo caído antes", () => {
    expect(alerta(doisTempos(-6000, 0)).estado).toBe("estavel");
    const subindo = alerta(doisTempos(0, 3000));
    expect(subindo.estado).toBe("estavel");
    expect(subindo.linhas[0]).toContain("subiu");
  });

  it("queda no mesmo ritmo ou mais lenta que antes é 'caindo'", () => {
    const a = alerta(doisTempos(-12000, -3000));
    expect(a.estado).toBe("caindo");
    expect(a.titulo).toBe("Desvalorizando");
    expect(a.linhas.join(" ")).toContain("perdendo força");
    expect(a.linhas.join(" ")).toContain("12 meses seguidos de queda");
    expect(a.linhas.join(" ")).toContain("Cada mês de pátio custa cerca de R$");
  });

  it("últimos seis meses caindo mais que os seis anteriores é 'acelerando'", () => {
    const a = alerta(doisTempos(-3000, -12000));
    expect(a.estado).toBe("acelerando");
    expect(a.linhas.join(" ")).toContain("ganhando velocidade");
    expect(a.linhas.join(" ")).toContain("menor valor do período");
  });

  it("compara a queda de um ano com o que um ano de idade custa no modelo", () => {
    const ano = (anoModelo: number, valor: number, escolhido: boolean, abaixo: number | null) => ({ ano: `${anoModelo}-1`, anoModelo, valor, escolhido, abaixoDoSeguintePct: abaixo });
    // Caiu 15% em doze meses.
    const valores = doisTempos(-7500, -7500);
    const perdeuMais = alerta(valores, [ano(2023, 93500, false, null), ano(2022, 85000, true, -9.1)]);
    expect(perdeuMais.linhas.join(" ")).toContain("perdeu mais que um ano de idade");
    const dentro = alerta(valores, [ano(2023, 106250, false, null), ano(2022, 85000, true, -20)]);
    expect(dentro.linhas.join(" ")).toContain("é a perda de um ano de idade");
    // Sem vizinho, a frase não aparece: não há com o que comparar.
    expect(alerta(valores, [ano(2022, 85000, true, null)]).linhas.join(" ")).not.toContain("ano de idade");
  });
});

describe("a busca: o que está guardado não gasta o teto da FIPE", () => {
  let pedidas: string[];
  let gravadas: LinhaDoHistorico[];
  let guardadas: LinhaDoHistorico[];
  let respostaDe: (url: string) => { status: number; corpo: unknown };

  const buscar = async (url: string) => {
    pedidas.push(url);
    const { status, corpo } = respostaDe(url);
    return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
  };
  const banco = (leitura?: Awaited<ReturnType<BancoDoHistorico["ler"]>>): BancoDoHistorico => ({
    ler: async () => leitura ?? { ok: true, linhas: guardadas },
    gravar: async (_p, linhas) => {
      gravadas.push(...linhas);
      return { ok: true };
    },
  });
  const valor = { price: "R$ 100.000,00", brand: "VW", model: "T-Cross", modelYear: 2022, fuel: "Flex", codeFipe: "005510-1" };
  const padrao = (url: string) => (url.endsWith("/references") ? { status: 200, corpo: referenciasCruas() } : { status: 200, corpo: valor });

  beforeEach(() => {
    esquecerReferencias();
    pedidas = [];
    gravadas = [];
    guardadas = [];
    respostaDe = padrao;
  });

  it("primeira consulta: busca tudo, com o mês no parâmetro, e guarda", async () => {
    const r = await consultarMercado(PEDIDO, { buscar: buscar as never, token: "tok", banco: banco() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.chamadas).toBe(MESES_DE_HISTORICO + 1 + 2);
    expect(gravadas).toHaveLength(r.chamadas);
    expect(pedidas.filter((u) => u.includes("reference=330"))).toHaveLength(3);
    expect(pedidas.some((u) => u.includes("/cars/brands/59/models/5940/years/2022-1?reference=329"))).toBe(true);
    expect(r.mercado.historico).toHaveLength(MESES_DE_HISTORICO + 1);
    expect(r.avisos).toEqual([]);
  });

  it("segunda consulta: nenhuma chamada de valor", async () => {
    await consultarMercado(PEDIDO, { buscar: buscar as never, token: "tok", banco: banco() });
    guardadas = [...gravadas];
    pedidas = [];
    gravadas = [];
    const r = await consultarMercado(PEDIDO, { buscar: buscar as never, token: "tok", banco: banco() });
    expect(r.ok && r.chamadas).toBe(0);
    // Nem a lista de meses: ela fica em memória.
    expect(pedidas).toEqual([]);
    expect(gravadas).toEqual([]);
  });

  it("404 é resposta: o mês fica guardado como 'sem valor' e some da série", async () => {
    respostaDe = (url) => (url.includes("years/2022-1?reference=310") ? { status: 404, corpo: { error: "not found" } } : padrao(url));
    const r = await consultarMercado(PEDIDO, { buscar: buscar as never, token: undefined, banco: banco() });
    expect(r.ok && r.mercado.historico).toHaveLength(MESES_DE_HISTORICO);
    expect(r.ok && r.mercado.mesesQueFaltaram).toBe(0);
    expect(gravadas.filter((l) => l.valor === null)).toHaveLength(1);
  });

  it("429 logo no mês corrente: para a fila e diz que é o limite do dia", async () => {
    respostaDe = (url) => (url.endsWith("/references") ? padrao(url) : { status: 429, corpo: {} });
    const r = await consultarMercado(PEDIDO, { buscar: buscar as never, token: "tok", banco: banco() });
    expect(r).toMatchObject({ ok: false, status: 429 });
    // Uma chamada por trabalhador: ninguém insiste contra o limite.
    expect(pedidas.filter((u) => !u.endsWith("/references")).length).toBeLessThanOrEqual(5);
  });

  it("429 no meio: entrega o que tem e avisa que o histórico está incompleto", async () => {
    let n = 0;
    respostaDe = (url) => (url.endsWith("/references") ? padrao(url) : ++n > 10 ? { status: 429, corpo: {} } : { status: 200, corpo: valor });
    const r = await consultarMercado(PEDIDO, { buscar: buscar as never, token: "tok", banco: banco() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mercado.mesesQueFaltaram).toBeGreaterThan(0);
    expect(r.avisos.join(" ")).toContain("limite de consultas de hoje");
    expect(gravadas).toHaveLength(10);
  });

  it("a FIPE corta sem dizer 429: para depois de poucas falhas seguidas e diz o motivo", async () => {
    // O que aconteceu em 07/10/2026 no Preview, sem token: quatro vieram, o resto não.
    let n = 0;
    respostaDe = (url) => (url.endsWith("/references") ? padrao(url) : ++n > 4 ? { status: 403, corpo: {} } : { status: 200, corpo: valor });
    const r = await consultarMercado(PEDIDO, { buscar: buscar as never, token: undefined, banco: banco() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(gravadas).toHaveLength(4);
    // Não insiste nas 27: quatro falhas seguidas param a fila (mais as que já estavam em voo).
    expect(r.chamadas).toBeLessThan(15);
    expect(r.avisos.join(" ")).toContain("respondeu 403");
    expect(r.avisos.join(" ")).toContain("FIPE_API_TOKEN");
  });

  it("falha solta no meio não para a fila, e com token não se fala de token", async () => {
    let n = 0;
    respostaDe = (url) => (url.endsWith("/references") ? padrao(url) : ++n % 6 === 0 ? { status: 500, corpo: {} } : { status: 200, corpo: valor });
    const r = await consultarMercado(PEDIDO, { buscar: buscar as never, token: "tok", banco: banco() });
    expect(r.ok && r.chamadas).toBe(MESES_DE_HISTORICO + 1 + 2);
    expect(r.ok && r.avisos.join(" ")).toContain("respondeu 500");
    expect(r.ok && r.avisos.join(" ")).not.toContain("FIPE_API_TOKEN");
  });

  it("402 é mês fora do plano da FIPE: para, mostra o que veio, não manda tentar de novo e não insiste depois", async () => {
    // O que aconteceu em 07 e 08/10/2026 em produção, com token: outubro, setembro e agosto vieram; julho para trás, 402.
    const fora = (url: string) => /reference=(\d+)/.test(url) && Number(/reference=(\d+)/.exec(url)![1]) <= 327;
    respostaDe = (url) => (fora(url) ? { status: 402, corpo: {} } : padrao(url));
    const r = await consultarMercado(PEDIDO, { buscar: buscar as never, token: "tok", banco: banco() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mercado.historico).toHaveLength(3);
    expect(r.mercado.mesesForaDoPlano).toBe(MESES_DE_HISTORICO + 1 - 3);
    expect(r.mercado.mesesQueFaltaram).toBe(0);
    // Três do mês corrente, dois meses anteriores, e no máximo um 402 por trabalhador.
    expect(r.chamadas).toBeLessThanOrEqual(3 + 2 + 3);
    const aviso = r.avisos.join(" ");
    expect(aviso).toContain("julho/2026");
    expect(aviso).toContain("402");
    expect(aviso).not.toContain("busca só o que falta");
    expect(gravadas.every((l) => l.valor !== null)).toBe(true);

    // De novo: o que veio está guardado e o corte está em memória, então nenhuma chamada.
    guardadas = [...gravadas];
    pedidas = [];
    const de_novo = await consultarMercado(PEDIDO, { buscar: buscar as never, token: "tok", banco: banco() });
    expect(de_novo.ok && de_novo.chamadas).toBe(0);
    expect(pedidas).toEqual([]);
    expect(de_novo.ok && de_novo.mercado.mesesForaDoPlano).toBe(MESES_DE_HISTORICO + 1 - 3);
  });

  it("402 no mês corrente: diz que é o plano da FIPE, e não limite do dia", async () => {
    respostaDe = (url) => (url.endsWith("/references") ? padrao(url) : { status: 402, corpo: {} });
    const r = await consultarMercado(PEDIDO, { buscar: buscar as never, token: "tok", banco: banco() });
    expect(r).toMatchObject({ ok: false, status: 502 });
    expect(!r.ok && r.motivo).toContain("plano");
  });

  it("sem a tabela no banco: funciona, não grava e avisa da migração", async () => {
    const r = await consultarMercado(PEDIDO, {
      buscar: buscar as never,
      token: "tok",
      banco: banco({ ok: false, faltaMigracao: true, motivo: "relation does not exist" }),
    });
    expect(r.ok).toBe(true);
    expect(gravadas).toEqual([]);
    expect(r.ok && r.avisos.join(" ")).toContain("20261006190000_fipe_historico");
  });

  it("a FIPE fora do ar na lista de meses é 502, e a falha não fica em memória", async () => {
    respostaDe = () => ({ status: 503, corpo: {} });
    expect(await consultarMercado(PEDIDO, { buscar: buscar as never, token: "tok", banco: banco() })).toMatchObject({ ok: false, status: 502 });
    respostaDe = padrao;
    expect((await consultarMercado(PEDIDO, { buscar: buscar as never, token: "tok", banco: banco() })).ok).toBe(true);
  });
});
