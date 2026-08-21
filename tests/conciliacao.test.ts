import { describe, it, expect } from "vitest";
import { ErroDeOfx, dataDePosted, lerOfx, valorDeTrnamt } from "../src/lib/ofx";
import {
  conciliar,
  distanciaEmDias,
  resumirConciliacao,
  type LinhaDoBanco,
  type MovimentacaoDoCaixa,
} from "../src/lib/conciliacao";

/**
 * Conciliação bancária (P4 do briefing de 2026-08-21).
 *
 * A tentação de um motor de conciliação é maximizar o casamento — tela limpa
 * parece sucesso. É o oposto do que serve a operação: o valor está no que
 * SOBRA, porque é ali que mora a tarifa que ninguém lançou e o pagamento que
 * nunca compensou. Casar por aproximação esconde as duas coisas.
 *
 * Por isso a maioria destes testes prova RECUSA: valor quase igual não casa,
 * empate não vira escolha, lado trocado não casa. E a idempotência do FITID,
 * porque ela reimporta o extrato toda semana.
 */

// ---------------------------------------------------------------------------
// OFX
// ---------------------------------------------------------------------------

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>341<ACCTID>12345-6</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260821120000[-3:BRT]
<TRNAMT>-1234.56
<FITID>2026082100001
<MEMO>PAGTO FORNECEDOR PECAS
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260821
<TRNAMT>50000.00
<FITID>2026082100002
<MEMO>TED RECEBIDA MERC&amp;PAGO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260822
<TRNAMT>-29.90
<FITID>2026082200001
<MEMO>TARIFA PACOTE SERVICOS
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

describe("lerOfx — SGML, que é o que banco brasileiro emite", () => {
  const extrato = lerOfx(OFX_SGML);

  it("lê as três transações, com banco e conta", () => {
    expect(extrato.banco).toBe("341");
    expect(extrato.conta).toBe("12345-6");
    expect(extrato.lancamentos).toHaveLength(3);
  });

  it("o valor é sempre positivo — o lado mora em `tipo`", () => {
    // O mesmo desenho de `movimentacoes` e dos aportes: quem lê nunca
    // interpreta sinal.
    const [pagamento, recebimento] = extrato.lancamentos;
    expect(pagamento.valor).toBe(1234.56);
    expect(pagamento.tipo).toBe("saida");
    expect(recebimento.valor).toBe(50000);
    expect(recebimento.tipo).toBe("entrada");
  });

  it("a data ignora a hora e o fuso do banco", () => {
    // `20260821120000[-3:BRT]` → 2026-08-21. Interpretar a hora traria de
    // volta o fuso que o módulo inteiro evita comparando texto.
    expect(extrato.lancamentos[0].data).toBe("2026-08-21");
  });

  it("desfaz as entidades do texto do extrato", () => {
    expect(extrato.lancamentos[1].descricao).toBe("TED RECEBIDA MERC&PAGO");
  });
});

describe("lerOfx — recusa com motivo, nunca lista vazia em silêncio", () => {
  it("arquivo que não é OFX explica o que baixar", () => {
    // "Seu extrato está vazio" na cara de quem subiu o PDF errado é o pior
    // desfecho possível: ela procuraria o erro no banco.
    expect(() => lerOfx("isto é um pdf qualquer")).toThrow(ErroDeOfx);
    expect(() => lerOfx("isto é um pdf qualquer")).toThrow(/formato OFX/);
  });

  it("OFX sem transação fala do período, não do arquivo", () => {
    expect(() => lerOfx("OFXHEADER:100\n<OFX></OFX>")).toThrow(/nenhuma transação/);
  });

  it("linha sem FITID é deixada de fora — sem ela não há como não duplicar", () => {
    const semFitid = OFX_SGML.replace("<FITID>2026082100001\n", "");
    const r = lerOfx(semFitid);
    expect(r.lancamentos).toHaveLength(2);
    expect(r.lancamentos.map((l) => l.fitid)).not.toContain("2026082100001");
  });

  it("valor zero não é movimento de dinheiro", () => {
    const comZero = OFX_SGML.replace("<TRNAMT>-29.90", "<TRNAMT>0.00");
    expect(lerOfx(comZero).lancamentos).toHaveLength(2);
  });
});

describe("lerOfx — OFX 2.x (XML) também", () => {
  it("lê o mesmo conteúdo com as tags fechadas", () => {
    const xml = `<?xml version="1.0"?><OFX><BANKMSGSRSV1><STMTTRN>
      <DTPOSTED>20260821</DTPOSTED><TRNAMT>-100.00</TRNAMT>
      <FITID>abc123</FITID><MEMO>Teste XML</MEMO>
    </STMTTRN></BANKMSGSRSV1></OFX>`;
    const r = lerOfx(xml);
    expect(r.lancamentos).toEqual([
      { fitid: "abc123", data: "2026-08-21", valor: 100, tipo: "saida", descricao: "Teste XML" },
    ]);
  });
});

