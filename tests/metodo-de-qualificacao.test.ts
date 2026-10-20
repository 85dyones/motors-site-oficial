import { describe, expect, it } from "vitest";
import { FICHA_VAZIA, SINAIS_NEUTROS, calcularAquecimento, decidirEntrega, fichaValida, type FichaDoLead } from "../src/lib/aquecimento";
import { baloesSemDisposicao, semDisposicao } from "../src/lib/agenteDeAtendimento";
import {
  horarioParaVisita,
  metodoNoEstado,
  momentoDaVisita,
  prontidao,
  proximosDias,
  rotuloDaVisita,
  trocaParaLer,
} from "../src/lib/metodoDeQualificacao";
import { mensagemDeEntrega, mensagemDePassagemAoCliente, mensagemDeRetomadaAoCliente } from "../src/lib/resumoParaOVendedor";

/**
 * O método de qualificação da loja, os 5P (2026-10-20): o que falta, o
 * próximo movimento, e quando o lead está pronto para o comercial — visita
 * com dia e hora, ou simulação completa. E a rede contra o "fico à
 * disposição", que o dono vetou.
 */

// Terça, 20/10/2026, 10h em Curitiba.
const TERCA_10H = new Date("2026-10-20T13:00:00Z");
const ficha = (parcial: Partial<FichaDoLead>): FichaDoLead => ({ ...FICHA_VAZIA, ...parcial });
const ONIX = { interesse: "Onix LT 2020", interesse_especifico: true };

describe("o que falta e o próximo movimento", () => {
  it("ficha vazia: falta tudo, na ordem do método, e o movimento é descobrir o carro", () => {
    const p = prontidao(FICHA_VAZIA, TERCA_10H);
    expect(p.pronto).toBeNull();
    // Quem decide e para que vai usar não entram: não são perguntas de roteiro.
    expect(p.faltam.map((f) => f.pilar)).toEqual(["produto", "pagamento", "pagamento", "prazo", "pessoa", "passo"]);
    expect(p.proximoMovimento).toBe("descobrir qual carro ele procura — ofereça opções do catálogo");
  });

  it("o nome do WhatsApp basta para não perguntar como ele se chama", () => {
    expect(prontidao(FICHA_VAZIA, TERCA_10H, { nomeNoWhatsApp: "Rafael" }).faltam.map((f) => f.item)).not.toContain("como ele se chama");
  });

  it("visita com o dia dito e sem hora: o movimento é fechar o horário", () => {
    const p = prontidao(ficha({ ...ONIX, pagamento: "com_troca", troca: "Clio 2011", visita: "sábado" }), TERCA_10H);
    expect(p.proximoMovimento).toBe("fechar o horário da visita (sábado) — proponha dois horários dentro do horário da loja");
    expect(p.faltam.map((f) => f.item)).not.toContain("quem decide junto (ou em nome de quem fica o carro)");
  });

  it("carro definido e à vista: o movimento é marcar a visita com duas opções concretas", () => {
    const p = prontidao(ficha({ ...ONIX, pagamento: "a_vista" }), TERCA_10H);
    expect(p.proximoMovimento).toBe("marcar a visita ou o test-drive com dia e hora — proponha duas opções concretas dentro do horário da loja");
  });

  it("'com troca' não fecha o pagamento: falta como paga a diferença", () => {
    const itens = prontidao(ficha({ ...ONIX, pagamento: "com_troca", troca: "Clio 2011" }), TERCA_10H).faltam.map((f) => f.item);
    expect(itens).toContain("como paga a diferença da troca (à vista ou financiado)");
  });

  it("financiado: o movimento é completar a simulação, dizendo o que falta", () => {
    const p = prontidao(ficha({ ...ONIX, pagamento: "financiado", entrada: "10 mil" }), TERCA_10H);
    expect(p.pronto).toBeNull();
    expect(p.proximoMovimento).toBe("deixar a simulação pronta: falta a parcela que cabe ou em quantas vezes");
    // UM rumo e, no máximo, o item seguinte — a lista inteira virava questionário.
    expect(metodoNoEstado(p)).toEqual([
      "Próximo movimento (UMA pergunta, depois de responder o que o cliente disse): deixar a simulação pronta: falta a parcela que cabe ou em quantas vezes.",
      "Depois, quando couber naturalmente: se tem carro na troca (modelo, ano e km) [Pagamento].",
    ]);
  });
});

