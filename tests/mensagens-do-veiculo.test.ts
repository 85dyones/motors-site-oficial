import { describe, it, expect } from "vitest";
import {
  mensagemDeDuvidas,
  mensagemDeInteresse,
  mensagemDeTestDrive,
  mensagemDeTroca,
  textoDeCompartilhamento,
} from "../src/lib/mensagensDoVeiculo";
import { nomeComAno } from "../src/lib/nomeDoVeiculo";

/**
 * As mensagens que o visitante manda para a loja pelo WhatsApp.
 *
 * ---------------------------------------------------------------------------
 * Por que saíram do `PDPClientWrapper`
 * ---------------------------------------------------------------------------
 * Mesma razão de `lib/tituloDaFicha.ts`, e o comentário de lá vale aqui: eram
 * seis interpolações dentro de handlers de clique de um componente de cliente,
 * e o único teste possível era procurar palavras no arquivo — que não percebe
 * quando o COMPORTAMENTO muda. As mensagens montavam
 * `${marca} ${modelo} ${ano}` cru, sem passar por `nomeDoVeiculo`, e por isso
 * traziam dois defeitos medidos no estoque em 2026-09-07:
 *
 *   Nissan March 1.6 Rio 2016 2016   ← o ano em dobro (`modelo` já o embute)
 *   Ford Ka 2020                     ← sem a versão, e existem TRÊS Ford Ka
 *
 * O segundo é o pior dos dois: a mensagem chega a uma pessoa, e o consultor
 * não tem como saber de qual Ka o cliente está falando.
 */

const MARCH = {
  marca: "Nissan",
  modelo: "March 1.6 Rio 2016",
  versao: "1.6 Rio 2016",
  ano: 2016,
};

/** Um dos três Ford Ka do pátio — o nome curto não distingue nenhum deles. */
const KA = {
  marca: "Ford",
  modelo: "Ka",
  versao: "Sedan 1.0 SE Flex 4p",
  ano: 2020,
};

/** O RevendaMais embute a versão no modelo na maior parte do estoque. */
const BMW = {
  marca: "BMW",
  modelo: "X4 M40i 3.0 M Sport Edit V6 Turbo Aut",
  versao: "m40i 3.0 m sport edit v6 turbo aut",
  ano: 2020,
};

/** Toda mensagem que nomeia o carro, para as regras valerem em todas. */
const TODAS = [
  ["interesse (à venda)", (v: typeof MARCH, ref?: string) => mensagemDeInteresse(v, "a-venda", ref)],
  ["interesse (vendido)", (v: typeof MARCH, ref?: string) => mensagemDeInteresse(v, "vendido", ref)],
  [
    "interesse (indisponível)",
    (v: typeof MARCH, ref?: string) => mensagemDeInteresse(v, "indisponivel", ref),
  ],
  ["dúvidas", mensagemDeDuvidas],
  ["troca", mensagemDeTroca],
  ["test-drive", mensagemDeTestDrive],
] as const;

describe("o carro tem um nome só, e é o mesmo da página", () => {
  it("nenhuma mensagem repete o ano que já está no modelo", () => {
    for (const [rotulo, montar] of TODAS) {
      expect(montar(MARCH), rotulo).not.toMatch(/2016\s+2016/);
    }
  });

  it("toda mensagem nomeia o carro como a ficha o nomeia", () => {
    // A condição inteira, e não uma grafia: qualquer mensagem que invente o
    // próprio jeito de escrever o nome volta a divergir da página.
    for (const [rotulo, montar] of TODAS) {
      for (const veiculo of [MARCH, KA, BMW]) {
        expect(montar(veiculo), `${rotulo} · ${veiculo.marca}`).toContain(nomeComAno(veiculo));
      }
    }
  });

  it("a mensagem distingue os três Ford Ka", () => {
    // Hoje sai "Ford Ka 2020" — e o pátio tem três. O consultor recebe a
    // mensagem sem saber de qual carro o cliente está falando.
    for (const [rotulo, montar] of TODAS) {
      expect(montar(KA), rotulo).toContain("Sedan 1.0 SE Flex 4p");
    }
  });

  it("não repete a versão que já está no modelo", () => {
    for (const [rotulo, montar] of TODAS) {
      const msg = montar(BMW).toLowerCase();
      const ocorrencias = msg.split("m40i 3.0 m sport edit v6 turbo aut").length - 1;
      expect(ocorrencias, `${rotulo} · repetiu a versão`).toBe(1);
    }
  });

  it("o sufixo de rastreamento vai no fim, quando existe", () => {
    for (const [rotulo, montar] of TODAS) {
      expect(montar(MARCH, " [ref: ag123]"), rotulo).toMatch(/\[ref: ag123\]$/);
      // Sem sufixo, a mensagem não pode terminar com espaço solto.
      expect(montar(MARCH), rotulo).toBe(montar(MARCH).trimEnd());
    }
  });
});

