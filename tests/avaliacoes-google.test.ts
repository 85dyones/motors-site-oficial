import { describe, it, expect } from "vitest";
import {
  formatarNota,
  montarPainel,
  selecionarParaVitrine,
  tempoRelativo,
  type AvaliacaoGoogle,
} from "../src/lib/avaliacoesGoogle";

/**
 * A regra que estes testes existem para proteger é a do CLAUDE.md §6, aplicada
 * à reputação: ordenar é curadoria, esconder é fraude.
 *
 * Uma seção de avaliações onde nenhuma crítica nunca aparece é lida como
 * maquiada, e filtrar por nota também contraria as regras de exibição do
 * Google. O jeito de isso voltar é alguém "melhorar" a home com um
 * `.filter(a => a.nota >= 4)` — daí o teste.
 */

function avaliacao(over: Partial<AvaliacaoGoogle> = {}): AvaliacaoGoogle {
  return {
    id: Math.random().toString(36).slice(2),
    autorNome: "Cliente",
    autorFotoUrl: null,
    nota: 5,
    comentario: "Atendimento bom.",
    publicadaEm: "2026-07-01T12:00:00Z",
    respostaTexto: null,
    respondidaEm: null,
    ...over,
  };
}

describe("selecionarParaVitrine", () => {
  it("NÃO descarta avaliação de nota baixa", () => {
    const ruim = avaliacao({ id: "ruim", nota: 1, comentario: "Demorou demais." });
    const boa = avaliacao({ id: "boa", nota: 5 });

    const saida = selecionarParaVitrine([boa, ruim]);

    expect(saida.map((a) => a.id)).toContain("ruim");
  });

  it("ordena da mais recente para a mais antiga", () => {
    const antiga = avaliacao({ id: "antiga", publicadaEm: "2026-01-10T00:00:00Z" });
    const nova = avaliacao({ id: "nova", publicadaEm: "2026-07-20T00:00:00Z" });
    const meio = avaliacao({ id: "meio", publicadaEm: "2026-04-05T00:00:00Z" });

    expect(selecionarParaVitrine([antiga, nova, meio]).map((a) => a.id)).toEqual([
      "nova",
      "meio",
      "antiga",
    ]);
  });

  it("a crítica recente ganha do elogio antigo", () => {
    // O caso que motiva o teste anterior: se alguém trocar a ordenação por
    // "melhores primeiro", esta asserção cai.
    const elogioAntigo = avaliacao({ id: "elogio", nota: 5, publicadaEm: "2026-01-01T00:00:00Z" });
    const criticaNova = avaliacao({ id: "critica", nota: 2, publicadaEm: "2026-08-01T00:00:00Z" });

    expect(selecionarParaVitrine([elogioAntigo, criticaNova])[0].id).toBe("critica");
  });

  it("descarta avaliação sem texto — é estrela solta, não card", () => {
    const semTexto = avaliacao({ id: "vazia", comentario: null });
    const soEspacos = avaliacao({ id: "espacos", comentario: "   " });
    const comTexto = avaliacao({ id: "texto" });

    expect(selecionarParaVitrine([semTexto, soEspacos, comTexto]).map((a) => a.id)).toEqual([
      "texto",
    ]);
  });

  it("respeita o limite", () => {
    const muitas = Array.from({ length: 20 }, (_, i) =>
      avaliacao({ id: `a${i}`, publicadaEm: `2026-07-${String(i + 1).padStart(2, "0")}T00:00:00Z` })
    );

    expect(selecionarParaVitrine(muitas, 3)).toHaveLength(3);
    expect(selecionarParaVitrine(muitas, 0)).toHaveLength(0);
  });

  it("lista vazia não quebra", () => {
    expect(selecionarParaVitrine([])).toEqual([]);
  });
});

