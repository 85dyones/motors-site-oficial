import { describe, it, expect } from "vitest";
import {
  AVISO_DE_BUSCA_INVALIDA,
  CAMPOS_DOS_DADOS,
  ETAPA_DE_VISITA,
  ETAPAS_COM_SUGESTAO,
  FAIXAS_DE_ENTRADA,
  FOLGA_DO_AGORA_MS,
  PAGAMENTOS_PRETENDIDOS,
  RESULTADOS_DA_LIGACAO,
  TIPOS_DE_INTERACAO,
  decidirDados,
  decidirInteracao,
  diaNaLoja,
  filtroDaBusca,
  instanteNoFusoDaLoja,
  leadEstaAberto,
  montarHistorico,
  ordenarListaDoDia,
  refDoLead,
  rotuloDoPasso,
  situacaoDoPasso,
  sugestoesDeProximoPasso,
  ultimaInteracaoPorLead,
  type EventoDoLead,
  type InteracaoDoLead,
} from "../src/lib/gestaoDoLead";
import { ETAPAS_PADRAO } from "../src/lib/funil";
import { padraoDaRef } from "../src/lib/leadsKanban";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * As regras da gestão do lead, EXECUTADAS (`lib/gestaoDoLead`).
 *
 * Todo "agora" é fixo e toda expectativa foi escrita à mão, em horário de São
 * Paulo (UTC-3): o servidor roda em UTC, e a conta que só fecha no fuso da
 * máquina é a que quebra em produção às 21h.
 *
 * Sábado, 03/10/2026, 12:00 em São Paulo.
 */
const AGORA = Date.parse("2026-10-03T15:00:00Z");
/** Um horário de São Paulo, escrito como se lê na parede da loja. */
const sp = (dia: string, hora: string) => `${dia}T${hora}:00-03:00`;
const ms = (iso: string) => Date.parse(iso);

