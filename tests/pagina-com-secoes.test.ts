import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PaginaDeEstoque from "../src/components/modernist/PaginaDeEstoque";

/**
 * Seções com `<h2>` dentro de uma página institucional.
 *
 * Existe por causa da `/garantia` revista em 2026-09-13 — *"rever este texto
 * do /garantia, alinhar com o restante das peças conforme o proposto"*. A
 * proposta do pacote (`conteudo-seo/pacote/paginas/garantia.md`) organiza a
 * página em H2 — a garantia, o que fazer se algo falhar, por que a perícia vem
 * antes —, e a introdução de `PaginaDeEstoque` é uma lista plana de
 * parágrafos. Seis parágrafos seguidos sob o `<h1>` não se escaneiam.
 *
 * O que este arquivo trava:
 *
 *   1. **Cada seção sai com `<h2>` e os seus parágrafos, na ordem.**
 *   2. **O texto das seções linka pela MESMA régua da introdução e do FAQ.**
 *      O `Set` do linkador atravessa as três partes, então cada destino vira
 *      link uma vez por página. Seção com linkador próprio repetiria o link —
 *      e o teste de dois links para o mesmo destino é o que pega isso.
 *   3. **Sem seções, nada muda.** A mesma `PaginaDeEstoque` serve cerca de
 *      cem páginas; a prop nova não pode acrescentar marcação a nenhuma delas.
 */

type Props = Parameters<typeof PaginaDeEstoque>[0];

const BASE: Props = {
  trilha: [{ rotulo: "Home", href: "/" }],
  titulo: "Garantia do seminovo",
  veiculos: [],
  contagem: false,
};

function desenhar(extra: Partial<Props>): string {
  return renderToStaticMarkup(createElement(PaginaDeEstoque, { ...BASE, ...extra }));
}

describe("seções da página institucional", () => {
  it("desenha cada seção com h2 e parágrafos, na ordem", () => {
    const html = desenhar({
      secoes: [
        {
          titulo: "A garantia da Motors Store",
          paragrafos: ["Primeiro parágrafo da seção.", "Segundo parágrafo da seção."],
        },
        { titulo: "O que fazer se algo falhar", paragrafos: ["Avise antes de mexer."] },
      ],
    });

    const primeira = html.indexOf(">A garantia da Motors Store</h2>");
    const segunda = html.indexOf(">O que fazer se algo falhar</h2>");
    const paragrafo = html.indexOf("Segundo parágrafo da seção.");

    // Guarda o -1 antes de comparar ordem: `indexOf` que não acha passa por
    // "menor que" qualquer coisa e deixaria a ordem verde sem a seção existir.
    expect(primeira).toBeGreaterThan(-1);
    expect(segunda).toBeGreaterThan(primeira);
    expect(paragrafo).toBeGreaterThan(primeira);
    expect(paragrafo).toBeLessThan(segunda);
  });

  it("uma seção sozinha também linka os termos que já são páginas", () => {
    const html = desenhar({
      secoes: [
        {
          titulo: "Por que a perícia vem antes",
          paragrafos: ["A perícia cautelar verifica estrutura, identificação e histórico."],
        },
      ],
    });

    expect(html).toContain('href="/garantia"');
  });

  it("linka pela mesma régua da introdução — um link por destino na página inteira", () => {
    const html = desenhar({
      introducao: ["Todo veículo passa por perícia cautelar independente."],
      secoes: [
        {
          titulo: "Por que a perícia vem antes",
          paragrafos: ["A perícia cautelar verifica estrutura, identificação e histórico."],
        },
      ],
    });

    // A seção TEM de estar na página antes de contar links. Sem esta linha o
    // teste passava com a seção ausente — um link só, da introdução — e ficava
    // verde justamente no caso em que não mede nada.
    expect(html).toContain(">Por que a perícia vem antes</h2>");
    expect(html.match(/href="\/garantia"/g) ?? []).toHaveLength(1);
  });

  it("sem seções, a página sai idêntica", () => {
    const sem = desenhar({ introducao: ["Texto de abertura."] });
    const vazia = desenhar({ introducao: ["Texto de abertura."], secoes: [] });

    expect(vazia).toBe(sem);
    expect(sem).not.toContain("<h2");
  });
});
