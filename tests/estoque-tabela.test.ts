import { describe, it, expect } from "vitest";
import {
  classificarEstado,
  contarPorEstado,
  filtrarLinhas,
  idDoCaminhoDaPagina,
  mapaDeVisitas,
  contarLeadsPorVeiculo,
  normalizarBusca,
  versaoParaExibir,
  type LinhaDeEstoque,
} from "../src/lib/estoqueTabela";

/**
 * Testes da tabela de estoque (tela A6).
 *
 * O que esta camada decide é o que o operador vê como "publicado" — e é sobre
 * essa leitura que ele marca carro como vendido. Errar o estado aqui faz o
 * painel mentir sobre a vitrine.
 */

function linha(parcial: Partial<LinhaDeEstoque> = {}): LinhaDeEstoque {
  return {
    id: "4821",
    marca: "Land Rover",
    modelo: "Range Rover Evoque",
    versao: "R-Dynamic SE",
    ano: 2022,
    quilometragem: 38400,
    preco: 289900,
    foto: null,
    fotos: 12,
    estado: "publicado",
    tipo: "SUV",
    perfilUso: "",
    placa: "",
    destacado: false,
    visitas: null,
    leads: 0,
    divergente: false,
    quickTags: [],
    ...parcial,
  };
}

describe("classificarEstado", () => {
  it("no último sync e não vendido é publicado", () => {
    expect(classificarEstado({ vendido: false }, true)).toBe("publicado");
  });

  it("fora do último sync é fora do feed", () => {
    expect(classificarEstado({ vendido: false }, false)).toBe("fora_do_feed");
  });

  it("vendido vence fora do feed — o motivo real é a venda", () => {
    // O carro vendido some do feed no ciclo seguinte. Se "fora do feed"
    // ganhasse, a tela esconderia por que ele saiu.
    expect(classificarEstado({ vendido: true }, false)).toBe("vendido");
  });

  it("vendido nulo é tratado como não vendido", () => {
    expect(classificarEstado({ vendido: null }, true)).toBe("publicado");
  });
});

describe("contarPorEstado", () => {
  it("soma cada estado e o total", () => {
    const contagem = contarPorEstado([
      linha({ estado: "publicado" }),
      linha({ estado: "publicado" }),
      linha({ estado: "vendido" }),
      linha({ estado: "fora_do_feed" }),
    ]);
    expect(contagem).toEqual({ todos: 4, publicado: 2, vendido: 1, fora_do_feed: 1 });
  });

  it("lista vazia zera tudo em vez de quebrar", () => {
    expect(contarPorEstado([])).toEqual({ todos: 0, publicado: 0, vendido: 0, fora_do_feed: 0 });
  });
});

describe("normalizarBusca", () => {
  it("tira acento e caixa", () => {
    expect(normalizarBusca("  Citroën C4  ")).toBe("citroen c4");
  });
});

describe("filtrarLinhas", () => {
  const linhas = [
    linha({ id: "4821", marca: "Land Rover", modelo: "Evoque", estado: "publicado", placa: "ABC1D23" }),
    linha({ id: "4830", marca: "Toyota", modelo: "SW4", estado: "vendido" }),
    linha({ id: "4907", marca: "Citroën", modelo: "C4 Cactus", estado: "fora_do_feed" }),
  ];

  it("sem filtro devolve tudo", () => {
    expect(filtrarLinhas(linhas)).toHaveLength(3);
  });

  it("filtra por estado", () => {
    expect(filtrarLinhas(linhas, { estado: "vendido" }).map((l) => l.id)).toEqual(["4830"]);
  });

  it("acha por modelo sem acento", () => {
    expect(filtrarLinhas(linhas, { busca: "citroen" }).map((l) => l.id)).toEqual(["4907"]);
  });

  it("acha pelo código do veículo", () => {
    expect(filtrarLinhas(linhas, { busca: "4830" }).map((l) => l.id)).toEqual(["4830"]);
  });

  it("acha pela placa — a busca por placa nunca funcionou no painel antigo", () => {
    expect(filtrarLinhas(linhas, { busca: "abc1d23" }).map((l) => l.id)).toEqual(["4821"]);
  });

  it("combina estado e busca", () => {
    expect(filtrarLinhas(linhas, { estado: "publicado", busca: "toyota" })).toEqual([]);
  });
});

describe("versaoParaExibir", () => {
  it("some quando o modelo já traz a versão — o caso do feed", () => {
    // "camaro ss 6.2 v-8 2p" no modelo, "ss 6.2 v-8 2p" na versão: a segunda
    // linha era um eco em caixa baixa da primeira.
    expect(versaoParaExibir("Camaro Ss 6.2 V-8 2p", "ss 6.2 v-8 2p")).toBe("");
  });

  it("aparece quando diz algo que o modelo não diz", () => {
    expect(versaoParaExibir("Range Rover Evoque", "R-Dynamic SE")).toBe("R-Dynamic SE");
  });

  it("versão vazia não vira texto", () => {
    expect(versaoParaExibir("Onix", "")).toBe("");
    expect(versaoParaExibir("Onix", "   ")).toBe("");
  });

  it("ignora acento na comparação", () => {
    expect(versaoParaExibir("Citroën C4 Cactus Feel", "feel")).toBe("");
  });
});

describe("idDoCaminhoDaPagina", () => {
  it("extrai o id do fim do slug da PDP", () => {
    expect(
      idDoCaminhoDaPagina("/carros/land-rover/evoque/r-dynamic/land-rover-evoque-r-dynamic-4821"),
    ).toBe("4821");
  });

  it("ignora a query string e a barra final", () => {
    expect(idDoCaminhoDaPagina("/carros/fiat/argo/drive/fiat-argo-drive-77/?utm_source=meta")).toBe("77");
  });

  it("pega o ÚLTIMO número, não o do nome do modelo", () => {
    // "208" e "500" são modelos; o id é o que vem depois do último hífen.
    expect(idDoCaminhoDaPagina("/carros/peugeot/208/griffe/peugeot-208-griffe-6512")).toBe("6512");
    expect(idDoCaminhoDaPagina("/carros/fiat/500/cult/fiat-500-cult-33")).toBe("33");
  });

  it("caminho que não é de veículo devolve null", () => {
    expect(idDoCaminhoDaPagina("/estoque")).toBeNull();
    expect(idDoCaminhoDaPagina("")).toBeNull();
  });
});

describe("mapaDeVisitas", () => {
  it("null do GA4 continua null — nunca vira zero", () => {
    // Zero diria "ninguém viu este carro". Sem credencial, a verdade é "não sei".
    expect(mapaDeVisitas(null)).toBeNull();
  });

  it("soma caminhos diferentes que apontam para o mesmo veículo", () => {
    const mapa = mapaDeVisitas([
      { caminho: "/carros/a/b/c/a-b-c-10", visitas: 30 },
      { caminho: "/carros/a/b/c/a-b-c-10?ref=x", visitas: 12 },
      { caminho: "/estoque", visitas: 900 },
    ]);
    expect(mapa).toEqual({ "10": 42 });
  });
});

describe("contarLeadsPorVeiculo", () => {
  it("conta por veículo e ignora lead sem veículo", () => {
    const mapa = contarLeadsPorVeiculo([
      { veiculo_id: 4821 },
      { veiculo_id: "4821" },
      { veiculo_id: null },
      { veiculo_id: "" },
      {},
      { veiculo_id: 99 },
    ]);
    expect(mapa).toEqual({ "4821": 2, "99": 1 });
  });
});
