import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Decisão 17 do plano do PR 3 (`constraints.md`): o grafo do repasse é
 * `Car`+`Offer`, `BreadcrumbList`, `AutoDealer`, `WebSite` na ficha, e
 * `BreadcrumbList`, `ItemList`, `FAQPage`, `AutoDealer`, `WebSite` na página —
 * **sem `view_item`/`ViewContent` com id de repasse**. O id do repasse não
 * existe no catálogo da Meta nem no feed do Google Merchant, então uma
 * conversão de visualização de item casaria o remarketing com nada: o pixel
 * dispararia `content_ids: ["<uuid do repasse>"]`, o catálogo não teria essa
 * entrada, e o anúncio dinâmico gerado a partir dela ficaria vazio.
 *
 * A ficha (`src/app/repasse/[carro]/page.tsx`) e os componentes que ela monta
 * (`src/components/repasse/`) são exatamente a superfície que teria essa
 * tentação — é o ponto óbvio para alguém copiar o `trackVehicleView` da PDP do
 * estoque. Esta trava varre os dois diretórios inteiros, não uma lista de
 * arquivos: uma trava por lista protege a lista, não o invariante, e o
 * próximo componente do repasse nasceria sem cobertura.
 */

const RAIZ_DO_REPASSE = [
  join(__dirname, "..", "src", "app", "repasse"),
  join(__dirname, "..", "src", "components", "repasse"),
];

// `trackVehicleView` (`src/lib/telemetry.ts`) é quem de fato dispara
// `view_item` (GA4) e `ViewContent` (Meta) na PDP do estoque, chamado de
// `PDPClientWrapper.tsx:210`. Os quatro primeiros termos continuam pegando
// quem escrever o disparo à mão (`fbq(…"ViewContent"…)`, `gtag(…"view_item"…)`
// ou `content_ids` literal); os dois últimos pegam quem importar a função ou
// o componente que já fazem isso pela PDP do estoque.
const PROIBIDOS = ["ViewContent", "view_item", "content_ids", "trackVehicleView", "PDPClientWrapper"];

/** Todo `.ts`/`.tsx` sob os diretórios do repasse, recursivamente. */
function arquivosDoRepasse(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosDoRepasse(caminho, achados);
    else if (/\.tsx?$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

/**
 * As portas do PR 4. A home e o `/estoque` não desenham repasse por conta
 * própria: entregam o dado às faixas de `src/components/repasse/`, que a
 * varredura acima já cobre. Mas é no ponto de chamada que alguém copiaria o
 * `trackVehicleView` "para medir a faixa" (handoff do PR 4, §8), então os
 * dois arquivos entram um a um. Se a home um dia medir `view_item_list` do
 * ESTOQUE, o termo `view_item` daqui vai acusar: reveja esta lista junto, não
 * a apague.
 */
const PONTOS_DE_CHAMADA = [
  join(__dirname, "..", "src", "app", "page.tsx"),
  join(__dirname, "..", "src", "app", "estoque", "page.tsx"),
];

const arquivos = [...RAIZ_DO_REPASSE.flatMap((raiz) => arquivosDoRepasse(raiz)), ...PONTOS_DE_CHAMADA];

describe("o repasse não mede view_item/ViewContent", () => {
  it("a varredura achou os arquivos de verdade — não um diretório vazio", () => {
    // Sem isto, um diretório apagado ou um caminho errado faria `arquivos`
    // ficar vazio e todo `it.each` abaixo passar sem examinar nada.
    expect(arquivos.length).toBeGreaterThanOrEqual(5);
    // O card e as faixas das portas moram no diretório varrido (decisão 4).
    for (const nome of ["CardDaFaixa.tsx", "FaixaDoRepasseNoEstoque.tsx", "FaixaDoRepasseNaHome.tsx"]) {
      expect(arquivos.some((a) => a.endsWith(nome)), nome).toBe(true);
    }
  });

  it.each(arquivos.map((caminho) => [caminho] as const))("%s não tem view_item nem ViewContent", (caminho) => {
    const fonte = readFileSync(caminho, "utf8");
    for (const proibido of PROIBIDOS) {
      expect(fonte, `${caminho} contém "${proibido}"`).not.toContain(proibido);
    }
  });
});