describe("dataDePosted e valorDeTrnamt", () => {
  it("data inválida vira nula em vez de virar hoje", () => {
    expect(dataDePosted("20261321")).toBeNull();
    expect(dataDePosted("lixo")).toBeNull();
    expect(dataDePosted("20260821")).toBe("2026-08-21");
  });

  it("aceita vírgula decimal — há emissor brasileiro que manda assim", () => {
    expect(valorDeTrnamt("-1234,56")).toBe(-1234.56);
    expect(valorDeTrnamt("1234.56")).toBe(1234.56);
    expect(valorDeTrnamt("R$ 10")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// O motor
// ---------------------------------------------------------------------------

const linha = (p: Partial<LinhaDoBanco>): LinhaDoBanco => ({
  fitid: "f1",
  data: "2026-08-21",
  valor: 1000,
  tipo: "saida",
  descricao: "banco",
  ...p,
});

const mov = (p: Partial<MovimentacaoDoCaixa>): MovimentacaoDoCaixa => ({
  id: "m1",
  data_movimentacao: "2026-08-21",
  valor: 1000,
  tipo: "saida",
  descricao: "sistema",
  ...p,
});

describe("conciliar — o que casa", () => {
  it("par inequívoco casa sozinho", () => {
    const r = conciliar([linha({})], [mov({})]);
    expect(r.casados).toEqual([{ fitid: "f1", movimentacaoId: "m1", distanciaEmDias: 0 }]);
    expect(r.soNoBanco).toEqual([]);
    expect(r.soNoSistema).toEqual([]);
  });

  it("a folga de data é do calendário, não do valor", () => {
    // Pagamento na sexta compensa na segunda: a data do sistema é a do ATO, a
    // do banco é a da COMPENSAÇÃO.
    const r = conciliar(
      [linha({ data: "2026-08-24" })],
      [mov({ data_movimentacao: "2026-08-21" })],
    );
    expect(r.casados[0].distanciaEmDias).toBe(3);
  });

  it("fora da janela não casa — e sobra dos dois lados", () => {
    const r = conciliar(
      [linha({ data: "2026-08-28" })],
      [mov({ data_movimentacao: "2026-08-21" })],
    );
    expect(r.casados).toEqual([]);
    expect(r.soNoBanco).toHaveLength(1);
    expect(r.soNoSistema).toHaveLength(1);
  });

  it("valor QUASE igual nunca casa", () => {
    // R$ 1.234,56 e R$ 1.234,65 são coisas diferentes. Um motor que os junta
    // transforma erro de digitação em conta fechada.
    const r = conciliar([linha({ valor: 1234.56 })], [mov({ valor: 1234.65 })]);
    expect(r.casados).toEqual([]);
    expect(r.soNoBanco).toHaveLength(1);
  });

  it("lado trocado nunca casa", () => {
    const r = conciliar([linha({ tipo: "saida" })], [mov({ tipo: "entrada" })]);
    expect(r.casados).toEqual([]);
  });

  it("valor em string, como vem do PostgREST", () => {
    const r = conciliar([linha({ valor: 1000 })], [mov({ valor: "1000.00" })]);
    expect(r.casados).toHaveLength(1);
  });
});

describe("conciliar — o que NÃO casa sozinho", () => {
  it("dois pagamentos do mesmo valor viram sugestão, não escolha", () => {
    // É aqui que um motor de conciliação erra caro e em silêncio: escolher
    // sozinho entre duas contas do mesmo valor no mesmo dia.
    const r = conciliar(
      [linha({ fitid: "f1", valor: 500 })],
      [
        mov({ id: "m1", valor: 500 }),
        mov({ id: "m2", valor: 500, data_movimentacao: "2026-08-22" }),
      ],
    );
    expect(r.casados).toEqual([]);
    expect(r.sugestoes).toHaveLength(1);
    // Do mais provável para o menos: distância de data ordena.
    expect(r.sugestoes[0].candidatos.map((c) => c.movimentacaoId)).toEqual(["m1", "m2"]);
  });

  it("duas linhas do banco disputando a mesma movimentação não casam", () => {
    const r = conciliar(
      [linha({ fitid: "f1", valor: 500 }), linha({ fitid: "f2", valor: 500 })],
      [mov({ id: "m1", valor: 500 })],
    );
    expect(r.casados).toEqual([]);
    expect(r.sugestoes).toHaveLength(2);
  });

  it("uma movimentação casa com no máximo uma linha", () => {
    const r = conciliar(
      [linha({ fitid: "f1", valor: 100 }), linha({ fitid: "f2", valor: 200 })],
      [mov({ id: "m1", valor: 100 }), mov({ id: "m2", valor: 200 })],
    );
    expect(r.casados).toHaveLength(2);
    const usadas = r.casados.map((c) => c.movimentacaoId);
    expect(new Set(usadas).size).toBe(2);
  });
});

describe("conciliar — o que sobra é o resultado", () => {
  it("tarifa do banco aparece como 'só no banco'", () => {
    // O achado mais comum e mais valioso: dinheiro que saiu da conta e não
    // existe no caixa do sistema.
    const r = conciliar(
      [linha({ fitid: "tarifa", valor: 29.9, descricao: "TARIFA PACOTE" })],
      [],
    );
    expect(r.soNoBanco.map((l) => l.fitid)).toEqual(["tarifa"]);
    expect(resumirConciliacao(r).valorSoNoBanco).toBe(29.9);
  });

  it("pagamento registrado e não compensado aparece como 'só no sistema'", () => {
    const r = conciliar([], [mov({ id: "m9", valor: 4000 })]);
    expect(r.soNoSistema.map((m) => m.id)).toEqual(["m9"]);
    expect(resumirConciliacao(r).valorSoNoSistema).toBe(4000);
  });

  it("candidato preso numa sugestão não conta como 'só no sistema'", () => {
    // Senão a mesma movimentação apareceria em duas colunas, e a soma de
    // pendências contaria o dinheiro duas vezes.
    const r = conciliar(
      [linha({ fitid: "f1", valor: 500 }), linha({ fitid: "f2", valor: 500 })],
      [mov({ id: "m1", valor: 500 })],
    );
    expect(r.soNoSistema).toEqual([]);
  });

  it("o resumo fecha: tudo que entrou aparece em exatamente uma coluna", () => {
    const linhas = [
      linha({ fitid: "casa", valor: 100 }),
      linha({ fitid: "sobra", valor: 777 }),
      linha({ fitid: "dup1", valor: 500 }),
      linha({ fitid: "dup2", valor: 500 }),
    ];
    const movs = [mov({ id: "mcasa", valor: 100 }), mov({ id: "mdup", valor: 500 })];
    const r = conciliar(linhas, movs);
    const resumo = resumirConciliacao(r);
    expect(resumo.linhasDoBanco).toBe(linhas.length);
    expect(resumo.conciliadas + resumo.aConfirmar + resumo.soNoBanco).toBe(linhas.length);
  });
});

describe("conciliar — determinismo e resiliência", () => {
  it("a mesma entrada dá a mesma saída, sempre", () => {
    // A conciliação é reexecutada a cada importação. Um motor que muda de
    // ideia entre duas execuções destrói a confiança de quem fecha o mês.
    const linhas = [linha({ fitid: "a", valor: 10 }), linha({ fitid: "b", valor: 10 })];
    const movs = [mov({ id: "x", valor: 10 }), mov({ id: "y", valor: 10 })];
    const primeira = JSON.stringify(conciliar(linhas, movs));
    const segunda = JSON.stringify(conciliar([...linhas].reverse(), [...movs].reverse()));
    expect(JSON.parse(primeira).sugestoes.length).toBe(JSON.parse(segunda).sugestoes.length);
    // Os candidatos de cada linha saem na mesma ordem, independente da ordem
    // de entrada: o desempate pelo id garante isso.
    expect(conciliar(linhas, movs).sugestoes[0].candidatos.map((c) => c.movimentacaoId)).toEqual([
      "x",
      "y",
    ]);
  });

  it("tolerância zero significa só o mesmo dia", () => {
    const r = conciliar(
      [linha({ data: "2026-08-22" })],
      [mov({ data_movimentacao: "2026-08-21" })],
      { toleranciaEmDias: 0 },
    );
    expect(r.casados).toEqual([]);
  });

  it("valor corrompido não casa nem derruba a conciliação inteira", () => {
    const r = conciliar([linha({ valor: 100 })], [mov({ valor: "não-numérico" })]);
    expect(r.casados).toEqual([]);
    expect(r.soNoBanco).toHaveLength(1);
  });

  it("listas vazias devolvem resultado vazio, não erro", () => {
    const r = conciliar([], []);
    expect(resumirConciliacao(r).linhasDoBanco).toBe(0);
  });
});

describe("distanciaEmDias", () => {
  it("atravessa mês e ano sem se perder", () => {
    expect(distanciaEmDias("2026-08-31", "2026-09-01")).toBe(1);
    expect(distanciaEmDias("2026-12-31", "2027-01-01")).toBe(1);
    expect(distanciaEmDias("2026-08-21", "2026-08-21")).toBe(0);
  });

  it("data ilegível fica infinitamente longe — nunca casa por acidente", () => {
    expect(distanciaEmDias("lixo", "2026-08-21")).toBe(Number.POSITIVE_INFINITY);
  });
});