describe("cada mensagem diz a coisa certa", () => {
  it("carro à venda pergunta, em vez de declarar", () => {
    // Declaração recebe "um momento"; pergunta define a primeira resposta do
    // consultor. Regra que já estava no comentário do componente.
    expect(mensagemDeInteresse(KA, "a-venda")).toMatch(/\?$/);
  });

  it("vendido afirma a venda; indisponível NÃO afirma", () => {
    // A saída do feed não diz o motivo — pode ser repasse, reserva ou anúncio
    // expirado. O consultor não pode receber o cliente com uma venda que
    // talvez não tenha acontecido.
    expect(mensagemDeInteresse(KA, "vendido")).toContain("vendido");
    expect(mensagemDeInteresse(KA, "indisponivel")).not.toContain("vendido");
    expect(mensagemDeInteresse(KA, "indisponivel")).toContain("não está mais disponível");
  });

  it("as três variantes de interesse são textos distintos", () => {
    const textos = ["a-venda", "vendido", "indisponivel"].map((e) =>
      mensagemDeInteresse(KA, e as "a-venda"),
    );
    expect(new Set(textos).size).toBe(3);
  });
});

describe("a ficha usa estas funções — e não monta o nome por conta própria", () => {
  /**
   * A trava do PONTO DE CHAMADA.
   *
   * Sem ela, os testes acima ficam verdes com o componente revertido: eles
   * exercitam o módulo puro, e o defeito vivia na ficha. Foi assim que uma
   * função nova já passou semanas ao lado do código velho neste repositório.
   *
   * A asserção afirma a CONDIÇÃO inteira — nenhuma superfície monta o nome à
   * mão —, e não uma grafia proibida. `lerCodigo` desconta comentários: a nota
   * que explica a remoção cita o código removido.
   */
  const WRAPPER = "src/components/PDPClientWrapper.tsx";

  it("nenhuma mensagem interpola marca, modelo e ano à mão", async () => {
    const { lerCodigo } = await import("./fonte");
    const fonte = lerCodigo(WRAPPER);

    // Qualquer ordem, com ou sem parênteses/hífen entre modelo e ano.
    expect(fonte).not.toMatch(
      /\$\{veiculo\.marca\}\s*\$\{veiculo\.modelo\}\s*[-(\s]*\$\{veiculo\.ano\}/,
    );
  });

  it("os cinco textos saem do módulo", async () => {
    const { lerCodigo } = await import("./fonte");
    const fonte = lerCodigo(WRAPPER);

    for (const fn of [
      "mensagemDeInteresse",
      "mensagemDeDuvidas",
      "mensagemDeTroca",
      "mensagemDeTestDrive",
      "textoDeCompartilhamento",
    ]) {
      expect(fonte, `${fn} não é chamada na ficha`).toContain(`${fn}(`);
    }
  });

  it("o `ref` continua sendo lido no instante do clique", async () => {
    // `sufixoRef()` pode ser gravado depois da montagem da página: guardá-lo em
    // estado mandaria o valor velho. As chamadas passam a função invocada, não
    // uma variável de fora do handler.
    const { lerCodigo } = await import("./fonte");
    expect(lerCodigo(WRAPPER)).toMatch(/mensagemDeDuvidas\(veiculo,\s*sufixoRef\(\)\)/);
  });
});

describe("o texto de compartilhamento", () => {
  const PRECO = "R$ 318.900";
  const URL = "https://motorsstore.com.br/carros/bmw/x4/m40i-7947766";

  it("traz nome, preço e link", () => {
    const texto = textoDeCompartilhamento(BMW, { precoTexto: PRECO, url: URL });
    expect(texto).toContain(nomeComAno(BMW));
    expect(texto).toContain(PRECO);
    expect(texto).toContain(URL);
  });

  it("diz a versão UMA vez, nunca duas", () => {
    // A linha "📋 {versão}" saía sempre, e no BMW era cópia literal do que a
    // linha do carro já dizia — em caixa baixa, ainda por cima.
    const texto = textoDeCompartilhamento(BMW, { precoTexto: PRECO, url: URL }).toLowerCase();
    expect(texto.split("m40i 3.0 m sport edit v6 turbo aut").length - 1).toBe(1);
  });

  it("a versão continua no texto quando é ela que distingue o carro", () => {
    // Tirar a linha `📋` não pode custar a informação: no Ka ela é o que separa
    // um dos três. Ela sobrevive porque `nomeComAno` já a carrega.
    const texto = textoDeCompartilhamento(KA, { precoTexto: "R$ 62.900", url: URL });
    expect(texto).toContain("Sedan 1.0 SE Flex 4p");
    expect(texto.split("Sedan 1.0 SE Flex 4p").length - 1).toBe(1);
  });

  it("não repete o ano", () => {
    expect(textoDeCompartilhamento(MARCH, { precoTexto: "R$ 42.900", url: URL })).not.toMatch(
      /2016\s+2016/,
    );
  });
});
