import { describe, it, expect } from "vitest";
import { repasseDaLinha, COLUNAS_PUBLICAS_DO_REPASSE } from "../src/lib/leituraDosRepasses";
import { repasseDeTeste } from "./repasseDeTeste";

/** A linha como o PostgREST entrega: numeric pode vir em texto, jsonb como array. */
function linhaDoBanco(parcial: Record<string, unknown> = {}): Record<string, unknown> {
  // `arquivado_em` não é coluna pública: a linha anônima nunca a traz.
  const publico: Record<string, unknown> = { ...repasseDeTeste() };
  delete publico.arquivado_em;
  return { ...publico, preco: "36900.00", fipe_valor: "42100.00", ...parcial };
}

describe("repasseDaLinha", () => {
  it("converte a linha pública no Repasse do código", () => {
    const r = repasseDaLinha(linhaDoBanco());
    expect(r).not.toBeNull();
    expect(r!.preco).toBe(36900);
    expect(r!.fipe_valor).toBe(42100);
    expect(r!.itens_de_estado).toHaveLength(3);
    expect(r!.arquivado_em).toBeNull();
  });

  it("valor fora da lista fechada vira null, nunca passa adiante", () => {
    const r = repasseDaLinha(linhaDoBanco({ laudo: "reprovado", carroceria: "conversivel" }));
    expect(r!.laudo).toBeNull();
    expect(r!.carroceria).toBeNull();
  });

  it("item da ficha sem descrição é descartado; orçamento em texto vira número", () => {
    const r = repasseDaLinha(
      linhaDoBanco({
        itens_de_estado: [
          { descricao: "", local: "x" },
          { descricao: "Embreagem", local: "Câmbio", foto: "f", orcamento: "1400", estetico: false },
        ],
      }),
    );
    expect(r!.itens_de_estado).toEqual([
      { descricao: "Embreagem", local: "Câmbio", foto: "f", orcamento: 1400, estetico: false },
    ]);
  });

  it("linha sem o essencial não vira carro", () => {
    expect(repasseDaLinha(linhaDoBanco({ slug: null }))).toBeNull();
    expect(repasseDaLinha(linhaDoBanco({ preco: null }))).toBeNull();
    expect(repasseDaLinha(linhaDoBanco({ situacao: "sumiu" }))).toBeNull();
  });
});

describe("COLUNAS_PUBLICAS_DO_REPASSE", () => {
  it("nunca inclui quem cadastrou, quem validou ou a org", () => {
    for (const interna of ["criado_por", "validado_por", "enviado_em", "validado_em", "devolvido_com", "org_id", "updated_at"]) {
      expect(COLUNAS_PUBLICAS_DO_REPASSE as readonly string[]).not.toContain(interna);
    }
  });
});
