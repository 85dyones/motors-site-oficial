import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings } from "../src/types";
import type { Guia, SecaoDoGuia } from "../src/lib/guias";
import { ancorasDasSecoes, blocosDaSecao, blocosDoParagrafo, textoSemMarcas } from "../src/lib/blocosDoGuia";
import { marcasFortes } from "./marcasDeIA";
import { conferir } from "../conteudo-seo/aplicar-guias.mjs";

/**
 * Guias escaneáveis (30/09/2026).
 *
 * O dono: os blocos imensos de texto são "escaneáveis pelos LLMs e buscadores,
 * mas maçantes para os leitores". A reforma mexeu na FORMA dos 26 guias
 * (listas, subtítulos, parágrafos partidos entre frases) sem trocar palavra;
 * as únicas palavras novas são os subtítulos. A página ganhou o índice
 * "Neste guia", a abertura em corpo maior e letra de 16/17px.
 *
 * Este arquivo prende a convenção de `lib/blocosDoGuia.ts`, o que a página
 * faz com ela e os limites que a reforma respeitou.
 */

const RAIZ = join(__dirname, "..");
const LOTES = ["guias-onda-1.json", "guias-onda-2.json", "guias-onda-2-garantia.json", "guias-onda-3.json"];
interface GuiaDoLote {
  slug: string;
  titulo: string;
  estado: string;
  corpo: SecaoDoGuia[];
}
const publicados: GuiaDoLote[] = LOTES.flatMap(
  (f) => JSON.parse(readFileSync(join(RAIZ, "conteudo-seo", f), "utf8")).guias as GuiaDoLote[],
).filter((g) => g.estado === "publicado");

describe("a convenção do parágrafo", () => {
  it("texto sem marca continua um parágrafo só", () => {
    expect(blocosDoParagrafo("Uma frase. Outra frase.")).toEqual([{ tipo: "paragrafo", texto: "Uma frase. Outra frase." }]);
    expect(blocosDoParagrafo("   ")).toEqual([]);
  });

  it("linhas com '- ' viram lista, e o que vem antes abre a lista", () => {
    expect(blocosDoParagrafo("São normais:\n- uma pausa curta\n- um ruído discreto")).toEqual([
      { tipo: "paragrafo", texto: "São normais:" },
      { tipo: "lista", itens: ["uma pausa curta", "um ruído discreto"] },
    ]);
  });

  it("texto depois da lista volta a ser parágrafo", () => {
    expect(blocosDoParagrafo("- a\n- b\nFecho.")).toEqual([
      { tipo: "lista", itens: ["a", "b"] },
      { tipo: "paragrafo", texto: "Fecho." },
    ]);
  });

  it("'### ' vira subtítulo, e o texto colado embaixo dele vira parágrafo", () => {
    expect(blocosDoParagrafo("### Ventilação do cárter")).toEqual([{ tipo: "subtitulo", texto: "Ventilação do cárter" }]);
    // Quem escreve pelo painel pode esquecer a linha em branco.
    expect(blocosDoParagrafo("### A\ncontinua")).toEqual([
      { tipo: "subtitulo", texto: "A" },
      { tipo: "paragrafo", texto: "continua" },
    ]);
    // "###" no meio da frase não é marca.
    expect(blocosDoParagrafo("texto ### solto")[0].tipo).toBe("paragrafo");
  });

  it("'---' sozinho fecha o último subtítulo", () => {
    expect(blocosDoParagrafo("---")).toEqual([{ tipo: "separador" }]);
    expect(blocosDoParagrafo("--- e texto")[0].tipo).toBe("paragrafo");
  });

  it("listas vizinhas na mesma seção viram uma só", () => {
    expect(blocosDaSecao(["Abre:", "- um", "- dois"])).toEqual([
      { tipo: "paragrafo", texto: "Abre:" },
      { tipo: "lista", itens: ["um", "dois"] },
    ]);
  });

  it("hífen de palavra composta e travessão no meio da linha não viram lista", () => {
    expect(blocosDoParagrafo("O T-Cross usa o 250 TSI - e só ele.")).toEqual([
      { tipo: "paragrafo", texto: "O T-Cross usa o 250 TSI - e só ele." },
    ]);
  });

  it("as âncoras das seções são únicas e sem acento", () => {
    expect(ancorasDasSecoes(["O que é, e quem faz", "Preço", "Preço"])).toEqual(["o-que-e-e-quem-faz", "preco", "preco-2"]);
  });
});

