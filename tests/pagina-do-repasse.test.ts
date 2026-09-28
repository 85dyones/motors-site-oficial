import { describe, it, expect } from "vitest";
import * as pagina from "../src/lib/paginaDoRepasse";
import { termosProibidosEm } from "../src/lib/checklistDoRepasse";
import { PRAZO_DA_GARANTIA } from "../src/lib/paginasInstitucionais";
import { lerCodigo } from "./fonte";
import { FUNCOES_COM_AMOSTRA, todoOTextoDoRepasse } from "./textoDoRepasse";

/**
 * As travas da spec §9 sobre o texto da seção de repasse — TUDO o texto de
 * `paginaDoRepasse.ts`, o fixo e o que as funções montam com dado.
 *
 * As regras são do dono (24/09): nunca "não girou" nem os rótulos antigos;
 * nada de CDC, direitos, "%", "a partir de R$", "premium", "exclusivo",
 * "melhor preço" ou "consulte"; a garantia do estoque só pela constante; e o
 * laudo nunca publicado — quando o texto diz que ele sai, diz que sai A PEDIDO
 * (decisão 1 do PR 3: a regra literal "todo laudo vem com a pedido" barraria
 * "Cada anúncio diz se o carro tem laudo cautelar", que é da prancha).
 */
const TUDO = todoOTextoDoRepasse();
const FRASES = TUDO.flatMap((texto) => texto.split(/(?<=[.!?;])\s+/));

describe("a leitura alcança o texto (controle)", () => {
  it("recolhe o fixo e o montado", () => {
    expect(TUDO.length).toBeGreaterThan(150);
    expect(TUDO).toContain("Carros de repasse em Curitiba");
    expect(TUDO).toContain(pagina.LISTA_DO_REPASSE.consentimento);
    expect(TUDO).toContain("A conta do Renault Kwid Zen 1.0 2021");
  });

  it("toda função exportada tem amostra no ajudante", () => {
    const funcoes = Object.entries(pagina)
      .filter(([, valor]) => typeof valor === "function")
      .map(([nome]) => nome)
      .sort();
    expect(funcoes).toEqual([...FUNCOES_COM_AMOSTRA].sort());
  });
});

describe("os termos que o repasse não usa", () => {
  it("nenhum da lista do painel (venda e jurídico)", () => {
    const achados = TUDO.flatMap((texto) => termosProibidosEm(texto).map((termo) => `${termo}: ${texto}`));
    expect(achados).toEqual([]);
  });

  it("nem os da §9 que a lista do painel não cobre", () => {
    for (const texto of TUDO) {
      expect(texto, texto).not.toMatch(/%/);
      expect(texto, texto).not.toMatch(/\bdireitos?\b/i);
      expect(texto, texto).not.toMatch(/\bconsulte\b/i);
      expect(texto, texto).not.toMatch(/\bexclusiv/i);
    }
  });

  it("a prancha antiga da lista não voltou", () => {
    expect(TUDO.join(" ")).not.toContain("Ao enviar, você concorda");
  });
});

describe("a garantia do estoque só aparece pela constante", () => {
  it("o arquivo não digita o prazo", () => {
    const codigo = lerCodigo("src/lib/paginaDoRepasse.ts");
    expect(codigo).not.toMatch(/tr[êe]s\s+meses/i);
    expect(codigo).not.toMatch(/5\.000/);
    expect(codigo).not.toMatch(/quil[ôo]metros/i);
  });

  it("toda frase que cita meses cita o prazo inteiro", () => {
    const comMeses = TUDO.filter((texto) => /meses/i.test(texto));
    expect(comMeses.length).toBeGreaterThanOrEqual(4);
    for (const texto of comMeses) {
      expect(texto.toLowerCase(), texto).toContain(PRAZO_DA_GARANTIA.toLowerCase());
    }
  });
});

describe("o laudo sai a pedido", () => {
  it("nunca publicado, disponível, online ou anexo, e nunca para baixar ou ver", () => {
    for (const frase of FRASES) {
      expect(frase, frase).not.toMatch(/laudo[^.!?]{0,60}\b(publicad|dispon[íi]ve|online|anex)/i);
      expect(frase, frase).not.toMatch(/\b(baixar|baixe|ver|veja|abrir|abra)\s+o\s+laudo\b/i);
    }
  });

  it("toda frase que diz que o laudo sai diz que sai a pedido", () => {
    const saem = FRASES.filter((frase) => /\blaudo\b/i.test(frase) && /\bsai\b/i.test(frase));
    expect(saem.length).toBeGreaterThanOrEqual(4);
    for (const frase of saem) expect(frase, frase).toMatch(/a pedido/i);
  });
});

