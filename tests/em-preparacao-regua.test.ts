import { describe, it, expect } from "vitest";
import {
  bloqueiosDePublicacao,
  entraNoFeedDeAnuncios,
  liberadoEmPreparacao,
  MINIMO_DE_FOTOS,
  MINIMO_DE_FOTOS_EM_PREPARACAO,
  publicavel,
} from "../src/lib/coerenciaDoCadastro";
import { recusasParaPublicar } from "../src/lib/estadoDoCadastro";

/**
 * A exceção do carro "em preparação" na régua de publicação — spec
 * 2026-09-28-em-preparacao-design, seção "A régua de publicação".
 */

const fotos = (n: number) => Array.from({ length: n }, (_, i) => `https://cdn.exemplo/f${i}.jpg`);
const DATA = "2026-10-03T17:00:00+00:00";

describe("quando a exceção vale", () => {
  it("caixa marcada E data válida", () => {
    expect(liberadoEmPreparacao({ em_preparacao: true, previsao_chegada_em: DATA })).toBe(true);
  });

  it("caixa sem data, data sem caixa, data que não é data: não vale", () => {
    expect(liberadoEmPreparacao({ em_preparacao: true, previsao_chegada_em: null })).toBe(false);
    expect(liberadoEmPreparacao({ em_preparacao: true, previsao_chegada_em: "" })).toBe(false);
    expect(liberadoEmPreparacao({ em_preparacao: true, previsao_chegada_em: "amanhã" })).toBe(false);
    expect(liberadoEmPreparacao({ em_preparacao: false, previsao_chegada_em: DATA })).toBe(false);
    expect(liberadoEmPreparacao({ previsao_chegada_em: DATA })).toBe(false);
  });
});

describe("a régua com a exceção", () => {
  it("o mínimo em preparação é uma foto", () => {
    expect(MINIMO_DE_FOTOS_EM_PREPARACAO).toBe(1);
  });

  it("1 foto + caixa + data: publica, com a pendência da ficha à vista", () => {
    const motivos = bloqueiosDePublicacao({
      whatsapp_images: fotos(1),
      em_preparacao: true,
      previsao_chegada_em: DATA,
    });
    expect(motivos.some((m) => m.bloqueia)).toBe(false);
    expect(motivos).toEqual([
      expect.objectContaining({ id: "fotos-incompletas", texto: expect.stringMatching(/^no ar com 1 foto — /) }),
    ]);
  });

  it("1 foto + caixa SEM data: a régua de sempre", () => {
    const motivos = bloqueiosDePublicacao({ whatsapp_images: fotos(1), em_preparacao: true });
    expect(motivos).toEqual([
      expect.objectContaining({ id: "poucas-fotos", bloqueia: true, texto: expect.stringMatching(/^1 de 4 fotos/) }),
    ]);
  });

  it("sem a caixa, nada muda: 1 e 3 fotos seguem fora, 4 entra", () => {
    expect(publicavel({ whatsapp_images: fotos(1) })).toBe(false);
    expect(publicavel({ whatsapp_images: fotos(3) })).toBe(false);
    expect(publicavel({ whatsapp_images: fotos(MINIMO_DE_FOTOS) })).toBe(true);
  });

  it("em preparação sem foto nenhuma continua fora — o texto diz 1, não 4", () => {
    const motivos = bloqueiosDePublicacao({ whatsapp_images: [], em_preparacao: true, previsao_chegada_em: DATA });
    expect(motivos[0]).toMatchObject({ id: "poucas-fotos", bloqueia: true });
    expect(motivos[0].texto).toMatch(/^0 de 1 foto para publicar/);
  });

  it("o /logo.png do mapper não conta como foto", () => {
    // `mapVeiculoDbToVeiculo` põe "/logo.png" quando o carro não tem foto
    // nenhuma. A ficha julga o objeto MAPEADO; sem esta regra, o carro em
    // preparação sem foto sairia bloqueado na vitrine e liberado na ficha.
    expect(
      publicavel({ whatsapp_images: ["/logo.png"], em_preparacao: true, previsao_chegada_em: DATA }),
    ).toBe(false);
  });
});

describe("publicar e marcar em preparação no mesmo salvamento", () => {
  it("a recusa julga o valor NOVO", () => {
    const antes = { id: 8479269, whatsapp_images: fotos(1) };
    const atualizacao = { em_preparacao: true, previsao_chegada_em: DATA };
    expect(recusasParaPublicar([{ ...antes, ...atualizacao }])).toEqual([]);
    expect(recusasParaPublicar([antes])).toHaveLength(1);
  });
});

describe("o feed de anúncios recusa a exceção", () => {
  it("em preparação com menos de 4 fotos fica fora", () => {
    expect(entraNoFeedDeAnuncios({ whatsapp_images: fotos(1), em_preparacao: true })).toBe(false);
    expect(entraNoFeedDeAnuncios({ whatsapp_images: fotos(3), em_preparacao: true })).toBe(false);
  });

  it("em preparação com 4 fotos entra", () => {
    expect(entraNoFeedDeAnuncios({ whatsapp_images: fotos(4), em_preparacao: true })).toBe(true);
  });

  it("carro fora de preparação: o feed confia na vitrine, como sempre", () => {
    // O `getEstoque` já cortou quem não cumpre a régua. Repetir a régua aqui
    // quebraria o feed de todo teste e de todo carro que a vitrine aceita.
    expect(entraNoFeedDeAnuncios({ whatsapp_images: fotos(1) })).toBe(true);
  });
});
