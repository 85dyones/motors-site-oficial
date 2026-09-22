import { describe, it, expect } from "vitest";
import {
  VAGAS,
  montarPainelDeDestaques,
  moverDestaque,
  removerDestaque,
  limparForaDoAr,
  voltaCompletaEmSegundos,
} from "../src/lib/destaquesDoPainel";
import { VAGAS_NA_GRADE } from "../src/lib/destaquesDaSemana";
import type { LinhaDeEstoque } from "../src/lib/estoqueTabela";

/**
 * A curadoria dos destaques não tinha tela: era uma lista append-only que o
 * site cortava em silêncio. Ver
 * `docs/superpowers/specs/2026-09-21-destaques-e-filtros-do-painel-design.md`.
 *
 * Só os campos que a regra lê entram nos dublês — `estado` responde sozinho
 * "este carro está no ar?", porque `decidirEstado` já dobrou arquivado,
 * vendido, rascunho e sem-foto nele.
 */
const linha = (id: string, over: Partial<LinhaDeEstoque> = {}): LinhaDeEstoque =>
  ({
    id,
    marca: "Fiat",
    modelo: "Toro",
    versao: "",
    preco: 100000,
    estado: "publicado",
    ...over,
  }) as unknown as LinhaDeEstoque;

describe("VAGAS", () => {
  it("a grade não redigita o seis — importa a constante da home", () => {
    expect(VAGAS.grade).toBe(VAGAS_NA_GRADE);
  });

  it("o banner tem quatro vagas e a TV não tem teto", () => {
    expect(VAGAS.banner).toBe(4);
    expect(VAGAS.tv).toBeNull();
  });
});

describe("montarPainelDeDestaques", () => {
  it("a posição viva ignora os mortos acima dela", () => {
    const itens = montarPainelDeDestaques(
      ["morto", "vivo1", "vivo2"],
      [
        linha("morto", { estado: "arquivado" }),
        linha("vivo1"),
        linha("vivo2"),
      ],
      "banner",
    );

    expect(itens[0]).toMatchObject({ posicao: 1, posicaoViva: null, destino: "fora_do_ar" });
    expect(itens[1]).toMatchObject({ posicao: 2, posicaoViva: 1, destino: "no_ar" });
    expect(itens[2]).toMatchObject({ posicao: 3, posicaoViva: 2, destino: "no_ar" });
  });

  it("no banner, o quinto vivo fica fora do teto", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const itens = montarPainelDeDestaques(ids, ids.map((i) => linha(i)), "banner");

    expect(itens.map((i) => i.destino)).toEqual([
      "no_ar", "no_ar", "no_ar", "no_ar", "fora_do_teto",
    ]);
  });

  it("na TV, o quinto vivo continua no ar — ela não tem teto", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const itens = montarPainelDeDestaques(ids, ids.map((i) => linha(i)), "tv");

    expect(itens.every((i) => i.destino === "no_ar")).toBe(true);
  });

  it("o id que não está no estoque não derruba a montagem", () => {
    const itens = montarPainelDeDestaques(["fantasma"], [], "banner");

    expect(itens[0]).toMatchObject({
      destino: "fora_do_ar",
      motivoForaDoAr: "fora do estoque",
      posicaoViva: null,
    });
  });

  it("cada estado morto se explica com o seu motivo", () => {
    const itens = montarPainelDeDestaques(
      ["v", "a", "r", "f"],
      [
        linha("v", { estado: "vendido" }),
        linha("a", { estado: "arquivado" }),
        linha("r", { estado: "rascunho" }),
        linha("f", { estado: "fora_da_vitrine" }),
      ],
      "banner",
    );

    expect(itens.map((i) => i.motivoForaDoAr)).toEqual([
      "vendido", "arquivado", "rascunho", "sem foto",
    ]);
  });

  it("a fotografia real de 21/09: com o teto em 4, o Toro deixa de ser cortado", () => {
    // Os 9 ids medidos em produção, na ordem gravada. Cinco estão fora do ar.
    const ids = [
      "8324691", "8296347", "8307965", "8171616", "8121860",
      "8429524", "8358193", "8107703", "8464513",
    ];
    const linhas = [
      linha("8324691", { estado: "arquivado" }),
      linha("8296347", { estado: "arquivado" }),
      linha("8307965", { estado: "arquivado" }),
      linha("8171616"),
      linha("8121860", { estado: "arquivado" }),
      linha("8429524"),
      linha("8358193"),
      linha("8107703", { estado: "vendido" }),
      linha("8464513"),
    ];

    const itens = montarPainelDeDestaques(ids, linhas, "banner");
    const porId = new Map(itens.map((i) => [i.id, i]));

    // O Titano é o 4º da lista e o 1º do banner — o número que a tela mostra.
    expect(porId.get("8171616")).toMatchObject({ posicao: 4, posicaoViva: 1 });
    // O Toro era o descartado. Com quatro vagas, ele entra.
    expect(porId.get("8464513")).toMatchObject({ posicaoViva: 4, destino: "no_ar" });
    expect(itens.filter((i) => i.destino === "fora_do_ar")).toHaveLength(5);
  });
});

describe("moverDestaque", () => {
  it("troca com o vizinho de cima", () => {
    expect(moverDestaque(["a", "b", "c"], "b", "cima")).toEqual(["b", "a", "c"]);
  });

  it("troca com o vizinho de baixo", () => {
    expect(moverDestaque(["a", "b", "c"], "b", "baixo")).toEqual(["a", "c", "b"]);
  });

  it("no topo, subir não faz nada", () => {
    expect(moverDestaque(["a", "b"], "a", "cima")).toEqual(["a", "b"]);
  });

  it("no fim, descer não faz nada", () => {
    expect(moverDestaque(["a", "b"], "b", "baixo")).toEqual(["a", "b"]);
  });

  it("id que não está na lista devolve a lista intacta", () => {
    expect(moverDestaque(["a", "b"], "z", "cima")).toEqual(["a", "b"]);
  });
});

describe("removerDestaque", () => {
  it("tira o id e preserva a ordem do resto", () => {
    expect(removerDestaque(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});

describe("limparForaDoAr", () => {
  it("tira só os mortos e preserva a ordem dos vivos", () => {
    const ids = ["a", "morto", "b", "vendido", "c"];
    const linhas = [
      linha("a"), linha("morto", { estado: "arquivado" }), linha("b"),
      linha("vendido", { estado: "vendido" }), linha("c"),
    ];

    expect(limparForaDoAr(ids, linhas)).toEqual(["a", "b", "c"]);
  });

  it("tira o id que sumiu do estoque", () => {
    expect(limparForaDoAr(["a", "fantasma"], [linha("a")])).toEqual(["a"]);
  });
});

describe("voltaCompletaEmSegundos", () => {
  it("quatro carros a oito segundos dão trinta e dois", () => {
    expect(voltaCompletaEmSegundos(4)).toBe(32);
  });

  it("lista vazia não roda", () => {
    expect(voltaCompletaEmSegundos(0)).toBe(0);
  });
});
