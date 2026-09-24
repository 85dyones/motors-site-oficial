import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PAGINAS_COMPARTILHAVEIS } from "../src/lib/compartilhamento";

/**
 * A /avaliacao não afirma um cálculo que o site não faz.
 *
 * Até 24/09/2026 a página, a meta e o cartão de compartilhamento diziam "Dados
 * oficiais da Tabela FIPE cruzados com o giro real do nosso estoque". Nenhum
 * código cruza FIPE com giro de estoque: a página mostra a FIPE, e a faixa de
 * compra (que o cliente nem vê) é a curva de `parametros_avaliacao`, que
 * também não lê giro. A frase trocou por "Referência oficial da Tabela FIPE,
 * na versão exata do seu carro" — o que a tela faz.
 *
 * Se um dia a avaliação passar a usar o giro do estoque de verdade, a frase
 * pode voltar junto com o código que a sustenta, e este teste muda com ela.
 */

const RAIZ = join(__dirname, "..");
const ler = (arquivo: string) => readFileSync(join(RAIZ, arquivo), "utf-8");

/** O código sem comentários — é o texto que chega ao cliente que importa. */
function semComentarios(codigo: string): string {
  return codigo
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const CALCULO_INVENTADO = /cruzad[oa]s?\s+com\s+o\s+giro|giro\s+real\s+do\s+nosso\s+estoque/i;

describe("a /avaliacao descreve só o que faz", () => {
  it.each(["src/components/AutoAvaliacao.tsx", "src/app/avaliacao/page.tsx"])(
    "%s não diz que cruza a FIPE com o giro do estoque",
    (arquivo) => {
      expect(semComentarios(ler(arquivo))).not.toMatch(CALCULO_INVENTADO);
    },
  );

  it("nem o cartão de compartilhamento da página", () => {
    const avaliacao = PAGINAS_COMPARTILHAVEIS.find((p) => p.id === "avaliacao");
    expect(avaliacao, "a página de avaliação saiu da lista de compartilháveis").toBeDefined();
    expect(avaliacao!.descricaoPadrao).not.toMatch(CALCULO_INVENTADO);
    expect(avaliacao!.descricaoPadrao).toMatch(/Tabela FIPE/);
  });

  it("a meta e o cartão dizem a mesma coisa", () => {
    const pagina = ler("src/app/avaliacao/page.tsx");
    const meta = pagina.match(/const DESCRICAO =\s*"([^"]+)"/)?.[1];
    expect(meta).toBe(PAGINAS_COMPARTILHAVEIS.find((p) => p.id === "avaliacao")!.descricaoPadrao);
  });
});
