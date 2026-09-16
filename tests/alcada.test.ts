import { describe, it, expect } from "vitest";
import {
  podeAjustarValoresDoNegocio,
  podeExcluirLancamento,
} from "../src/lib/alcada";
import { ALCADA_DO_PERFIL, MATRIZ_DE_PERMISSOES } from "../src/lib/permissoes";

/**
 * As alçadas finas que sobreviveram à aposentadoria do módulo de caixa
 * (2026-08-28, decisão do dono — o financeiro renasce sobre o razão do
 * handoff, spec 30).
 *
 * A suíte anterior (`alcada-aprovacao.test.ts`) travava a régua completa de
 * aprovação de agendamento; ela saiu junto com as telas e funções que
 * exercitava — está no git para quando o razão trouxer aprovação de volta.
 * O que continua travado aqui é o que continua tendo consumidor:
 *
 *  1. nenhum limiar em reais volta à matriz por descuido — a lição de
 *     2026-08-21 ("essa regra de 1.500 reais não faz sentido") sobrevive à
 *     aposentadoria do módulo que a motivou;
 *  2. apagar movimentação de investidor é só do Admin — os demais cancelam
 *     (é a régua que `/admin/investidores` e a rota de DELETE consultam);
 *  3. quem ajusta os valores do negócio (custo de aquisição + preço acima de
 *     5%) sai da MATRIZ, não de lista embutida.
 */

describe("a régua não é um valor em reais", () => {
  it("nenhuma alçada de perfil cita um número", () => {
    for (const [perfil, texto] of Object.entries(ALCADA_DO_PERFIL)) {
      if (perfil === "comercial") continue; // "5% no preço" é percentual, não reais
      expect(texto, `alçada de ${perfil} voltou a ser um valor`).not.toMatch(/R\$\s*\d/);
    }
  });

  it("nenhuma observação da matriz promete um limite em reais", () => {
    for (const l of MATRIZ_DE_PERMISSOES) {
      expect(l.observacao, `linha "${l.acao}" ainda cita um valor`).not.toMatch(/R\$\s*\d/);
    }
  });
});

describe("podeExcluirLancamento — quem aprova não apaga a prova", () => {
  it("só o Admin apaga", () => {
    expect(podeExcluirLancamento(["admin"])).toBe(true);
  });

  it("gestor e financeiro cancelam, não apagam", () => {
    expect(podeExcluirLancamento(["gestor"])).toBe(false);
    expect(podeExcluirLancamento(["financeiro"])).toBe(false);
    expect(podeExcluirLancamento(["gestor", "financeiro"])).toBe(false);
  });

  it("lista vazia nega — não é da equipe", () => {
    expect(podeExcluirLancamento([])).toBe(false);
  });
});

describe("podeAjustarValoresDoNegocio — entrada e saída numa pergunta só", () => {
  it("admin, gestor e financeiro ajustam (custo + preço acima de 5%)", () => {
    expect(podeAjustarValoresDoNegocio(["admin"])).toBe(true);
    expect(podeAjustarValoresDoNegocio(["gestor"])).toBe(true);
    expect(podeAjustarValoresDoNegocio(["financeiro"])).toBe(true);
  });

  it("comercial não vê custo; marketing não vê nada disso", () => {
    expect(podeAjustarValoresDoNegocio(["comercial"])).toBe(false);
    expect(podeAjustarValoresDoNegocio(["marketing"])).toBe(false);
  });
});
