import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";

/**
 * O `llms-full.txt` lista o mesmo pátio que a vitrine.
 *
 * Medido em produção em 2026-09-17: o `llms-full.txt` e o `/api/ney` listavam
 * os mesmos 45 carros, com a mesma regra de "à venda", mas escrita duas vezes.
 * O `/api/ney` lê `recortesDoEstoque().disponiveis`, que é
 * `disponiveisDe(getEstoque())`. O `llms-full.txt` repetia `getEstoque()` com um
 * `!v.vendido` próprio. Uma mudança no que conta como "à venda" feita num lugar
 * não chegaria ao outro, e é o `llms-full.txt` que publica preço e link de
 * compra.
 *
 * `disponiveisDe` já era exportado de `lib/hubsDeEstoque.ts`, e ninguém o
 * importava. A rota passa a aplicá-lo sobre `getEstoque()` sem opção: a mesma
 * composição da metade `disponiveis` de `recortesDoEstoque`, sem a leitura do
 * histórico, que o arquivo não usa. Desde então o helper mora em
 * `lib/regrasEstoque.ts`, com a regra de "à venda" do site inteiro (ver
 * `a-venda-num-lugar-so.test.ts`).
 *
 * O teste lê a FONTE porque a rota depende do Supabase e do cache do Next e não
 * roda aqui. É o mesmo desenho da trava do `/api/ney` em
 * `fichas-para-o-assistente.test.ts` ("a rota lê o mesmo pátio que a vitrine").
 */

const fonte = lerCodigo("src/app/api/llms-full.txt/route.ts");

describe("o `llms-full.txt` lê o mesmo pátio que a vitrine", () => {
  it("o que está à venda sai de `disponiveisDe`, sobre `getEstoque()` sem opção", () => {
    expect(fonte).toMatch(/return montarInventario\(\s*disponiveisDe\(await getEstoque\(\)\)/);
  });

  it("`disponiveisDe` é o de `lib/regrasEstoque`, importado pelo nome", () => {
    // Uma trava que procura só a chamada passa com
    // `import { outraRegra as disponiveisDe }`: é o defeito de apelido que
    // `schema-do-veiculo.test.ts` registra no teste do endereço do rodapé. O
    // import exato fecha essa porta.
    expect(fonte).toMatch(/import \{ disponiveisDe \} from "\.\.\/\.\.\/\.\.\/lib\/regrasEstoque";/);
  });

  it("e a rota não decide sozinha o que está à venda", () => {
    // O filtro próprio era `!v.vendido`. Nenhuma leitura de `vendido` pode
    // voltar a esta rota: a regra mora em `disponiveisDe`.
    expect(fonte).not.toMatch(/\.vendido/);
  });
});
