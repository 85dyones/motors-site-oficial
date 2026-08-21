import { describe, it, expect } from "vitest";
import {
  dataDeHoje,
  resumoDoDia,
  type ContaResumivel,
  type MovimentacaoResumivel,
} from "../src/lib/financeiroDia";

/**
 * O dia da operação financeira (briefing de 2026-08-21).
 *
 * A adm/financeira paga contas de manhã olhando "o que vence hoje" — e o
 * sistema anterior não tinha esse recorte. A tela nova afirma quatro listas e
 * oito totais; cada afirmação dessas é dinheiro, então cada uma está provada
 * aqui. O que estes testes travam:
 *
 *  1. o recorte por data compara TEXTO `YYYY-MM-DD`, nunca `Date` — é o
 *     formato do PostgREST e é imune a fuso;
 *  2. `parcial` segue aberta, `cancelado` e `pago` saem do radar;
 *  3. ordenação é contrato: atrasada mais antiga primeiro, as do dia por
 *     valor decrescente;
 *  4. valor corrompido soma 0, não NaN — uma linha ruim não pode apagar o
 *     painel do dia.
 */

const conta = (parcial: Partial<ContaResumivel>): ContaResumivel => ({
  id: parcial.id ?? "c1",
  tipo: "pagar",
  descricao: "Conta",
  valor: 100,
  data_vencimento: "2026-08-21",
  status: "pendente",
  ...parcial,
});

describe("resumoDoDia — as quatro listas", () => {
  const contas: ContaResumivel[] = [
    conta({ id: "hoje-grande", valor: 900, data_vencimento: "2026-08-21" }),
    conta({ id: "hoje-pequena", valor: 50, data_vencimento: "2026-08-21" }),
    conta({ id: "vencida-nova", valor: 200, data_vencimento: "2026-08-19", status: "vencido" }),
    conta({ id: "vencida-antiga", valor: 300, data_vencimento: "2026-08-10" }),
    conta({ id: "futura", valor: 400, data_vencimento: "2026-08-25" }),
    conta({ id: "receber-hoje", tipo: "receber", valor: 700, data_vencimento: "2026-08-21", cliente: "Fulano" }),
    conta({
      id: "paga-hoje",
      valor: 150,
      status: "pago",
      data_vencimento: "2026-08-15",
      data_pagamento: "2026-08-21",
    }),
    conta({
      id: "recebida-hoje",
      tipo: "receber",
      valor: 80,
      status: "pago",
      data_vencimento: "2026-08-21",
      data_pagamento: "2026-08-21",
    }),
    conta({
      id: "paga-ontem",
      valor: 999,
      status: "pago",
      data_vencimento: "2026-08-20",
      data_pagamento: "2026-08-20",
    }),
    conta({ id: "cancelada", valor: 500, data_vencimento: "2026-08-21", status: "cancelado" }),
  ];

  const resumo = resumoDoDia(contas, [], "2026-08-21");

  it("separa o que vence hoje do que já venceu e do que ainda vem", () => {
    expect(resumo.pagarHoje.map((c) => c.id)).toEqual(["hoje-grande", "hoje-pequena"]);
    expect(resumo.pagarVencidas.map((c) => c.id)).toEqual(["vencida-antiga", "vencida-nova"]);
    // A futura não aparece em lista nenhuma: o dia é o dia.
    const todosIds = [
      ...resumo.pagarHoje,
      ...resumo.pagarVencidas,
      ...resumo.receberHoje,
      ...resumo.liquidadasNoDia,
    ].map((c) => c.id);
    expect(todosIds).not.toContain("futura");
  });

  it("a receber é lista própria — pagar e receber nunca se somam", () => {
    expect(resumo.receberHoje.map((c) => c.id)).toEqual(["receber-hoje"]);
    expect(resumo.totais.receberHoje).toBe(700);
    expect(resumo.totais.pagarHoje).toBe(950);
  });

  it("liquidadas do dia: só as com data_pagamento na data, dos dois tipos", () => {
    expect(resumo.liquidadasNoDia.map((c) => c.id)).toEqual(["paga-hoje", "recebida-hoje"]);
    expect(resumo.totais.pagoNoDia).toBe(150);
    expect(resumo.totais.recebidoNoDia).toBe(80);
  });

  it("cancelada não entra em lugar nenhum", () => {
    const todosIds = [
      ...resumo.pagarHoje,
      ...resumo.pagarVencidas,
      ...resumo.receberHoje,
      ...resumo.liquidadasNoDia,
    ].map((c) => c.id);
    expect(todosIds).not.toContain("cancelada");
  });

  it("as vencidas vêm da mais antiga para a mais nova; as do dia, da maior para a menor", () => {
    // Prioridade operacional: o atraso mais velho cobra juros há mais tempo,
    // e o pagamento grande não pode se esconder no fim da lista.
    expect(resumo.pagarVencidas[0].id).toBe("vencida-antiga");
    expect(resumo.pagarHoje[0].id).toBe("hoje-grande");
  });

  it("`parcial` segue aberta — o que falta pagar continua devido", () => {
    const r = resumoDoDia(
      [conta({ id: "parcial", status: "parcial", data_vencimento: "2026-08-21" })],
      [],
      "2026-08-21",
    );
    expect(r.pagarHoje.map((c) => c.id)).toEqual(["parcial"]);
  });
});

