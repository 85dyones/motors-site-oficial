import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";
import { checkTagMatchesVehicle, condicoesDaTag } from "../src/lib/regrasEstoque";
import { DESTAQUES_PADRAO } from "../src/lib/destaquesRapidos";
import { DEFAULT_QUICK_TAGS } from "../src/app/ThemeContext";
import { CARROCERIAS } from "../src/lib/classificacaoVeiculo";
import { SLUGS_DE_PERFIL } from "../src/lib/perfisDeUso";
import type { QuickTag, Veiculo } from "../src/types";

/**
 * Curadoria — regra com várias condições, e padrões que recortam de verdade.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo trava
 * ---------------------------------------------------------------------------
 * Medidos contra os 35 veículos servidos em 2026-08-27, os padrões fixos
 * antigos diziam o seguinte:
 *
 *   curadoria    perfil_uso == "CURADORIA EXCLUSIVA"   →  0 de 35
 *   economicos   preço < R$ 180.000                    → 34 de 35
 *   parcela_1k   preço < R$ 120.000                    → 30 de 35
 *   baixa_km     km < 40.000                           →  6 de 35
 *
 * O primeiro apontava para um valor que morreu na migração de perfis; os dois
 * de preço devolviam quase todo o pátio, porque foram calibrados para uma loja
 * de mediana muito mais alta (a real é R$ 62.900). Zero e quase-tudo são os
 * dois jeitos de uma curadoria não curar nada.
 *
 * A mudança de fundo é a regra aceitar várias condições com E — "SUV para
 * família", "automático com baixa km" —, que é o que o vocabulário de perfis
 * múltiplos abriu e uma condição só não alcança.
 */

const carro = (over: Partial<Veiculo> = {}): Veiculo =>
  ({
    id: "1",
    marca: "Chevrolet",
    modelo: "Onix",
    versao: "1.0",
    ano: 2020,
    quilometragem: 50000,
    cambio: "Manual",
    combustivel: "Flex",
    preco_original: 70000,
    preco_promocional: 0,
    tipo: "Hatch",
    perfis_uso: ["urbano", "economico"],
    ...over,
  }) as Veiculo;

describe("1 · a forma antiga continua valendo", () => {
  // É o que dispensa migração: as tags gravadas em produção estão assim, e
  // reescrever o que funciona seria risco sem retorno.
  const antiga = {
    id: "baixa_km",
    name: "BAIXA QUILOMETRAGEM",
    field: "quilometragem",
    operator: "less",
    value: "40000",
  } as QuickTag;

  it("`condicoesDaTag` traduz os três campos soltos numa condição", () => {
    expect(condicoesDaTag(antiga)).toEqual([
      { field: "quilometragem", operator: "less", value: "40000" },
    ]);
  });

  it("e a regra casa como sempre casou", () => {
    expect(checkTagMatchesVehicle(antiga, carro({ quilometragem: 30000 }), {})).toBe(true);
    expect(checkTagMatchesVehicle(antiga, carro({ quilometragem: 90000 }), {})).toBe(false);
  });

  it("tag sem campo nenhum não casa ninguém", () => {
    // Categoria vazia não pode virar categoria universal: `every` sobre lista
    // vazia é `true` em JavaScript, e sem esta guarda a curadoria devolveria o
    // pátio inteiro justamente quando não sabe o que quer.
    const semRegra = { id: "x", name: "X" } as QuickTag;
    expect(condicoesDaTag(semRegra)).toEqual([]);
    expect(checkTagMatchesVehicle(semRegra, carro(), {})).toBe(false);
  });
});

