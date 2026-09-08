import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings } from "../src/types";
import { RESUMO_DA_SECAO, TITULO_SEO_DA_SECAO } from "../src/lib/guias";
import { textoDeFabricaDaPagina } from "../src/lib/compartilhamento";

/**
 * O preview do card de compartilhamento diz o que o site publica.
 *
 * O texto de `/guias` passou a ser editável no painel em 07/09. Os textos de
 * fábrica de `PAGINAS_COMPARTILHAVEIS` continuam existindo como padrão do
 * código — e o preview lia SÓ eles. Quem editasse o parágrafo veria o site
 * mudar e o painel continuar mostrando o antigo.
 *
 * O defeito não é novo: o docblock de `tituloDaAba` em `CardsCompartilhamento`
 * já o descreve para a home, com a frase "sem isto o preview mostraria o texto
 * de fábrica e o site publicaria outro". O que era novo é que NADA guardava
 * aquilo — a revisão cortou a passagem da prop nos três pontos do caminho, um
 * de cada vez, e a suíte inteira ficou verde nos três.
 *
 * O que este arquivo cobre, e o que não cobre — a primeira versão desta lista
 * afirmava demais, e a revisão mediu:
 *
 *   · quem PRODUZ o valor (a página de configurações, no servidor) — coberto,
 *     inclusive contra passar outro valor não-nulo;
 *   · a DECISÃO de qual texto é o de fábrica — coberta na função pura, com os
 *     ramos de guias, de home e de qualquer outra página;
 *   · o CONSUMO pelo componente — coberto pelo ramo da home, que é o único
 *     alcançável por render (`selecionada` nasce `"home"`). A mesma linha serve
 *     os guias, então cortá-la derruba o teste;
 *   · o ELO DO MEIO — o `ConfiguracoesClientWrapper` repassando a prop —
 *     **não coberto**. São 1500 linhas presas a dois contextos, e montá-lo
 *     custaria mais que a linha que ele encaminha;
 *   · o ramo dos GUIAS dentro do componente — **não coberto** por render, pelo
 *     estado interno. Só pela função pura.
 *   · o `placeholder` do campo Descrição — **não cobrível**. Ele passou a ler
 *     `fabrica.descricao` (era `pagina.descricaoPadrao`, e este branch tornou
 *     essa linha falsa: na aba Guias com resumo gravado, o campo sugeria o
 *     texto do código enquanto a prévia logo abaixo mostrava o do banco). Para
 *     a HOME os dois são a mesma string — `textoDeFabricaDaPagina` só troca o
 *     título ali —, então a mutação é EQUIVALENTE no único ramo alcançável por
 *     render. Medido: trocar de volta deixa a suíte verde. A correção está
 *     certa por construção, e não por teste.
 */

const EMPRESA: CompanySettings = {
  name: "Motors Store",
  phone: "41 99737-2165",
  whatsapp: "41 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "Seg a sex 8h30-18h30",
  instagram: "",
  facebook: "",
  cnpj: "",
};

/** O que a tabela devolve. `null` = sem override, o estado de entrega. */
let linha: { titulo_seo: string | null; resumo: string | null } | null = null;

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: linha, error: null }) }) }),
    }),
  },
}));

describe("a página de configurações resolve o cabeçalho e passa adiante", () => {
  /**
   * O server component é chamado DIRETO, e o elemento inspecionado.
   *
   * É o que permite afirmar sobre uma prop: `renderToStaticMarkup` devolveria
   * texto, e prop não vira texto. A página é `async`, então chamá-la é só
   * esperar — e o que volta é a árvore, com o `<Suspense>` por fora.
   */
  async function propDaTela(): Promise<unknown> {
    const { default: Pagina } = await import("../src/app/admin/configuracoes/page");
    const arvore = (await Pagina({ searchParams: Promise.resolve({}) })) as ReactElement<{
      children: ReactElement<{ cabecalhoDosGuias?: unknown }>;
    }>;
    return arvore.props.children.props.cabecalhoDosGuias;
  }

  it("sem override, passa o texto do código", async () => {
    linha = null;

    expect(await propDaTela()).toEqual({
      tituloSeo: TITULO_SEO_DA_SECAO,
      resumo: RESUMO_DA_SECAO,
    });
  });

  it("com override, passa o texto do painel", async () => {
    linha = { titulo_seo: "Editado na mão", resumo: "Parágrafo editado." };

    expect(await propDaTela()).toEqual({
      tituloSeo: "Editado na mão",
      resumo: "Parágrafo editado.",
    });
  });
});