describe("pronto para o comercial", () => {
  it("visita com dia e hora, no horário da loja e nos próximos 30 dias: agendou", () => {
    const f = ficha({ ...ONIX, visita_data: "2026-10-24", visita_hora: "10:00" });
    expect(prontidao(f, TERCA_10H)).toMatchObject({ pronto: "agendou", problemaDaVisita: null });
    expect(momentoDaVisita(f)!.toISOString()).toBe("2026-10-24T13:00:00.000Z");
    expect(rotuloDaVisita(f)).toBe("sábado, 24/10, às 10h");
  });

  it("só o dia, sem a hora, não é compromisso", () => {
    expect(prontidao(ficha({ ...ONIX, visita_data: "2026-10-24" }), TERCA_10H).pronto).toBeNull();
  });

  it("visita que não vale diz por quê: domingo, sábado depois das 15h, no passado, longe demais", () => {
    const problema = (visita_data: string, visita_hora: string) => prontidao(ficha({ ...ONIX, visita_data, visita_hora }), TERCA_10H).problemaDaVisita;
    expect(problema("2026-10-25", "10:00")).toBe("a visita anotada (domingo, 25/10, às 10h) está fora do horário da loja");
    expect(problema("2026-10-24", "16:00")).toBe("a visita anotada (sábado, 24/10, às 16h) está fora do horário da loja");
    expect(problema("2026-10-19", "10:00")).toBe("a visita anotada (segunda-feira, 19/10, às 10h) já passou");
    expect(problema("2026-12-01", "10:00")).toBe("a visita anotada (terça-feira, 01/12, às 10h) está a mais de 30 dias");
  });

  it("simulação: carro exato, financiado, entrada (mesmo 'sem entrada') e parcela", () => {
    const completa = ficha({ ...ONIX, pagamento: "financiado", entrada: "sem entrada", parcela: "48x" });
    expect(prontidao(completa, TERCA_10H).pronto).toBe("simulacao");
    expect(prontidao({ ...completa, interesse_especifico: false }, TERCA_10H).pronto).toBeNull();
    expect(prontidao({ ...completa, pagamento: "a_vista" }, TERCA_10H).pronto).toBeNull();
  });

  it("a visita marcada vence a simulação: é o compromisso mais forte", () => {
    const f = ficha({ ...ONIX, pagamento: "financiado", entrada: "10 mil", parcela: "48x", visita_data: "2026-10-22", visita_hora: "17:30" });
    expect(prontidao(f, TERCA_10H).pronto).toBe("agendou");
  });

  it("enquanto o assistente conduz, a temperatura sozinha não entrega; sem conduzir, entrega", () => {
    const quente = { temperatura: "quente" as const };
    expect(decidirEntrega(quente, SINAIS_NEUTROS, "quente", null, { conduzindo: true })).toEqual({ entregar: false, motivo: null });
    expect(decidirEntrega(quente, SINAIS_NEUTROS, "quente", null)).toEqual({ entregar: true, motivo: "quente" });
    // Conduzindo, o que o método persegue e o que o cliente pede continuam entregando.
    expect(decidirEntrega(quente, SINAIS_NEUTROS, "quente", "agendou", { conduzindo: true })).toEqual({ entregar: true, motivo: "agendou" });
    expect(decidirEntrega(quente, { ...SINAIS_NEUTROS, pediu_humano: true }, "quente", null, { conduzindo: true })).toEqual({ entregar: true, motivo: "pediu_humano" });
  });

  it("na entrega, quem pediu gente vem antes; pronto vem antes de pediu condição; opt-out nunca", () => {
    const morno = { temperatura: "morno" as const };
    expect(decidirEntrega(morno, { ...SINAIS_NEUTROS, pediu_humano: true }, "quente", "agendou")).toEqual({ entregar: true, motivo: "pediu_humano" });
    expect(decidirEntrega(morno, { ...SINAIS_NEUTROS, pediu_condicao: true }, "quente", "simulacao")).toEqual({ entregar: true, motivo: "simulacao" });
    expect(decidirEntrega(morno, SINAIS_NEUTROS, "quente", "agendou")).toEqual({ entregar: true, motivo: "agendou" });
    expect(decidirEntrega(morno, { ...SINAIS_NEUTROS, optout: true }, "quente", "agendou")).toEqual({ entregar: false, motivo: null });
  });
});

