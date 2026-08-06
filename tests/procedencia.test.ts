import { describe, it, expect } from "vitest";
import { PROCEDENCIA_PADRAO, normalizarProcedencia } from "../src/lib/procedencia";

/**
 * A faixa de procedência é o argumento de confiança da PDP e agora vem do
 * banco. Um blob meio gravado não pode virar bloco em branco, faixa fora de
 * ordem ou — pior — a volta do texto antigo, que prometia histórico de revisões
 * para todo carro e transferência sem custo.
 */

describe("normalizarProcedencia", () => {
  it("sem nada salvo, devolve o padrão inteiro", () => {
    for (const bruto of [null, undefined, {}, [], "", 0]) {
      expect(normalizarProcedencia(bruto)).toEqual(PROCEDENCIA_PADRAO);
    }
  });

  it("o padrão não promete o que a loja não garante sempre", () => {
    const manutencao = PROCEDENCIA_PADRAO.find((i) => i.id === "manutencao")!;
    const transferencia = PROCEDENCIA_PADRAO.find((i) => i.id === "transferencia")!;

    expect(manutencao.descricao).toMatch(/quando/i);
    expect(manutencao.descricao).not.toMatch(/revisões rastreadas/i);
    expect(transferencia.descricao).not.toMatch(/sem custo/i);
  });

  it("usa o texto salvo quando ele existe", () => {
    const saida = normalizarProcedencia([
      { id: "garantia", titulo: "Garantia de 6 meses", descricao: "Motor e câmbio, na nota." },
    ]);
    const garantia = saida.find((i) => i.id === "garantia")!;
    expect(garantia.titulo).toBe("Garantia de 6 meses");
    expect(garantia.descricao).toBe("Motor e câmbio, na nota.");
  });

  it("campo em branco ou ilegível cai no padrão, não some da tela", () => {
    const saida = normalizarProcedencia([
      { id: "laudo", titulo: "   ", descricao: null },
      { id: "garantia", titulo: 42, descricao: "Texto bom." },
    ]);
    const laudo = saida.find((i) => i.id === "laudo")!;
    const garantia = saida.find((i) => i.id === "garantia")!;

    expect(laudo).toEqual(PROCEDENCIA_PADRAO[0]);
    expect(garantia.titulo).toBe(PROCEDENCIA_PADRAO[2].titulo);
    expect(garantia.descricao).toBe("Texto bom.");
  });

  it("mantém a ordem e a lista completa, ignorando id desconhecido", () => {
    const saida = normalizarProcedencia([
      { id: "transferencia", titulo: "T", descricao: "D" },
      { id: "inventado", titulo: "X", descricao: "Y" },
    ]);
    expect(saida).toHaveLength(PROCEDENCIA_PADRAO.length);
    expect(saida.map((i) => i.id)).toEqual(PROCEDENCIA_PADRAO.map((i) => i.id));
  });

  it("só `false` explícito desliga um bloco", () => {
    const saida = normalizarProcedencia([
      { id: "transferencia", ativo: false },
      { id: "laudo", ativo: "sim" },
      { id: "garantia" },
    ]);
    expect(saida.find((i) => i.id === "transferencia")!.ativo).toBe(false);
    expect(saida.find((i) => i.id === "laudo")!.ativo).toBe(true);
    expect(saida.find((i) => i.id === "garantia")!.ativo).toBe(true);
  });

  it("aceita o formato de envelope `{ itens: [...] }`", () => {
    const saida = normalizarProcedencia({
      itens: [{ id: "laudo", titulo: "Laudo próprio", descricao: "Feito na casa." }],
    });
    expect(saida.find((i) => i.id === "laudo")!.titulo).toBe("Laudo próprio");
  });

  it("não deixa o texto salvo entrar com espaço sobrando", () => {
    const saida = normalizarProcedencia([
      { id: "laudo", titulo: "  Laudo  ", descricao: "  Descrição.  " },
    ]);
    const laudo = saida.find((i) => i.id === "laudo")!;
    expect(laudo.titulo).toBe("Laudo");
    expect(laudo.descricao).toBe("Descrição.");
  });
});
