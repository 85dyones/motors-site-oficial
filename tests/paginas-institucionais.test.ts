import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";
import {
  GARANTIA_MESES,
  PERGUNTAS_DE_FINANCIAMENTO,
  PERGUNTAS_DE_GARANTIA,
  TEXTO_DE_FINANCIAMENTO,
  TEXTO_DE_GARANTIA,
} from "../src/lib/paginasInstitucionais";
import { PROCEDENCIA_PADRAO } from "../src/lib/procedencia";

/**
 * `/financiamento` e `/garantia` — as duas páginas em que cada frase é uma
 * promessa pública da loja.
 *
 * Este arquivo não testa comportamento: testa **o que o site tem permissão de
 * afirmar**. É o tipo de coisa que se degrada por acréscimo — alguém acrescenta
 * "taxa a partir de 0,99%" numa terça-feira e ninguém percebe até virar
 * reclamação. Os limites aqui saem de `conteudo-seo/POSICIONAMENTO.md`, da
 * regulação de publicidade de crédito e do CDC.
 */

const TEXTO_INTEIRO = [
  ...TEXTO_DE_FINANCIAMENTO,
  ...TEXTO_DE_GARANTIA,
  ...PERGUNTAS_DE_FINANCIAMENTO.flatMap((p) => [p.pergunta, p.resposta]),
  ...PERGUNTAS_DE_GARANTIA.flatMap((p) => [p.pergunta, p.resposta]),
].join(" ");

describe("financiamento não promete o que depende do banco", () => {
  it("nenhuma taxa, percentual ou parcela fechada no texto", () => {
    // Página com valor de parcela exige CET, quantidade e valor total pela
    // regulação de publicidade de crédito (§1.4b). Quem entrega os três, com o
    // aviso de que a taxa varia, é o simulador — não a prosa em volta dele.
    const financiamento = [
      ...TEXTO_DE_FINANCIAMENTO,
      ...PERGUNTAS_DE_FINANCIAMENTO.flatMap((p) => [p.pergunta, p.resposta]),
    ].join(" ");

    expect(financiamento).not.toMatch(/\d+[,.]\d+\s*%/);
    expect(financiamento).not.toMatch(/a partir de\s*R\$/i);
    expect(financiamento).not.toMatch(/\bR\$\s*\d/);
  });

  it("não promete aprovação", () => {
    expect(TEXTO_INTEIRO).not.toMatch(/aprova(ção|do)\s+(garantid|cert|imediat)/i);
    expect(TEXTO_INTEIRO).not.toMatch(/todos\s+(são\s+)?aprovad/i);
    expect(TEXTO_INTEIRO).not.toMatch(/nome sujo|negativad/i);
  });

  it("diz explicitamente que a simulação é estimativa", () => {
    const financiamento = [
      ...TEXTO_DE_FINANCIAMENTO,
      ...PERGUNTAS_DE_FINANCIAMENTO.map((p) => p.resposta),
    ].join(" ");

    expect(financiamento).toMatch(/estimativa/i);
    expect(financiamento).toMatch(/análise de crédito/i);
  });

  it("o simulador da página é o mesmo da ficha, com o mesmo aviso", () => {
    // Duas calculadoras significariam duas tabelas de taxa envelhecendo em
    // ritmos diferentes na mesma loja.
    expect(lerCodigo("src/components/SimuladorDeFinanciamento.tsx")).toMatch(
      /import\("\.\/CalculadoraFinanciamento"\)/,
    );
    expect(ler("src/components/CalculadoraFinanciamento.tsx")).toMatch(/TAC e IOF/);
  });
});

describe("garantia afirma o prazo sem vendê-lo como vantagem", () => {
  it("declara os três meses", () => {
    expect(GARANTIA_MESES).toBe(3);
    expect(TEXTO_DE_GARANTIA.join(" ")).toMatch(/três meses/i);
  });

  it("diz que a cobertura SOMA aos direitos do consumidor", () => {
    // 90 dias é o mínimo legal para venda por pessoa jurídica. Apresentar a
    // garantia como se substituísse o CDC seria errado — e apresentá-la como
    // grande diferencial soa ingênuo para quem pesquisou
    // (`conteudo-seo/POSICIONAMENTO.md`).
    const garantia = TEXTO_DE_GARANTIA.join(" ");

    expect(garantia).toMatch(/soma-se aos seus direitos/i);
    // A negativa precisa estar escrita: "soma-se" sozinho é ambíguo para quem
    // lê rápido, e a frase que resolve a ambiguidade é justamente a que um
    // revisor apressado corta por achar redundante.
    expect(garantia).toMatch(/não os substitui/i);
  });

  it("não usa os três meses como argumento de superioridade", () => {
    expect(TEXTO_DE_GARANTIA.join(" ")).not.toMatch(
      /maior garantia|melhor garantia|garantia estendida|exclusiv/i,
    );
  });

  it("NÃO lista exclusões", () => {
    // Afirmar condição contratual que este arquivo não tem como confirmar é
    // passivo nos dois sentidos: prometer o que a loja não cumpre, ou negar o
    // que ela cobre. A página delimita o escopo e remete ao termo da venda.
    const garantia = [
      ...TEXTO_DE_GARANTIA,
      ...PERGUNTAS_DE_GARANTIA.map((p) => p.resposta),
    ].join(" ");

    expect(garantia).not.toMatch(/não cobre|excluí|exceto|salvo/i);
    expect(garantia).toMatch(/termo/i);
  });

  it("o escopo é o mesmo que a ficha do veículo já anuncia", () => {
    // A faixa de procedência da PDP diz "Garantia de motor e câmbio". Duas
    // versões da mesma promessa no mesmo site é como o cliente descobre no
    // balcão que uma delas não vale.
    const daFicha = PROCEDENCIA_PADRAO.find((i) => i.id === "garantia");

    expect(daFicha?.titulo).toMatch(/motor e câmbio/i);
    expect(TEXTO_DE_GARANTIA.join(" ")).toMatch(/motor e câmbio/i);
    expect(TEXTO_DE_GARANTIA.join(" ")).toMatch(/sem carência e sem franquia/i);
  });

  it("a página reaproveita a faixa de procedência em vez de reescrevê-la", () => {
    expect(lerCodigo("src/app/garantia/page.tsx")).toMatch(/normalizarProcedencia\(settings\.procedencia\)/);
  });
});

describe("vocabulário da casa", () => {
  it('nenhuma das duas páginas usa "premium"', () => {
    // Decisão de 2026-08-17: a mediana do estoque é R$ 65.900 e "premium"
    // aplicado a um carro de R$ 27 mil é mentira pequena que o comprador
    // percebe na primeira linha.
    expect(TEXTO_INTEIRO).not.toMatch(/premium/i);
  });

  it("o diferencial afirmado é a seleção, não o mínimo legal", () => {
    expect(TEXTO_DE_GARANTIA.join(" ")).toMatch(/três entram/i);
    expect(TEXTO_DE_GARANTIA.join(" ")).toMatch(/perícia cautelar independente/i);
  });
});