describe("a ficha do método", () => {
  it("dia e hora só no formato e de verdade", () => {
    expect(fichaValida({ visita_data: "2026-10-24", visita_hora: "9:30" })).toMatchObject({ visita_data: "2026-10-24", visita_hora: "09:30" });
    expect(fichaValida({ visita_data: "2026-02-30", visita_hora: "25:00" })).toMatchObject({ visita_data: null, visita_hora: null });
    expect(fichaValida({ visita_data: "24/10", visita_hora: "10h" })).toMatchObject({ visita_data: null, visita_hora: null });
  });

  it("os campos novos passam aparados; ficha antiga sem eles fica nula", () => {
    expect(fichaValida({ nome: "  Ana Paula ", uso: "família", parcela: "até 1.500", decisor: "com o marido" })).toMatchObject({
      nome: "Ana Paula",
      uso: "família",
      parcela: "até 1.500",
      decisor: "com o marido",
    });
    expect(fichaValida({ interesse: "Onix" })).toMatchObject({ nome: null, uso: null, parcela: null, decisor: null, visita_data: null, visita_hora: null });
  });

  it("'sem troca' não soma pontos de troca; a visita marcada e quem decide somam", () => {
    const sem = calcularAquecimento(ficha({ troca: "sem troca" }), SINAIS_NEUTROS);
    expect(sem.motivos.map((m) => m.chave)).not.toContain("troca");
    const motivos = calcularAquecimento(ficha({ visita_data: "2026-10-24", visita_hora: "10:00", decisor: "com a esposa", parcela: "48x" }), SINAIS_NEUTROS).motivos;
    expect(motivos.map((m) => m.texto)).toEqual(["Visita marcada: 24/10 às 10:00", "Disse a parcela ou o prazo: 48x", "Disse quem decide: com a esposa"]);
    expect(trocaParaLer("sem troca")).toBe("não tem");
    expect(trocaParaLer("Não tenho")).toBe("não tem");
    expect(trocaParaLer("Uno 2014")).toBe("Uno 2014");
  });
});

describe("o calendário e o horário que vão ao modelo", () => {
  it("os próximos dias com a data por extenso, a partir de hoje", () => {
    expect(proximosDias(TERCA_10H, 5)).toEqual([
      "hoje, terça-feira 20/10 = 2026-10-20",
      "amanhã, quarta-feira 21/10 = 2026-10-21",
      "quinta-feira 22/10 = 2026-10-22",
      "sexta-feira 23/10 = 2026-10-23",
      "sábado 24/10 = 2026-10-24",
    ]);
  });

  it("o horário da loja, para marcar visita", () => {
    expect(horarioParaVisita()).toBe("seg a sex, 8h30 às 18h30; sáb, 8h30 às 15h");
  });
});

describe("nada de 'fico à disposição'", () => {
  it("tira a frase de quem larga a conversa e deixa o resto", () => {
    expect(semDisposicao("Fechado! Qualquer dúvida estou aqui.")).toBe("Fechado!");
    expect(semDisposicao("O Onix está disponível. Sigo à sua disposição!")).toBe("O Onix está disponível.");
    expect(semDisposicao("Show! É só me chamar.")).toBe("Show!");
    expect(semDisposicao("Estamos à disposição para o que precisar.")).toBe("");
  });

  it("a pergunta fica, mesmo com a frase colada — é ela que conduz", () => {
    expect(semDisposicao("Qualquer dúvida me chama, mas me diz: prefere sábado?")).toBe("Qualquer dúvida me chama, mas me diz: prefere sábado?");
  });

  it("balão vazio some; se nada sobrar, ficam os originais (sem resposta é pior)", () => {
    expect(baloesSemDisposicao(["Perfeito!", "Fico à disposição."])).toEqual(["Perfeito!"]);
    expect(baloesSemDisposicao(["Fico à disposição."])).toEqual(["Fico à disposição."]);
  });
});