describe("o texto é o das pranchas", () => {
  it("as onze perguntas, na ordem da prancha", () => {
    expect(pagina.PERGUNTAS_DO_REPASSE.map((p) => p.pergunta)).toEqual([
      "O que é um carro de repasse?",
      "O mesmo carro pode estar no estoque e no repasse?",
      "O que muda entre um repasse com laudo e um sem laudo?",
      "Por que o repasse custa menos?",
      "Carro de repasse tem garantia?",
      "O que é a ficha de estado?",
      "Posso levar o carro ao meu mecânico?",
      "Dá para financiar ou dar meu carro na troca?",
      "Quem faz a transferência?",
      "Tem carro de leilão ou com sinistro?",
      "Sou lojista. O que muda para mim?",
    ]);
    expect(pagina.PERGUNTAS_DO_REPASSE[0].resposta).toBe(
      "É o carro que a loja vende no estado em que está: funcionando, mas sem preparar e sem a garantia da loja, por um preço abaixo da FIPE. Cada anúncio diz se o carro tem laudo cautelar e, quando há reparo pendente, quanto ele custa.",
    );
    expect(pagina.PERGUNTAS_DO_REPASSE[1].resposta).toBe(
      "Pode. No estoque, ele é entregue com os reparos feitos e com a garantia da loja, pelo preço de loja. No repasse, sai como está, funcionando, sem os reparos e sem a garantia, e por isso custa menos. Nos dois casos você vê o carro no pátio antes de fechar.",
    );
    expect(pagina.PERGUNTAS_DO_REPASSE[4].resposta).toBe(
      `Não tem a garantia da loja, a de ${PRAZO_DA_GARANTIA}, que vale para o estoque. O carro funciona, e o estado dele você confere no pátio, com o seu mecânico, antes de fechar.`,
    );
  });

  it("a linha de consentimento é a da §7.4", () => {
    expect(pagina.LISTA_DO_REPASSE.consentimento).toBe(
      "Ao entrar na lista, você aceita receber avisos de repasse pelo WhatsApp e pode sair quando quiser.",
    );
    expect(pagina.LISTA_DO_REPASSE.politica).toBe("Política de privacidade");
  });

  it("a descrição de busca e compartilhamento", () => {
    expect(pagina.DESCRICAO_DO_REPASSE).toBe(
      "Carros funcionando, vendidos no estado: sem os reparos feitos e sem a garantia da loja, por isso abaixo da FIPE. Você confere o carro no pátio antes de fechar.",
    );
  });

  it("o herói, as provas, a tabela e os passos", () => {
    expect(pagina.HEROI_DO_REPASSE.texto).toBe(
      "Carros funcionando, vendidos no estado em que estão: sem os reparos feitos e sem a garantia da loja, por isso abaixo da FIPE. Cada anúncio diz se o carro tem laudo cautelar e mostra a conta, e você confere tudo no pátio antes de fechar.",
    );
    expect(pagina.PROVAS_DO_REPASSE.itens.map((p) => p.titulo)).toEqual([
      "Com laudo ou sem laudo",
      "A conta aberta",
      "A ficha de estado",
      "Exame no pátio",
    ]);
    expect(pagina.REPASSE_OU_ESTOQUE.texto).toBe(
      "O mesmo carro pode estar nos dois lugares. No estoque, ele sai com os reparos feitos e com a garantia da loja. No repasse, sai como está, funcionando, sem essa garantia e por um preço menor.",
    );
    expect(pagina.REPASSE_OU_ESTOQUE.linhas.map((l) => l.tema)).toEqual([
      "Preço",
      "Garantia da loja",
      "Estado do carro",
      "Pagamento",
      "Transferência",
      "Antes de comprar",
    ]);
    const estadoDoCarro = pagina.REPASSE_OU_ESTOQUE.linhas.find((l) => l.tema === "Estado do carro")!;
    expect(estadoDoCarro.repasse).toBe(
      "Funcionando, no estado em que está, sem os reparos feitos. O anúncio diz se tem laudo cautelar, e a ficha de estado lista os defeitos conhecidos",
    );
    expect(estadoDoCarro.estoque).toBe(
      "Com os reparos feitos e aprovado na perícia cautelar independente antes de entrar na vitrine",
    );
    expect(pagina.COMO_COMPRAR.passos.map((p) => p.titulo)).toEqual([
      "Escolha",
      "Pergunte",
      "Examine no pátio",
      "Pague e transfira",
    ]);
    expect(pagina.PRECISA_FINANCIAR.texto).toBe(
      `Precisa financiar ou quer garantia? O estoque tem carros com garantia de ${PRAZO_DA_GARANTIA}.`,
    );
  });

  it("a ficha diz que o carro funciona, no destaque do que não vem", () => {
    expect(pagina.FICHA_DO_REPASSE.naoVemDestaque).toBe("O carro funciona, e o preço já leva em conta o que não vem.");
  });
});

describe("o não encontrado só promete o que mostra", () => {
  it("nenhum texto dele fala do lote aberto, que a página não traz", () => {
    const texto = Object.values(pagina.NAO_ENCONTRADO_NO_REPASSE).join(" ");
    expect(texto).not.toMatch(/\babert[oa]s?\b/i);
    expect(texto).not.toMatch(/\blote\b/i);
  });
});

