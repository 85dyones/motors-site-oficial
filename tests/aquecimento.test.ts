import { describe, expect, it } from "vitest";
import {
  FICHA_VAZIA,
  LIMIARES_DE_FABRICA,
  PESOS_DE_FABRICA,
  SINAIS_NEUTROS,
  calcularAquecimento,
  decidirEntrega,
  fichaValida,
  limiaresValidos,
  mesclarFicha,
  mesclarSinais,
  motivoPrincipal,
  pesosValidos,
  sinaisValidos,
  temperaturaAlcanca,
  temperaturaDe,
  type FichaDoLead,
} from "../src/lib/aquecimento";

/**
 * A régua do aquecimento (2026-10-20): o modelo preenche a ficha, a régua
 * soma. O número precisa se explicar — cada ponto vira motivo.
 */

const ficha = (parcial: Partial<FichaDoLead>): FichaDoLead => ({ ...FICHA_VAZIA, ...parcial });

describe("a nota soma o que o cliente disse", () => {
  it("a conta do comentário de fábrica fecha: 20 → 35 → 60 → 85", () => {
    const passo1 = ficha({ interesse: "Onix 2020", interesse_especifico: true });
    expect(calcularAquecimento(passo1, SINAIS_NEUTROS).pontos).toBe(20);
    expect(calcularAquecimento(passo1, SINAIS_NEUTROS).temperatura).toBe("frio");

    const passo2 = { ...passo1, pagamento: "financiado" as const, entrada: "15 mil" };
    expect(calcularAquecimento(passo2, SINAIS_NEUTROS)).toMatchObject({ pontos: 35, temperatura: "morno" });

    const passo3 = { ...passo2, troca: "Uno 2014", prazo: "este_mes" as const };
    expect(calcularAquecimento(passo3, SINAIS_NEUTROS)).toMatchObject({ pontos: 60, temperatura: "morno" });

    const quente = calcularAquecimento(passo3, { ...SINAIS_NEUTROS, quer_visitar: true });
    expect(quente).toMatchObject({ pontos: 85, temperatura: "quente" });
  });

  it("cada ponto tem motivo, do que mais somou para o que mais tirou", () => {
    const r = calcularAquecimento(
      ficha({ interesse: "SUV", troca: "Gol 2012", prazo: "sem_pressa" }),
      { ...SINAIS_NEUTROS, so_pesquisando: true },
    );
    expect(r.motivos.map((m) => m.chave)).toEqual(["interesse_generico", "troca", "prazo_sem_pressa", "so_pesquisando"]);
    expect(r.motivos[0].texto).toBe("Procura: SUV");
    expect(r.motivos[1].texto).toBe("Ofereceu carro na troca: Gol 2012");
    // 10 + 10 − 10 − 15 = −5, e a nota não fica negativa.
    expect(r.pontos).toBe(0);
    expect(motivoPrincipal(r)).toBe("Procura: SUV");
  });

  it("nunca passa de 100", () => {
    const tudo = ficha({
      interesse: "Civic 2021",
      interesse_especifico: true,
      orcamento: "até 120 mil",
      pagamento: "a_vista",
      entrada: "tudo",
      troca: "Corolla 2018",
      prazo: "imediato",
      visita: "sábado 10h",
    });
    const r = calcularAquecimento(tudo, { ...SINAIS_NEUTROS, quer_visitar: true, pediu_condicao: true }, { mensagensDoCliente: 9 });
    expect(r.pontos).toBe(100);
  });

  it("engajamento só conta a partir de 3 mensagens do cliente", () => {
    const f = ficha({ interesse: "HB20" });
    expect(calcularAquecimento(f, SINAIS_NEUTROS, { mensagensDoCliente: 2 }).pontos).toBe(10);
    expect(calcularAquecimento(f, SINAIS_NEUTROS, { mensagensDoCliente: 3 }).pontos).toBe(15);
  });

  it("opt-out zera e tira os motivos: quem pediu para parar está fora", () => {
    const r = calcularAquecimento(ficha({ interesse: "Onix", interesse_especifico: true }), { ...SINAIS_NEUTROS, optout: true });
    expect(r).toEqual({ pontos: 0, temperatura: "frio", motivos: [] });
  });

  it("os pesos e os limiares da configuração mandam", () => {
    const f = ficha({ interesse: "Onix", interesse_especifico: true });
    const pesos = { ...PESOS_DE_FABRICA, interesse_especifico: 50 };
    expect(calcularAquecimento(f, SINAIS_NEUTROS, { pesos, limiares: { morno: 30, quente: 50 } })).toMatchObject({
      pontos: 50,
      temperatura: "quente",
    });
  });
});

describe("temperatura", () => {
  it("corta nos limiares, inclusive", () => {
    expect(temperaturaDe(34, LIMIARES_DE_FABRICA)).toBe("frio");
    expect(temperaturaDe(35, LIMIARES_DE_FABRICA)).toBe("morno");
    expect(temperaturaDe(65, LIMIARES_DE_FABRICA)).toBe("quente");
  });

  it("compara 'a partir de'", () => {
    expect(temperaturaAlcanca("quente", "morno")).toBe(true);
    expect(temperaturaAlcanca("morno", "quente")).toBe(false);
    expect(temperaturaAlcanca("morno", "morno")).toBe(true);
  });
});

