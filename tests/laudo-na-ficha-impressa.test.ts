import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";
import { TEXTO_LAUDO_PENDENTE } from "../src/lib/textoDoLaudo";
import { LAUDO_APROVADO_PADRAO } from "../src/lib/descritivo/laudoPadrao";

/**
 * A folha impressa é entregue na mão do cliente, no balcão.
 *
 * Diferente da tela, ela não some quando o cadastro muda: o papel que sai
 * hoje continua afirmando amanhã. Em 21/09/2026, 33 dos 79 veículos não
 * vendidos liam "EM ANÁLISE" — se a faixa afirmasse aprovação sem régua,
 * seriam 33 folhas afirmando perícia aprovada sobre carros cuja perícia não
 * aprovou.
 *
 * A decisão do dono em 21/09 foi: a faixa sai em toda folha (sem buraco no
 * leiaute), mas só afirma onde o dado sustenta. Estas travas guardam as duas
 * metades — que a faixa não tem guarda de exibição, e que a AFIRMAÇÃO tem.
 */

const FOLHA = "src/components/modernist/FichaImpressa.tsx";

describe("a faixa do laudo na folha impressa", () => {
  const fonte = lerCodigo(FOLHA);

  it("a afirmação de aprovação depende de `cautelar_100`", () => {
    // As três coisas que a folha só pode dizer com a perícia aprovada.
    for (const afirmacao of ["100% APROVADO", "HISTÓRICO LIVRE DE SINISTRO E LEILÃO"]) {
      const i = fonte.indexOf(afirmacao);
      expect(i, `a folha não diz mais "${afirmacao}"`).toBeGreaterThan(-1);

      // A afirmação tem que estar do lado verdadeiro de um ternário de
      // `cautelar_100` — nunca solta na árvore.
      const antes = fonte.slice(Math.max(0, i - 220), i);
      expect(
        /cautelar_100\s*\n?\s*\?/.test(antes) || /cautelar_100 \?/.test(antes),
        `"${afirmacao}" não está atrás da régua de cautelar_100`,
      ).toBe(true);
    }
  });

  it("o carro em análise recebe o texto pendente, não o silêncio", () => {
    expect(fonte).toMatch(/EM ANÁLISE/);
    expect(fonte).toMatch(/TEXTO_LAUDO_PENDENTE/);
  });

  it("as duas frases vêm das constantes, não de cópia", () => {
    // Uma verdade só: a redação aprovada foi fixada em 09/09 e o módulo
    // proíbe parafraseá-la. Se alguém colar o texto aqui, a cópia envelhece
    // sozinha quando a constante mudar.
    expect(fonte).toMatch(/LAUDO_APROVADO_PADRAO/);
    expect(fonte).not.toContain(LAUDO_APROVADO_PADRAO);
    expect(fonte).not.toContain(TEXTO_LAUDO_PENDENTE);
  });

  it("a faixa em si não tem guarda de exibição — ela sai em toda folha", () => {
    // O `{veiculo.cautelar_100 && (` de antes escondia a faixa inteira e
    // deixava um vão no leiaute. Voltar a ele é o que esta trava impede.
    expect(fonte).not.toMatch(/\{veiculo\.cautelar_100 && \(/);
  });
});
