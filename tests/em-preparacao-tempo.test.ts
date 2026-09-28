import { describe, it, expect } from "vitest";
import {
  chegadaAoPatio,
  dataDaPrevisao,
  diasDePrevisaoVencida,
  doCampoDataHora,
  faixaDaChegada,
  formatarRelogio,
  paraCampoDataHora,
  relogioAte,
} from "../src/lib/emPreparacao";

/**
 * O tempo do carro "em preparação", contado em São Paulo — spec
 * 2026-09-28-em-preparacao-design, seção "Site".
 *
 * Os instantes estão em UTC; o comentário de cada um diz a hora de São Paulo
 * (UTC-3 o ano todo desde 2019).
 */

const em = (previsao: string) => ({ em_preparacao: true, previsao_chegada_em: previsao });
const SEGUNDA_10H = new Date("2026-09-28T13:00:00Z"); // seg 28/09, 10h

describe("a fase e os dias de calendário", () => {
  it("cinco dias antes", () => {
    const c = chegadaAoPatio(em("2026-10-03T17:00:00Z"), SEGUNDA_10H); // sáb 03/10, 14h
    expect(c).toMatchObject({ fase: "a-caminho", dias: 5 });
    expect(faixaDaChegada(c!)).toBe("EM PREPARAÇÃO · CHEGA EM 5 DIAS");
  });

  it("no mesmo dia, horas antes: HOJE", () => {
    const c = chegadaAoPatio(em("2026-09-28T20:00:00Z"), SEGUNDA_10H); // seg 17h
    expect(faixaDaChegada(c!)).toBe("EM PREPARAÇÃO · CHEGA HOJE");
  });

  it("dias de CALENDÁRIO, não horas ÷ 24: faltando 16 horas, a previsão é amanhã", () => {
    // Seg 10h → ter 2h. Horas ÷ 24 dariam 0, "HOJE" — e a pessoa lê o
    // calendário, não o cronômetro.
    const c = chegadaAoPatio(em("2026-09-29T05:00:00Z"), SEGUNDA_10H);
    expect(faixaDaChegada(c!)).toBe("EM PREPARAÇÃO · CHEGA AMANHÃ");
  });

  it("a virada do dia é a de São Paulo, não a de Greenwich", () => {
    // Dom 27/09 às 23h30 em SP já é segunda em UTC. A previsão de seg 9h é
    // AMANHÃ para quem está na loja.
    const agora = new Date("2026-09-28T02:30:00Z");
    const c = chegadaAoPatio(em("2026-09-28T12:00:00Z"), agora);
    expect(faixaDaChegada(c!)).toBe("EM PREPARAÇÃO · CHEGA AMANHÃ");
  });

  it("depois da data: a qualquer momento, com o atraso contado", () => {
    const agora = new Date("2026-10-05T13:00:00Z"); // seg 05/10
    const c = chegadaAoPatio(em("2026-10-03T17:00:00Z"), agora);
    expect(c).toMatchObject({ fase: "a-qualquer-momento", diasDeAtraso: 2 });
    expect(faixaDaChegada(c!)).toBe("EM PREPARAÇÃO · CHEGA A QUALQUER MOMENTO");
    expect(diasDePrevisaoVencida(em("2026-10-03T17:00:00Z"), agora)).toBe(2);
  });

  it("sem a caixa, ou sem data, não há chegada nenhuma", () => {
    expect(chegadaAoPatio({ em_preparacao: false, previsao_chegada_em: "2026-10-03T17:00:00Z" }, SEGUNDA_10H)).toBeNull();
    expect(chegadaAoPatio({ em_preparacao: true, previsao_chegada_em: null }, SEGUNDA_10H)).toBeNull();
    expect(diasDePrevisaoVencida({ em_preparacao: true, previsao_chegada_em: "2026-10-03T17:00:00Z" }, SEGUNDA_10H)).toBeNull();
  });
});

describe("o relógio da ficha", () => {
  it("dias, horas, minutos e segundos até a data", () => {
    const r = relogioAte(new Date("2026-10-03T17:00:00Z"), SEGUNDA_10H);
    expect(r).toEqual({ dias: 5, horas: 4, minutos: 0, segundos: 0 });
    expect(formatarRelogio(r!)).toBe("05d 04h 00m 00s");
  });

  it("um segundo depois", () => {
    const r = relogioAte(new Date("2026-10-03T17:00:00Z"), new Date("2026-09-28T13:00:01Z"));
    expect(formatarRelogio(r!)).toBe("05d 03h 59m 59s");
  });

  it("data passada não tem relógio", () => {
    expect(relogioAte(new Date("2026-09-28T12:00:00Z"), SEGUNDA_10H)).toBeNull();
  });
});

describe("a data escrita", () => {
  it("dia, mês e hora de São Paulo", () => {
    expect(dataDaPrevisao("2026-10-03T17:00:00Z")).toBe("03/10 às 14h");
  });

  it("com minutos quando há minutos", () => {
    expect(dataDaPrevisao("2026-10-03T17:30:00Z")).toBe("03/10 às 14h30");
  });
});

describe("o campo de data e hora do painel", () => {
  it("do banco para o campo: o horário de São Paulo", () => {
    expect(paraCampoDataHora("2026-10-03T17:00:00+00:00")).toBe("2026-10-03T14:00");
  });

  it("do campo para o banco: o instante certo", () => {
    expect(doCampoDataHora("2026-10-03T14:00")).toBe("2026-10-03T17:00:00.000Z");
  });

  it("ida e volta devolve o mesmo campo", () => {
    expect(paraCampoDataHora(doCampoDataHora("2026-12-31T23:30"))).toBe("2026-12-31T23:30");
  });

  it("vazio e lixo não viram data", () => {
    expect(paraCampoDataHora(null)).toBe("");
    expect(paraCampoDataHora("ontem")).toBe("");
    expect(doCampoDataHora("")).toBeNull();
    expect(doCampoDataHora("03/10/2026")).toBeNull();
  });
});
