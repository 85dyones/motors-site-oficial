import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GUIAS_CONHECIDOS,
  GUIAS_DA_PAGINA,
  GUIAS_POR_MODELO,
  GRUPOS_DE_GUIAS,
  TITULO_DE_OUTROS_GUIAS,
  agruparGuias,
} from "../src/lib/guiasNoSite";
import { segmentarComLinks } from "../src/lib/linksNoTexto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PaginaDeEstoque from "../src/components/modernist/PaginaDeEstoque";

/**
 * O registro de `lib/guiasNoSite.ts` copia título e slug dos guias, que vivem
 * no banco. Os JSON de `conteudo-seo/` são a versão que está no ar
 * (`GRAVACAO-2026-09-21.md`), e é contra eles que a cópia é conferida.
 */
const RAIZ = join(__dirname, "..");
const LOTES = ["guias-onda-1.json", "guias-onda-2.json", "guias-onda-2-garantia.json", "guias-onda-3.json"];

interface GuiaDoLote {
  slug: string;
  titulo: string;
  estado: string;
  corpo: { titulo: string; paragrafos: string[] }[];
  faq: { pergunta: string; resposta: string }[];
}

const publicados: GuiaDoLote[] = LOTES.flatMap(
  (arquivo) => JSON.parse(readFileSync(join(RAIZ, "conteudo-seo", arquivo), "utf8")).guias as GuiaDoLote[],
).filter((g) => g.estado === "publicado");

const textoDo = (slug: string) => {
  const g = publicados.find((x) => x.slug === slug)!;
  return [...g.corpo.flatMap((s) => [s.titulo, ...s.paragrafos]), ...g.faq.flatMap((f) => [f.pergunta, f.resposta])].join("\n");
};

describe("o registro de guias do site", () => {
  it("conhece cada guia publicado, com o título igual ao do lote", () => {
    for (const g of publicados) {
      expect(GUIAS_CONHECIDOS[g.slug], `${g.slug} fora do registro`).toBeDefined();
      expect(GUIAS_CONHECIDOS[g.slug].titulo).toBe(g.titulo);
    }
    expect(Object.keys(GUIAS_CONHECIDOS).sort()).toEqual(publicados.map((g) => g.slug).sort());
  });

  it("não aponta página nenhuma para guia que não existe", () => {
    const slugs = new Set(publicados.map((g) => g.slug));
    const todos = [...Object.values(GUIAS_DA_PAGINA).flat(), ...Object.values(GUIAS_POR_MODELO).flat()];
    for (const g of todos) {
      expect(slugs.has(g.slug), g.slug).toBe(true);
      expect(g.href).toBe(`/guias/${g.slug}`);
      expect(g.apoio.length, `apoio vazio em ${g.slug}`).toBeGreaterThan(0);
    }
  });

  it("as duas ligações decididas pelo dono em 29/09 respeitam as regras das páginas", () => {
    // /avaliacao: a FIPE é a única cifra da página, e o card não traz valor
    // nem fala em desconto. "Abaixo da FIPE" NÃO é proibido: o formulário diz
    // que a compra fica abaixo da FIPE, e o dono manteve a frase em 29/09/2026.
    const fipe = GUIAS_DA_PAGINA["/avaliacao"].find((g) => g.slug === "tabela-fipe-nao-e-preco-de-venda");
    expect(fipe).toBeDefined();
    for (const g of GUIAS_DA_PAGINA["/avaliacao"]) {
      expect(`${g.titulo} ${g.apoio}`, g.slug).not.toMatch(/R\$|\d+\s*mil\b|desconto/i);
    }

    // /garantia: o guia de vício oculto não explica a garantia legal nem
    // enumera o escopo dela (sem CDC, sem prazo legal) e manda a dúvida de
    // direito para o Procon ou um advogado.
    const vicio = GUIAS_DA_PAGINA["/garantia"].find((g) => g.slug === "vicio-oculto-carro-usado");
    expect(vicio).toBeDefined();
    const texto = textoDo("vicio-oculto-carro-usado");
    expect(texto).not.toMatch(/\bCDC\b|Código de Defesa|90 dias|noventa dias/i);
    expect(texto).toMatch(/Procon ou um advogado/);
  });

  it("só liga um guia de mecânica a modelo que o texto do guia cita pelo nome", () => {
    // O nome como o guia escreve, quando o slug do hub não é o nome.
    const nome: Record<string, string> = {
      "onix-plus": "Onix Plus",
    };
    for (const [chave, guias] of Object.entries(GUIAS_POR_MODELO)) {
      const modelo = chave.split("/")[1];
      const escrito = nome[modelo] ?? modelo;
      const padrao = new RegExp(`(?<![\\p{L}\\p{N}])${escrito.replace(/[-]/g, "[- ]")}(?![\\p{L}\\p{N}])`, "iu");
      for (const g of guias) {
        expect(padrao.test(textoDo(g.slug)), `${chave} -> ${g.slug}`).toBe(true);
      }
    }
  });
});