describe("o texto que depende do dado", () => {
  it("contagens no singular e no plural", () => {
    expect(pagina.tituloDoLote(1)).toBe("1 carro no repasse");
    expect(pagina.tituloDoLote(6)).toBe("6 carros no repasse");
    expect(pagina.verOsCarros(6)).toBe("VER OS 6 CARROS");
    expect(pagina.verOsCarros(1)).toBe("VER O CARRO");
    expect(pagina.verOsOutros(4)).toBe("VER OS OUTROS 4 CARROS");
    // T1-M1 (final-review, 25/09): um carro com uma foto de defeito é comum.
    expect(pagina.contagemDeFotos(28, 1)).toBe("28 fotos · 1 de defeito");
    expect(pagina.contagemDeFotos(28, 2)).toBe("28 fotos · 2 de defeitos");
  });

  it("a linha do lote diz hoje só quando é hoje, e conta os só-lojistas à parte", () => {
    expect(pagina.linhaDoLote({ hoje: true, dia: "24/09", abertos: 6, soLojistas: 0 })).toBe(
      "Lote atualizado hoje, 24/09 · 6 carros abertos a todos",
    );
    expect(pagina.linhaDoLote({ hoje: false, dia: "23/09", abertos: 1, soLojistas: 2 })).toBe(
      "Lote atualizado em 23/09 · 1 carro aberto a todos · 2 só para lojistas",
    );
  });

  it("a confirmação concorda com o que a pessoa marcou", () => {
    expect(pagina.tituloDaConfirmacao("  Ana Souza ")).toBe("Pronto, Ana. Você está na lista do repasse.");
    expect(pagina.textoDaConfirmacao({ faixa: "30-50", carrocerias: ["hatch"], comLote: true })).toBe(
      "Quando entrar um hatch de R$ 30 mil a R$ 50 mil, ele chega no seu WhatsApp. Enquanto isso, dá para ver o que está aberto hoje.",
    );
    expect(pagina.textoDaConfirmacao({ faixa: "ate-30", carrocerias: ["picape"], comLote: false })).toBe(
      "Quando entrar uma picape até R$ 30 mil, ela chega no seu WhatsApp.",
    );
    expect(pagina.textoDaConfirmacao({ faixa: null, carrocerias: [], comLote: false })).toBe(
      "Quando entrar um carro, ele chega no seu WhatsApp.",
    );
  });

  it("o card mostra o detalhe de leilão e sinistro até 60 caracteres, e acima disso só 'consta'", () => {
    const sessenta = "pequena monta em 2021, para-choque e farol esquerdo trocados";
    const sessentaEUm = "pequena monta em 2021, para-choque e farol dianteiro trocados";
    expect(sessenta).toHaveLength(60);
    expect(sessentaEUm).toHaveLength(61);
    const semLeilao = { laudo: "aprovado", leilao_consta: false, leilao_detalhe: null, sinistro_consta: true } as const;

    expect(pagina.linhaDoHistoricoNoCard({ ...semLeilao, sinistro_detalhe: sessenta })).toBe(
      `Laudo: aprovado, sai a pedido · Leilão: não consta · Sinistro: consta, ${sessenta}`,
    );
    // O ponto final não conta: o que se mede é o que aparece.
    expect(pagina.linhaDoHistoricoNoCard({ ...semLeilao, sinistro_detalhe: `${sessenta}.` })).toBe(
      `Laudo: aprovado, sai a pedido · Leilão: não consta · Sinistro: consta, ${sessenta}`,
    );
    expect(pagina.linhaDoHistoricoNoCard({ ...semLeilao, sinistro_detalhe: sessentaEUm })).toBe(
      "Laudo: aprovado, sai a pedido · Leilão: não consta · Sinistro: consta",
    );
    expect(
      pagina.linhaDoHistoricoNoCard({
        laudo: "nao_feito",
        leilao_consta: true,
        leilao_detalhe: "arrematado em leilão de financeira em 2019.",
        sinistro_consta: false,
        sinistro_detalhe: null,
      }),
    ).toBe("Laudo: não feito · Leilão: consta, arrematado em leilão de financeira em 2019 · Sinistro: não consta");
    expect(
      pagina.linhaDoHistoricoNoCard({
        laudo: "nao_feito",
        leilao_consta: true,
        leilao_detalhe: sessentaEUm,
        sinistro_consta: false,
        sinistro_detalhe: null,
      }),
    ).toBe("Laudo: não feito · Leilão: consta · Sinistro: não consta");
  });

  it("o vazio só cita data quando houve venda", () => {
    expect(pagina.textoDoVazio("23/09")).toContain("o último carro saiu em 23/09");
    expect(pagina.textoDoVazio(null)).not.toMatch(/saiu em/);
  });

  it("a FIPE do mês sem o ano, como na prancha", () => {
    expect(pagina.rotuloDaFipe("setembro de 2026")).toBe("FIPE de setembro");
    expect(pagina.rotuloDaFipe(null)).toBe("FIPE do mês");
  });
});