describe("montarPainel", () => {
  /** Uma resposta do Places API (New) com os campos que a home pede. */
  const respostaCompleta = {
    rating: 4.9,
    userRatingCount: 84,
    googleMapsUri: "https://maps.google.com/?cid=123",
    reviews: [
      {
        name: "places/ChIJabc/reviews/rev1",
        rating: 5,
        text: { text: "Atendimento impecável." },
        publishTime: "2026-07-01T12:00:00Z",
        authorAttribution: {
          displayName: "Rafael M.",
          photoUri: "https://lh3.googleusercontent.com/a/foto",
        },
      },
    ],
  };

  it("lê a nota e o total da raiz da resposta", () => {
    const painel = montarPainel(respostaCompleta)!;
    expect(painel.reputacao.notaMedia).toBe(4.9);
    expect(painel.reputacao.totalAvaliacoes).toBe(84);
    expect(painel.reputacao.urlPerfil).toBe("https://maps.google.com/?cid=123");
  });

  it("a média NÃO é recalculada sobre as avaliações recebidas", () => {
    // São 5 de dezenas. Calcular sobre elas publicaria um número que não bate
    // com o perfil que o cliente vai conferir.
    const painel = montarPainel({
      ...respostaCompleta,
      rating: 4.2,
      reviews: [
        { ...respostaCompleta.reviews[0], name: "r1", rating: 5 },
        { ...respostaCompleta.reviews[0], name: "r2", rating: 5 },
      ],
    })!;
    expect(painel.reputacao.notaMedia).toBe(4.2);
  });

  it("mapeia a avaliação inteira", () => {
    const [a] = montarPainel(respostaCompleta)!.avaliacoes;
    expect(a).toEqual({
      id: "places/ChIJabc/reviews/rev1",
      autorNome: "Rafael M.",
      autorFotoUrl: "https://lh3.googleusercontent.com/a/foto",
      nota: 5,
      comentario: "Atendimento impecável.",
      publicadaEm: "2026-07-01T12:00:00Z",
      respostaTexto: null,
      respondidaEm: null,
    });
  });

  it("descarta avaliação sem autor — não pode ir ao ar como avaliação do Google", () => {
    const painel = montarPainel({
      ...respostaCompleta,
      reviews: [{ ...respostaCompleta.reviews[0], authorAttribution: {} }],
    })!;
    expect(painel.avaliacoes).toEqual([]);
  });

  it("descarta avaliação sem identificador ou sem data", () => {
    const painel = montarPainel({
      ...respostaCompleta,
      reviews: [
        { ...respostaCompleta.reviews[0], name: undefined },
        { ...respostaCompleta.reviews[0], publishTime: undefined },
      ],
    })!;
    expect(painel.avaliacoes).toEqual([]);
  });

  it("sem nota ou sem total não há painel — o cabeçalho É a seção", () => {
    expect(montarPainel({ userRatingCount: 84 })).toBeNull();
    expect(montarPainel({ rating: 4.9 })).toBeNull();
    expect(montarPainel({})).toBeNull();
    expect(montarPainel(null)).toBeNull();
  });

  it("perfil sem nenhuma avaliação ainda devolve o cabeçalho", () => {
    const painel = montarPainel({ rating: 5, userRatingCount: 1 })!;
    expect(painel.reputacao.totalAvaliacoes).toBe(1);
    expect(painel.avaliacoes).toEqual([]);
  });

  it("resposta com formato inesperado não explode", () => {
    for (const entrada of [undefined, "texto", 7, [], { reviews: "não é lista" }]) {
      expect(() => montarPainel(entrada)).not.toThrow();
    }
  });
});

describe("formatarNota", () => {
  it("usa vírgula decimal e uma casa", () => {
    expect(formatarNota(4.9)).toBe("4,9");
    expect(formatarNota(5)).toBe("5,0");
  });

  it("arredonda o que vier com mais casas", () => {
    // `reputacao_google.nota_media` é `numeric(2,1)`, então na prática o valor
    // já chega com uma casa. Isto é defesa contra o dia em que a coluna mudar
    // ou o número vier direto da API sem passar pelo banco.
    expect(formatarNota(4.44)).toBe("4,4");
    expect(formatarNota(4.96)).toBe("5,0");
  });
});

describe("tempoRelativo", () => {
  const agora = new Date("2026-08-06T12:00:00Z");

  it("cobre a escala de dias a anos", () => {
    expect(tempoRelativo("2026-08-06T09:00:00Z", agora)).toBe("hoje");
    expect(tempoRelativo("2026-08-05T09:00:00Z", agora)).toBe("ontem");
    expect(tempoRelativo("2026-07-25T12:00:00Z", agora)).toBe("há 12 dias");
    expect(tempoRelativo("2026-07-01T12:00:00Z", agora)).toBe("há 1 mês");
    expect(tempoRelativo("2026-02-06T12:00:00Z", agora)).toBe("há 6 meses");
    expect(tempoRelativo("2024-08-06T12:00:00Z", agora)).toBe("há 2 anos");
  });

  it("data no futuro devolve string vazia em vez de 'há -3 dias'", () => {
    // Fuso do sync e relógio do servidor podem discordar por algumas horas.
    expect(tempoRelativo("2026-08-09T12:00:00Z", agora)).toBe("");
  });

  it("data inválida não imprime NaN na home", () => {
    expect(tempoRelativo("não é data", agora)).toBe("");
  });
});
