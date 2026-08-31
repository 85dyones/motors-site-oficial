import { describe, it, expect } from "vitest";
import type { Veiculo } from "../src/types";
import { getVeiculoPdpUrl } from "../src/lib/supabase";
import {
  acharHubDeCarroceria,
  acharHubDeMarca,
  acharHubDeModelo,
  caminhosDosHubs,
  hubsDeCarroceria,
  hubsDeMarca,
  rotuloDoModelo,
} from "../src/lib/hubsDeEstoque";
import { slugDeMarca, slugDeModelo } from "../src/lib/veiculoUrl";

/**
 * Hubs de marca, modelo e carroceria — as páginas que sobrevivem à venda.
 *
 * Até 2026-08-25 `/carros/jeep` e `/carros/jeep/renegade` respondiam 404
 * (§0.5.3 do plano de aquisição): a única camada indexável do estoque era a
 * ficha, que morre quando o carro é vendido. Este arquivo trava as três
 * decisões que fazem os hubs valerem a pena — e que são fáceis de desfazer sem
 * perceber, porque nada quebra na tela quando se desfazem.
 */

function veiculo(parcial: Partial<Veiculo> & Pick<Veiculo, "id" | "marca" | "modelo">): Veiculo {
  return {
    versao: "",
    ano: 2022,
    quilometragem: 40000,
    cambio: "Automático",
    combustivel: "Flex",
    cor: "Prata",
    fipe: "",
    preco_original: 100000,
    preco_promocional: 0,
    pericia: "",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
    ...parcial,
  } as Veiculo;
}

const RENEGADE = veiculo({
  id: "7977579",
  marca: "Jeep",
  modelo: "Renegade S T270 1.3 Tb 4x4 Flex Aut",
  versao: "S T270 1.3 Tb 4x4 Flex Aut",
  tipo: "SUV",
});

const COMPASS = veiculo({
  id: "111",
  marca: "Jeep",
  modelo: "Compass",
  versao: "Longitude 1.3 T270",
  tipo: "SUV",
});

const ONIX = veiculo({ id: "222", marca: "Chevrolet", modelo: "Chevrolet Onix", versao: "LT 1.0", tipo: "Hatch" });

describe("o slug do hub é o mesmo segmento que a ficha usa", () => {
  /**
   * Se hub e ficha slugificarem diferente, o hub lista carros cujas URLs não
   * batem com o próprio caminho — link interno para 404, em silêncio. É a
   * razão de `slugDeMarca`/`slugDeModelo` terem saído de dentro de
   * `getVeiculoPdpUrl` em vez de serem reescritos ao lado dele.
   */
  it.each([RENEGADE, COMPASS, ONIX])("$marca $modelo", (v) => {
    const [, segmento, marcaNaFicha, modeloNaFicha] = getVeiculoPdpUrl(v).split("/");

    expect(segmento).toBe("carros");
    expect(slugDeMarca(v.marca)).toBe(marcaNaFicha);
    expect(slugDeModelo(v.marca, v.modelo, v.versao)).toBe(modeloNaFicha);
  });

  it("tira o prefixo da marca que o feed embute no modelo", () => {
    // "Chevrolet Onix" vira `/carros/chevrolet/onix`, não `/chevrolet/chevrolet-onix`.
    expect(slugDeModelo("Chevrolet", "Chevrolet Onix", "LT 1.0")).toBe("onix");
    expect(rotuloDoModelo("Chevrolet", "Chevrolet Onix", "LT 1.0")).toBe("Onix");
  });

  it("tira a versão que o feed repete na cauda do modelo", () => {
    expect(slugDeModelo("Jeep", RENEGADE.modelo, RENEGADE.versao)).toBe("renegade");
    expect(rotuloDoModelo("Jeep", RENEGADE.modelo, RENEGADE.versao)).toBe("Renegade");
  });
});

describe("a URL da ficha — quatro segmentos, sem repetição (2026-08-31)", () => {
  /**
   * `getVeiculoPdpUrl` passou a chamar `limparModelo` e `slugificar` em vez de
   * repetir as regex. É refatoração pura: qualquer diferença renomeia URL já
   * indexada, que é o custo que a §2.2.2b do plano manda não pagar. Os casos
   * abaixo cobrem o que o feed do RevendaMais realmente manda.
   */
  it.each([
    [
      veiculo({ id: "7977579", marca: "Jeep", modelo: "Renegade S T270 1.3 Tb 4x4 Flex Aut", versao: "S T270 1.3 Tb 4x4 Flex Aut" }),
      "/carros/jeep/renegade/s-t270-1-3-turbo-4x4-flex-automatico-7977579",
    ],
    [
      // Marca embutida no modelo, versão repetida na cauda.
      veiculo({ id: "42", marca: "Chevrolet", modelo: "Chevrolet Cruze LTZ 1.4 Turbo", versao: "LTZ 1.4 Turbo" }),
      "/carros/chevrolet/cruze/ltz-1-4-turbo-42",
    ],
    [
      // Acento vira a letra sem acento desde 2026-08-28 — antes ele SUMIA, e
      // "Citroën" saía `citron`.
      //
      // A versão anterior deste caso preservava o comportamento antigo de
      // propósito, com o argumento de que transliterar "renomearia URL viva".
      // A premissa foi medida e não se sustenta: nenhum dos 35 veículos
      // servidos tem acento em marca, modelo ou versão, e nenhuma das 145 URLs
      // do sitemap sai mutilada. Não há URL viva para renomear.
      //
      // O que havia era um defeito à espera: `Utilitário` e `Conversível` são
      // carroceria da lista fechada, e o hub delas nasceria como
      // `/estoque/utilitrio` no dia em que o primeiro carro fosse classificado
      // assim — que é uma das pendências abertas do painel.
      veiculo({ id: "7", marca: "Citroën", modelo: "C4 Cactus", versao: "Feel 1.6" }),
      "/carros/citroen/c4-cactus/feel-1-6-7",
    ],
    [
      // Campos vazios caem nos mesmos fallbacks de antes.
      veiculo({ id: "9", marca: "", modelo: "", versao: "" }),
      "/carros/veiculo/padrao/padrao-9",
    ],
  ])("%#", (v, esperado) => {
    expect(getVeiculoPdpUrl(v)).toBe(esperado);
  });
});