describe("o que o vendedor e o cliente leem", () => {
  const entrega = (parcial: Partial<FichaDoLead>, motivo: "agendou" | "simulacao") =>
    mensagemDeEntrega({
      motivo,
      lead: { nome: "Rafael", telefone: "5541999990000" },
      ficha: ficha(parcial),
      aquecimento: { pontos: 45, temperatura: "morno", motivos: [] },
      resumo: null,
      origem: null,
      linkDoLead: null,
      para: "vendedor",
    });

  it("visita marcada: o cabeçalho e a visita na primeira linha do corpo", () => {
    const m = entrega({ ...ONIX, visita: "sábado 10h", visita_data: "2026-10-24", visita_hora: "10:00", nome: "Rafael Souza" }, "agendou");
    const linhas = m.split("\n");
    expect(linhas[0]).toBe("📅 VISITA MARCADA — Rafael");
    expect(linhas[3]).toBe("📅 Visita marcada: sábado, 24/10, às 10h");
    expect(m).toContain("Se apresentou como: Rafael Souza");
  });

  it("simulação: parcela, troca e quem decide aparecem", () => {
    const m = entrega({ ...ONIX, pagamento: "financiado", entrada: "10 mil", parcela: "48x", troca: "sem troca", decisor: "no nome da esposa", uso: "família" }, "simulacao");
    expect(m.split("\n")[0]).toBe("🧮 PRONTO PARA SIMULAR — Rafael");
    for (const linha of ["Uso: família", "Pagamento: Financiado · entrada 10 mil", "Parcela: 48x", "Troca: não tem", "Quem decide: no nome da esposa"]) {
      expect(m).toContain(linha);
    }
  });

  it("a passagem repete a visita, ou diz que a simulação está com a equipe", () => {
    const base = { nomeDoCliente: "Rafael", vendedor: null, equipeDisponivel: true };
    expect(mensagemDePassagemAoCliente({ ...base, visita: "sábado, 24/10, às 10h" })).toBe(
      "Perfeito, Rafael! Visita marcada: sábado, 24/10, às 10h. Vou passar seu atendimento para a nossa equipe de consultores, que já te chama.",
    );
    expect(mensagemDePassagemAoCliente({ ...base, retomada: true })).toBe(
      "Oi, Rafael! Vou passar seu atendimento para a nossa equipe de consultores, que já te chama.",
    );
    expect(mensagemDePassagemAoCliente({ ...base, simulacao: true })).toBe(
      "Perfeito, Rafael! Já deixei os dados da sua simulação com a equipe. Vou passar seu atendimento para a nossa equipe de consultores, que já te chama.",
    );
  });
});

describe("o WhatsApp do vendedor retoma de onde o assistente parou", () => {
  const retomada = (parcial: Partial<FichaDoLead>, vendedor: string | null = "Carla Souza") =>
    mensagemDeRetomadaAoCliente({ nomeDoCliente: "Rafael", vendedor, nomeDoAssistente: "Ney", ficha: ficha(parcial) });

  it("lista o que o cliente disse e pergunta o horário da visita que ele comentou", () => {
    expect(retomada({ ...ONIX, troca: "Renault Clio 2011, 149.000 km", pagamento: "com_troca", visita: "sábado" })).toBe(
      [
        "Olá, Rafael! Aqui é Carla, da equipe de consultores. Vou seguir com o seu atendimento a partir da sua conversa com Ney, sem você precisar repetir nada.",
        "",
        "Anotei aqui:",
        "• Carro: Onix LT 2020",
        "• Troca: Renault Clio 2011, 149.000 km",
        "• Pagamento: com troca",
        "• Visita: sábado",
        "",
        "Você comentou de vir sábado: qual horário fica melhor pra você?",
      ].join("\n"),
    );
  });

  it("visita marcada: pede a confirmação", () => {
    expect(retomada({ ...ONIX, visita_data: "2026-10-24", visita_hora: "10:00" })!.split("\n").at(-1)).toBe("Sua visita está marcada para sábado, 24/10, às 10h. Posso confirmar?");
  });

  it("financiamento: completa a simulação, ou confirma os dados quando estão todos", () => {
    expect(retomada({ ...ONIX, pagamento: "financiado" })!.split("\n").at(-1)).toBe("Para eu preparar a sua simulação: quanto você pensa em dar de entrada?");
    const completa = retomada({ ...ONIX, pagamento: "financiado", entrada: "10 mil", parcela: "até 1.200" })!;
    expect(completa).toContain("• Pagamento: financiado, entrada de 10 mil, parcela até 1.200");
    expect(completa.split("\n").at(-1)).toBe("Com esses dados eu já preparo a sua simulação. Está tudo certo?");
  });

  it("nada de nota nem orçamento para o cliente; sem dono, fala pela equipe", () => {
    const m = retomada({ ...ONIX, orcamento: "até 50 mil", troca: "sem troca" }, null)!;
    expect(m).not.toContain("50 mil");
    expect(m).toContain("• Troca: sem carro na troca");
    expect(m).toContain("Aqui é da equipe de consultores.");
  });

  it("sem nada anotado, não há retomada (fica a abertura de sempre)", () => {
    expect(retomada({ orcamento: "até 50 mil" })).toBeNull();
  });
});