describe("a ficha acumula e nunca apaga", () => {
  it("valor novo substitui; nulo mantém", () => {
    const antes = ficha({ interesse: "Onix", interesse_especifico: true, pagamento: "financiado", troca: "Uno" });
    const depois = mesclarFicha(antes, { pagamento: "a_vista", troca: null, prazo: "imediato" });
    expect(depois).toMatchObject({ interesse: "Onix", pagamento: "a_vista", troca: "Uno", prazo: "imediato" });
  });

  it("o 'específico' só muda junto com um interesse novo", () => {
    const antes = ficha({ interesse: "Onix 2020", interesse_especifico: true });
    expect(mesclarFicha(antes, { interesse_especifico: false }).interesse_especifico).toBe(true);
    expect(mesclarFicha(antes, { interesse: "um SUV", interesse_especifico: false }).interesse_especifico).toBe(false);
  });

  it("o opt-out gruda: a volta seguinte do modelo não o desfaz", () => {
    const antes = { ...SINAIS_NEUTROS, optout: true };
    expect(mesclarSinais(antes, { ...SINAIS_NEUTROS, quer_visitar: true }).optout).toBe(true);
  });
});

describe("a leitura recusa o que não é do vocabulário", () => {
  it("pagamento e prazo fora da lista viram nulo; interesse_especifico sem interesse é falso", () => {
    expect(fichaValida({ pagamento: "pix", prazo: "ontem", interesse_especifico: true })).toEqual(FICHA_VAZIA);
    expect(fichaValida({ interesse: "  Onix   2020 ", pagamento: "consorcio" })).toMatchObject({ interesse: "Onix 2020", pagamento: "consorcio" });
  });

  it("sinais só aceitam o booleano verdadeiro", () => {
    expect(sinaisValidos({ pediu_humano: "true", optout: 1 })).toEqual(SINAIS_NEUTROS);
    expect(sinaisValidos({ pediu_humano: true }).pediu_humano).toBe(true);
  });

  it("pesos: o lido por cima do de fábrica, com teto em ±100 e lixo ignorado", () => {
    const p = pesosValidos({ troca: "25", entrada: "abc", desinteresse: -500, orcamento: null });
    expect(p.troca).toBe(25);
    expect(p.entrada).toBe(PESOS_DE_FABRICA.entrada);
    expect(p.desinteresse).toBe(-100);
    expect(p.orcamento).toBe(PESOS_DE_FABRICA.orcamento);
  });

  it("limiares incoerentes voltam aos de fábrica", () => {
    expect(limiaresValidos(70, 60)).toEqual(LIMIARES_DE_FABRICA);
    expect(limiaresValidos(0, 50)).toEqual(LIMIARES_DE_FABRICA);
    expect(limiaresValidos(30, 80)).toEqual({ morno: 30, quente: 80 });
  });
});

describe("a entrega ao vendedor", () => {
  it("pediu humano entrega com qualquer nota", () => {
    expect(decidirEntrega({ temperatura: "frio" }, { ...SINAIS_NEUTROS, pediu_humano: true })).toEqual({ entregar: true, motivo: "pediu_humano" });
  });

  // O dono (21/10/2026): "se alguém tiver reclamação ou pós-venda, assuma uma
  // postura séria, receba o atendimento e transfira direto pro atendente".
  it("reclamação ou pós-venda entrega na hora, antes de tudo — menos do opt-out", () => {
    const pos = { ...SINAIS_NEUTROS, pos_venda: true };
    expect(decidirEntrega({ temperatura: "frio" }, pos)).toEqual({ entregar: true, motivo: "pos_venda" });
    expect(decidirEntrega({ temperatura: "quente" }, { ...pos, pediu_humano: true, pediu_condicao: true }, "quente", "agendou", { conduzindo: true })).toEqual({ entregar: true, motivo: "pos_venda" });
    expect(decidirEntrega({ temperatura: "frio" }, { ...pos, optout: true })).toEqual({ entregar: false, motivo: null });
    expect(sinaisValidos({ pos_venda: true }).pos_venda).toBe(true);
    expect(sinaisValidos({ pos_venda: "sim" }).pos_venda).toBe(false);
  });

  it("pediu condição (desconto, troca, financiamento) entrega: o assistente não decide nada disso", () => {
    expect(decidirEntrega({ temperatura: "frio" }, { ...SINAIS_NEUTROS, pediu_condicao: true })).toEqual({ entregar: true, motivo: "pediu_condicao" });
  });

  it("pela temperatura, a partir da mínima configurada", () => {
    expect(decidirEntrega({ temperatura: "morno" }, SINAIS_NEUTROS).entregar).toBe(false);
    expect(decidirEntrega({ temperatura: "morno" }, SINAIS_NEUTROS, "morno")).toEqual({ entregar: true, motivo: "quente" });
    expect(decidirEntrega({ temperatura: "quente" }, SINAIS_NEUTROS)).toEqual({ entregar: true, motivo: "quente" });
  });

  it("opt-out nunca entrega", () => {
    expect(decidirEntrega({ temperatura: "quente" }, { ...SINAIS_NEUTROS, optout: true, pediu_humano: true }).entregar).toBe(false);
  });
});
