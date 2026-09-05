import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PaginaDeEstoque from "../src/components/modernist/PaginaDeEstoque";

/**
 * O FAQ renderizado — a fiação, não a função.
 *
 * `links-no-texto-do-faq` cobre `segmentarComLinks` com 13 casos, e nenhum
 * deles nota se o componente parou de chamá-la. É o padrão que a memória do
 * projeto já registra duas vezes: extrair a lógica para uma lib deixa a função
 * com bateria completa e a chamada sem ninguém. Trocar o `<dd>` de volta para
 * `{item.resposta}` mantém a página correta, o texto idêntico e todos os
 * testes da lib verdes — e apaga os links de ~50 páginas de uma vez.
 *
 * Este arquivo renderiza a página de verdade e conta as âncoras que saem
 * DENTRO da lista de perguntas.
 */

const FAQ = [
  {
    pergunta: "Vocês aceitam meu carro na troca?",
    resposta: "Aceitamos. Dá para começar pela Avaliação Express, online.",
  },
  {
    pergunta: "Os carros têm laudo?",
    resposta: "Sim. Todo veículo passa por perícia cautelar independente antes da vitrine.",
  },
  {
    pergunta: "Tem financiamento?",
    resposta: "Sim, com financiamento aprovado em múltiplos bancos.",
  },
];

function pagina(caminho?: string): string {
  return renderToStaticMarkup(
    createElement(PaginaDeEstoque, {
      trilha: [{ rotulo: "Home", href: "/" }],
      titulo: "Página de teste",
      veiculos: [],
      faq: FAQ,
      contagem: false,
      caminho,
    }),
  );
}

/** Só o pedaço da página que é a lista de perguntas. */
function blocoDoFaq(html: string): string {
  const inicio = html.indexOf("<dl");
  const fim = html.indexOf("</dl>");
  expect(inicio, "a lista de perguntas não foi renderizada").toBeGreaterThan(-1);
  return html.slice(inicio, fim);
}

function hrefs(trecho: string): string[] {
  return [...trecho.matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);
}

describe("as respostas do FAQ linkam para as páginas que citam", () => {
  it("os três destinos aparecem como âncora dentro do FAQ", () => {
    const dentroDoFaq = hrefs(blocoDoFaq(pagina()));

    expect(dentroDoFaq).toContain("/avaliacao");
    expect(dentroDoFaq).toContain("/garantia");
    expect(dentroDoFaq).toContain("/financiamento");
  });

  it("o texto visível continua exatamente o texto da resposta", () => {
    // O que o leitor vê, com as tags removidas — precisa bater com a string que
    // vai para o `FAQPage` do JSON-LD. Divergência aqui é violação de diretriz.
    const visivel = blocoDoFaq(pagina())
      .replace(/<[^>]+>/g, "")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");

    for (const item of FAQ) {
      expect(visivel, `resposta alterada: ${item.pergunta}`).toContain(item.resposta);
    }
  });

  it("a página não linka para si mesma", () => {
    const dentroDoFaq = hrefs(blocoDoFaq(pagina("/financiamento")));

    expect(dentroDoFaq).not.toContain("/financiamento");
    expect(dentroDoFaq).toContain("/avaliacao");
  });

  it("sem FAQ, nenhuma âncora é inventada", () => {
    const html = renderToStaticMarkup(
      createElement(PaginaDeEstoque, {
        trilha: [{ rotulo: "Home", href: "/" }],
        titulo: "Sem perguntas",
        veiculos: [],
        faq: [],
        contagem: false,
      }),
    );

    expect(html).not.toContain("<dl");
  });
});

describe("a introdução também linka", () => {
  it("um parágrafo de abertura que cita a Avaliação Express vira link", () => {
    const html = renderToStaticMarkup(
      createElement(PaginaDeEstoque, {
        trilha: [{ rotulo: "Home", href: "/" }],
        titulo: "Financiamento",
        veiculos: [],
        introducao: [
          "Seu carro atual entra como entrada. A Avaliação Express devolve uma proposta pelo WhatsApp.",
        ],
        contagem: false,
        caminho: "/financiamento",
      }),
    );

    // O parágrafo, não o FAQ: é onde a menção mais valiosa de /financiamento
    // mora, e o primeiro corte desta entrega deixou de fora.
    expect(hrefs(html)).toContain("/avaliacao");
  });

  it("a introdução preserva o texto do parágrafo", () => {
    const paragrafo = "Trabalhamos com financiamento e perícia cautelar em todo o estoque.";
    const html = renderToStaticMarkup(
      createElement(PaginaDeEstoque, {
        trilha: [{ rotulo: "Home", href: "/" }],
        titulo: "Teste",
        veiculos: [],
        introducao: [paragrafo],
        contagem: false,
      }),
    );

    const visivel = html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
    expect(visivel).toContain(paragrafo);
  });
});
