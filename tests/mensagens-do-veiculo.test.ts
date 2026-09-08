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
 * As mensagens de WhatsApp da ficha nomeiam o carro como a página o nomeia.
 *
 * Medido no estoque em 2026-09-07, nos 38 publicados à venda: duas mensagens
 * jogavam fora a versão, que está preenchida e correta no banco —
 *
 *   8059102   "Ford Ka 2020"      perde  "Sedan 1.0 SE Flex 4p"
 *   8243644   "Honda HR-V 2016"   perde  "EX 1.8 Flexone 16v 5p Aut"
 *
 * — e o pátio tem TRÊS Ford Ka. A mensagem chega a uma pessoa: o consultor
 * recebia o pedido sem saber de qual carro se tratava.
 */

/** Um dos três Ford Ka do pátio — o nome curto não distingue nenhum deles. */
const KA = {
  marca: "Ford",
  modelo: "Ka",
  versao: "Sedan 1.0 SE Flex 4p",
  ano: 2020,
};

/** O outro caso real: a versão vive fora do modelo. */
const HRV = {
  marca: "Honda",
  modelo: "HR-V",
  versao: "EX 1.8 Flexone 16v 5p Aut",
  ano: 2016,
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
  ["interesse (à venda)", (v: typeof KA, ref?: string) => mensagemDeInteresse(v, "a-venda", ref)],
  ["interesse (vendido)", (v: typeof KA, ref?: string) => mensagemDeInteresse(v, "vendido", ref)],
  [
    "interesse (indisponível)",
    (v: typeof KA, ref?: string) => mensagemDeInteresse(v, "indisponivel", ref),
  ],
  ["dúvidas", mensagemDeDuvidas],
  ["troca", mensagemDeTroca],
  ["test-drive", mensagemDeTestDrive],
] as const;

describe("o carro tem um nome só, e é o mesmo da página", () => {
  it("toda mensagem nomeia o carro como a ficha o nomeia", () => {
    // A condição inteira, e não uma grafia: qualquer mensagem que invente o
    // próprio jeito de escrever o nome volta a divergir da página.
    for (const [rotulo, montar] of TODAS) {
      for (const veiculo of [KA, HRV, BMW]) {
        expect(montar(veiculo), `${rotulo} · ${veiculo.marca}`).toContain(nomeComAno(veiculo));
      }
    }
  });

  it("a mensagem distingue os três Ford Ka", () => {
    // O defeito, no caso em que ele custa dinheiro: sem a versão, o consultor
    // recebe "Ford Ka 2020" e o pátio tem três.
    for (const [rotulo, montar] of TODAS) {
      expect(montar(KA), rotulo).toContain("Sedan 1.0 SE Flex 4p");
      expect(montar(HRV), rotulo).toContain("EX 1.8 Flexone 16v 5p Aut");
    }
  });

  it("não repete a versão que já está no modelo", () => {
    // A dedupe de `nomeDoVeiculo` tem de sobreviver à mudança: o BMW não pode
    // sair com a versão duas vezes.
    for (const [rotulo, montar] of TODAS) {
      const msg = montar(BMW).toLowerCase();
      const ocorrencias = msg.split("m40i 3.0 m sport edit v6 turbo aut").length - 1;
      expect(ocorrencias, `${rotulo} · repetiu a versão`).toBe(1);
    }
  });

  it("o sufixo de rastreamento vai no fim, quando existe", () => {
    for (const [rotulo, montar] of TODAS) {
      expect(montar(KA, " [ref: ag123]"), rotulo).toMatch(/\[ref: ag123\]$/);
      // Sem sufixo, a mensagem não pode terminar com espaço solto.
      expect(montar(KA), rotulo).toBe(montar(KA).trimEnd());
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
   * exercitam o módulo puro, e o defeito vivia na ficha. Já aconteceu neste
   * repositório de uma função nova passar semanas ao lado do código velho.
   *
   * A primeira versão desta trava era uma regex de ADJACÊNCIA
   * (`marca` → `modelo` → ano), e a revisão a derrubou: bastou inserir
   * `${veiculo.marca} ${veiculo.modelo} ${veiculo.versao} ${veiculo.ano}` —
   * com a versão no meio — para os 13 testes ficarem verdes. A trava protegia
   * os cinco pontos existentes e não impedia um sexto, que era exatamente o
   * caso vivo no mesmo arquivo (`vehicleName` e `vehicleInfo`).
   *
   * Agora a régua é outra e vale para o arquivo inteiro: **nenhum literal de
   * template pode citar marca e ano juntos**. Quem nomeia o carro com o ano
   * está montando o nome, e isso é trabalho do módulo. O `alt` das imagens usa
   * marca + modelo SEM ano e continua livre, que é o recorte certo.
   *
   * `lerCodigo` desconta comentários: a nota que explica a remoção cita o
   * código removido.
   */
  const WRAPPER = "src/components/PDPClientWrapper.tsx";

  it("nenhum texto do arquivo monta o nome do carro com o ano", async () => {
    const { lerCodigo } = await import("./fonte");

    const literais = lerCodigo(WRAPPER).match(/`[^`]*`/g) ?? [];
    const infratores = literais.filter(
      (l) => l.includes("veiculo.marca") && l.includes("veiculo.ano"),
    );

    expect(infratores, "monte o nome em lib/mensagensDoVeiculo.ts").toEqual([]);
  });

  it("a calculadora de financiamento recebe o nome COMPLETO", async () => {
    /* A sétima mensagem da ficha, e a que eu não tinha visto:
       `CalculadoraFinanciamento` monta "Olá! Tenho interesse no {vehicleName}
       e fiz uma simulação…" — a ação de maior intenção da página. A prop
       recebia `${marca} ${modelo}`: sem versão E sem ano, pior que as outras
       seis.

       ⚠️ A régua do teste acima (marca + ano no mesmo literal) NÃO pega este
       caso, porque o literal antigo não citava o ano. Provado por mutação. Daí
       a asserção específica: a prop não pode ser texto montado à mão. */
    const { lerCodigo } = await import("./fonte");
    const fonte = lerCodigo(WRAPPER);

    expect(fonte).toContain("vehicleName={nomeComAno(veiculo)}");
    expect(fonte, "vehicleName voltou a ser montado à mão").not.toMatch(/vehicleName=\{`/);
  });

  it("o modal de lead recebe a versão, para a saída do captcha nomear o carro", async () => {
    /* `vehicleInfo` alimenta a mensagem que o `SaidaDoCaptcha` manda para o
       WhatsApp quando o Turnstile bloqueia o visitante — caminho alcançável
       sempre que o desafio falha. Ia sem a versão. */
    const { lerCodigo } = await import("./fonte");
    const bloco = lerCodigo(WRAPPER).split("vehicleInfo={{")[1] ?? "";

    expect(bloco, "vehicleInfo não é mais passado na ficha").not.toBe("");
    expect(bloco.slice(0, 200)).toContain("versao: veiculo.versao");
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
});
