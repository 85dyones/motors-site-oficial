import { describe, it, expect } from "vitest";
import {
  REGRA_DA_CURVA,
  fipeParaNumero,
  idadeEmAnos,
  lerParametrosDaCurva,
  recomendarAvaliacao,
  type ParametrosDaCurva,
} from "../src/lib/avaliacaoRecomendacao";

/**
 * A régua de compra — a curva de deságio da spec 11, lida de
 * `parametros_avaliacao`.
 *
 * Esta régua decide o número que o consultor vê ao abrir o lead, então ela
 * merece trava: um erro aqui não quebra a build nem aparece na tela — vira
 * proposta errada para um cliente real.
 *
 * Trocou a régua de três faixas fixas (10% / 15–20% / "30% ou mais", de
 * 2026-08-06) em 2026-09-24, por decisão do dono. O que a antiga errava, e
 * estes testes travam: km alto fora da faixa de avarias não mexia no número,
 * e carro novo saía com 10%.
 *
 * Os parâmetros abaixo são a linha vigente de produção (a semente da f0f,
 * mais `km_por_ano`), no formato em que o PostgREST a devolve: numeric em
 * texto, `numrange` em texto, `degraus_km` em jsonb. "Hoje" é fixo: a idade
 * do carro depende dele.
 */

const LINHA_DO_BANCO = {
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
  vigencia_ate: null,
};

const P = lerParametrosDaCurva(LINHA_DO_BANCO) as ParametrosDaCurva;
/** 1º de julho de 2026: um 2020 tem ~6,5 anos, e o esperado ~97,5 mil km. */
const HOJE = new Date(Date.UTC(2026, 6, 1, 12));
const FIPE = "R$ 100.000,00"; // números redondos deixam a conta óbvia

function avaliar(mecanica: string, conservacao: string, km: number | null, anoModelo = 2020, fipe: string | null = FIPE) {
  const r = recomendarAvaliacao({
    estadoMecanico: mecanica,
    estadoConservacao: conservacao,
    quilometragem: km,
    anoModelo,
    fipeValor: fipe,
    parametros: P,
    hoje: HOJE,
  });
  if (!r) throw new Error("com parâmetros legíveis a recomendação não pode ser nula");
  return r;
}

/** O km esperado de um 2020 no "hoje" dos testes, pela mesma conta da régua. */
const ESPERADO_2020 = Math.round(15000 * idadeEmAnos(2020, HOJE));

describe("a linha de parametros_avaliacao vira régua", () => {
  it("lê o formato do PostgREST", () => {
    expect(P).toMatchObject({
      basePp: 20,
      excepcionalPp: -5,
      pisoPct: 15,
      tetoPct: 40,
      kmPorAno: 15000,
      avariaLeve: [2, 4],
      avariaSeria: [8, 12],
      pendencia: [3, 5],
      vigenciaDesde: "2026-08-30",
    });
    expect(P.degrausKm.at(-1)).toEqual({ ate: null, pp: 10 });
  });

  it("degraus fora de ordem são ordenados; o aberto fica por último", () => {
    const embaralhada = { ...LINHA_DO_BANCO, degraus_km: [...LINHA_DO_BANCO.degraus_km].reverse() };
    expect(lerParametrosDaCurva(embaralhada)?.degrausKm.map((d) => d.ate)).toEqual([5000, 15000, 30000, 50000, null]);
  });

  it("linha torta não vira régua — e sem régua não há sugestão, nunca uma inventada", () => {
    for (const torta of [
      null,
      {},
      { ...LINHA_DO_BANCO, km_por_ano: undefined }, // migração da coluna ainda não aplicada
      { ...LINHA_DO_BANCO, km_por_ano: 0 },
      { ...LINHA_DO_BANCO, piso_pct: "40.00" }, // piso não pode alcançar o teto
      { ...LINHA_DO_BANCO, avaria_leve_pp: "2 a 4" },
      { ...LINHA_DO_BANCO, avaria_seria_pp: "[12,8]" },
      { ...LINHA_DO_BANCO, degraus_km: [] },
      { ...LINHA_DO_BANCO, degraus_km: [{ pp: 0, desvio_km_ate: null }, { pp: 2, desvio_km_ate: 5000 }, { pp: 3, desvio_km_ate: null }] },
      { ...LINHA_DO_BANCO, base_pp: "vinte" },
    ]) {
      expect(lerParametrosDaCurva(torta), JSON.stringify(torta)).toBeNull();
    }
    expect(
      recomendarAvaliacao({
        estadoMecanico: "bom",
        estadoConservacao: "riscos",
        quilometragem: 50000,
        anoModelo: 2020,
        fipeValor: FIPE,
        parametros: null,
      }),
    ).toBeNull();
  });
});

