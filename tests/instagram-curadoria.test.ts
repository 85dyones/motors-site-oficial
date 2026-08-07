import { describe, it, expect } from "vitest";
import {
  MAX_PUBLICACOES,
  normalizarCuradoria,
} from "../src/lib/instagramCuradoria";

/**
 * `normalizarCuradoria` lê JSON livre gravado por um painel que muda. O
 * contrato que estes testes fixam é: qualquer entrada, nenhuma exceção — o pior
 * caso aceitável é a faixa não aparecer, nunca a home quebrar.
 */

describe("normalizarCuradoria", () => {
  it("aceita o envelope { publicacoes: [...] }", () => {
    const saida = normalizarCuradoria({
      publicacoes: [{ id: "a", imagemUrl: "https://x/1.jpg" }],
    });
    expect(saida).toHaveLength(1);
    expect(saida[0].imagemUrl).toBe("https://x/1.jpg");
  });

  it("aceita array pelado", () => {
    expect(normalizarCuradoria([{ imagemUrl: "https://x/1.jpg" }])).toHaveLength(1);
  });

  it("descarta entrada sem imagem — quadro sem foto é buraco na grade", () => {
    const saida = normalizarCuradoria([
      { id: "a", imagemUrl: "https://x/1.jpg" },
      { id: "b", legenda: "esqueceram a foto" },
      { id: "c", imagemUrl: "   " },
    ]);
    expect(saida.map((p) => p.id)).toEqual(["a"]);
  });

  it("deduplica pela imagem, não pelo id", () => {
    // Dois ids diferentes para a mesma foto são a mesma publicação salva duas
    // vezes — o editor gera id novo a cada clique em "adicionar".
    const saida = normalizarCuradoria([
      { id: "primeiro", imagemUrl: "https://x/1.jpg" },
      { id: "segundo", imagemUrl: "https://x/1.jpg" },
    ]);
    expect(saida).toHaveLength(1);
    expect(saida[0].id).toBe("primeiro");
  });

  it("preserva a ordem em que a loja salvou", () => {
    const saida = normalizarCuradoria([
      { id: "c", imagemUrl: "https://x/3.jpg" },
      { id: "a", imagemUrl: "https://x/1.jpg" },
      { id: "b", imagemUrl: "https://x/2.jpg" },
    ]);
    expect(saida.map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  it("corta no teto da faixa", () => {
    const muitas = Array.from({ length: MAX_PUBLICACOES + 5 }, (_, i) => ({
      id: `p${i}`,
      imagemUrl: `https://x/${i}.jpg`,
    }));
    expect(normalizarCuradoria(muitas)).toHaveLength(MAX_PUBLICACOES);
  });

  it("normaliza texto em branco para null", () => {
    const [p] = normalizarCuradoria([
      { id: "a", imagemUrl: "https://x/1.jpg", legenda: "  ", permalink: "" },
    ]);
    expect(p.legenda).toBeNull();
    expect(p.permalink).toBeNull();
  });

  it("apara espaços das bordas", () => {
    const [p] = normalizarCuradoria([
      { id: "a", imagemUrl: " https://x/1.jpg ", legenda: " Entrega do Rafael " },
    ]);
    expect(p.imagemUrl).toBe("https://x/1.jpg");
    expect(p.legenda).toBe("Entrega do Rafael");
  });

  it("usa a imagem como id quando ele falta", () => {
    const [p] = normalizarCuradoria([{ imagemUrl: "https://x/1.jpg" }]);
    expect(p.id).toBe("https://x/1.jpg");
  });

  it("lixo devolve lista vazia em vez de explodir", () => {
    for (const entrada of [null, undefined, 0, "", "texto", {}, { publicacoes: "não é lista" }, [null, 7, "x"]]) {
      expect(normalizarCuradoria(entrada)).toEqual([]);
    }
  });
});