describe("o texto de fábrica de cada página", () => {
  const PAGINA = { tituloPadrao: "Título do código", descricaoPadrao: "Descrição do código" };
  const CABECALHO = { tituloSeo: "Título do painel", resumo: "Parágrafo do painel." };

  it("guias: usa o cabeçalho editado, título e parágrafo", () => {
    expect(
      textoDeFabricaDaPagina({ id: "guias", pagina: PAGINA, cabecalhoDosGuias: CABECALHO }),
    ).toEqual({ titulo: "Título do painel", descricao: "Parágrafo do painel." });
  });

  it("guias: sem cabeçalho editado, cai no texto do código", () => {
    expect(textoDeFabricaDaPagina({ id: "guias", pagina: PAGINA })).toEqual({
      titulo: "Título do código",
      descricao: "Descrição do código",
    });
  });

  it("guias: campo em branco no painel não publica vazio", () => {
    // Em branco significa "não escrevi", e não "publique nada". Sem o `trim()`
    // o card do WhatsApp sairia sem título.
    expect(
      textoDeFabricaDaPagina({
        id: "guias",
        pagina: PAGINA,
        cabecalhoDosGuias: { tituloSeo: "   ", resumo: "" },
      }),
    ).toEqual({ titulo: "Título do código", descricao: "Descrição do código" });
  });

  it("home: continua usando a frase da aba, que é o comportamento antigo", () => {
    // Este ramo é anterior a 07/09 e também não tinha trava — a mesma mutação
    // que apagava o dos guias apagava o dele.
    expect(
      textoDeFabricaDaPagina({ id: "home", pagina: PAGINA, tituloDaAba: "Frase da aba" }),
    ).toEqual({ titulo: "Frase da aba", descricao: "Descrição do código" });
  });

  it("outra página qualquer ignora os dois e usa o texto do código", () => {
    expect(
      textoDeFabricaDaPagina({
        id: "sobre",
        pagina: PAGINA,
        tituloDaAba: "Frase da aba",
        cabecalhoDosGuias: CABECALHO,
      }),
    ).toEqual({ titulo: "Título do código", descricao: "Descrição do código" });
  });
});

describe("o componente CONSOME a fábrica, e não a constante", () => {
  /**
   * O ramo alcançável por render é o da HOME, porque `selecionada` nasce
   * `"home"`. É pouco, e é o suficiente para a mutação que importa: trocar a
   * chamada de `textoDeFabricaDaPagina` por `{titulo: pagina.tituloPadrao, …}`
   * derruba este teste — e é a MESMA linha que serve o ramo dos guias.
   *
   * A revisão anterior tinha razão em reprovar o que estava aqui: um
   * `toContain("Motors Store")` que é verdadeiro com ou sem a prop ser usada,
   * vendido como asserção de consumo. Isto aqui não é isso: o texto afirmado só
   * aparece se o componente tiver passado pela função.
   *
   * O ramo dos guias em si continua inalcançável por render (estado interno,
   * sem harness de interação) — quem o prova é o bloco de cima, na função pura.
   */
  async function card(props: {
    tituloDaAba?: string;
    cabecalhoDosGuias?: { tituloSeo: string; resumo: string };
  }): Promise<string> {
    const { default: Cards } = await import("../src/components/admin/CardsCompartilhamento");
    return renderToStaticMarkup(
      createElement(Cards, {
        valor: {},
        nomeLoja: EMPRESA.name,
        ...props,
        aoEnviarImagem: async () => "",
        aoSalvar: async () => {},
      }),
    );
  }

  it("a frase da aba chega ao preview da home", async () => {
    const html = await card({ tituloDaAba: "Frase da aba escrita no painel" });

    expect(html).toContain("Frase da aba escrita no painel");
  });

  it("sem a frase da aba, aparece o texto de fábrica da home", async () => {
    // Controle: prova que o teste acima mede a passagem pela função, e não algo
    // que apareceria de qualquer jeito.
    const html = await card({});

    expect(html).not.toContain("Frase da aba escrita no painel");
  });

  it("a prop dos guias não derruba a montagem", async () => {
    expect(await card({ cabecalhoDosGuias: { tituloSeo: "T", resumo: "R" } })).toContain(
      "Motors Store",
    );
  });
});
