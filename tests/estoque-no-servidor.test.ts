import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";

/**
 * `/estoque` precisa chegar com conteúdo no HTML servido.
 *
 * Medido em produção em 2026-08-25: a página respondia 178 KB com **zero** link
 * de veículo e nenhum `<h1>`. `Catalogo` é client component e usa
 * `useSearchParams()`; dentro de um `<Suspense>`, o Next entrega apenas o
 * fallback na renderização estática. Título, trilha e a grade inteira só
 * existiam depois de o JavaScript rodar.
 *
 * Para uma página que converte isso é indiferente. Para a página de maior
 * prioridade do sitemap depois da home, é o defeito inteiro: nenhuma
 * autoridade chega às fichas pelo HTML, e o rastreador depende de uma segunda
 * passada de renderização para descobrir o que a loja vende.
 *
 * A auditoria de 24/08/2026 não pegou isto — o navegador dela executava JS.
 */

const PAGINA = "src/app/estoque/page.tsx";
const CATALOGO = "src/components/modernist/Catalogo.tsx";

describe("o servidor entrega título, trilha e listagem", () => {
  const fonte = lerCodigo(PAGINA);

  it("a página de estoque é server component", () => {
    // Um "use client" aqui devolveria o problema inteiro de uma vez.
    expect(fonte.trimStart().startsWith('"use client"')).toBe(false);
  });

  it("o `<h1>` vive na página, fora do `<Suspense>`", () => {
    const indiceH1 = fonte.indexOf("<h1");
    const indiceSuspense = fonte.indexOf("<Suspense");

    expect(indiceH1).toBeGreaterThan(-1);
    expect(indiceH1).toBeLessThan(indiceSuspense);
  });

  it("publica `ItemList` com as URLs das fichas", () => {
    // É o que põe as URLs de veículo no HTML bruto de uma página cuja grade é
    // renderizada no cliente.
    expect(fonte).toMatch(/schemaDeListagem\(/);
    expect(fonte).toMatch(/schemaDeTrilha\(/);
  });

  it("liga o catálogo aos hubs perenes com link de verdade", () => {
    // Sem este índice os hubs nasceriam órfãos: existiriam no sitemap e em
    // nenhuma navegação.
    expect(fonte).toMatch(/href=\{`\/carros\/\$\{m\.slug\}`\}/);
    expect(fonte).toMatch(/href=\{`\/estoque\/\$\{c\.slug\}`\}/);
  });
});

describe("o catálogo cliente não guarda mais o que é conteúdo", () => {
  const fonte = lerCodigo(CATALOGO);

  it("continua sendo client component (o filtro é dele)", () => {
    expect(fonte.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("não tem `<h1>` — ele voltaria a sumir do HTML servido", () => {
    expect(fonte).not.toMatch(/<h1/);
  });

  it("a contagem filtrada, que muda a cada caixa marcada, fica aqui", () => {
    // Nunca poderia ser o `<h1>`: título que muda com filtro não é título.
    expect(fonte).toMatch(/totalFiltrado/);
  });
});

describe("os hubs e as páginas de bairro nascem servidos", () => {
  it.each([
    "src/app/[categoria]/[marca]/page.tsx",
    "src/app/[categoria]/[marca]/[modelo]/page.tsx",
    "src/app/estoque/[carroceria]/page.tsx",
    "src/app/seminovos-curitiba/page.tsx",
    "src/app/seminovos-bacacheri/page.tsx",
  ])("%s não é client component", (arquivo) => {
    expect(ler(arquivo).trimStart().startsWith('"use client"')).toBe(false);
  });

  it("a listagem compartilhada renderiza os cards no servidor", () => {
    const fonte = ler("src/components/modernist/PaginaDeEstoque.tsx");
    expect(fonte.trimStart().startsWith('"use client"')).toBe(false);
    expect(fonte).toMatch(/<CardVeiculo/);
  });
});