describe("resumoDoDia — totais e resiliência", () => {
  it("soma `valor` vindo como string, o formato do PostgREST", () => {
    const r = resumoDoDia(
      [
        conta({ id: "a", valor: "1500.50" }),
        conta({ id: "b", valor: "99.50" }),
      ],
      [],
      "2026-08-21",
    );
    expect(r.totais.pagarHoje).toBe(1600);
  });

  it("valor corrompido soma zero, nunca NaN", () => {
    // Uma linha ruim no banco não pode transformar o total do dia em NaN —
    // NaN contamina toda soma que o toca e apaga o painel inteiro.
    const r = resumoDoDia(
      [conta({ id: "ok", valor: 100 }), conta({ id: "ruim", valor: "não-numérico" })],
      [],
      "2026-08-21",
    );
    expect(r.totais.pagarHoje).toBe(100);
  });

  it("movimentações: entradas, saídas e saldo, só as da data", () => {
    const movs: MovimentacaoResumivel[] = [
      { tipo: "entrada", valor: "1000", data_movimentacao: "2026-08-21" },
      { tipo: "saida", valor: 300, data_movimentacao: "2026-08-21" },
      { tipo: "entrada", valor: 9999, data_movimentacao: "2026-08-20" },
    ];
    const r = resumoDoDia([], movs, "2026-08-21");
    expect(r.totais.entradasNoDia).toBe(1000);
    expect(r.totais.saidasNoDia).toBe(300);
    expect(r.totais.saldoDoDia).toBe(700);
  });

  it("listas vazias devolvem resumo zerado, não erro", () => {
    const r = resumoDoDia([], [], "2026-08-21");
    expect(r.pagarHoje).toEqual([]);
    expect(r.totais.saldoDoDia).toBe(0);
  });
});

describe("dataDeHoje — o dia no fuso da loja", () => {
  it("às 22h de Curitiba ainda é hoje, mesmo que o UTC já tenha virado", () => {
    // 2026-08-22T01:00Z = 2026-08-21 22:00 em Curitiba (UTC-3). O idioma
    // `toISOString().split("T")[0]` responderia 22 — e a Sinthia fecha o
    // caixa à noite. É o motivo de a função existir.
    expect(dataDeHoje(new Date("2026-08-22T01:00:00Z"))).toBe("2026-08-21");
  });

  it("de manhã os dois fusos concordam", () => {
    expect(dataDeHoje(new Date("2026-08-21T12:00:00Z"))).toBe("2026-08-21");
  });
});
