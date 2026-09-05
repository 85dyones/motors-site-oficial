import { describe, it, expect } from "vitest";
import {
  segmentarComLinks,
  TERMOS_COM_DESTINO,
  type SegmentoDeTexto,
} from "../src/lib/linksNoTexto";

/**
 * A segmentação que põe link no FAQ sem tocar no texto do FAQ.
 *
 * O risco desta função não é errar o link — é errar o TEXTO. As mesmas strings
 * que ela segmenta para a tela vão inteiras para o `FAQPage` do JSON-LD, e o
 * Google exige que o texto marcado seja idêntico ao visível. Uma segmentação
 * que perca uma vírgula, duplique uma palavra ou coma um espaço cria
 * divergência entre markup e página — que é violação de diretriz, não bug de
 * layout.
 *
 * Por isso o primeiro teste é o invariante, e ele roda contra as respostas
 * REAIS do repositório, não contra exemplos inventados aqui.
 */

/** O que o leitor vê, com os segmentos remontados. */
function texto(segmentos: SegmentoDeTexto[]): string {
  return segmentos.map((s) => s.texto).join("");
}

/** Os destinos que viraram link, na ordem. */
function destinos(segmentos: SegmentoDeTexto[]): string[] {
  return segmentos.filter((s) => s.href).map((s) => s.href!);
}

describe("o texto sobrevive à segmentação", () => {
  it("remontar os segmentos devolve a entrada, byte a byte", () => {
    const entradas = [
      "Dá para começar pela Avaliação Express, online.",
      "Sim, com financiamento e análise em múltiplos bancos.",
      "Todo veículo passa por perícia cautelar independente, e o laudo cautelar fica na ficha.",
      "Texto sem termo nenhum.",
      "",
      "financiamento",
      "  espaços  no  meio  e  nas  pontas  ",
    ];

    for (const entrada of entradas) {
      expect(texto(segmentarComLinks(entrada))).toBe(entrada);
    }
  });

  it("vale para toda resposta de FAQ que o repositório publica", async () => {
    const { PERGUNTAS_DE_GARANTIA, PERGUNTAS_DE_FINANCIAMENTO } = await import(
      "../src/lib/paginasInstitucionais"
    );
    const { PERGUNTAS_POR_CAMINHO } = await import("../src/lib/textoDosHubs");

    const respostas = [
      ...PERGUNTAS_DE_GARANTIA,
      ...PERGUNTAS_DE_FINANCIAMENTO,
      ...Object.values(PERGUNTAS_POR_CAMINHO).flat(),
    ].map((p) => p.resposta);

    // Se este numero cair para zero por uma renomeacao, o teste vira teatro.
    expect(respostas.length).toBeGreaterThan(10);
    for (const resposta of respostas) {
      expect(texto(segmentarComLinks(resposta))).toBe(resposta);
    }
  });
});

describe("quais termos viram link", () => {
  it("liga Avaliação Express à página de avaliação", () => {
    const segmentos = segmentarComLinks("Dá para começar pela Avaliação Express, online.");

    expect(destinos(segmentos)).toEqual(["/avaliacao"]);
    expect(segmentos.find((s) => s.href)?.texto).toBe("Avaliação Express");
  });

  it("liga laudo e perícia cautelar à garantia", () => {
    expect(destinos(segmentarComLinks("o laudo cautelar fica na ficha"))).toEqual(["/garantia"]);
    expect(destinos(segmentarComLinks("passa por perícia cautelar antes"))).toEqual(["/garantia"]);
  });

  it("casa sem diferenciar caixa, e preserva a caixa do texto", () => {
    const segmentos = segmentarComLinks("dá para começar pela avaliação express, online.");
    const link = segmentos.find((s) => s.href);

    expect(link?.href).toBe("/avaliacao");
    expect(link?.texto).toBe("avaliação express");
  });

  it("linka só a primeira ocorrência de cada termo", () => {
    const segmentos = segmentarComLinks(
      "Tem financiamento? O financiamento sai com análise, e o financiamento é aprovado em vários bancos.",
    );

    expect(destinos(segmentos)).toEqual(["/financiamento"]);
  });

  it("respeita limite de palavra — não linka dentro de outra palavra", () => {
    expect(destinos(segmentarComLinks("Fazemos refinanciamento de veículo."))).toEqual([]);
  });

  it("texto sem termo nenhum sai como um segmento só, sem link", () => {
    const segmentos = segmentarComLinks("Trabalhamos com seminovos em Curitiba.");

    expect(segmentos).toHaveLength(1);
    expect(segmentos[0].href).toBeUndefined();
  });
});

describe("a página não linka para si mesma", () => {
  it("o FAQ de /financiamento não vira link para /financiamento", () => {
    const resposta = "Sim, com financiamento e simulação na ficha do veículo.";

    expect(destinos(segmentarComLinks(resposta, "/financiamento"))).toEqual([]);
    expect(destinos(segmentarComLinks(resposta))).toEqual(["/financiamento"]);
  });

  it("o FAQ de /garantia não vira link para /garantia, mas ainda linka o resto", () => {
    const resposta = "O laudo cautelar fica na ficha. Dá para começar pela Avaliação Express.";

    expect(destinos(segmentarComLinks(resposta, "/garantia"))).toEqual(["/avaliacao"]);
  });

  it("suprimir o auto-link não altera o texto", () => {
    const resposta = "Sim, com financiamento e análise de crédito.";

    expect(texto(segmentarComLinks(resposta, "/financiamento"))).toBe(resposta);
  });
});

describe("a lista de termos", () => {
  it("não tem href duplicado apontando para caminho fora do site", () => {
    for (const destino of TERMOS_COM_DESTINO) {
      expect(destino.href.startsWith("/"), `${destino.termo} não é caminho interno`).toBe(true);
      expect(destino.termo.trim()).toBe(destino.termo);
    }
  });

  it("nenhum termo é substring de outro com destino diferente", () => {
    for (const a of TERMOS_COM_DESTINO) {
      for (const b of TERMOS_COM_DESTINO) {
        if (a === b || a.href === b.href) continue;
        expect(
          a.termo.toLowerCase().includes(b.termo.toLowerCase()),
          `"${b.termo}" dentro de "${a.termo}" com destinos diferentes`,
        ).toBe(false);
      }
    }
  });
});

describe("um destino, um link — mesmo com termos diferentes", () => {
  it("perícia cautelar e laudo cautelar na mesma frase dão UM link", () => {
    // Os dois termos apontam para `/garantia`. A revisão de 05/09 mostrou que
    // a supressão por página não pegava este caso, porque o filtro roda antes
    // do laço e nenhum dos dois estava no `Set` naquele momento.
    const segmentos = segmentarComLinks(
      "A perícia cautelar é independente e o laudo cautelar fica publicado assim que aprovado.",
    );

    expect(destinos(segmentos)).toEqual(["/garantia"]);
  });

  it("e o texto continua inteiro", () => {
    const frase = "A perícia cautelar é independente e o laudo cautelar fica publicado.";

    expect(texto(segmentarComLinks(frase))).toBe(frase);
  });

  it("destinos diferentes na mesma frase continuam saindo os dois", () => {
    const segmentos = segmentarComLinks(
      "A perícia cautelar vem antes, e a Avaliação Express cuida do seu usado.",
    );

    expect(destinos(segmentos).sort()).toEqual(["/avaliacao", "/garantia"]);
  });
});