describe("o que o guia desmente não entra", () => {
  // O teste de cima só pede que o modelo seja citado; estes são os casos em
  // que o guia cita o modelo para dizer que ele NÃO tem a tecnologia.
  const slugsDe = (chave: string) => (GUIAS_POR_MODELO[chave] ?? []).map((g) => g.slug);

  it("Ka, EcoSport e Kwid não levam ao guia de turbo: nunca tiveram motor turbo", () => {
    for (const chave of ["ford/ka", "ford/ecosport", "renault/kwid"]) {
      expect(slugsDe(chave), chave).not.toContain("motores-turbo-usados-o-que-checar");
    }
    expect(textoDo("motores-turbo-usados-o-que-checar")).toMatch(/Ka e EcoSport brasileiros nunca tiveram motor turbo/);
  });

  it("os 250 TSI não levam ao guia de dupla embreagem: usam automático de conversor", () => {
    for (const chave of ["volkswagen/polo", "volkswagen/virtus", "volkswagen/t-cross", "volkswagen/nivus", "volkswagen/taos"]) {
      expect(slugsDe(chave), chave).not.toContain("cambio-dupla-embreagem-usado");
    }
  });

  it("todo número de uma linha de apoio está no texto do guia", () => {
    const todos = [...Object.values(GUIAS_DA_PAGINA).flat(), ...Object.values(GUIAS_POR_MODELO).flat()];
    for (const g of todos) {
      for (const numero of g.apoio.match(/\d+(?:[.,]\d+)?/g) ?? []) {
        expect(textoDo(g.slug), `"${numero}" em ${g.slug}: ${g.apoio}`).toContain(numero);
      }
    }
  });
});

describe("o bloco de guias não repete o link do texto", () => {
  it("guia que a introdução já linka não volta como card", () => {
    const html = renderToStaticMarkup(
      createElement(PaginaDeEstoque, {
        trilha: [{ rotulo: "Home", href: "/" }],
        titulo: "Garantia do seminovo",
        introducao: ["Todo carro passa por perícia antes da vitrine, e de cada dez avaliados, três entram."],
        veiculos: [],
        caminho: "/garantia",
        guias: {
          titulo: "Para ler antes de comprar",
          lista: [...GUIAS_DA_PAGINA["/garantia"], ...GUIAS_DA_PAGINA["/sobre"]],
        },
      }),
    );
    const vezes = (href: string) => html.split(`href="${href}"`).length - 1;
    expect(vezes("/guias/o-que-reprova-pericia-cautelar")).toBe(1);
    expect(vezes("/guias/garantia-carro-usado-loja")).toBe(1);
  });
});

describe("o índice agrupado", () => {
  const publicadosComoGuia = publicados.map((g) => ({ slug: g.slug }));

  it("abre pela procedência e segue a ordem dos grupos", () => {
    const grupos = agruparGuias(publicadosComoGuia);
    expect(grupos.map((g) => g.titulo)).toEqual(GRUPOS_DE_GUIAS.map((g) => g.titulo));
    expect(grupos[0].guias[0].slug).toBe("laudo-cautelar-carro-usado");
    expect(grupos.flatMap((g) => g.guias)).toHaveLength(publicados.length);
  });

  it("guia novo, publicado pelo painel, fecha o índice em vez de sumir", () => {
    const grupos = agruparGuias([...publicadosComoGuia, { slug: "guia-que-ainda-nao-esta-no-registro" }]);
    const ultimo = grupos[grupos.length - 1];
    expect(ultimo.titulo).toBe(TITULO_DE_OUTROS_GUIAS);
    expect(ultimo.guias.map((g) => g.slug)).toEqual(["guia-que-ainda-nao-esta-no-registro"]);
  });
});

describe("o llms.txt", () => {
  const llms = readFileSync(join(RAIZ, "public", "llms.txt"), "utf8");

  it("lista cada guia publicado pela URL canônica", () => {
    for (const g of publicados) {
      expect(llms, g.slug).toContain(`https://motorsstore.com.br/guias/${g.slug})`);
    }
  });
});

describe("os termos da auditoria de 29/09", () => {
  const destinoDe = (texto: string, caminho?: string) =>
    segmentarComLinks(texto, caminho).filter((s) => s.href).map((s) => [s.texto, s.href]);

  it("a frase dos três de cada dez leva ao levantamento que a sustenta", () => {
    expect(destinoDe("Na vitrine, de cada dez avaliados, três entram.")).toContainEqual([
      "de cada dez avaliados, três entram",
      "/guias/o-que-reprova-pericia-cautelar",
    ]);
    // O próprio levantamento não linka para si.
    expect(
      destinoDe("De cada dez carros avaliados, três entram.", "/guias/o-que-reprova-pericia-cautelar"),
    ).toEqual([]);
  });

  it("cada variação usada nos guias publicados casa com algum termo", () => {
    const variacoes = new Set<string>();
    for (const g of publicados) {
      for (const m of textoDo(g.slug).matchAll(/de cada dez [^,.]{0,30}, três entram/giu)) variacoes.add(m[0]);
    }
    for (const v of variacoes) {
      expect(destinoDe(`${v}.`).map((d) => d[1]), v).toContain("/guias/o-que-reprova-pericia-cautelar");
    }
  });

  it("remarcação irregular e adulteração de numeração levam ao guia de chassi", () => {
    expect(destinoDe("pega clonagem, remarcação irregular e troca")).toContainEqual([
      "remarcação irregular",
      "/guias/chassi-remarcado",
    ]);
    expect(destinoDe("divergência ou adulteração de numeração, que é reprovação")).toContainEqual([
      "adulteração de numeração",
      "/guias/chassi-remarcado",
    ]);
  });
});
