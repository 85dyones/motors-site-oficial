import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GaleriaDeFotos from "../src/components/admin/GaleriaDeFotos";
import {
  FOTOS_DA_FICHA_COMPLETA,
  MINIMO_DE_FOTOS,
  MINIMO_DE_FOTOS_EM_PREPARACAO,
} from "../src/lib/coerenciaDoCadastro";

/**
 * A régua da galeria no carro em preparação — achado da revisão final (28/09).
 *
 * A aba "Fotos e mídia" é onde o editor abre, e a galeria usava
 * `MINIMO_DE_FOTOS` cru: o carro em preparação com uma foto, que está no ar,
 * lia "Faltam 3 de 4 para este veículo aparecer na vitrine, no feed de
 * anúncios e na busca" — falso para vitrine e busca. Renderizado, e afirmando
 * sobre o texto que chega ao leitor.
 */

const fotos = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ zap: `https://cdn.exemplo/${i}.jpg`, web: `https://cdn.exemplo/${i}.webp` }));

const galeria = (n: number, emPreparacao?: boolean) =>
  renderToStaticMarkup(
    createElement(GaleriaDeFotos, {
      estoqueId: 8497421,
      fotos: fotos(n),
      origem: "sync",
      podeEditar: false,
      aoGravar: () => {},
      ...(emPreparacao === undefined ? {} : { emPreparacao }),
    }),
  )
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

describe("a galeria do carro em preparação", () => {
  it("uma foto: no ar, e o que falta para o feed e para a ficha", () => {
    const n = MINIMO_DE_FOTOS_EM_PREPARACAO;
    const texto = galeria(n, true);
    expect(texto).toContain(
      `Em preparação: no ar com ${n} foto. ` +
        `Faltam ${MINIMO_DE_FOTOS - n} para o feed de anúncios e ${FOTOS_DA_FICHA_COMPLETA - n} para a ficha completa.`,
    );
    expect(texto).not.toContain("para este veículo aparecer na vitrine");
  });

  it("uma a menos que o feed: o singular certo", () => {
    const n = MINIMO_DE_FOTOS - 1;
    expect(galeria(n, true)).toContain(
      `Em preparação: no ar com ${n} fotos. ` +
        `Falta 1 para o feed de anúncios e ${FOTOS_DA_FICHA_COMPLETA - n} para a ficha completa.`,
    );
  });

  it("com o feed cumprido, a parte do feed some", () => {
    const n = MINIMO_DE_FOTOS;
    const texto = galeria(n, true);
    expect(texto).toContain(
      `Em preparação: no ar com ${n} fotos. Faltam ${FOTOS_DA_FICHA_COMPLETA - n} para a ficha completa.`,
    );
    expect(texto).not.toContain("feed de anúncios");
  });

  it("uma a menos que a ficha completa: o singular certo", () => {
    expect(galeria(FOTOS_DA_FICHA_COMPLETA - 1, true)).toContain("Falta 1 para a ficha completa.");
  });

  it("sem foto nenhuma: falta a de cadastro, e o feed pede a régua cheia", () => {
    const texto = galeria(0, true);
    expect(texto).toContain(
      `Em preparação: falta ${MINIMO_DE_FOTOS_EM_PREPARACAO} de ${MINIMO_DE_FOTOS_EM_PREPARACAO} ` +
        `para aparecer na vitrine e na busca. O feed de anúncios pede ${MINIMO_DE_FOTOS}.`,
    );
    expect(texto).not.toContain("no ar");
  });

  it("ficha completa: nada falta", () => {
    const texto = galeria(FOTOS_DA_FICHA_COMPLETA, true);
    expect(texto).toContain(`Em preparação: no ar com ${FOTOS_DA_FICHA_COMPLETA} fotos.`);
    expect(texto).not.toMatch(/Falta/);
  });
});

describe("a galeria do carro comum não muda", () => {
  it("uma foto: o texto de sempre, com a régua cheia", () => {
    for (const texto of [galeria(1), galeria(1, false)]) {
      expect(texto).toContain(
        `Faltam ${MINIMO_DE_FOTOS - 1} de ${MINIMO_DE_FOTOS} para este veículo aparecer na vitrine, no feed de anúncios e na busca.`,
      );
      expect(texto).not.toContain("Em preparação");
    }
  });

  it("no ar e devendo a ficha: o texto de sempre", () => {
    const n = MINIMO_DE_FOTOS;
    expect(galeria(n, false)).toContain(
      `No ar com ${n} fotos. Faltam ${FOTOS_DA_FICHA_COMPLETA - n} para a ficha completa`,
    );
  });
});
