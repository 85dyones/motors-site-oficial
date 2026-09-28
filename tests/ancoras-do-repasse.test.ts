import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { semComentarios } from "./fonte";

/**
 * Link de âncora para a página do repasse é `<a href>` puro, nunca `next/link`
 * (final-review do PR 3, I1, 25/09).
 *
 * A lista do repasse escolhe a trilha pelo endereço: `#lista-lojista` abre na
 * trilha do lojista, e a troca depois de montada vem do evento `hashchange`
 * (`ListaDoRepasse.tsx`, `useSyncExternalStore` assinado nele). Numa navegação
 * só de hash, o `Link` do App Router faz `preventDefault` e resolve pelo
 * roteador com `history.pushState`, que NÃO dispara `hashchange`. O bug real:
 * "CADASTRAR MEU CNPJ" no card rolava até a lista, mas ela ficava na trilha
 * "compro para usar", sem o campo de CNPJ, e o lojista entrava como
 * consumidor. Com `<a>` de mesmo caminho, o navegador faz navegação de
 * fragmento e dispara `hashchange`; vindo de outra página, `<a>` carrega o
 * `/repasse` já com o hash, que a lista lê ao montar.
 *
 * "Âncora da página do repasse" = `href` que começa por `#` ou por
 * `${CAMINHO_DO_REPASSE}#` (ou `/repasse#` literal). Link para OUTRA página
 * com hash (`${ficha}#ficha-de-estado`, `/privacidade#dados`) não entra: lá
 * ninguém escuta `hashchange` e o roteador rola até o alvo.
 *
 * A varredura cobre os dois diretórios inteiros, no molde de
 * `repasse-sem-view-item.test.ts`: trava por lista protege a lista, não o
 * invariante.
 */

const RAIZ_DO_REPASSE = [
  join(__dirname, "..", "src", "app", "repasse"),
  join(__dirname, "..", "src", "components", "repasse"),
];

function arquivosDoRepasse(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosDoRepasse(caminho, achados);
    else if (/\.tsx?$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

/**
 * O destino de cada `<Link …href=…>` com destino em texto (aspas ou crase).
 * `<Link` exige espaço depois, para não pegar `<LinkRegua`. `[^>]*?` não passa
 * do fim da tag de abertura.
 */
const HREF_DO_LINK = /<Link\s[^>]*?href=\{?\s*(["'`])([^"'`]*)/g;

function ehAncoraDoRepasse(destino: string): boolean {
  return destino.startsWith("#") || destino.startsWith("${CAMINHO_DO_REPASSE}#") || destino.startsWith("/repasse#");
}

/** Os destinos de `<Link` que são âncora da página do repasse, na fonte sem comentários. */
function linksDeAncora(fonte: string): string[] {
  const codigo = semComentarios(fonte);
  return [...codigo.matchAll(HREF_DO_LINK)].map((m) => m[2]).filter(ehAncoraDoRepasse);
}

const arquivos = RAIZ_DO_REPASSE.flatMap((raiz) => arquivosDoRepasse(raiz));

describe("âncora da página do repasse não passa por next/link", () => {
  it("a varredura achou os arquivos de verdade — não um diretório vazio", () => {
    expect(arquivos.length).toBeGreaterThanOrEqual(5);
  });

  it("o detector pega o bug real e deixa passar o que não é ele (fonte sintética)", () => {
    const comOBug = [
      "<Link href={`${CAMINHO_DO_REPASSE}#${ANCORA_DA_LISTA_LOJISTA}`} className=\"mt-btn\">",
      "<Link\n  href={`#${ANCORA_DA_FICHA_DE_ESTADO}`}\n  className=\"x\">",
      '<Link className="x" href="/repasse#lista">',
    ].join("\n");
    expect(linksDeAncora(comOBug)).toEqual([
      "${CAMINHO_DO_REPASSE}#${ANCORA_DA_LISTA_LOJISTA}",
      "#${ANCORA_DA_FICHA_DE_ESTADO}",
      "/repasse#lista",
    ]);

    const semOBug = [
      "<a href={`${CAMINHO_DO_REPASSE}#${ANCORA_DA_LISTA_LOJISTA}`} className=\"mt-btn\">",
      "<Link href={`${ficha}#${ANCORA_DA_FICHA_DE_ESTADO}`} className=\"x\">",
      '<Link href="/privacidade#dados" className="x">',
      "<Link href={ficha} className=\"x\">",
    ].join("\n");
    expect(linksDeAncora(semOBug)).toEqual([]);
  });

  it.each(arquivos.map((caminho) => [caminho] as const))("%s não tem <Link> para âncora do repasse", (caminho) => {
    expect(linksDeAncora(readFileSync(caminho, "utf8")), `${caminho}: troque por <a href>`).toEqual([]);
  });
});
