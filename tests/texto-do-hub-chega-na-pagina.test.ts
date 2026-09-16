import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";
import { normalizarTextoDoHub, resolverTextoDoHub } from "../src/lib/textoEditadoDoHub";

/**
 * O texto salvo no painel precisa CHEGAR na página.
 *
 * ---------------------------------------------------------------------------
 * O defeito que este arquivo existe para não deixar voltar
 * ---------------------------------------------------------------------------
 * Relatado pelo dono em 2026-09-01: *"as páginas de texto não têm seu conteúdo
 * salvo após alteração"*.
 *
 * O texto ESTAVA salvo — havia uma linha em `textos_de_hub` para
 * `/estoque/picape`, com título e quatro parágrafos. O que faltava era quem a
 * lesse: a entrega de 31/08 ligou o override em **uma** das três rotas de hub.
 *
 *   /carros/{marca}/{modelo}   65 páginas   lia          ✓
 *   /carros/{marca}            20 páginas   NÃO lia      ✗
 *   /estoque/{recorte}         18 páginas   NÃO lia      ✗
 *
 * O painel oferecia as 103 para editar e 38 ignoravam em silêncio. Não havia
 * erro, log nem tela diferente — o operador salvava, ia conferir e encontrava o
 * texto automático, exatamente como quem não salvou nada.
 *
 * Uma trava por comportamento não pegaria isto sem subir o Next inteiro com
 * banco; a trava barata é exigir que TODA rota de hub importe a resolução. É
 * uma asserção sobre o código, e é honesta sobre isso: ela garante que a rota
 * consulta o override, não que o pinte bonito.
 */

/** As três rotas que servem hub — a mesma lista que o painel oferece editar. */
const ROTAS_DE_HUB = [
  ["hub de modelo", "src/app/[categoria]/[marca]/[modelo]/page.tsx"],
  ["hub de marca", "src/app/[categoria]/[marca]/page.tsx"],
  ["recortes de /estoque", "src/app/estoque/[recorte]/page.tsx"],
] as const;

describe("toda rota de hub lê o texto que o painel grava", () => {
  it.each(ROTAS_DE_HUB)("%s consulta o override", (_nome, caminho) => {
    const fonte = lerCodigo(caminho);
    // A CHAMADA, não o nome. `toContain("buscarTextoDoHub")` casava com a linha
    // do `import` e sobrevivia à troca da chamada por `null` — mutação
    // encontrou. Import não busca nada.
    expect(fonte, "não CHAMA a busca do texto editado")
      .toMatch(/buscarTextoDoHub\(\s*caminho\s*\)/);
    expect(fonte, "não CHAMA a resolução editado × gerado")
      .toMatch(/resolverTextoDoHub\(/);
  });

  it.each(ROTAS_DE_HUB)("%s usa o resultado no título E no corpo", (_nome, caminho) => {
    const fonte = lerCodigo(caminho);
    // Passar pela resolução e depois renderizar o gerado seria o mesmo bug com
    // uma chamada a mais. O que vai para a tela tem de ser o que saiu de lá.
    expect(fonte, "o corpo não vem da resolução").toMatch(/introducao=\{introducao\}/);
    expect(fonte, "o título não vem da resolução").toMatch(/titulo=\{(titulo|tituloDaPagina)\}/);
  });

  it("a gravação descarta o cache da página editada", () => {
    // As três rotas são ISR de uma hora. Sem `revalidatePath`, "salvei e não
    // mudou nada" dura até sessenta minutos — e foi metade do defeito relatado.
    const rota = lerCodigo("src/app/api/hubs/textos/route.ts");
    expect(rota, "a rota não importa revalidatePath").toContain("revalidatePath");
    // Nas DUAS saídas: salvar e voltar ao automático. Só numa, "desfazer"
    // ficaria preso no cache — e o operador veria o texto que acabou de apagar.
    expect((rota.match(/revalidatePath\(caminho\)/g) ?? []).length).toBe(2);
  });

  it("as rotas continuam com ISR — o texto não congela o giro do estoque", () => {
    // O `revalidate` existe para a contagem, a faixa de preço e as versões
    // acompanharem a vitrine. Trocá-lo por `force-dynamic` para "resolver" o
    // cache faria toda visita bater no banco.
    for (const [nome, caminho] of ROTAS_DE_HUB) {
      expect(lerCodigo(caminho), nome).toMatch(/export const revalidate = \d+/);
    }
  });
});

describe("a régua de override × gerado", () => {
  const gerado = { titulo: "Gerado", paragrafos: ["Um.", "Dois."] };

  it("sem linha, vale o gerado", () => {
    expect(resolverTextoDoHub(null, gerado)).toEqual({ ...gerado, editado: false });
  });

  it("linha esvaziada conta como ausente", () => {
    // Um registro criado e depois limpo não pode apagar o texto da página: tem
    // de devolver o padrão, não uma página muda.
    expect(normalizarTextoDoHub({ titulo: "  ", paragrafos: ["", "  "] })).toBeNull();
    expect(resolverTextoDoHub(normalizarTextoDoHub({ titulo: "", paragrafos: [] }), gerado).titulo)
      .toBe("Gerado");
  });

  it("título próprio sem corpo mantém os parágrafos gerados", () => {
    const r = resolverTextoDoHub(normalizarTextoDoHub({ titulo: "Meu", paragrafos: [] }), gerado);
    expect(r.titulo).toBe("Meu");
    expect(r.paragrafos).toEqual(gerado.paragrafos);
  });

  it("corpo próprio substitui INTEIRO, sem mesclar", () => {
    // Mesclar deixaria a página com metade da voz da loja e metade do robô, e
    // o operador não teria como prever o resultado do que digitou.
    const r = resolverTextoDoHub(normalizarTextoDoHub({ titulo: null, paragrafos: ["Só este."] }), gerado);
    expect(r.paragrafos).toEqual(["Só este."]);
    expect(r.titulo).toBe("Gerado");
  });
});