describe("os 26 guias depois da reforma", () => {
  const paragrafos = publicados.flatMap((g) => g.corpo.flatMap((s) => s.paragrafos.map((p) => ({ slug: g.slug, secao: s.titulo, p }))));

  it("subtítulo é curto e não repete a marca de IA", () => {
    for (const { slug, p } of paragrafos) {
      for (const b of blocosDoParagrafo(p)) {
        if (b.tipo !== "subtitulo") continue;
        expect(b.texto.split(/\s+/).length, `${slug}: ${b.texto}`).toBeLessThanOrEqual(6);
        expect(b.texto, slug).not.toMatch(/[—–:]|^Em resumo|^Resumindo/);
        expect(marcasFortes(b.texto), `${slug}: ${b.texto}`).toEqual([]);
      }
    }
  });

  it("subtítulo nunca fecha a seção e nunca repete o título dela", () => {
    for (const g of publicados) {
      for (const s of g.corpo) {
        const blocos = blocosDaSecao(s.paragrafos);
        expect(blocos.at(-1)?.tipo, `${g.slug} · ${s.titulo}`).not.toBe("subtitulo");
        for (const b of blocos) if (b.tipo === "subtitulo") expect(b.texto).not.toBe(s.titulo);
      }
    }
  });

  it("o separador só aparece depois de um subtítulo, e nunca fecha a seção", () => {
    for (const g of publicados) {
      for (const s of g.corpo) {
        const blocos = blocosDaSecao(s.paragrafos);
        blocos.forEach((b, i) => {
          if (b.tipo !== "separador") return;
          expect(blocos.slice(0, i).some((x) => x.tipo === "subtitulo"), `${g.slug} · ${s.titulo}`).toBe(true);
          expect(i, `${g.slug} · ${s.titulo}`).toBeLessThan(blocos.length - 1);
        });
      }
    }
  });

  it("lista tem ao menos dois itens", () => {
    for (const { slug, p } of paragrafos) {
      for (const b of blocosDoParagrafo(p)) if (b.tipo === "lista") expect(b.itens.length, slug).toBeGreaterThanOrEqual(2);
    }
  });

  it("citação entre aspas abre e fecha na mesma linha", () => {
    // É a string entre aspas que o linkador casa com o título de outro guia.
    // Partida entre um item de lista e o seguinte, o link some sem aviso.
    for (const { slug, p } of paragrafos) {
      for (const linha of p.split("\n")) {
        expect((linha.match(/"/g) ?? []).length % 2, `${slug}: ${linha.slice(0, 80)}`).toBe(0);
      }
    }
  });

  it("nenhum bloco corrido passa de 90 palavras", () => {
    for (const { slug, secao, p } of paragrafos) {
      for (const b of blocosDoParagrafo(p)) {
        if (b.tipo !== "paragrafo") continue;
        expect(b.texto.split(/\s+/).length, `${slug} · ${secao}: ${b.texto.slice(0, 60)}`).toBeLessThanOrEqual(90);
      }
    }
  });

  it("o texto sem marcas não traz traço de lista nem cerquilha", () => {
    for (const { slug, p } of paragrafos) {
      expect(textoSemMarcas(p), slug).not.toMatch(/(^|\n)\s*-\s|###/);
    }
  });
});

describe("o aplicador aceita as duas marcas, e só elas", () => {
  const base = JSON.parse(readFileSync(join(RAIZ, "conteudo-seo", "guias-onda-2-garantia.json"), "utf8"));
  const comParagrafo = (p: string) => {
    const lote = structuredClone(base);
    lote.guias[0].corpo[0].paragrafos = [...lote.guias[0].corpo[0].paragrafos, p];
    return conferir(lote).erros as string[];
  };

  it("'- ', '### ' e '---' passam", () => {
    expect(comParagrafo("Abre:\n- um item\n- outro item")).toEqual([]);
    expect(comParagrafo("### Subtítulo curto")).toEqual([]);
    expect(comParagrafo("---")).toEqual([]);
  });

  it("o resto do markdown continua reprovando", () => {
    for (const p of ["Abre:\n* um item\n* outro", "## Título grande", "### Dois\nlinhas", "Um **negrito** aqui"]) {
      expect(comParagrafo(p).length, p).toBeGreaterThan(0);
    }
  });
});

describe("o sticky voltou a grudar", () => {
  const ler = (f: string) => readFileSync(join(RAIZ, f), "utf8");

  it("html e body cortam o vazamento lateral com clip, e não com hidden", () => {
    // `hidden` fazia do body um contêiner de rolagem que nunca rola, e nenhum
    // `sticky` do site grudava (o header incluso).
    const css = ler("src/app/globals.css");
    const regra = css.slice(css.indexOf("html, body {"), css.indexOf("}", css.indexOf("html, body {")));
    expect(regra).toContain("overflow-x: clip");
    expect(regra).not.toContain("overflow-x: hidden");
  });

  it("o voltar-ao-topo sai de cena quando a página tem barra fixa no pé", () => {
    expect(ler("src/components/Header.tsx")).toContain('document.querySelector("[data-barra-inferior]")');
    expect(ler("src/components/ResultadoDoProfiler.tsx")).toMatch(/data-barra-inferior className="sticky bottom-0/);
  });
});

// ---------------------------------------------------------------------------
// A página
// ---------------------------------------------------------------------------

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

const GUIA: Guia = {
  slug: "teste-escaneavel",
  titulo: "Guia de teste",
  tituloSeo: "Guia de teste | Motors Store",
  descricao: "Descrição curta.",
  publicadoEm: "2026-09-05T09:00:00-03:00",
  atualizadoEm: "2026-09-30T09:00:00-03:00",
  sobre: ["Laudo cautelar"],
  corpo: [
    { titulo: "O que é, e quem faz", paragrafos: ["A abertura responde ao título.", "Segundo parágrafo."] },
    {
      titulo: "Os sinais",
      paragrafos: [
        "São defeito:\n- trepidação na saída\n- solavanco entre primeira e segunda\n- mensagem de superaquecimento do câmbio",
        "### Carro frio",
        "Faça o test-drive frio. A garantia cobre o câmbio.",
        "---",
        "Conclusão da seção inteira.",
      ],
    },
  ],
  faq: [{ pergunta: "Pergunta?", resposta: "Resposta." }],
  saida: { rotulo: "Ver o estoque", href: "/estoque", apoio: "O que tem hoje." },
};

vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: EMPRESA }),
}));
vi.mock("../src/lib/guiasDoBanco", () => ({
  listarGuiasPublicados: async () => [GUIA],
  buscarGuiaPublicado: async (slug: string) => (slug === GUIA.slug ? GUIA : null),
  GuiasIndisponiveisError: class extends Error {},
}));