describe("2 · várias condições, com E", () => {
  const suvDeFamilia: QuickTag = {
    id: "suv-familia",
    name: "SUV PARA FAMÍLIA",
    condicoes: [
      { field: "tipo", operator: "equals", value: "SUV" },
      { field: "perfil_uso", operator: "equals", value: "familia" },
    ],
  };

  it("exige as duas — casar uma não basta", () => {
    // É o E, e é o que separa a regra nova de um OU acidental. Com OU, "SUV
    // para família" devolveria todo SUV e toda família: mais carros que
    // qualquer um dos dois recortes, o oposto de curar.
    expect(checkTagMatchesVehicle(suvDeFamilia, carro({ tipo: "SUV", perfis_uso: ["familia"] }), {})).toBe(true);
    expect(checkTagMatchesVehicle(suvDeFamilia, carro({ tipo: "SUV", perfis_uso: ["urbano"] }), {})).toBe(false);
    expect(checkTagMatchesVehicle(suvDeFamilia, carro({ tipo: "Hatch", perfis_uso: ["familia"] }), {})).toBe(false);
  });

  it("o perfil casa por QUALQUER item da lista, dentro da combinação", () => {
    // O carro tem três perfis; a condição pede um. Se a combinação olhasse só
    // o primeiro, um carro de três usos deixaria de casar em duas categorias.
    const v = carro({ tipo: "SUV", perfis_uso: ["urbano", "familia", "economico"] });
    expect(checkTagMatchesVehicle(suvDeFamilia, v, {})).toBe(true);
  });

  it("mistura texto e número na mesma regra", () => {
    const automaticoBarato: QuickTag = {
      id: "a",
      name: "A",
      condicoes: [
        { field: "cambio", operator: "equals", value: "Automático" },
        { field: "preco", operator: "less", value: "60000" },
      ],
    };
    expect(checkTagMatchesVehicle(automaticoBarato, carro({ cambio: "Automático", preco_original: 55000 }), {})).toBe(true);
    expect(checkTagMatchesVehicle(automaticoBarato, carro({ cambio: "Automático", preco_original: 90000 }), {})).toBe(false);
    expect(checkTagMatchesVehicle(automaticoBarato, carro({ cambio: "Manual", preco_original: 55000 }), {})).toBe(false);
  });

  it("`ano` compara como número, não como texto", () => {
    // Pelo campo aberto, sem caso próprio. Comparado como texto, "2019" seria
    // "maior" que "2022" em parte dos casos — e o erro sairia como uma vitrine
    // com os carros errados, nunca como exceção.
    const recente: QuickTag = {
      id: "r", name: "R",
      condicoes: [{ field: "ano", operator: "greater", value: "2022" }],
    };
    expect(checkTagMatchesVehicle(recente, carro({ ano: 2025 }), {})).toBe(true);
    expect(checkTagMatchesVehicle(recente, carro({ ano: 2019 }), {})).toBe(false);
  });

  it("a seleção manual vence condições que não casam", () => {
    // É como a campanha do mês monta a vitrine: carro a carro, contra a regra.
    const v = carro({ tipo: "Hatch", perfis_uso: ["urbano"] });
    expect(checkTagMatchesVehicle(suvDeFamilia, v, { "1": { quick_tags: ["suv-familia"] } })).toBe(true);
  });

  it("categoria só-manual não casa ninguém por regra", () => {
    const manual: QuickTag = {
      id: "campanha", name: "CAMPANHA",
      condicoes: [{ field: "manual", operator: "none", value: "" }],
    };
    expect(checkTagMatchesVehicle(manual, carro(), {})).toBe(false);
    expect(checkTagMatchesVehicle(manual, carro(), { "1": { quick_tags: ["campanha"] } })).toBe(true);
  });
});

