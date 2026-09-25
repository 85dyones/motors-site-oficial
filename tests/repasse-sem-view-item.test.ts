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
 * tentação — é o ponto óbvio para alguém copiar o `trackViewItem` da PDP do
 * estoque. Esta trava varre os dois diretórios inteiros, não uma lista de
 * arquivos: uma trava por lista protege a lista, não o invariante, e o
 * próximo componente do repasse nasceria sem cobertura.
 */

const RAIZ_DO_REPASSE = [
  join(__dirname, "..", "src", "app", "repasse"),
  join(__dirname, "..", "src", "components", "repasse"),
];

const PROIBIDOS = ["trackViewItem", "ViewContent", "view_item", "content_ids"];

/** Todo `.ts`/`.tsx` sob os diretórios do repasse, recursivamente. */
function arquivosDoRepasse(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosDoRepasse(caminho, achados);
    else if (/\.tsx?$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

const arquivos = RAIZ_DO_REPASSE.flatMap((raiz) => arquivosDoRepasse(raiz));

describe("o repasse não mede view_item/ViewContent", () => {
  it("a varredura achou os arquivos de verdade — não um diretório vazio", () => {
    // Sem isto, um diretório apagado ou um caminho errado faria `arquivos`
    // ficar vazio e todo `it.each` abaixo passar sem examinar nada.
    expect(arquivos.length).toBeGreaterThanOrEqual(5);
  });

  it.each(arquivos.map((caminho) => [caminho] as const))("%s não tem view_item nem ViewContent", (caminho) => {
    const fonte = readFileSync(caminho, "utf8");
    for (const proibido of PROIBIDOS) {
      expect(fonte, `${caminho} contém "${proibido}"`).not.toContain(proibido);
    }
  });
});