async function html(): Promise<string> {
  const { default: GuiaPage } = await import("../src/app/guias/[slug]/page");
  return renderToStaticMarkup(await GuiaPage({ params: Promise.resolve({ slug: GUIA.slug }) }));
}

describe("a página do guia", () => {
  it("abre com o índice das seções, com âncora que existe", async () => {
    const h = await html();
    expect(h).toContain('id="o-que-e-e-quem-faz"');
    expect(h).toContain('id="os-sinais"');
    // Duas vezes cada: o índice recolhido do celular e o fixo do computador.
    expect(h.split('href="#os-sinais"').length - 1).toBe(2);
    expect(h).toContain('aria-label="Neste guia"');
  });

  it("a lista sai como <ul> e o subtítulo como <h3>, sem as marcas", async () => {
    const h = await html();
    expect(h).toMatch(/<ul[^>]*>[\s\S]*trepidação na saída[\s\S]*<\/ul>/);
    expect(h.match(/<li\b/g)?.length).toBeGreaterThanOrEqual(3);
    expect(h).toMatch(/<h3[^>]*>Carro frio<\/h3>/);
    expect(h).toMatch(/<hr[^>]*\/?>[\s\S]*Conclusão da seção inteira/);
    expect(h).toMatch(/<ul role="list"/);
    expect(h).not.toMatch(/###|>- |>---/);
  });

  it("a abertura sai em corpo maior, e só ela", async () => {
    const h = await html();
    const maiores = h.match(/<p class="[^"]*text-\[20px\][^"]*">[\s\S]*?<\/p>/g) ?? [];
    expect(maiores).toHaveLength(1);
    expect(maiores[0]).toContain("A abertura responde ao título.");
  });

  it("o linkador continua valendo dentro da lista e do texto, uma vez por destino", async () => {
    const h = await html();
    // "garantia" é termo com destino; aparece uma vez no texto.
    expect(h.split('href="/garantia"').length - 1).toBeLessThanOrEqual(1);
  });
});