describe("idade do carro", () => {
  it("conta de 1º de janeiro do ano-modelo, com fração", () => {
    expect(idadeEmAnos(2020, HOJE)).toBeCloseTo(6.5, 1);
  });

  it("nunca menos de um ano — carro zero não ganha degrau por rodar 3 mil km", () => {
    expect(idadeEmAnos(2026, HOJE)).toBe(1);
    expect(idadeEmAnos(2027, HOJE)).toBe(1);
  });
});

describe("a conta", () => {
  it("carro no km esperado e sem avaria: só a base", () => {
    const r = avaliar("bom", "riscos", ESPERADO_2020);
    expect(r.desconto_min).toBe(20);
    expect(r.desconto_max).toBe(20);
    expect(r.faixa).toBe("padrao");
    expect(r.componentes.map((c) => c.nome)).toEqual(["base", "km"]);
    expect(r.valor_sugerido_min).toBe(80000);
    expect(r.valor_sugerido_max).toBe(80000);
    expect(r.regra).toBe(REGRA_DA_CURVA);
    expect(r.parametros_id).toBe(LINHA_DO_BANCO.id);
  });

  it("o km acima do esperado cai no degrau certo — inclusive sem avaria nenhuma", () => {
    // A régua de 3 faixas deixava o km alto sem efeito fora das avarias.
    const casos: Array<[number, number]> = [
      [ESPERADO_2020 + 5000, 0],
      [ESPERADO_2020 + 5001, 2],
      [ESPERADO_2020 + 15000, 2],
      [ESPERADO_2020 + 30000, 4],
      [ESPERADO_2020 + 50000, 7],
      [ESPERADO_2020 + 50001, 10],
      [400000, 10],
    ];
    for (const [quilometragem, degrau] of casos) {
      const r = avaliar("bom", "riscos", quilometragem);
      expect(r.componentes.find((c) => c.nome === "km")?.pp_min, `${quilometragem} km`).toBe(degrau);
      expect(r.desconto_min).toBe(20 + degrau);
    }
  });

  it("km abaixo do esperado não é prêmio", () => {
    const r = avaliar("bom", "riscos", 10000);
    expect(r.km_desvio).toBeLessThan(0);
    expect(r.desconto_min).toBe(20);
  });

  it("avaria leve soma o intervalo leve; séria, o sério; e as duas somam", () => {
    expect([avaliar("atencao", "riscos", ESPERADO_2020).desconto_min, avaliar("atencao", "riscos", ESPERADO_2020).desconto_max]).toEqual([22, 24]);
    expect([avaliar("bom", "reparos", ESPERADO_2020).desconto_min, avaliar("bom", "reparos", ESPERADO_2020).desconto_max]).toEqual([22, 24]);
    const seria = avaliar("ruim", "impecavel", ESPERADO_2020);
    expect([seria.desconto_min, seria.desconto_max]).toEqual([28, 32]);
    const duas = avaliar("atencao", "avariado", ESPERADO_2020);
    expect([duas.desconto_min, duas.desconto_max]).toEqual([30, 36]);
    expect(duas.faixa).toBe("com_avarias");
    // O maior deságio produz o MENOR valor.
    expect(duas.valor_sugerido_min).toBe(64000);
    expect(duas.valor_sugerido_max).toBe(70000);
  });

  it("estado excepcional é só candidato: baixa o limite de BAIXO até o piso, e só com km dentro do esperado", () => {
    const r = avaliar("excelente", "impecavel", ESPERADO_2020);
    expect(r.faixa).toBe("excepcional");
    expect([r.desconto_min, r.desconto_max]).toEqual([15, 20]);
    expect(r.faixa_label).toMatch(/só se a vistoria confirmar/);
    // Com km acima do esperado não há candidato.
    const rodado = avaliar("excelente", "impecavel", ESPERADO_2020 + 20000);
    expect(rodado.componentes.some((c) => c.nome === "estado excepcional")).toBe(false);
    expect(rodado.desconto_min).toBe(24);
    // "Bom" não é excelente.
    expect(avaliar("bom", "impecavel", ESPERADO_2020).faixa).toBe("padrao");
  });

  it("o piso segura o limite de baixo", () => {
    const baixo = { ...P, basePp: 15 };
    const r = recomendarAvaliacao({
      estadoMecanico: "excelente",
      estadoConservacao: "impecavel",
      quilometragem: ESPERADO_2020,
      anoModelo: 2020,
      fipeValor: FIPE,
      parametros: baixo,
      hoje: HOJE,
    })!;
    expect(r.desconto_min).toBe(15);
  });

  it("acima do teto não é compra: sem valor sugerido, e o rótulo diz recusar ou repasse", () => {
    const r = avaliar("ruim", "avariado", 400000, 2011);
    expect(r.desconto_min).toBeGreaterThan(40);
    expect(r.acima_do_teto).toBe(true);
    expect(r.faixa).toBe("acima_do_teto");
    expect(r.valor_sugerido_min).toBeNull();
    expect(r.valor_sugerido_max).toBeNull();
    expect(r.resumo).toMatch(/recusar ou encaminhar como repasse/);
  });

  it("o limite de cima encosta no teto, com aviso, quando só ele passaria", () => {
    const r = avaliar("ruim", "avariado", ESPERADO_2020);
    expect(r.desconto_min).toBe(36);
    expect(r.desconto_max).toBe(40);
    expect(r.sinais.join(" ")).toMatch(/teto de 40%/);
  });

  it("sem km ou sem ano, o degrau de km fica para a vistoria — e diz isso", () => {
    const semKm = avaliar("bom", "riscos", null);
    expect(semKm.componentes.some((c) => c.nome === "km")).toBe(false);
    expect(semKm.sinais.join(" ")).toMatch(/km não informado/);
    expect(semKm.desconto_min).toBe(20);
  });

  it("a pendência de documento vira aviso com o intervalo do banco", () => {
    expect(avaliar("bom", "riscos", ESPERADO_2020).sinais.join(" ")).toMatch(/pendência soma de 3 a 5 p\.p\./);
  });

  it("sem FIPE, a faixa sai sem valor — nunca com zero", () => {
    const r = avaliar("bom", "riscos", ESPERADO_2020, 2020, null);
    expect(r.valor_sugerido_min).toBeNull();
    expect(r.resumo).toBe(r.faixa_label);
  });
});

describe("os casos do diagnóstico de 24/09 que a régua antiga errava", () => {
  // Hoje fixo em 1º/07/2026, FIPE redonda de R$ 100 mil.
  it("Gol 2011 com 250 mil km, 'excelente e impecável': a antiga dava 10%", () => {
    const r = avaliar("excelente", "impecavel", 250000, 2011);
    expect(r.desconto_min).toBeGreaterThan(20);
  });

  it("carro de 0–3 anos em ótimo estado: a antiga dava 10%, a curva nunca desce do piso", () => {
    const r = avaliar("excelente", "impecavel", 20000, 2025);
    expect(r.desconto_min).toBe(15);
  });
});

describe("fipeParaNumero", () => {
  it("lê o formato que a API da FIPE devolve", () => {
    expect(fipeParaNumero("R$ 67.142,00")).toBe(67142);
  });

  it("devolve null quando não dá para ler, em vez de chutar", () => {
    for (const v of ["", null, undefined, "consulte"]) expect(fipeParaNumero(v)).toBeNull();
  });
});