const MIGRACAO = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260923150000_gestao_do_lead.sql"),
  "utf-8",
);
/** Os valores de um `check (... in ('a', 'b'))` da migração. */
function valoresDoCheck(nome: string): string[] {
  const trecho = MIGRACAO.slice(MIGRACAO.indexOf(`add constraint ${nome}`));
  const lista = /in \(([^)]+)\)/.exec(trecho);
  if (!lista) throw new Error(`check ${nome} não encontrado na migração`);
  return [...lista[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

// ---------------------------------------------------------------------------

describe("o vocabulário é o do banco", () => {
  it("tipos, resultados, faixas e pagamentos são as listas dos CHECKs da migração", () => {
    expect([...TIPOS_DE_INTERACAO]).toEqual(valoresDoCheck("leads_interacoes_tipo_valido"));
    expect([...RESULTADOS_DA_LIGACAO]).toEqual(valoresDoCheck("leads_interacoes_resultado_valido"));
    expect(FAIXAS_DE_ENTRADA.map((f) => f.valor)).toEqual(valoresDoCheck("leads_faixa_entrada_valida"));
    expect(PAGAMENTOS_PRETENDIDOS.map((p) => p.valor)).toEqual(valoresDoCheck("leads_pagamento_pretendido_valido"));
  });

  it("os rótulos são os do desenho", () => {
    expect(FAIXAS_DE_ENTRADA.map((f) => f.rotulo)).toEqual([
      "Sem entrada",
      "Até R$ 5 mil",
      "R$ 5 a 10 mil",
      "R$ 10 a 20 mil",
      "Acima de R$ 20 mil",
    ]);
    expect(PAGAMENTOS_PRETENDIDOS.map((p) => p.rotulo)).toEqual(["À vista", "Financiado", "Com troca", "Consórcio"]);
  });

  it("a etapa de visita e as etapas com sugestão existem no funil semeado, e são colunas", () => {
    const abertas = ETAPAS_PADRAO.filter((e) => e.tipo === "aberta").map((e) => e.chave);
    expect(abertas).toContain(ETAPA_DE_VISITA);
    // As cinco colunas do funil, e só elas: nenhuma etapa aberta sem sugestão.
    expect([...ETAPAS_COM_SUGESTAO].sort()).toEqual([...abertas].sort());
  });
});

// ---------------------------------------------------------------------------

describe("decidirInteracao — o que a função do banco aceita", () => {
  const PASSO = { proximo_passo: "Ligar de novo", proximo_passo_vence_em: sp("2026-10-04", "10:00") };

  it("nota com texto e próximo passo: vai, com o texto aparado e a data em UTC", () => {
    const d = decidirInteracao({ tipo: "nota", texto: "  Pediu fotos  ", ...PASSO });
    expect(d).toEqual({
      ok: true,
      args: {
        p_tipo: "nota",
        p_resultado: null,
        p_texto: "Pediu fotos",
        p_passo: "Ligar de novo",
        p_vence_em: "2026-10-04T13:00:00.000Z",
      },
    });
  });

  it("ligação com resultado dispensa o texto; os três resultados valem", () => {
    for (const resultado of RESULTADOS_DA_LIGACAO) {
      const d = decidirInteracao({ tipo: "ligacao", resultado, ...PASSO });
      expect(d.ok, resultado).toBe(true);
      if (d.ok) expect(d.args).toMatchObject({ p_tipo: "ligacao", p_resultado: resultado, p_texto: null });
    }
  });

  it("os quatro tipos valem com texto", () => {
    for (const tipo of TIPOS_DE_INTERACAO) {
      expect(decidirInteracao({ tipo, texto: "ok", ...PASSO }).ok, tipo).toBe(true);
    }
  });

  it("registro que não diz nada é recusado: sem texto, só espaços, ligação sem resultado", () => {
    for (const corpo of [
      { tipo: "nota" },
      { tipo: "nota", texto: "   " },
      { tipo: "whatsapp", texto: null },
      { tipo: "visita", texto: 42 },
      { tipo: "ligacao" },
      { tipo: "ligacao", resultado: "" },
    ]) {
      const d = decidirInteracao({ ...corpo, ...PASSO });
      expect(d, JSON.stringify(corpo)).toMatchObject({ ok: false, status: 400, codigo: "interacao_vazia" });
    }
    const ligacao = decidirInteracao({ tipo: "ligacao", ...PASSO });
    expect(!ligacao.ok && ligacao.erro).toBe("Marque se atendeu ou escreva o que aconteceu.");
    const nota = decidirInteracao({ tipo: "nota", ...PASSO });
    expect(!nota.ok && nota.erro).toBe("Escreva o que aconteceu.");
  });

  it("tipo fora da lista é recusado", () => {
    for (const tipo of ["email", "", null, undefined, 3, "Nota"]) {
      const d = decidirInteracao({ tipo, texto: "x", ...PASSO });
      expect(d, String(tipo)).toMatchObject({ ok: false, codigo: "tipo_invalido" });
    }
    expect(decidirInteracao(null)).toMatchObject({ ok: false, codigo: "tipo_invalido" });
  });

  it("resultado inventado, ou resultado fora de ligação, é recusado e não descartado", () => {
    expect(decidirInteracao({ tipo: "ligacao", resultado: "ocupado", ...PASSO })).toMatchObject({
      ok: false,
      codigo: "resultado_invalido",
    });
    for (const tipo of ["nota", "whatsapp", "visita"]) {
      const d = decidirInteracao({ tipo, texto: "x", resultado: "atendeu", ...PASSO });
      expect(d, tipo).toMatchObject({ ok: false, codigo: "resultado_invalido" });
    }
  });

  /**
   * Pedido do dono em 2026-10-09: *"elimine a obrigatoriedade do próximo
   * passo [...] nem sempre teremos o próximo passo, isso pode inibir o
   * comercial de usar o sistema"*. A nota de atendimento vale sozinha, com o
   * lead aberto ou fechado; a função do banco mantém o passo que o lead tinha.
   */
  it("sem próximo passo, o registro vale: nota, ligação, WhatsApp e visita", () => {
    expect(decidirInteracao({ tipo: "nota", texto: "Cliente pediu um tempo." })).toEqual({
      ok: true,
      args: { p_tipo: "nota", p_resultado: null, p_texto: "Cliente pediu um tempo.", p_passo: null, p_vence_em: null },
    });
    for (const corpo of [
      { tipo: "ligacao", resultado: "nao_atendeu" },
      { tipo: "whatsapp", texto: "Mandei as fotos" },
      { tipo: "visita", texto: "Veio ver o carro", proximo_passo: "   ", proximo_passo_vence_em: "" },
      { tipo: "nota", texto: "x", proximo_passo: null, proximo_passo_vence_em: null },
    ]) {
      const d = decidirInteracao(corpo);
      expect(d.ok, JSON.stringify(corpo)).toBe(true);
      if (d.ok) expect(d.args, JSON.stringify(corpo)).toMatchObject({ p_passo: null, p_vence_em: null });
      if (d.ok) expect(d.args, JSON.stringify(corpo)).not.toHaveProperty("p_concluir_passo");
    }
  });

  it("se vier passo, vem inteiro: só o texto ou só a data é `proximo_passo_incompleto`", () => {
    for (const meio of [
      { proximo_passo: "Ligar" },
      { proximo_passo_vence_em: sp("2026-10-04", "10:00") },
      { proximo_passo: "   ", proximo_passo_vence_em: sp("2026-10-04", "10:00") },
      { proximo_passo: "Ligar", proximo_passo_vence_em: "" },
      { proximo_passo: "Ligar", proximo_passo_vence_em: null },
    ]) {
      expect(decidirInteracao({ tipo: "nota", texto: "x", ...meio }), JSON.stringify(meio)).toMatchObject({
        ok: false,
        status: 400,
        codigo: "proximo_passo_incompleto",
      });
    }
  });

  /**
   * O CONCLUIR sem passo novo. Sem o sinal, a função manteria no lead o passo
   * que acabou de ser feito (20261009120000). O sinal só viaja quando é
   * `true` e não há passo novo: com passo novo, ele já substitui o feito, e
   * a chamada de seis argumentos segue valendo antes da migração.
   */
  it("CONCLUIR sem passo novo pede para limpar o passo; com passo novo, ou sem o sinal, não", () => {
    const concluido = decidirInteracao({ tipo: "nota", texto: "Feito: Ligar.", concluir_passo: true });
    expect(concluido.ok && concluido.args.p_concluir_passo).toBe(true);
    const comNovo = decidirInteracao({ tipo: "nota", texto: "Feito: Ligar.", concluir_passo: true, ...PASSO });
    expect(comNovo.ok && comNovo.args).not.toHaveProperty("p_concluir_passo");
    for (const sinal of [false, "true", 1, null, undefined]) {
      const d = decidirInteracao({ tipo: "nota", texto: "x", concluir_passo: sinal });
      expect(d.ok && d.args, String(sinal)).not.toHaveProperty("p_concluir_passo");
    }
    // O sinal não salva meio passo.
    expect(decidirInteracao({ tipo: "nota", texto: "x", concluir_passo: true, proximo_passo: "Ligar" })).toMatchObject({
      ok: false,
      codigo: "proximo_passo_incompleto",
    });
  });

  it("a data precisa de fuso: sem ele o servidor leria em UTC e gravaria três horas errado", () => {
    for (const data of ["2026-10-04T10:00", "2026-10-04 10:00:00", "04/10/2026 10:00", "amanhã", 1759583000000, "2026-13-40T10:00:00Z"]) {
      const d = decidirInteracao({ tipo: "nota", texto: "x", proximo_passo: "Ligar", proximo_passo_vence_em: data });
      expect(d, String(data)).toMatchObject({ ok: false, codigo: "data_invalida" });
    }
    for (const data of ["2026-10-04T13:00:00Z", "2026-10-04T13:00:00.000Z", "2026-10-04T10:00-03:00", "2026-10-04T10:00:00-0300"]) {
      const d = decidirInteracao({ tipo: "nota", texto: "x", proximo_passo: "Ligar", proximo_passo_vence_em: data });
      expect(d.ok && d.args.p_vence_em, data).toBe("2026-10-04T13:00:00.000Z");
    }
  });

  it("nunca manda meio passo: ou os dois nulos, ou os dois preenchidos", () => {
    const corpos = [
      { tipo: "nota", texto: "x" },
      { tipo: "nota", texto: "x", ...PASSO },
      { tipo: "nota", texto: "x", proximo_passo: "Ligar" },
      { tipo: "ligacao", resultado: "atendeu", proximo_passo_vence_em: sp("2026-10-04", "10:00") },
    ];
    for (const corpo of corpos) {
      const d = decidirInteracao(corpo);
      if (d.ok) expect(d.args.p_passo === null, JSON.stringify(corpo)).toBe(d.args.p_vence_em === null);
    }
  });

  it("leadEstaAberto: fechado é quem tem um dos três desfechos", () => {
    expect(leadEstaAberto({ desfecho: null })).toBe(true);
    expect(leadEstaAberto({})).toBe(true);
    for (const desfecho of ["ganho", "perdido", "descartado"]) expect(leadEstaAberto({ desfecho })).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("sugestoesDeProximoPasso — as duas de cada etapa, no relógio da loja", () => {
  it("ao meio-dia de sábado, cada etapa devolve o texto e o instante do desenho", () => {
    const esperado: Record<string, Array<[string, string, string]>> = {
      novo: [
        ["Primeiro contato pelo WhatsApp", "hoje +15 min", sp("2026-10-03", "12:15")],
        ["Ligar para qualificar", "hoje +1 h", sp("2026-10-03", "13:00")],
      ],
      em_contato: [
        ["Enviar proposta", "amanhã 10:00", sp("2026-10-04", "10:00")],
        ["Convidar para visita", "amanhã 10:00", sp("2026-10-04", "10:00")],
      ],
      proposta: [
        ["Cobrar retorno da proposta", "amanhã 10:00", sp("2026-10-04", "10:00")],
        ["Enviar simulação de financiamento", "hoje 17:00", sp("2026-10-03", "17:00")],
      ],
      visita: [
        ["Confirmar visita", "amanhã 09:00", sp("2026-10-04", "09:00")],
        ["Avaliar carro na troca", "hoje 16:00", sp("2026-10-03", "16:00")],
      ],
      negociacao: [
        ["Levar contraproposta ao gerente", "hoje 16:00", sp("2026-10-03", "16:00")],
        ["Fechar pedido", "amanhã 10:00", sp("2026-10-04", "10:00")],
      ],
    };
    for (const [etapa, sugestoes] of Object.entries(esperado)) {
      const lidas = sugestoesDeProximoPasso(etapa, AGORA);
      expect(lidas.map((s) => [s.texto, s.quando]), etapa).toEqual(sugestoes.map(([t, q]) => [t, q]));
      expect(lidas.map((s) => ms(s.vence_em)), etapa).toEqual(sugestoes.map(([, , quando]) => ms(quando)));
    }
  });

  it("toda sugestão passa por decidirInteracao como está", () => {
    for (const etapa of ETAPAS_COM_SUGESTAO) {
      for (const s of sugestoesDeProximoPasso(etapa, AGORA)) {
        const d = decidirInteracao({ tipo: "nota", texto: "x", proximo_passo: s.texto, proximo_passo_vence_em: s.vence_em });
        expect(d.ok, `${etapa}: ${s.texto}`).toBe(true);
      }
    }
  });

  it("21h30 em São Paulo já é amanhã em UTC: 'amanhã' continua sendo o dia seguinte da LOJA", () => {
    // 03/10 21:30 em São Paulo = 04/10 00:30 UTC.
    const noite = ms(sp("2026-10-03", "21:30"));
    const [proposta] = sugestoesDeProximoPasso("em_contato", noite);
    expect(ms(proposta.vence_em)).toBe(ms(sp("2026-10-04", "10:00")));
  });

  it("um minuto antes e um minuto depois da meia-noite de São Paulo", () => {
    const antes = sugestoesDeProximoPasso("visita", ms(sp("2026-10-03", "23:59")));
    expect(ms(antes[0].vence_em)).toBe(ms(sp("2026-10-04", "09:00")));
    const depois = sugestoesDeProximoPasso("visita", ms(sp("2026-10-04", "00:01")));
    expect(ms(depois[0].vence_em)).toBe(ms(sp("2026-10-05", "09:00")));
    // "hoje 16:00" à 00:01 ainda é hoje: o dia mal começou.
    expect(depois[1].quando).toBe("hoje 16:00");
    expect(ms(depois[1].vence_em)).toBe(ms(sp("2026-10-04", "16:00")));
  });

  it("'hoje 17:00' pedido depois das 17h não nasce atrasado: vai para amanhã, e o rótulo diz", () => {
    const tarde = ms(sp("2026-10-03", "18:30"));
    const [, simulacao] = sugestoesDeProximoPasso("proposta", tarde);
    expect(simulacao.quando).toBe("amanhã 17:00");
    expect(ms(simulacao.vence_em)).toBe(ms(sp("2026-10-04", "17:00")));
    // Na hora exata também: um passo que vence neste instante já venceu.
    const naHora = sugestoesDeProximoPasso("proposta", ms(sp("2026-10-03", "17:00")))[1];
    expect(naHora.quando).toBe("amanhã 17:00");
    // Um minuto antes, ainda é hoje.
    expect(sugestoesDeProximoPasso("proposta", ms(sp("2026-10-03", "16:59")))[1].quando).toBe("hoje 17:00");
  });

  it("nenhuma sugestão vence no passado, em hora nenhuma do dia", () => {
    for (let hora = 0; hora < 24; hora += 1) {
      const agora = ms(sp("2026-10-03", `${String(hora).padStart(2, "0")}:30`));
      for (const etapa of ETAPAS_COM_SUGESTAO) {
        for (const s of sugestoesDeProximoPasso(etapa, agora)) {
          expect(ms(s.vence_em), `${etapa} às ${hora}h30: ${s.texto}`).toBeGreaterThan(agora);
        }
      }
    }
  });

  it("etapa que o dono criou, terminal ou ausente: sem sugestão", () => {
    for (const etapa of ["test_drive", "fechado", "perdido", "descartado", "", null, undefined]) {
      expect(sugestoesDeProximoPasso(etapa, AGORA), String(etapa)).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------

describe("situacaoDoPasso e rotuloDoPasso", () => {
  it("as etiquetas do desenho", () => {
    const casos: Array<[string, string, string | null, string, string]> = [
      // vencimento (São Paulo)           situação     card                lista
      [sp("2026-10-03", "16:30"), "hoje", "hoje", "HOJE · 16:30", "16:30"],
      [sp("2026-09-28", "17:00"), "5 dias atrás", "atrasado", "ATRASADO · 5 D", "5 d"],
      [sp("2026-10-02", "17:00"), "ontem", "atrasado", "ATRASADO · 1 D", "ontem 17:00"],
      [sp("2026-10-04", "09:00"), "amanhã", "proximo", "AMANHÃ · 09:00", "Amanhã 09:00"],
      [sp("2026-10-09", "10:00"), "sexta", "proximo", "SEX · 10:00", "Sex 10:00"],
      [sp("2026-10-05", "08:05"), "segunda", "proximo", "SEG · 08:05", "Seg 08:05"],
      [sp("2026-10-03", "12:00"), "agora", "hoje", "AGORA", "Agora"],
      [sp("2026-10-03", "11:40"), "20 min atrás", "atrasado", "ATRASADO · 20 MIN", "11:40"],
      [sp("2026-10-03", "08:00"), "4 h atrás", "atrasado", "ATRASADO · 4 H", "08:00"],
    ];
    for (const [vence, caso, situacao, card, lista] of casos) {
      expect(situacaoDoPasso(vence, AGORA), caso).toBe(situacao);
      expect(rotuloDoPasso(vence, AGORA, "card"), caso).toBe(card);
      expect(rotuloDoPasso(vence, AGORA, "lista"), caso).toBe(lista);
    }
    // O card é o formato padrão.
    expect(rotuloDoPasso(sp("2026-10-03", "16:30"), AGORA)).toBe("HOJE · 16:30");
  });

  it("'Sáb 10:00': o sábado seguinte visto de uma segunda", () => {
    const segunda = ms(sp("2026-10-05", "09:00"));
    expect(rotuloDoPasso(sp("2026-10-10", "10:00"), segunda, "lista")).toBe("Sáb 10:00");
    expect(rotuloDoPasso(sp("2026-10-10", "10:00"), segunda, "card")).toBe("SÁB · 10:00");
    expect(rotuloDoPasso(sp("2026-10-11", "10:00"), segunda, "lista")).toBe("Dom 10:00");
  });

  it("de sete dias em diante é a data: 'Sáb' visto de um sábado seria ambíguo", () => {
    expect(rotuloDoPasso(sp("2026-10-10", "10:00"), AGORA, "lista")).toBe("10/10 10:00");
    expect(rotuloDoPasso(sp("2026-11-02", "10:00"), AGORA, "card")).toBe("02/11 · 10:00");
  });

  it("a virada do dia é a de São Paulo, não a de UTC", () => {
    // 23:59 de hoje em São Paulo já é dia 04 em UTC: continua "hoje".
    expect(situacaoDoPasso(sp("2026-10-03", "23:59"), AGORA)).toBe("hoje");
    expect(rotuloDoPasso(sp("2026-10-03", "23:59"), AGORA, "lista")).toBe("23:59");
    // Meia-noite em ponto é amanhã.
    expect(situacaoDoPasso(sp("2026-10-04", "00:00"), AGORA)).toBe("proximo");
    expect(rotuloDoPasso(sp("2026-10-04", "00:00"), AGORA, "lista")).toBe("Amanhã 00:00");

    // Agora são 22:00 em São Paulo (01:00 UTC do dia seguinte): o passo das
    // 23:00 é de HOJE, e o das 09:00 da manhã de hoje está atrasado HOJE.
    const noite = ms(sp("2026-10-03", "22:00"));
    expect(situacaoDoPasso(sp("2026-10-03", "23:00"), noite)).toBe("hoje");
    expect(rotuloDoPasso(sp("2026-10-03", "09:00"), noite, "card")).toBe("ATRASADO · 13 H");
    expect(rotuloDoPasso(sp("2026-10-04", "09:00"), noite, "lista")).toBe("Amanhã 09:00");
  });

  it("o atraso em dias é de calendário: venceu 23:50, à 00:10 está 'ontem'", () => {
    const madrugada = ms(sp("2026-10-04", "00:10"));
    // Vinte minutos de atraso, mas passou a folga do "Agora" e virou o dia.
    expect(situacaoDoPasso(sp("2026-10-03", "23:50"), madrugada)).toBe("atrasado");
    expect(rotuloDoPasso(sp("2026-10-03", "23:50"), madrugada, "lista")).toBe("ontem 23:50");
    expect(rotuloDoPasso(sp("2026-10-03", "23:50"), madrugada, "card")).toBe("ATRASADO · 1 D");
  });

  it("a folga do 'Agora': o passo que acabou de vencer é de hoje; passada a folga, atrasou", () => {
    const venceu = sp("2026-10-03", "12:00");
    const noLimite = AGORA + FOLGA_DO_AGORA_MS;
    expect(situacaoDoPasso(venceu, noLimite)).toBe("hoje");
    expect(rotuloDoPasso(venceu, noLimite, "lista")).toBe("Agora");
    expect(situacaoDoPasso(venceu, noLimite + 1)).toBe("atrasado");
    expect(rotuloDoPasso(venceu, noLimite + 60_000, "card")).toBe("ATRASADO · 16 MIN");
    // O que ainda vai vencer daqui a um minuto não é "Agora": tem hora.
    expect(rotuloDoPasso(sp("2026-10-03", "12:01"), AGORA, "card")).toBe("HOJE · 12:01");
    // A folga atravessa a meia-noite sem virar "ontem".
    expect(rotuloDoPasso(sp("2026-10-03", "23:55"), ms(sp("2026-10-04", "00:05")), "lista")).toBe("Agora");
  });

  it("sem data, ou data ilegível: null", () => {
    for (const v of [null, undefined, "", "   ", "depois"]) {
      expect(situacaoDoPasso(v, AGORA), String(v)).toBeNull();
      expect(rotuloDoPasso(v, AGORA), String(v)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------

describe("ordenarListaDoDia", () => {
  const lead = (id: string, vence: string | null, extra: Record<string, unknown> = {}) => ({
    id,
    proximo_passo: vence ? `passo de ${id}` : null,
    proximo_passo_vence_em: vence,
    desfecho: null as string | null,
    ...extra,
  });

  it("agrupa em Atrasados / Hoje / Próximos, cada grupo por vencimento", () => {
    const lista = ordenarListaDoDia(
      [
        lead("amanha-10", sp("2026-10-04", "10:00")),
        lead("hoje-17", sp("2026-10-03", "17:00")),
        lead("ontem", sp("2026-10-02", "17:00")),
        lead("hoje-13", sp("2026-10-03", "13:00")),
        lead("cinco-dias", sp("2026-09-28", "09:00")),
        lead("hoje-cedo", sp("2026-10-03", "08:00")),
        lead("sexta", sp("2026-10-09", "10:00")),
        lead("amanha-09", sp("2026-10-04", "09:00")),
      ],
      AGORA,
    );
    // O atraso maior no topo.
    expect(lista.atrasados.map((l) => l.id)).toEqual(["cinco-dias", "ontem", "hoje-cedo"]);
    expect(lista.hoje.map((l) => l.id)).toEqual(["hoje-13", "hoje-17"]);
    expect(lista.proximos.map((l) => l.id)).toEqual(["amanha-09", "amanha-10", "sexta"]);
    expect(lista.semPasso).toBe(0);
  });

  it("lead aberto sem passo, com passo sem data ou com data sem passo fica fora, e é contado", () => {
    const lista = ordenarListaDoDia(
      [
        lead("com-passo", sp("2026-10-03", "17:00")),
        lead("sem-passo", null),
        { id: "so-texto", proximo_passo: "Ligar", proximo_passo_vence_em: null, desfecho: null },
        { id: "so-data", proximo_passo: "  ", proximo_passo_vence_em: sp("2026-10-03", "17:00"), desfecho: null },
        { id: "nada" },
      ],
      AGORA,
    );
    expect(lista.hoje.map((l) => l.id)).toEqual(["com-passo"]);
    expect(lista.atrasados).toEqual([]);
    expect(lista.proximos).toEqual([]);
    expect(lista.semPasso).toBe(4);
  });

  it("lead fechado não entra, nem na contagem dos sem passo", () => {
    const lista = ordenarListaDoDia(
      [
        lead("ganho", sp("2026-10-03", "17:00"), { desfecho: "ganho" }),
        lead("perdido-sem-passo", null, { desfecho: "perdido" }),
        lead("descartado", sp("2026-10-01", "17:00"), { desfecho: "descartado" }),
      ],
      AGORA,
    );
    expect(lista).toEqual({ atrasados: [], hoje: [], proximos: [], semPasso: 0 });
  });

  it("quem acabou de chegar na loja abre o grupo de Hoje, e não cai em Atrasados", () => {
    const lista = ordenarListaDoDia(
      [lead("hoje-17", sp("2026-10-03", "17:00")), lead("chegou", sp("2026-10-03", "11:58"))],
      AGORA,
    );
    expect(lista.hoje.map((l) => l.id)).toEqual(["chegou", "hoje-17"]);
    expect(lista.atrasados).toEqual([]);
  });

  it("o empate de horário tem ordem fixa, e a lista de entrada não é mexida", () => {
    const entrada = [lead("b", sp("2026-10-03", "17:00")), lead("a", sp("2026-10-03", "17:00"))];
    expect(ordenarListaDoDia(entrada, AGORA).hoje.map((l) => l.id)).toEqual(["a", "b"]);
    expect(entrada.map((l) => l.id)).toEqual(["b", "a"]);
  });

  it("o grupo é o do calendário de São Paulo: 23:30 de hoje é Hoje, embora já seja amanhã em UTC", () => {
    const lista = ordenarListaDoDia(
      [lead("fim-do-dia", sp("2026-10-03", "23:30")), lead("meia-noite", sp("2026-10-04", "00:00"))],
      AGORA,
    );
    expect(lista.hoje.map((l) => l.id)).toEqual(["fim-do-dia"]);
    expect(lista.proximos.map((l) => l.id)).toEqual(["meia-noite"]);
  });
});

// ---------------------------------------------------------------------------

describe("ultimaInteracaoPorLead", () => {
  const i = (lead_id: string, criado_em: string, extra: Partial<InteracaoDoLead> = {}): InteracaoDoLead => ({
    id: `${lead_id}-${criado_em}`,
    lead_id,
    tipo: "nota",
    texto: `nota de ${criado_em}`,
    autor: "Ana",
    criado_em,
    ...extra,
  });

  it("a mais recente de cada lead, qualquer que seja a ordem em que as linhas chegam", () => {
    const linhas = [
      i("l1", "2026-10-01T10:00:00Z"),
      i("l2", "2026-10-02T10:00:00Z", { tipo: "whatsapp", texto: "mandou fotos", autor: " Bia " }),
      i("l1", "2026-10-03T10:00:00Z", { tipo: "visita", texto: "veio ver o carro" }),
      i("l1", "2026-10-02T10:00:00Z"),
    ];
    for (const ordem of [linhas, [...linhas].reverse()]) {
      const mapa = ultimaInteracaoPorLead(ordem);
      expect(mapa.size).toBe(2);
      expect(mapa.get("l1")).toEqual({ tipo: "visita", quando: "2026-10-03T10:00:00Z", texto: "veio ver o carro", autor: "Ana" });
      expect(mapa.get("l2")).toEqual({ tipo: "whatsapp", quando: "2026-10-02T10:00:00Z", texto: "mandou fotos", autor: "Bia" });
    }
  });

  it("ligação sem texto mostra o resultado por extenso; sem autor, nulo", () => {
    const mapa = ultimaInteracaoPorLead([
      i("l1", "2026-10-03T10:00:00Z", { tipo: "ligacao", texto: null, resultado: "caixa_postal", autor: null }),
    ]);
    expect(mapa.get("l1")).toEqual({ tipo: "ligacao", quando: "2026-10-03T10:00:00Z", texto: "Caixa postal", autor: null });
  });
});

// ---------------------------------------------------------------------------

describe("montarHistorico", () => {
  const CONTEXTO = {
    etapas: [
      { chave: "novo", rotulo: "Novo" },
      { chave: "proposta", rotulo: "Proposta" },
      { chave: "visita", rotulo: "Visita agendada" },
      { chave: "perdido", rotulo: "Perdido" },
    ],
    motivos: [{ chave: "preco", rotulo: "Preço acima do que o cliente queria pagar" }],
  };
  let n = 0;
  const evento = (tipo: string, extra: Partial<EventoDoLead> = {}): EventoDoLead => ({
    id: `e${(n += 1)}`,
    tipo,
    criado_em: "2026-10-01T12:00:00Z",
    automatico: false,
    ...extra,
  });
  const frase = (e: EventoDoLead) => montarHistorico([], [e], CONTEXTO)[0];

  it("entrada: a etapa, o canal e o interesse que o gatilho gravou", () => {
    const item = frase(evento("entrada", { para: "novo", automatico: true, detalhe: { canal: "PDP", interesse: "Onix 2020" } }));
    expect(item).toMatchObject({
      origem: "sistema",
      tipo: "entrada",
      rotulo: "Entrada",
      autor: "Sistema",
      texto: "Lead recebido na etapa Novo, pelo canal PDP. Interesse: Onix 2020.",
    });
    expect(frase(evento("entrada", { para: "novo", detalhe: { canal: null, interesse: null } })).texto).toBe(
      "Lead recebido na etapa Novo.",
    );
  });

  it("etapa: de onde para onde, com o rótulo do funil; chave desconhecida vira texto legível", () => {
    expect(frase(evento("etapa", { de: "proposta", para: "visita", autor: "Ana" }))).toMatchObject({
      rotulo: "Etapa",
      autor: "Ana",
      texto: "Movido de Proposta para Visita agendada.",
    });
    expect(frase(evento("etapa", { de: "novo", para: "test_drive" })).texto).toBe("Movido de Novo para test drive.");
    expect(frase(evento("etapa", { para: "visita" })).texto).toBe("Movido para Visita agendada.");
  });

  it("responsável: atribuição, troca e retirada", () => {
    expect(frase(evento("responsavel", { de: null, para: "Ana", autor: "Dono" })).texto).toBe("Atribuído a Ana.");
    expect(frase(evento("responsavel", { de: "Ana", para: "Bia", autor: "Ana" })).texto).toBe(
      "Responsável trocado de Ana para Bia.",
    );
    expect(frase(evento("responsavel", { de: "Ana", para: null, autor: "Dono" })).texto).toBe(
      "Ficou sem responsável (estava com Ana).",
    );
  });

  it("responsável trocado no Chatwoot: a frase diz por onde, com o admin de lá como autor", () => {
    // A linha que `corrigirRastro` (`/api/chatwoot/eventos`) deixa.
    const item = frase(
      evento("responsavel", {
        de: null,
        para: "Bia",
        autor: "Dyones",
        automatico: false,
        detalhe: { origem: "chatwoot", conversa: 4821, nota: "atribuicao" },
      }),
    );
    expect(item.autor).toBe("Dyones");
    expect(item.texto).toBe("Atribuído a Bia. Atribuição feita no Chatwoot.");
    expect(
      frase(evento("responsavel", { de: "Ana", para: "Bia", detalhe: { origem: "chatwoot", conversa: 1, nota: "time" } })).texto,
    ).toBe("Responsável trocado de Ana para Bia. Atribuição feita no Chatwoot.");
  });

  it("transferência automática: o motor assina como Sistema", () => {
    expect(frase(evento("transferencia", { de: "Ana", para: "Bia", automatico: true, autor: null }))).toMatchObject({
      rotulo: "Transferência automática",
      autor: "Sistema",
      texto: "Transferido automaticamente de Ana para Bia.",
    });
    expect(frase(evento("transferencia", { de: null, para: "Bia", automatico: true })).texto).toBe(
      "Atribuído automaticamente a Bia.",
    );
    expect(frase(evento("transferencia", { de: "Ana", para: null, automatico: true })).texto).toBe(
      "Ficou sem responsável, por ação automática (estava com Ana).",
    );
    // A linha sem detalhe nenhum que o aceite da migração de etiquetas grava.
    expect(frase(evento("transferencia", { automatico: true, detalhe: null })).texto).toBe(
      "Ficou sem responsável, por ação automática.",
    );
  });

  it("contato: pelo botão do card e pela resposta no Chatwoot", () => {
    expect(frase(evento("contato", { para: "whatsapp", autor: "Ana", detalhe: { canal: "whatsapp", via_servico: false } })).texto).toBe(
      "Contato com o cliente registrado pelo WhatsApp.",
    );
    expect(frase(evento("contato", { para: "chatwoot", autor: "Bia", detalhe: { canal: "chatwoot", via_servico: true } }))).toMatchObject({
      autor: "Bia",
      texto: "Respondeu ao cliente pelo Chatwoot.",
    });
    // A linha da primeira versão da função, sem `via_servico`.
    expect(frase(evento("contato", { para: "telefone", detalhe: { canal: "telefone" } })).texto).toBe(
      "Contato com o cliente registrado pelo telefone.",
    );
    expect(frase(evento("contato", {})).texto).toBe("Contato com o cliente registrado.");
  });

  it("desfecho: o tipo, o motivo pelo nome, o valor em reais e a observação", () => {
    expect(
      frase(evento("desfecho", { de: null, para: "perdido", autor: "Ana", detalhe: { motivo: "preco", valor: null, nota: "achou caro" } })).texto,
    ).toBe("Fechado como Perdido. Motivo: Preço acima do que o cliente queria pagar. Observação: “achou caro”.");
    expect(
      frase(evento("desfecho", { para: "ganho", detalhe: { motivo: "financiado", valor: 55000, nota: null } })).texto,
    ).toBe("Fechado como Ganho. Motivo: financiado. Valor: R$ 55.000,00.");
    expect(frase(evento("desfecho", { para: "descartado", detalhe: { motivo: null, valor: null, nota: null } })).texto).toBe(
      "Fechado como Descartado. Sem motivo informado.",
    );
  });

  it("desfecho desfeito: o negócio reabriu", () => {
    expect(frase(evento("desfecho", { de: "perdido", para: null, detalhe: { motivo: null, valor: null, nota: null } })).texto).toBe(
      "Negócio reaberto (estava como Perdido).",
    );
  });

  it("alerta: o aviso foi GERADO, e a frase não afirma que alguém leu", () => {
    const estagnacao = frase(
      evento("alerta", { de: "Ana", para: "Ana", automatico: true, detalhe: { aviso: "estagnacao", minutos_parado: 2880, etapa: "proposta" } }),
    );
    expect(estagnacao).toMatchObject({
      rotulo: "Aviso",
      autor: "Sistema",
      texto: "Aviso de lead parado gerado para Ana: 2 dias sem atendimento em Proposta.",
    });
    expect(
      frase(evento("alerta", { de: "Ana", para: "Bia", automatico: true, detalhe: { aviso: "transferencia", minutos_parado: 4320, etapa: "proposta" } })).texto,
    ).toBe("Aviso de transferência gerado para Bia (estava com Ana): 3 dias sem atendimento em Proposta.");
    expect(
      frase(evento("alerta", { de: null, para: "Bia", automatico: true, detalhe: { aviso: "atribuicao", minutos_parado: 20, etapa: "novo" } })).texto,
    ).toBe("Aviso de atribuição gerado para Bia: 20 min sem responsável em Novo.");
    // A linha mínima que o aceite da migração de etiquetas grava.
    expect(frase(evento("alerta", { automatico: true, detalhe: { aviso: "estagnacao" } })).texto).toBe(
      "Aviso de lead parado gerado.",
    );
    for (const item of montarHistorico([], [evento("alerta", { para: "Ana", automatico: true, detalhe: { aviso: "estagnacao" } })], CONTEXTO)) {
      expect(item.texto).not.toMatch(/enviad|avisad|entreg/i);
    }
  });

  it("etiquetas pelo card: o que entrou e o que saiu", () => {
    const detalhe = (incluidas: string[], retiradas: string[]) => ({ origem: "card", antes: [], depois: [], incluidas, retiradas });
    expect(frase(evento("etiqueta", { autor: "Felipe", detalhe: detalhe(["negociando", "quer-comprar"], ["origem-site"]) }))).toMatchObject({
      rotulo: "Etiquetas",
      autor: "Felipe",
      texto: "Etiquetas da conversa: incluiu negociando e quer-comprar; retirou origem-site.",
    });
    expect(frase(evento("etiqueta", { detalhe: detalhe(["a", "b", "c"], []) })).texto).toBe(
      "Etiquetas da conversa: incluiu a, b e c.",
    );
    expect(frase(evento("etiqueta", { para: "x, y", detalhe: detalhe([], []) })).texto).toBe("Etiquetas da conversa: x, y.");
    expect(frase(evento("etiqueta", { detalhe: null })).texto).toBe("Etiquetas da conversa alteradas.");
  });

  it("etiquetas da passagem do SDR: o crédito de resgate, com o motivo e a passagem", () => {
    const item = frase(
      evento("etiqueta", {
        para: "resgate, reaquecido",
        autor: "Felipe",
        detalhe: {
          origem: "passagem_do_sdr",
          sdr_id: "u-sdr",
          etiquetas: ["resgate", "reaquecido"],
          motivos: ["parado", "reaberto"],
          responsavel_de: "Bia",
          responsavel_para: "Ana",
        },
      }),
    );
    expect(item.texto).toBe("Passagem do SDR creditada como resgate (lead parado e lead reaberto). De Bia para Ana.");
    expect(item.autor).toBe("Felipe");
    expect(
      frase(evento("etiqueta", { detalhe: { origem: "passagem_do_sdr", motivos: ["parado"], responsavel_de: null, responsavel_para: "Ana" } })).texto,
    ).toBe("Passagem do SDR creditada como resgate (lead parado). Para Ana.");
  });

  it("nota do rastro e tipo que o banco ganhe depois: frase, nunca JSON", () => {
    expect(frase(evento("nota", { detalhe: { texto: "Importado da planilha" } })).texto).toBe("Importado da planilha");
    expect(frase(evento("nota", {})).texto).toBe("Anotação do sistema.");
    const novo = frase(evento("fusao", { de: "a", para: "b", detalhe: { qualquer: { coisa: [1, 2] } } }));
    expect(novo).toMatchObject({ rotulo: "Sistema", texto: "Registro do tipo fusao: de a para b." });
  });

  it("todo tipo do CHECK do rastro tem rótulo próprio e frase sem chave crua", () => {
    const migracao = readFileSync(
      join(process.cwd(), "supabase", "migrations", "20260925180000_etiquetas_do_lead.sql"),
      "utf-8",
    );
    const trecho = migracao.slice(migracao.indexOf("add constraint leads_eventos_tipo_check"));
    const tipos = [...(/in \(([^)]+)\)/.exec(trecho)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(tipos).toHaveLength(9);
    for (const tipo of tipos) {
      const item = frase(evento(tipo, { de: "novo", para: "proposta", detalhe: { aviso: "estagnacao", origem: "card" } }));
      expect(item.rotulo, tipo).not.toBe("Sistema");
      expect(item.texto, tipo).not.toMatch(/[{}[\]]|undefined|null|Registro do tipo/);
      expect(item.texto.trim(), tipo).not.toBe("");
    }
  });

  it("detalhe que não é objeto (texto, lista, nulo) não quebra a frase", () => {
    for (const detalhe of ["texto solto", [1, 2], null, undefined, 7]) {
      expect(frase(evento("etapa", { de: "novo", para: "proposta", detalhe })).texto).toBe("Movido de Novo para Proposta.");
    }
  });

  it("o registro do vendedor: tipo por extenso, resultado, próximo passo e a marca de importado", () => {
    const interacoes: InteracaoDoLead[] = [
      {
        id: "i1",
        lead_id: "l1",
        tipo: "ligacao",
        resultado: "nao_atendeu",
        texto: null,
        autor: "Ana",
        passo_texto: "Ligar de novo",
        passo_vence_em: "2026-10-04T13:00:00Z",
        importada: false,
        criado_em: "2026-10-02T12:00:00Z",
      },
      { id: "i2", lead_id: "l1", tipo: "nota", texto: "Anotação antiga", autor: null, importada: true, criado_em: "2026-09-01T12:00:00Z" },
      { id: "i3", lead_id: "l1", tipo: "visita", texto: "Fez test drive", autor: "Bia", criado_em: "2026-10-03T12:00:00Z" },
    ];
    const [visita, ligacao, antiga] = montarHistorico(interacoes, []);
    expect(visita).toEqual({
      id: "interacao:i3",
      origem: "humana",
      tipo: "visita",
      rotulo: "Visita à loja",
      autor: "Bia",
      quando: "2026-10-03T12:00:00Z",
      texto: "Fez test drive",
    });
    expect(ligacao).toEqual({
      id: "interacao:i1",
      origem: "humana",
      tipo: "ligacao",
      rotulo: "Ligação",
      autor: "Ana",
      quando: "2026-10-02T12:00:00Z",
      texto: "Não atendeu",
      resultado: "nao_atendeu",
      proximoPasso: { texto: "Ligar de novo", vence_em: "2026-10-04T13:00:00Z" },
    });
    expect(antiga).toMatchObject({ rotulo: "Anotação", autor: null, importada: true });
  });

  it("uma linha só, da mais nova para a mais antiga, com ids que não colidem entre as tabelas", () => {
    const historico = montarHistorico(
      [
        { id: "x", tipo: "nota", texto: "segunda", autor: "Ana", criado_em: "2026-10-02T10:00:00Z" },
        { id: "y", tipo: "nota", texto: "quarta", autor: "Ana", criado_em: "2026-10-04T10:00:00Z" },
      ],
      [
        { id: "x", tipo: "etapa", de: "novo", para: "proposta", criado_em: "2026-10-03T10:00:00Z" },
        { id: "z", tipo: "entrada", para: "novo", criado_em: "2026-10-01T10:00:00Z" },
      ],
      CONTEXTO,
    );
    expect(historico.map((i) => i.id)).toEqual(["interacao:y", "evento:x", "interacao:x", "evento:z"]);
    expect(historico.map((i) => i.origem)).toEqual(["humana", "sistema", "humana", "sistema"]);
    expect(new Set(historico.map((i) => i.id)).size).toBe(4);
  });

  it("no mesmo instante, o registro do vendedor vem antes do movimento que o sistema anotou", () => {
    const quando = "2026-10-03T15:00:00Z";
    const historico = montarHistorico(
      [{ id: "i", tipo: "visita", texto: "Chegou na loja.", autor: "Ana", criado_em: quando }],
      [{ id: "e", tipo: "etapa", de: "proposta", para: "visita", autor: "Ana", criado_em: quando }],
      CONTEXTO,
    );
    expect(historico.map((i) => i.origem)).toEqual(["humana", "sistema"]);
  });

  it("listas nulas (leitura que falhou) viram histórico vazio, sem estourar", () => {
    expect(montarHistorico(null, undefined)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe("filtroDaBusca — nome, telefone ou referência", () => {
  it("referência: o código solto, o rótulo e a mensagem inteira", () => {
    for (const termo of ["0DCB1CDC", "0dcb1cdc", "(Ref: 0DCB1CDC)", "Olá! Tenho interesse no Onix 2022. (Ref: 0DCB1CDC)", "0dcb1cdc-fb39-4a39-99c9-923f025619f4"]) {
      expect(filtroDaBusca(termo), termo).toEqual({ tipo: "ref", ref: "0DCB1CDC" });
    }
  });

  it("telefone: só os dígitos, sem o 55 da frente", () => {
    expect(filtroDaBusca("(41) 99117-6299")).toEqual({ tipo: "telefone", digitos: "41991176299" });
    expect(filtroDaBusca("+55 41 99117-6299")).toEqual({ tipo: "telefone", digitos: "41991176299" });
    expect(filtroDaBusca("5541991176299")).toEqual({ tipo: "telefone", digitos: "41991176299" });
    expect(filtroDaBusca("6299")).toEqual({ tipo: "telefone", digitos: "6299" });
    // "55" no começo de um número curto é pedaço de telefone, e fica.
    expect(filtroDaBusca("5599")).toEqual({ tipo: "telefone", digitos: "5599" });
  });

  it("oito dígitos exatos são telefone E referência: a busca procura pelos dois", () => {
    expect(filtroDaBusca("41999990")).toEqual({ tipo: "telefone", digitos: "41999990", refAlternativa: "41999990" });
    // O que sai daqui serve ao filtro do banco sem estourar.
    expect(padraoDaRef("41999990")).toBe("41999990-%");
    // Com separador no meio já não é o código: só telefone.
    expect(filtroDaBusca("4199-9990")).toEqual({ tipo: "telefone", digitos: "41999990" });
  });

  it("nome: contém, com os curingas do termo escapados", () => {
    expect(filtroDaBusca("  Maria   Silva ")).toEqual({ tipo: "nome", termo: "Maria Silva", padrao: "%Maria Silva%" });
    expect(filtroDaBusca("100%_x\\")).toEqual({ tipo: "nome", termo: "100%_x\\", padrao: "%100\\%\\_x\\\\%" });
    // O asterisco também: o PostgREST o lê como `%` no `ilike`.
    expect(filtroDaBusca("Jo*")).toEqual({ tipo: "nome", termo: "Jo*", padrao: "%Jo\\*%" });
    expect(filtroDaBusca("**")).toEqual({ tipo: "nome", termo: "**", padrao: "%\\*\\*%" });
    // Nenhum asterisco do termo chega ao padrão sem a barra na frente.
    const padrao = (filtroDaBusca("a*b*c") as { padrao: string }).padrao;
    expect(padrao.replace(/\\\*/g, "")).not.toContain("*");
    // Nome com número não é telefone.
    expect(filtroDaBusca("Onix 2020")?.tipo).toBe("nome");
  });

  it("termo vazio ou curto demais não busca", () => {
    for (const termo of ["", "   ", "a", "12", "123", "(41)", null, undefined]) {
      expect(filtroDaBusca(termo), String(termo)).toBeNull();
    }
    expect(AVISO_DE_BUSCA_INVALIDA).not.toMatch(/—/);
  });

  it("refDoLead: os oito primeiros do ag_uid, em caixa alta, só quando é UUID", () => {
    expect(refDoLead("0dcb1cdc-fb39-4a39-99c9-923f025619f4")).toBe("0DCB1CDC");
    for (const v of ["0dcb1cdcf-b39", "ag_ref_nao_localizado", "", null, undefined]) expect(refDoLead(v)).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("decidirDados — a lista fechada dos dados do negócio", () => {
  it("os cinco campos, e só eles", () => {
    expect([...CAMPOS_DOS_DADOS]).toEqual(["carro_na_troca", "faixa_entrada", "pagamento_pretendido", "email", "veiculo_id"]);
  });

  it("grava o que veio, aparado, e só o que veio", () => {
    expect(
      decidirDados({
        carro_na_troca: "  Gol 2015 prata ",
        faixa_entrada: "de_5k_a_10k",
        pagamento_pretendido: "financiado",
        email: " ana@exemplo.com ",
        veiculo_id: "8203724",
      }),
    ).toEqual({
      ok: true,
      campos: {
        carro_na_troca: "Gol 2015 prata",
        faixa_entrada: "de_5k_a_10k",
        pagamento_pretendido: "financiado",
        email: "ana@exemplo.com",
        veiculo_id: 8203724,
      },
    });
    expect(decidirDados({ faixa_entrada: "sem_entrada" })).toEqual({ ok: true, campos: { faixa_entrada: "sem_entrada" } });
  });

  it("nulo e vazio limpam o campo", () => {
    expect(decidirDados({ carro_na_troca: "", faixa_entrada: null, pagamento_pretendido: "  ", email: null, veiculo_id: null })).toEqual({
      ok: true,
      campos: { carro_na_troca: null, faixa_entrada: null, pagamento_pretendido: null, email: null, veiculo_id: null },
    });
  });

  it("campo de fora é recusado, e não ignorado", () => {
    for (const campo of ["responsavel", "situacao", "observacoes", "desfecho", "nome", "telefone", "proximo_passo", "id"]) {
      const d = decidirDados({ faixa_entrada: "ate_5k", [campo]: "x" });
      expect(d, campo).toMatchObject({ ok: false, status: 400, codigo: "campo_desconhecido" });
      expect(!d.ok && d.erro, campo).toContain(campo);
    }
  });

  it("corpo vazio, nulo ou que não é objeto: nada para gravar", () => {
    for (const corpo of [{}, null, undefined, "x", [], { faixa_entrada: undefined }]) {
      expect(decidirDados(corpo), JSON.stringify(corpo)).toMatchObject({ ok: false, codigo: "sem_campos" });
    }
  });

  it("valor fora das listas do banco é recusado com o código do campo", () => {
    expect(decidirDados({ faixa_entrada: "ate_5mil" })).toMatchObject({ ok: false, codigo: "faixa_entrada_invalida" });
    expect(decidirDados({ faixa_entrada: "ACIMA_20K" })).toMatchObject({ ok: false, codigo: "faixa_entrada_invalida" });
    expect(decidirDados({ pagamento_pretendido: "pix" })).toMatchObject({ ok: false, codigo: "pagamento_pretendido_invalido" });
    expect(decidirDados({ pagamento_pretendido: "a vista" })).toMatchObject({ ok: false, codigo: "pagamento_pretendido_invalido" });
    expect(decidirDados({ email: "ana@" })).toMatchObject({ ok: false, codigo: "email_invalido" });
    expect(decidirDados({ email: 7 })).toMatchObject({ ok: false, codigo: "email_invalido" });
    expect(decidirDados({ carro_na_troca: 7 })).toMatchObject({ ok: false, codigo: "carro_na_troca_invalido" });
    for (const veiculo of ["abc", 0, -3, 1.5, true, {}]) {
      expect(decidirDados({ veiculo_id: veiculo }), String(veiculo)).toMatchObject({ ok: false, codigo: "veiculo_invalido" });
    }
  });
});

// ---------------------------------------------------------------------------

describe("o relógio da loja, para a tela montar a data", () => {
  it("diaNaLoja: o dia de São Paulo, e não o de UTC", () => {
    expect(diaNaLoja(AGORA)).toBe("2026-10-03");
    // 22:00 em São Paulo já é dia 04 em UTC.
    expect(diaNaLoja(ms(sp("2026-10-03", "22:00")))).toBe("2026-10-03");
    expect(diaNaLoja(ms(sp("2026-10-04", "00:00")))).toBe("2026-10-04");
    expect(diaNaLoja(AGORA, 1)).toBe("2026-10-04");
    expect(diaNaLoja(AGORA, 3)).toBe("2026-10-06");
    expect(diaNaLoja(AGORA, 7)).toBe("2026-10-10");
    // Virada de mês.
    expect(diaNaLoja(ms(sp("2026-10-31", "12:00")), 1)).toBe("2026-11-01");
  });

  it("instanteNoFusoDaLoja: dia e hora da parede da loja viram o instante certo", () => {
    expect(instanteNoFusoDaLoja("2026-10-04", "10:00")).toBe("2026-10-04T13:00:00.000Z");
    expect(instanteNoFusoDaLoja("2026-10-03", "23:30")).toBe("2026-10-04T02:30:00.000Z");
    expect(instanteNoFusoDaLoja("2026-10-04", "9:05")).toBe("2026-10-04T12:05:00.000Z");
    // Quando havia horário de verão, o deslocamento era outro: a conta lê o fuso, não um -3 fixo.
    expect(instanteNoFusoDaLoja("2018-12-01", "10:00")).toBe("2018-12-01T12:00:00.000Z");
  });

  it("o que não se lê devolve null, em vez de uma data inventada", () => {
    for (const [dia, hora] of [["2026-02-31", "10:00"], ["04/10/2026", "10:00"], ["2026-10-04", "25:00"], ["2026-10-04", "10:60"], ["2026-10-04", ""], ["", "10:00"]]) {
      expect(instanteNoFusoDaLoja(dia, hora), `${dia} ${hora}`).toBeNull();
    }
  });

  it("o que a tela monta passa pela validação da rota", () => {
    const vence = instanteNoFusoDaLoja(diaNaLoja(AGORA, 1), "10:00");
    const d = decidirInteracao({ tipo: "nota", texto: "x", proximo_passo: "Ligar", proximo_passo_vence_em: vence });
    expect(d.ok && d.args.p_vence_em).toBe("2026-10-04T13:00:00.000Z");
    expect(rotuloDoPasso(vence, AGORA, "lista")).toBe("Amanhã 10:00");
  });
});
