import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings } from "../src/types";
import type { Guia } from "../src/lib/guias";
import { NOME_DA_SECAO } from "../src/lib/guias";
import { colunasDoRodape } from "../src/lib/colunasDoRodape";
import { MENU_DO_CABECALHO } from "../src/lib/menuDoCabecalho";

/**
 * Os guias renderizados — o `<script>` de verdade, e o texto que ele marca.
 *
 * Nasce coberto, e isso é deliberado: a F2 levou quatro revisões justamente
 * porque a montagem do grafo vivia no JSX sem teste que a visse. `grafoDoGuia`
 * organiza; quem guarda o resultado é este arquivo.
 *
 * O conteúdo vem do BANCO desde 06/09 — o dono cria e edita os guias pelo
 * painel. Por isso a fixture aqui é sintética: o que está sob teste é a ROTA,
 * não o texto que a loja publicou. Amarrar a suíte ao texto real a quebraria
 * toda vez que alguém editasse um parágrafo pelo painel.
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

/**
 * Um guia de teste com as armadilhas embutidas de propósito: "perícia
 * cautelar" aparece em TRÊS parágrafos e mais uma vez no FAQ, que é o que pega
 * a regressão do linkador por bloco (seis âncoras para `/garantia`).
 */
const GUIA: Guia = {
  slug: "guia-de-teste",
  titulo: "Um guia de teste",
  tituloSeo: "Um guia de teste | Motors Store",
  descricao: "Descrição do guia de teste, com perícia cautelar no meio.",
  publicadoEm: "2026-09-05T09:00:00-03:00",
  atualizadoEm: "2026-09-06T09:00:00-03:00",
  sobre: ["Perícia cautelar veicular", "Laudo cautelar"],
  corpo: [
    {
      titulo: "Primeira seção",
      paragrafos: [
        "O primeiro parágrafo fala de perícia cautelar e do que ela verifica.",
        "O segundo parágrafo fala de perícia cautelar de novo, para testar o linkador.",
      ],
    },
    {
      titulo: "Segunda seção",
      paragrafos: ["A terceira menção de perícia cautelar mora aqui."],
    },
  ],
  faq: [
    {
      pergunta: "Uma pergunta de teste?",
      resposta: "Uma resposta de teste que menciona perícia cautelar e termina aqui.",
    },
    {
      pergunta: "Outra pergunta?",
      resposta: "Outra resposta, sem termo linkável nenhum, só para ter duas.",
    },
  ],
  saida: {
    rotulo: "Ver a garantia",
    href: "/garantia",
    apoio: "O que responde por motor e câmbio.",
  },
};

vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: EMPRESA }),
}));

vi.mock("../src/lib/guiasDoBanco", () => ({
  listarGuiasPublicados: async () => [GUIA],
  buscarGuiaPublicado: async (slug: string) => (slug === GUIA.slug ? GUIA : null),
  GuiasIndisponiveisError: class extends Error {},
}));