describe("3 · os padrões fixos", () => {
  /** Amostra que reproduz as faixas reais medidas no pátio de 27/08. */
  const patio: Veiculo[] = [
    carro({ id: "a", ano: 2025, quilometragem: 4200, cambio: "Automático", preco_original: 318900 }),
    carro({ id: "b", ano: 2024, quilometragem: 30050, cambio: "Automático", preco_original: 120000 }),
    carro({ id: "c", ano: 2023, quilometragem: 66500, cambio: "Automático", preco_original: 89900 }),
    carro({ id: "d", ano: 2019, quilometragem: 98595, cambio: "Manual", preco_original: 62900 }),
    carro({ id: "e", ano: 2013, quilometragem: 170500, cambio: "Manual", preco_original: 39900 }),
    carro({ id: "f", ano: 2008, quilometragem: 210000, cambio: "Manual", preco_original: 23900 }),
  ];

  it("nenhum devolve zero, nenhum devolve o pátio inteiro", () => {
    // As duas formas de não curar nada. A lista antiga tinha uma de cada.
    for (const tag of DESTAQUES_PADRAO) {
      const n = patio.filter((v) => checkTagMatchesVehicle(tag, v, {})).length;
      expect(n, `${tag.name} não pega ninguém`).toBeGreaterThan(0);
      expect(n, `${tag.name} pega o pátio inteiro`).toBeLessThan(patio.length);
    }
  });

  it("os padrões mortos saíram", () => {
    const ids = DESTAQUES_PADRAO.map((t) => t.id);
    // `curadoria` apontava para um valor que a migração de perfis apagou;
    // `economicos` e `parcela_1k` devolviam 34 e 30 de 35.
    expect(ids).not.toContain("curadoria");
    expect(ids).not.toContain("economicos");
    expect(ids).not.toContain("parcela_1k");
  });

  it("nenhum padrão repete um recorte que `/estoque` já faz", () => {
    // Carroceria, perfil e faixa de preço já são vitrine automática. Repetir
    // aqui produziria duas URLs para a mesma grade, e alguém teria de decidir
    // qual é a canônica. O que sobra para a curadoria é o que a vitrine não
    // corta — mais a seleção manual e o banner editorial.
    for (const tag of DESTAQUES_PADRAO) {
      for (const cond of condicoesDaTag(tag)) {
        expect(["tipo", "perfil_uso", "preco"], `${tag.name} usa ${cond.field}`).not.toContain(cond.field);
      }
    }
  });

  it("`DEFAULT_QUICK_TAGS` é o mesmo objeto, não uma cópia", () => {
    // Eram duas listas idênticas em arquivos diferentes. Duas listas que
    // precisam mudar juntas divergem — é só questão de qual alguém acha antes.
    expect(DEFAULT_QUICK_TAGS).toBe(DESTAQUES_PADRAO);
  });

  it("valor de vocabulário fechado existe no vocabulário", () => {
    for (const tag of DESTAQUES_PADRAO) {
      for (const cond of condicoesDaTag(tag)) {
        if (cond.field === "tipo") expect(CARROCERIAS as readonly string[]).toContain(cond.value);
        if (cond.field === "perfil_uso") expect(SLUGS_DE_PERFIL as readonly string[]).toContain(cond.value);
      }
    }
  });
});

describe("4 · o painel não deixa mais montar regra cega", () => {
  const painel = lerCodigo("src/components/ConfiguracoesClientWrapper.tsx");

  it("o contador usa o MESMO motor da vitrine", () => {
    // Aqui vivia uma terceira cópia da regra, escrita à mão — e que não
    // conhecia `perfis_uso`: toda categoria de perfil aparecia com contagem
    // errada no painel, ao lado da vitrine certa.
    expect(painel).toContain("checkTagMatchesVehicle(tag, v, overrides)");
    expect(painel).toContain("const linkedCount = contarCasando(tag)");
  });

  it("conta sobre os PUBLICÁVEIS, não sobre o que só o painel vê", () => {
    // O painel carrega o fora do feed e o bloqueado por laudo ou fotos.
    // Contá-los infla um número que o visitante nunca verá.
    expect(painel).toContain("publicavel(v as never)");
  });

  it("avisa quando a regra não pega ninguém", () => {
    const fonte = ler("src/components/ConfiguracoesClientWrapper.tsx");
    expect(fonte).toContain("Esta regra não pega nenhum carro");
    expect(fonte).toContain("o pátio inteiro: uma categoria que não recorta nada");
  });

  it("o valor vira lista onde o vocabulário é fechado", () => {
    // Texto livre foi como se chegou à categoria de zero carro: era preciso
    // saber e digitar `urbano` exatamente, sem os oito nomes à vista.
    expect(painel).toContain("CARROCERIAS");
    expect(painel).toContain("PERFIS_DE_USO.map((pf) => pf.slug)");
  });

  it("salvar grava a forma nova, sem os campos antigos junto", () => {
    // Os dois lados no mesmo objeto seriam duas verdades, e a leitura prefere
    // `condicoes` — o campo antigo viraria mentira silenciosa.
    expect(painel).toContain("const { field: _f, operator: _o, value: _v, ...semFormaAntiga } = editingQuickTag");
  });

  it("condição sem valor é barrada antes de salvar", () => {
    const fonte = ler("src/components/ConfiguracoesClientWrapper.tsx");
    expect(fonte).toContain("Uma das condições está sem valor");
  });
});
