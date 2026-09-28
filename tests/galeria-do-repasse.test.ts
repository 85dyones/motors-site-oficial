import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GaleriaDeFotos from "../src/components/admin/GaleriaDeFotos";
import { destinoDoRepasse } from "../src/lib/destinoDasFotos";
import { MINIMO_DE_FOTOS } from "../src/lib/coerenciaDoCadastro";

const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";

describe("o destino das fotos do repasse", () => {
  it("grava na pasta do repasse e na rota do repasse", () => {
    const d = destinoDoRepasse(ID);
    expect(d.caminho("abc-123", "web")).toBe(`repasse/${ID}/abc-123-web.webp`);
    expect(d.caminho("abc-123", "zap")).toBe(`repasse/${ID}/abc-123-zap.jpg`);
    expect(d.gravarEm).toBe(`/api/repasses/${ID}`);
    expect(d.reguaDoEstoque).toBe(false);
  });
});

describe("a galeria com o destino do repasse", () => {
  const desenhar = (podeEditar: boolean) =>
    renderToStaticMarkup(
      createElement(GaleriaDeFotos, {
        estoqueId: ID,
        fotos: [],
        origem: "painel",
        podeEditar,
        aoGravar: () => {},
        destino: destinoDoRepasse(ID),
      }),
    );

  it("não fala da vitrine do estoque", () => {
    const html = desenhar(true);
    expect(html).not.toContain(`Faltam ${MINIMO_DE_FOTOS} de ${MINIMO_DE_FOTOS}`);
    expect(html).not.toContain("para este veículo aparecer na vitrine");
    expect(html).toContain("Enviar fotos");
  });

  it("sem edição, o aviso é o do repasse, não o da matriz do estoque", () => {
    const html = desenhar(false);
    expect(html).toContain("só quem valida muda as fotos");
    expect(html).not.toContain("matriz A17");
  });

  it("sem destino, a galeria continua a do estoque", () => {
    const html = renderToStaticMarkup(
      createElement(GaleriaDeFotos, { estoqueId: 900000001, fotos: [], origem: "painel", podeEditar: false, aoGravar: () => {} }),
    );
    expect(html).toContain(`Faltam ${MINIMO_DE_FOTOS} de ${MINIMO_DE_FOTOS}`);
    expect(html).toContain("Seu perfil vê as fotos e não as altera");
  });
});
