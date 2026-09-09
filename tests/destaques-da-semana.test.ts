import { describe, it, expect } from "vitest";
import { montarDestaquesDaSemana, VAGAS_NA_GRADE, embaralhar } from "../src/lib/destaquesDaSemana";
import type { Veiculo } from "../src/types";

/**
 * A grade "Destaques da semana" é a área mais nobre da home e até 2026-09-09
 * não tinha curadoria: `disponiveis.slice(0, 6)` sobre um estoque ordenado por
 * preço mostrava os 6 carros mais caros que estavam no ar, para sempre.
 *
 * A regra aqui é a decisão do dono: o que ele marca vem primeiro, na ordem em
 * que marcou; o sorteio só completa o que faltar. Ver
 * `docs/superpowers/specs/2026-09-09-destaques-da-semana-design.md`.
 */

/** Só o `id` é lido pela regra; o resto do veículo não influencia nada. */
const carro = (id: string): Veiculo => ({ id }) as unknown as Veiculo;

const estoque = (...ids: string[]) => ids.map(carro);

/** Sorteador determinístico: consome a sequência dada, e repete a última. */
function sorteadorFixo(valores: number[]): () => number {
  let i = 0;
  return () => valores[Math.min(i++, valores.length - 1)];
}

/** Sempre 0: no Fisher-Yates, mantém a ordem de entrada — previsível. */
const semSorte = () => 0;

describe("montarDestaquesDaSemana", () => {
  it("mostra os marcados na ordem em que foram marcados", () => {
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque("a", "b", "c", "d", "e", "f"),
      selecionados: ["c", "a", "b", "f", "e", "d"],
      sortear: semSorte,
    });

    expect(grade.map((v) => v.id)).toEqual(["c", "a", "b", "f", "e", "d"]);
  });

  it("completa com sorteados até as 6 vagas", () => {
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque("a", "b", "c", "d", "e", "f", "g"),
      selecionados: ["g"],
      sortear: semSorte,
    });

    expect(grade).toHaveLength(VAGAS_NA_GRADE);
    expect(grade[0].id).toBe("g");
  });

  it("o sorteio nunca repete um carro já marcado", () => {
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque("a", "b", "c", "d", "e", "f", "g"),
      selecionados: ["a", "b"],
      sortear: semSorte,
    });

    const ids = grade.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("o sorteio não traz quem está no banner", () => {
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque("a", "b", "c", "d", "e", "f", "g", "h", "i"),
      selecionados: [],
      excluir: ["a", "b", "c"],
      sortear: semSorte,
    });

    expect(grade.map((v) => v.id)).not.toContain("a");
    expect(grade.map((v) => v.id)).not.toContain("b");
    expect(grade.map((v) => v.id)).not.toContain("c");
  });

  it("marcou mais de 6: aparecem os 6 primeiros, e o sorteio não entra", () => {
    const dez = ["j", "i", "h", "g", "f", "e", "d", "c", "b", "a"];
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque(...dez),
      selecionados: dez,
      sortear: () => {
        throw new Error("não devia sortear com a grade cheia de marcados");
      },
    });

    expect(grade.map((v) => v.id)).toEqual(dez.slice(0, VAGAS_NA_GRADE));
  });

  it("sem nada marcado, sorteia as 6 vagas", () => {
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque("a", "b", "c", "d", "e", "f", "g", "h"),
      selecionados: [],
      sortear: semSorte,
    });

    expect(grade).toHaveLength(VAGAS_NA_GRADE);
  });

  it("estoque menor que a grade: mostra o que há, sem buraco", () => {
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque("a", "b"),
      selecionados: ["a"],
      sortear: semSorte,
    });

    expect(grade.map((v) => v.id)).toEqual(["a", "b"]);
    expect(grade.every(Boolean)).toBe(true);
  });

  it("id marcado que saiu do estoque some sozinho, sem desmarcar", () => {
    // Carro vendido, arquivado ou barrado por falta de foto: a lista guarda
    // ids, e quem manda é o estoque. Não existe passo de manutenção.
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque("a", "b"),
      selecionados: ["vendido-ontem", "a"],
      sortear: semSorte,
    });

    expect(grade.map((v) => v.id)).toEqual(["a", "b"]);
  });

  it("id marcado duas vezes conta uma vez só", () => {
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque("a", "b", "c"),
      selecionados: ["a", "a", "b"],
      sortear: semSorte,
    });

    expect(grade.map((v) => v.id)).toEqual(["a", "b", "c"]);
  });

  it("não mexe na lista que recebeu", () => {
    // `disponiveis` é a mesma lista que a home usa para o hero, a busca e o
    // contador. Embaralhar no lugar mudaria a vitrine inteira.
    const disponiveis = estoque("a", "b", "c", "d", "e", "f", "g");
    const antes = disponiveis.map((v) => v.id);

    montarDestaquesDaSemana({
      disponiveis,
      selecionados: [],
      sortear: sorteadorFixo([0.9, 0.1, 0.7, 0.3, 0.5, 0.2]),
    });

    expect(disponiveis.map((v) => v.id)).toEqual(antes);
  });

  it("sorteador que devolve 1 não estoura o índice", () => {
    // `Math.random()` nunca devolve 1, mas um dublê pode — e sem a trava o
    // Fisher-Yates lê uma posição além do fim e devolve `undefined` na grade.
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque("a", "b", "c", "d", "e", "f", "g"),
      selecionados: [],
      sortear: () => 1,
    });

    expect(grade).toHaveLength(VAGAS_NA_GRADE);
    expect(grade.every((v) => v && typeof v.id === "string")).toBe(true);
  });

  it("com sorteador fixo, a saída é reproduzível", () => {
    const entrada = {
      disponiveis: estoque("a", "b", "c", "d", "e", "f", "g", "h"),
      selecionados: [],
    };
    const semente = () => sorteadorFixo([0.42, 0.13, 0.87, 0.5, 0.31, 0.64, 0.08]);

    const primeira = montarDestaquesDaSemana({ ...entrada, sortear: semente() });
    const segunda = montarDestaquesDaSemana({ ...entrada, sortear: semente() });

    expect(primeira.map((v) => v.id)).toEqual(segunda.map((v) => v.id));
  });
});

/**
 * `embaralhar` é testado à parte, e não só por dentro de
 * `montarDestaquesDaSemana`.
 *
 * Motivo: `montarDestaquesDaSemana` sempre chama `disponiveis.filter(...)`
 * antes de embaralhar, e `Array.prototype.filter` devolve um array NOVO mesmo
 * quando nenhum item é removido — inclusive quando `selecionados` e `excluir`
 * estão vazios. Por isso `embaralhar` nunca recebe `disponiveis` pela mesma
 * referência, e o teste "não mexe na lista que recebeu" (acima) não tem como
 * enxergar a cópia defensiva de `embaralhar`: ela é estruturalmente
 * inalcançável de fora, para qualquer combinação de entradas de
 * `montarDestaquesDaSemana`. Confirmado com `const copia = lista;` no passo de
 * mutação — sobrevive sempre, sem exceção, porque não é falso negativo, é
 * ausência real de cobertura.
 */
describe("embaralhar", () => {
  it("não muta a lista recebida", () => {
    const lista = ["a", "b", "c", "d", "e"];
    const antes = [...lista];

    embaralhar(lista, sorteadorFixo([0.9, 0.1, 0.7, 0.3]));

    expect(lista).toEqual(antes);
  });
});
