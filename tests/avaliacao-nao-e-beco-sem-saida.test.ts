import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings } from "../src/types";

/**
 * `/avaliacao` renderizada — a página que não tinha para onde mandar ninguém.
 *
 * O relatório de linkagem interna de 2026-09-05 classificou esta rota como
 * "órfã funcional", e a leitura do código confirmou pior do que ele descreveu:
 * `grep -c 'href=' src/components/AutoAvaliacao.tsx` devolvia **0** em 1441
 * linhas, e a rota era a única página comercial do site sem nenhum nó de
 * JSON-LD. Quem chegava saía pelo rodapé ou pelo botão voltar; o rastreador,
 * que não tem nenhum dos dois, encerrava o caminho aqui.
 *
 * A correção mora na ROTA, não no componente: `AutoAvaliacao` é o formulário de
 * produção — webhook, Turnstile, tracking — e a conversão de compra de estoque
 * depende dele. Envolver custa nada; editar custaria o funil.
 *
 * É exatamente essa escolha que deixa o buraco de teste. Trilha, grafo e saída
 * são JSX solto num arquivo de rota, o tipo de coisa que some sem quebrar tipo
 * nenhum. Três mutações que `tsc` aprova e que este arquivo pega:
 *
 *  - apagar o `<section>` "Depois da avaliação": a página volta a ser beco sem
 *    saída e nada avisa, porque o funil continua funcionando;
 *  - `href={destino.href}` → `href="#"`: os três cards continuam na tela, com o
 *    mesmo texto, sem levar a lugar nenhum;
 *  - remover `schemaDaLoja(...)` do array: a página perde o único nó que a liga
 *    ao `#dealer`, e o JSON-LD segue sendo JSON-LD válido — só que mudo.
 *
 * O `AutoAvaliacao` é mockado de propósito: ele puxa Turnstile, consulta FIPE e
 * `window`, e nada disso é o assunto aqui. O que está sob teste é a moldura.
 */

const EMPRESA: CompanySettings = {
  name: "Motors Store",
  phone: "41 99737-2165",
  whatsapp: "41 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "Seg a sex 8h30-18h30",
  instagram: "https://instagram.com/motorsstore.oficial",
  facebook: "https://facebook.com/motorsstore.oficial",
  cnpj: "",
};

vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: EMPRESA }),
}));

// O funil inteiro em duas palavras. O que ele faz é assunto de outros arquivos.
vi.mock("../src/components/AutoAvaliacao", () => ({
  default: () => null,
}));

async function paginaDeAvaliacao(): Promise<string> {
  const { default: AvaliacaoPage } = await import("../src/app/avaliacao/page");
  return renderToStaticMarkup(await AvaliacaoPage());
}

/** Os `href` de fato renderizados como âncora, na ordem em que aparecem. */
function hrefsRenderizados(html: string): string[] {
  return [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);
}

/** O conteúdo dos blocos `application/ld+json` da página. */
function grafo(html: string): Record<string, unknown>[] {
  // `[\s\S]` e não a flag `s`: o alvo do tsconfig é anterior a es2018, e
  // `dotAll` ali é erro de compilação, não aviso.
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) =>
    JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&")),
  );
}

describe("/avaliacao deixou de ser beco sem saída", () => {
  it("leva às três páginas que respondem a pergunta seguinte", async () => {
    const hrefs = hrefsRenderizados(await paginaDeAvaliacao());

    for (const destino of ["/estoque", "/financiamento", "/garantia"]) {
      expect(hrefs, `sem link para ${destino}`).toContain(destino);
    }
  });

  it("tem trilha navegável de volta para a home", async () => {
    expect(hrefsRenderizados(await paginaDeAvaliacao())).toContain("/");
  });

  it("nenhum link de saída é âncora morta", async () => {
    const hrefs = hrefsRenderizados(await paginaDeAvaliacao());

    expect(hrefs.length).toBeGreaterThanOrEqual(4);
    expect(hrefs.filter((h) => h === "#" || h === "")).toHaveLength(0);
  });

  it("publica a trilha e a loja no grafo", async () => {
    const nos = grafo(await paginaDeAvaliacao());
    const tipos = nos.map((no) => no["@type"]);

    expect(tipos).toContain("BreadcrumbList");
    expect(tipos).toContain("AutoDealer");
  });

  it("a loja no grafo é o mesmo #dealer que as ofertas referenciam", async () => {
    const loja = grafo(await paginaDeAvaliacao()).find((no) => no["@type"] === "AutoDealer");

    const { ID_DA_LOJA } = await import("../src/lib/schemaLoja");
    expect(loja?.["@id"]).toBe(ID_DA_LOJA);
  });

  it("não derruba a página para calcular priceRange — o campo fica de fora", async () => {
    // A escolha está documentada na rota: `/avaliacao` é captação de estoque e
    // não pode depender de uma leitura que, desde 4c83ceb, PARA a página quando
    // falha. Se alguém adicionar `recortesDoEstoque()` aqui, este teste cai
    // junto com o mock de settings — e é para cair.
    const loja = grafo(await paginaDeAvaliacao()).find((no) => no["@type"] === "AutoDealer");

    expect(loja).toBeDefined();
    expect(loja).not.toHaveProperty("priceRange");
    expect(loja?.address).toBeDefined();
  });
});