function nos(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(
    (m) => {
      const json = JSON.parse(
        m[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&"),
      );
      return Array.isArray(json) ? json : [json];
    },
  );
}

function limpar(html: string): string {
  return (
    html
      .replace(/<[^>]+>/g, "")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      // `&lt;` e `&gt;` entraram em 07/09: o último degrau da trilha da ficha é
      // `{guia.titulo}`, texto que o dono DIGITA no painel. Um guia chamado
      // "Seminovos < 100 mil km" deixava a suíte vermelha acusando divergência
      // de trilha onde não havia nenhuma — o defeito era do decodificador.
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      // `&amp;` por último: decodificar antes transformaria `&amp;lt;` em `<`.
      .replace(/&amp;/g, "&")
      .replace(/&#x2F;/g, "/")
  );
}

async function guiaRenderizado(slug = GUIA.slug): Promise<string> {
  const { default: GuiaPage } = await import("../src/app/guias/[slug]/page");
  return renderToStaticMarkup(await GuiaPage({ params: Promise.resolve({ slug }) }));
}

async function indice(): Promise<string> {
  const { default: GuiasPage } = await import("../src/app/guias/page");
  return renderToStaticMarkup(await GuiasPage());
}

describe("o guia publica o grafo inteiro", () => {
  it("emite Article, BreadcrumbList, FAQPage, AutoDealer e WebSite", async () => {
    const tipos = nos(await guiaRenderizado()).map((n) => n["@type"]);

    expect(tipos).toContain("Article");
    expect(tipos).toContain("BreadcrumbList");
    expect(tipos).toContain("FAQPage");
    expect(tipos).toContain("AutoDealer");
    expect(tipos).toContain("WebSite");
  });

  it("são cinco nós — cortar o array publicado quebra aqui", async () => {
    expect(nos(await guiaRenderizado())).toHaveLength(5);
  });

  it("o Article declara as datas do banco e aponta para a loja", async () => {
    const publicados = nos(await guiaRenderizado());
    const artigo = publicados.find((n) => n["@type"] === "Article")!;
    const loja = publicados.find((n) => n["@type"] === "AutoDealer")!;

    // `publicado_em` e `atualizado_em` são colunas distintas: um guia editado
    // muda o segundo e preserva o primeiro.
    expect(artigo.datePublished).toBe(GUIA.publicadoEm);
    expect(artigo.dateModified).toBe(GUIA.atualizadoEm);
    expect(artigo.author).toEqual({ "@id": loja["@id"] });
    expect(artigo.publisher).toEqual({ "@id": loja["@id"] });
  });

  it("a imagem do Article é URL absoluta", async () => {
    const artigo = nos(await guiaRenderizado()).find((n) => n["@type"] === "Article")!;

    // `urlDoCardGerado` devolve caminho relativo — serve ao `next/metadata`,
    // que absolutiza pelo `metadataBase`, e não serve ao JSON-LD.
    expect(String(artigo.image)).toMatch(/^https?:\/\//);
  });

  it("o texto do FAQPage é idêntico ao visível", async () => {
    const html = await guiaRenderizado();
    const faq = nos(html).find((n) => n["@type"] === "FAQPage") as {
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    const visivel = limpar(html);

    // Divergência entre markup e página é violação de diretriz, não bug de
    // layout — e o render põe link dentro das respostas.
    for (const pergunta of faq.mainEntity) {
      expect(visivel, `pergunta divergente: ${pergunta.name}`).toContain(pergunta.name);
      expect(visivel, `resposta divergente: ${pergunta.name}`).toContain(
        pergunta.acceptedAnswer.text,
      );
    }
  });

  it("o corpo inteiro chega à página", async () => {
    const visivel = limpar(await guiaRenderizado());

    for (const secao of GUIA.corpo) {
      expect(visivel, `seção sumida: ${secao.titulo}`).toContain(secao.titulo);
      for (const paragrafo of secao.paragrafos) {
        expect(visivel, `parágrafo alterado: ${paragrafo.slice(0, 40)}`).toContain(paragrafo);
      }
    }
  });

  it("tem saída comercial, e ela é um link", async () => {
    const hrefs = [...(await guiaRenderizado()).matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);

    expect(hrefs).toContain(GUIA.saida.href);
    expect(hrefs).toContain("/estoque");
    expect(hrefs.filter((h) => h === "#" || h === "")).toHaveLength(0);
  });

  it("um link por destino no corpo — não um por parágrafo", async () => {
    const html = await guiaRenderizado();
    const contagem: Record<string, number> = {};
    for (const m of html.matchAll(/<a[^>]*href="(\/[a-z-]*)"/g)) {
      contagem[m[1]] = (contagem[m[1]] ?? 0) + 1;
    }

    // A fixture menciona "perícia cautelar" quatro vezes de propósito. A
    // primeira versão da rota chamava `segmentarComLinks` por parágrafo e saía
    // com seis âncoras para `/garantia`; agora sobra a estrutural mais uma.
    expect(contagem["/garantia"] ?? 0).toBeLessThanOrEqual(2);
  });
});

describe("slug que não existe", () => {
  it("não devolve página renderizada", async () => {
    // `notFound()` estoura o fallback do Next. O que importa é que a rota NÃO
    // serve uma página para um guia inexistente — nem vazia, nem meia.
    await expect(guiaRenderizado("nao-existe")).rejects.toThrow();
  });
});

describe("o índice do cluster", () => {
  it("lista os guias publicados", async () => {
    const hrefs = [...(await indice()).matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);

    expect(hrefs).toContain(`/guias/${GUIA.slug}`);
  });

  it("publica CollectionPage, trilha, loja e site", async () => {
    const tipos = nos(await indice()).map((n) => n["@type"]);

    expect(tipos).toEqual(["CollectionPage", "BreadcrumbList", "AutoDealer", "WebSite"]);
  });

  it("o ItemList tem uma entrada por guia publicado", async () => {
    const pagina = nos(await indice()).find((n) => n["@type"] === "CollectionPage") as {
      mainEntity: { numberOfItems: number; itemListElement: unknown[] };
    };

    expect(pagina.mainEntity.numberOfItems).toBe(1);
    expect(pagina.mainEntity.itemListElement).toHaveLength(1);
  });

  it("leva de volta ao estoque e às páginas de conversão", async () => {
    const hrefs = [...(await indice()).matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);

    for (const destino of ["/estoque", "/garantia", "/avaliacao"]) {
      expect(hrefs).toContain(destino);
    }
  });
});

/**
 * O nome da seção sai de UM lugar, e as cinco pontas provam isso.
 *
 * Em 07/09 a seção deixou de se chamar "Guias de procedência" e passou a ser
 * "Guias Motors": o rótulo antigo anunciava um assunto só, num link presente em
 * todas as páginas, e a seção virou o conteúdo editorial da loja inteira.
 *
 * A primeira versão desta trava amarrava um par — a trilha desenhada contra a
 * marcada — e a revisão adversarial mostrou que isso não é uma trava, é um
 * pedaço dela: desfazendo a renomeação no `<h1>`, no `CollectionPage.name`, no
 * rodapé e nos textos de compartilhamento, a suíte cheia (2207 testes) ficou
 * VERDE nas quatro. O site serviria quatro nomes diferentes para a mesma seção
 * sem ninguém notar — e o `<h1>` podia divergir da trilha logo acima dele.
 *
 * Agora a fonte é `NOME_DA_SECAO`, e cada teste aqui afirma que a saída
 * RENDERIZADA de uma ponta é igual a ela. Renomear de novo é mexer na
 * constante; escrever o nome à mão em qualquer ponta fica vermelho.
 */
describe("o nome da seção sai de um lugar só", () => {
  interface DegrauMarcado {
    name: string;
    item: string;
    position: number;
  }

  function degrausMarcados(html: string): DegrauMarcado[] {
    const trilha = nos(html).find((n) => n["@type"] === "BreadcrumbList") as
      | { itemListElement: DegrauMarcado[] }
      | undefined;
    expect(trilha, "a página precisa publicar um BreadcrumbList").toBeDefined();

    const degraus = trilha!.itemListElement;
    // Sem esta guarda o resto vira teatro por vazio: uma trilha de nomes em
    // branco viraria " / " dos dois lados e casaria com ela mesma.
    for (const d of degraus) expect(d.name.trim().length).toBeGreaterThan(0);
    return degraus;
  }

  function navDa(html: string): string {
    const nav = html.match(/<nav[^>]*aria-label="Trilha"[\s\S]*?<\/nav>/);
    expect(nav, "a página precisa renderizar a trilha").not.toBeNull();
    return nav![0];
  }

  function trilhaVisivel(html: string): string {
    return limpar(navDa(html)).replace(/\s+/g, " ").trim();
  }

  /**
   * O segundo degrau, nas duas rotas.
   *
   * `HOME` é o primeiro e `/guias` é o segundo tanto no índice quanto na ficha,
   * então a posição serve de endereço e não depende da FORMA do elemento — que
   * difere: no índice o degrau é um `<span>` (página atual) e na ficha é um
   * `<a href="/guias">`. Fatiar por posição também é imune a um título de guia
   * que contenha " / ", porque o título é o terceiro.
   */
  function degrauVisivelDosGuias(html: string): string {
    const degraus = trilhaVisivel(html).split(" / ");
    expect(degraus.length).toBeGreaterThan(1);
    return degraus[1];
  }

  it("o <h1> do índice", async () => {
    const h1 = (await indice()).match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    expect(h1, "o índice precisa ter um <h1>").not.toBeNull();
    expect(limpar(h1![1]).trim()).toBe(NOME_DA_SECAO);
  });

  it("o degrau visível da trilha, nas duas rotas", async () => {
    // Comparação SENSÍVEL a caixa: desde 07/09 as duas rotas emitem o nome em
    // caixa mista e deixam o `uppercase` para o CSS. É o DOM que o leitor de
    // tela e o rastreador leem — a ficha mandava `GUIAS MOTORS` literal, e a
    // mesma seção chegava em duas grafias com os pixels iguais.
    expect(degrauVisivelDosGuias(await indice())).toBe(NOME_DA_SECAO);
    expect(degrauVisivelDosGuias(await guiaRenderizado())).toBe(NOME_DA_SECAO);
  });

  it("o CollectionPage.name", async () => {
    const pagina = nos(await indice()).find((n) => n["@type"] === "CollectionPage") as {
      name: string;
    };

    expect(pagina.name).toBe(NOME_DA_SECAO);
  });

  it("o degrau do BreadcrumbList, nas duas rotas", async () => {
    for (const html of [await indice(), await guiaRenderizado()]) {
      const degrau = degrausMarcados(html).find((d) => d.item.endsWith("/guias"));
      expect(degrau, "o BreadcrumbList precisa ter o degrau de /guias").toBeDefined();
      expect(degrau!.name).toBe(NOME_DA_SECAO);
    }
  });

  it("o rótulo no rodapé de todas as páginas", () => {
    const itens = colunasDoRodape(EMPRESA).flatMap((c) => c.itens);
    const guias = itens.find((i) => i.href === "/guias");

    expect(guias, "o rodapé precisa linkar /guias").toBeDefined();
    expect(guias!.rotulo).toBe(NOME_DA_SECAO);
  });

  it("o rótulo no menu do cabeçalho", () => {
    const item = MENU_DO_CABECALHO.find((i) => i.href === "/guias");

    expect(item, "o cabeçalho precisa linkar /guias").toBeDefined();
    // Caixa alta é a convenção dos outros cinco rótulos do menu, que não passam
    // por `uppercase` do CSS — por isso a comparação é com a constante em caixa
    // alta, e não com ela crua.
    expect(item!.rotulo).toBe(NOME_DA_SECAO.toUpperCase());
  });

  it("o menu põe os guias depois das telas de ação e antes das institucionais", () => {
    const ordem = MENU_DO_CABECALHO.map((i) => i.href);

    // A guarda vem antes da ordem, e não é zelo: `indexOf` devolve -1 quando
    // não acha, e -1 é menor que qualquer índice válido — sem isto, apagar
    // `/guias` do menu deixaria as duas asserções abaixo VERDES, que é o caso
    // exato que este teste existe para gritar.
    for (const href of ["/avaliacao", "/guias", "/sobre"]) {
      expect(ordem).toContain(href);
    }

    expect(ordem.indexOf("/guias")).toBeGreaterThan(ordem.indexOf("/avaliacao"));
    expect(ordem.indexOf("/guias")).toBeLessThan(ordem.indexOf("/sobre"));
  });

  /**
   * A trilha inteira, e não um degrau.
   *
   * A primeira versão usava `toContain` e a mutação provou que era teatro:
   * encurtando o degrau marcado para "Guias", continuava verde — "GUIAS" é
   * substring de "GUIAS MOTORS". Afirmar menos que a condição inteira deixa
   * passar exatamente o encurtamento que o teste existe para pegar.
   *
   * Aqui a comparação é INSENSÍVEL a caixa, e só aqui: `HOME` está escrito em
   * caixa alta no JSX das duas rotas enquanto o `BreadcrumbList` diz `Home`. O
   * degrau que importa já é comparado exatamente no teste acima, então uma
   * grafia esganiçada no schema não escapa por esta porta.
   */
  function concordam(html: string) {
    const marcada = degrausMarcados(html)
      .map((d) => d.name)
      .join(" / ");
    expect(trilhaVisivel(html).toUpperCase()).toBe(marcada.toUpperCase());
  }

  it("a trilha visível não diverge da marcada — índice", async () => concordam(await indice()));

  it("a trilha visível não diverge da marcada — ficha", async () =>
    concordam(await guiaRenderizado()));

  it("o `position` é a ordem do array, que é o que o teste acima assume", async () => {
    // A versão anterior ordenava por `position` e o comentário dizia que isso
    // protegia contra array e `position` discordarem. Não protegia nada:
    // `schemaDeTrilha` DERIVA `position: i + 1` do índice do array, então os
    // dois não podem divergir. O sort era inerte. A afirmação honesta é esta —
    // se a derivação mudar, é aqui que quebra, e não em silêncio.
    for (const html of [await indice(), await guiaRenderizado()]) {
      expect(degrausMarcados(html).map((d) => d.position)).toEqual(
        degrausMarcados(html).map((_, i) => i + 1),
      );
    }
  });

  it("o degrau da trilha não é escondido do leitor", async () => {
    // O docblock justifica esta trava dizendo que o Google compara o
    // `BreadcrumbList` com o que está NA TELA. `trilhaVisivel` lê o texto do
    // markup, e texto no markup não é texto na tela: trocar o degrau por
    // `<span className="sr-only">` deixava tudo verde com um degrau que
    // ninguém vê. `hidden lg:block` num breadcrumb responsivo é padrão desta
    // casa e cairia no mesmo buraco.
    for (const html of [await indice(), await guiaRenderizado()]) {
      expect(navDa(html)).not.toMatch(/class="[^"]*\b(sr-only|hidden)\b/);
    }
  });
});