describe("o hub é perene: existe pelo histórico, não pelo estoque de hoje", () => {
  /**
   * O ponto inteiro da camada. Um hub que some quando o último carro da marca
   * é vendido volta a ser efêmero — e o 301 da ficha vendida perde o destino
   * que ele existe para dar.
   */
  it("continua de pé com a grade vazia", () => {
    const hub = acharHubDeMarca([RENEGADE], [], "carros", "jeep");

    expect(hub).not.toBeNull();
    expect(hub!.nome).toBe("Jeep");
    expect(hub!.veiculos).toHaveLength(0);
    expect(hub!.modelos.map((m) => m.slug)).toContain("renegade");
  });

  it("o mesmo vale para o hub de modelo", () => {
    const hub = acharHubDeModelo([RENEGADE], [], "carros", "jeep", "renegade");

    expect(hub).not.toBeNull();
    expect(hub!.veiculos).toHaveLength(0);
  });

  it("marca que a loja nunca teve continua 404", () => {
    // Sem isto o site abriria espaço de URL infinito — `/carros/ferrari`,
    // `/carros/qualquer-coisa` — e cada erro de link viraria página indexável.
    expect(acharHubDeMarca([RENEGADE], [RENEGADE], "carros", "ferrari")).toBeNull();
    expect(acharHubDeModelo([RENEGADE], [RENEGADE], "carros", "jeep", "gladiator")).toBeNull();
  });

  it("não mistura os segmentos de carro e moto", () => {
    const harley = veiculo({ id: "333", marca: "Harley-Davidson", modelo: "Iron 883", tipo: "Motocicleta" });

    expect(acharHubDeMarca([harley], [harley], "carros", "harley-davidson")).toBeNull();
    expect(acharHubDeMarca([harley], [harley], "motos", "harley-davidson")).not.toBeNull();
  });
});

describe("carroceria vem de lista fechada", () => {
  it("aceita só as carrocerias do vocabulário", () => {
    const estoque = [RENEGADE, ONIX];

    expect(acharHubDeCarroceria(estoque, estoque, "suv")).not.toBeNull();
    expect(acharHubDeCarroceria(estoque, estoque, "hatch")).not.toBeNull();
    // O painel edita `tipo` à mão: sem a lista, um erro de digitação viraria URL.
    expect(acharHubDeCarroceria(estoque, estoque, "suvs")).toBeNull();
    expect(acharHubDeCarroceria(estoque, estoque, "premium")).toBeNull();
  });

  it("moto não ganha hub de carroceria — ela tem segmento próprio", () => {
    const harley = veiculo({ id: "333", marca: "Harley-Davidson", modelo: "Iron 883", tipo: "Motocicleta" });

    expect(hubsDeCarroceria([harley], [harley]).map((c) => c.slug)).not.toContain("motocicleta");
  });
});

describe("a grafia exibida sai do estoque, não de uma tabela inventada", () => {
  it("escolhe a forma mais frequente quando o feed varia a caixa", () => {
    const jeeps = [
      veiculo({ id: "1", marca: "JEEP", modelo: "Renegade" }),
      veiculo({ id: "2", marca: "Jeep", modelo: "Renegade" }),
      veiculo({ id: "3", marca: "Jeep", modelo: "Renegade" }),
    ];

    expect(hubsDeMarca(jeeps, jeeps, "carros")[0].nome).toBe("Jeep");
  });
});

describe("o sitemap anuncia todos os hubs, inclusive os vazios", () => {
  it("lista marca, modelo e carroceria", () => {
    const caminhos = caminhosDosHubs([RENEGADE, COMPASS, ONIX], [RENEGADE, ONIX]);

    expect(caminhos).toContain("/carros/jeep");
    expect(caminhos).toContain("/carros/jeep/renegade");
    // Compass está fora do estoque de hoje e mesmo assim entra: hub que some do
    // sitemap ao vender o último carro volta a ser efêmero.
    expect(caminhos).toContain("/carros/jeep/compass");
    expect(caminhos).toContain("/estoque/suv");
    expect(caminhos).toContain("/estoque/hatch");
  });
});
