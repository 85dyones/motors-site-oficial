import { describe, it, expect } from "vitest";
import {
  contextoDaFichaPerdida,
  indiceDeMarcas,
  patioEmDestaque,
  type MarcaConhecida,
} from "../src/lib/fichaPerdida";
import type { HubDeMarca } from "../src/lib/hubsDeEstoque";
import type { Veiculo } from "../src/types";

/**
 * Quem chega numa ficha que não existe mais precisa saber O QUÊ não existe.
 *
 * ---------------------------------------------------------------------------
 * O defeito que isto existe para impedir
 * ---------------------------------------------------------------------------
 * A rota da ficha chama `notFound()`, e até 2026-09-11 o corpo servido era o
 * 404 nativo do Next — `404: This page could not be found.`, em inglês, dentro
 * da moldura da marca. Verificado em produção:
 *
 *     curl -s https://motorsstore.com.br/carros/volkswagen/nivus/…-999999999
 *     → 404, "404: This page could not be found"
 *
 * A página nova precisa do contexto para não ser genérica, e o contexto só
 * existe no CAMINHO: `not-found.tsx` não recebe `params`. Daí esta função.
 *
 * ---------------------------------------------------------------------------
 * Por que resolver contra o índice, e nunca humanizar o slug
 * ---------------------------------------------------------------------------
 * A tentação é virar `volkswagen` em `Volkswagen` com um `toUpperCase` na
 * primeira letra. `ContextoDaEncomenda.marca` diz o contrário, e diz por
 * escrito: *"Como a loja escreve a marca — vem do hub, não digitado"*.
 *
 * O custo de humanizar aparece no caminho torto, que é justamente o que chega
 * numa 404: `/carros/foo/bar/x-1` viraria um pedido de encomenda de uma marca
 * "Foo" que não existe, gravado no banco e enviado ao consultor. Slug que não
 * casa com marca conhecida devolve contexto vazio, e a página cai no texto
 * genérico — que é honesto.
 *
 * O mesmo vale para `T-Cross` e `HR-V`: nenhuma regra de capitalização acerta
 * os dois, e o índice já sabe a resposta.
 *
 * ---------------------------------------------------------------------------
 * A regra que a revisão de 11/09 obrigou a existir
 * ---------------------------------------------------------------------------
 * O formulário de encomenda escreve, na voz do CLIENTE e dentro da coluna
 * `interesse` de `leads`: *"Vi que não tem no estoque agora — me avisem quando
 * entrar"* (`lib/encomenda.ts`). Nos hubs essa frase é verdadeira porque o
 * formulário só existe quando a grade está vazia — a guarda É a verdade da
 * frase.
 *
 * Nesta página a grade é vazia por construção, então a guarda não vale, e a
 * primeira versão produziu isto com um Nivus no pátio:
 *
 *     "Quando entrar Volkswagen Nivus, um consultor avisa."   ← no formulário
 *     Nivus, R$ 1XX.XXX                                        ← na mesma tela
 *
 * Afirmação falsa, na voz do cliente, gravada no banco. Daí o contrato novo:
 * quando o hub que atende o caminho TEM carro, o contexto não vai para o
 * formulário — vira link para o hub, que é o que resolve de verdade (R6:
 * página sem estoque linka para onde há estoque).
 */

const marcas: MarcaConhecida[] = [
  {
    slug: "volkswagen",
    nome: "Volkswagen",
    segmento: "carros",
    total: 2,
    modelos: [
      { slug: "nivus", nome: "Nivus", total: 2 },
      { slug: "t-cross", nome: "T-Cross", total: 0 },
      { slug: "saveiro", nome: "Saveiro", total: 0 },
    ],
  },
  {
    slug: "kia",
    nome: "Kia",
    segmento: "carros",
    total: 0,
    modelos: [{ slug: "picanto", nome: "Picanto", total: 0 }],
  },
  {
    slug: "honda",
    nome: "Honda",
    segmento: "motos",
    total: 0,
    modelos: [{ slug: "cg-160", nome: "CG 160", total: 0 }],
  },
];

const CAMINHO_NIVUS = "/carros/volkswagen/nivus/vw-nivus-highline-200-tsi-8100626";

describe("o contexto que sobra quando a ficha não existe", () => {
  it("lê marca e modelo do caminho da ficha", () => {
    const { encomenda } = contextoDaFichaPerdida(
      "/carros/volkswagen/t-cross/vw-t-cross-comfortline-1234",
      marcas,
    );

    expect(encomenda).toEqual({
      marca: "Volkswagen",
      modelo: "T-Cross",
      caminho: "/carros/volkswagen/t-cross/vw-t-cross-comfortline-1234",
      segmento: "carros",
    });
  });

  it("grava no lead o caminho que a pessoa abriu, não o hub", () => {
    const { encomenda } = contextoDaFichaPerdida(
      "/carros/volkswagen/saveiro/vw-saveiro-robust-4321",
      marcas,
    );

    expect(encomenda.caminho).toBe("/carros/volkswagen/saveiro/vw-saveiro-robust-4321");
  });

  it("preserva a grafia que a loja usa, em vez de capitalizar o slug", () => {
    const { encomenda } = contextoDaFichaPerdida(
      "/carros/volkswagen/t-cross/vw-t-cross-comfortline-1234",
      marcas,
    );

    expect(encomenda.modelo).toBe("T-Cross");
  });

  it("cai na marca quando o modelo não é conhecido e a marca está zerada", () => {
    const { encomenda } = contextoDaFichaPerdida("/carros/kia/sportage/kia-sportage-99", marcas);

    expect(encomenda.marca).toBe("Kia");
    expect(encomenda.modelo).toBeNull();
  });

  it("não inventa marca: caminho desconhecido vai ao formulário sem contexto", () => {
    const { encomenda } = contextoDaFichaPerdida("/carros/foo/bar/algo-1", marcas);

    expect(encomenda.marca).toBe("");
    expect(encomenda.modelo).toBeNull();
    expect(encomenda.caminho).toBe("/carros/foo/bar/algo-1");
  });

  it("não confunde o modelo de uma marca com o de outra", () => {
    // `nivus` é da Volkswagen. Pedido sob `kia`, não pode virar "Kia Nivus".
    const { encomenda } = contextoDaFichaPerdida("/carros/kia/nivus/algo-1", marcas);

    expect(encomenda.marca).toBe("Kia");
    expect(encomenda.modelo).toBeNull();
  });

  it("respeita o segmento: moto é moto, carro é carro", () => {
    const { encomenda } = contextoDaFichaPerdida(
      "/motos/honda/cg-160/honda-cg-160-2022-77",
      marcas,
    );

    expect(encomenda.marca).toBe("Honda");
    expect(encomenda.modelo).toBe("CG 160");
    expect(encomenda.segmento).toBe("motos");
  });

  it("não casa marca de outro segmento", () => {
    // Existe `honda` no índice, mas em `motos`. Sob `/carros/` não é ela.
    const { encomenda } = contextoDaFichaPerdida("/carros/honda/cg-160/x-1", marcas);

    expect(encomenda.marca).toBe("");
  });

  /**
   * ⚠️ `hubComEstoque` faz parte da asserção, e não é zelo: `nivus` TEM carro,
   * então o ramo do B2 também devolveria `marca: ""`. Medindo só a marca, apagar
   * a guarda de segmento deixava o teste **verde** — confirmado por mutação, e é
   * o defeito que o `indexOf -1` já ensinou nesta casa: asserção que não prova
   * ter chegado no ramo fica verde no caso que ela existe para gritar.
   */
  it("devolve contexto vazio para segmento que não serve ficha", () => {
    const perdida = contextoDaFichaPerdida("/estoque/volkswagen/nivus/algo-1", marcas);

    expect(perdida.encomenda.marca).toBe("");
    expect(perdida.encomenda.segmento).toBe("carros");
    expect(perdida.hubComEstoque).toBeNull();
  });

  it("devolve contexto vazio para caminho curto demais para ser ficha", () => {
    const perdida = contextoDaFichaPerdida("/carros/volkswagen/nivus", marcas);

    expect(perdida.encomenda.marca).toBe("");
    expect(perdida.hubComEstoque).toBeNull();
  });

  it("ignora barra final e caixa alta do caminho", () => {
    const { encomenda } = contextoDaFichaPerdida("/CARROS/Volkswagen/Saveiro/VW-1/", marcas);

    expect(encomenda.modelo).toBe("Saveiro");
  });
});

/**
 * A regra que impede o formulário de mentir. Ver a nota longa no topo.
 */
describe("quando o hub que atende o caminho TEM carro", () => {
  it("o formulário não promete avisar sobre o que está na tela", () => {
    const { encomenda } = contextoDaFichaPerdida(CAMINHO_NIVUS, marcas);

    expect(encomenda.marca).toBe("");
    expect(encomenda.modelo).toBeNull();
  });

  it("e o hub vira link, com a contagem", () => {
    const { hubComEstoque } = contextoDaFichaPerdida(CAMINHO_NIVUS, marcas);

    expect(hubComEstoque).toEqual({
      rotulo: "Volkswagen Nivus",
      href: "/carros/volkswagen/nivus",
      total: 2,
    });
  });

  it("modelo zerado numa marca com estoque manda para a marca", () => {
    const { encomenda, hubComEstoque } = contextoDaFichaPerdida(
      "/carros/volkswagen/saveiro/vw-saveiro-robust-4321",
      marcas,
    );

    expect(hubComEstoque).toEqual({
      rotulo: "Volkswagen",
      href: "/carros/volkswagen",
      total: 2,
    });
    // O modelo continua no formulário: Saveiro zerada, a frase é verdadeira.
    expect(encomenda.modelo).toBe("Saveiro");
  });

  it("sem carro em lugar nenhum, não há link e o contexto é do cliente", () => {
    const { encomenda, hubComEstoque } = contextoDaFichaPerdida(
      "/carros/kia/picanto/kia-picanto-ex3-77",
      marcas,
    );

    expect(hubComEstoque).toBeNull();
    expect(encomenda.marca).toBe("Kia");
    expect(encomenda.modelo).toBe("Picanto");
  });
});

/**
 * O índice é o que o servidor manda para o cliente — e por isso ele é magro de
 * propósito: `slug`, `nome` e a contagem. Nada de `Veiculo`.
 *
 * A regra que ele obedece não está escrita em nenhum lint: está no incidente.
 * Passar o registro do veículo inteiro como prop de client component foi como
 * `preco_compra` saiu no HTML do `/estoque`. Quem recorta, recorta na
 * FRONTEIRA — aqui — e não no consumo.
 *
 * Ele recebe `HubDeMarca[]` em vez do estoque cru pelo mesmo motivo que
 * `lib/coerenciaDoCadastro.ts` não importa nada além de tipos: montar o hub
 * exige `lib/hubsDeEstoque`, que importa o cliente do Supabase, e este módulo é
 * lido por um client component. Quem chama `hubsDeMarca` é o servidor.
 */
describe("o índice de marcas servido ao cliente", () => {
  const hub = (
    nome: string,
    slug: string,
    segmento: "carros" | "motos",
    modelos: { nome: string; slug: string; quantos: number }[],
  ) =>
    ({
      nome,
      slug,
      segmento,
      veiculos: Array.from(
        { length: modelos.reduce((s, m) => s + m.quantos, 0) },
        () => ({ id: "1", preco_compra: 55000 }) as unknown as Veiculo,
      ),
      modelos: modelos.map((m) => ({
        nome: m.nome,
        slug: m.slug,
        marca: nome,
        genero: "m",
        canonicalDe: null,
        veiculos: Array.from(
          { length: m.quantos },
          () => ({ id: "1", preco_compra: 55000 }) as unknown as Veiculo,
        ),
      })),
    }) as unknown as HubDeMarca;

  it("leva marca, modelo e contagem dos dois segmentos", () => {
    const indice = indiceDeMarcas([
      hub("Volkswagen", "volkswagen", "carros", [{ nome: "Nivus", slug: "nivus", quantos: 2 }]),
      hub("Honda", "honda", "motos", [{ nome: "CG 160", slug: "cg-160", quantos: 0 }]),
    ]);

    expect(indice.find((m) => m.slug === "volkswagen")).toEqual({
      slug: "volkswagen",
      nome: "Volkswagen",
      segmento: "carros",
      total: 2,
      modelos: [{ slug: "nivus", nome: "Nivus", total: 2 }],
    });
    expect(indice.find((m) => m.slug === "honda")?.segmento).toBe("motos");
  });

  it("não carrega o registro do veículo para o cliente", () => {
    const indice = indiceDeMarcas([
      hub("Volkswagen", "volkswagen", "carros", [{ nome: "Nivus", slug: "nivus", quantos: 2 }]),
    ]);

    expect(JSON.stringify(indice)).not.toContain("preco_compra");
    expect(Object.keys(indice[0]!).sort()).toEqual([
      "modelos",
      "nome",
      "segmento",
      "slug",
      "total",
    ]);
    expect(Object.keys(indice[0]!.modelos[0]!).sort()).toEqual(["nome", "slug", "total"]);
  });
});

/**
 * A amostra da grade, que a revisão de 11/09 pegou.
 *
 * ---------------------------------------------------------------------------
 * O defeito
 * ---------------------------------------------------------------------------
 * `getEstoque` ordena por `preco desc` e `disponiveisDe` preserva. A primeira
 * versão desta página fazia `disponiveis.slice(0, 6)`, o que punha na 404, com
 * o pátio real de 11/09: X4 de R$ 318.900, Camaro SS de R$ 229.900, X1 de
 * R$ 179.900 — numa loja de mediana R$ 61.900 e piso R$ 13.900, cujo
 * `POSICIONAMENTO.md` manda **evitar** "premium, luxo, exclusivo". Quem clicou
 * num anúncio de um hatch de R$ 40 mil recebia uma parede de carro caro.
 *
 * ---------------------------------------------------------------------------
 * Por que não é "os que entraram por último"
 * ---------------------------------------------------------------------------
 * Era a saída óbvia, e o dado a derruba: medido em produção em 11/09, **13 dos
 * 88** veículos com `vendido = false` têm `first_seen_at`. Ordenar por chegada
 * daria a mesma vitrine congelada de treze carros para sempre, e os outros 75
 * nunca apareceriam — bias pior que o do preço, e invisível. (`created_at`
 * existe nas 88 linhas, mas não é mapeado para `Veiculo`.)
 *
 * ---------------------------------------------------------------------------
 * A régua que ficou
 * ---------------------------------------------------------------------------
 * Amostra igualmente espaçada ao longo do preço, extremos inclusos. Não é
 * número de negócio — é regra de apresentação, da mesma natureza da banda de
 * `lib/similares.ts`, e existe para uma coisa só: **nenhuma faixa monopoliza a
 * página**. Quem cai aqui veio de um carro que não existe mais, e a loja não
 * sabe quanto ele queria gastar; mostrar o pátio inteiro em miniatura é a
 * única oferta honesta.
 */
describe("a amostra que a 404 mostra", () => {
  const carro = (id: string, preco: number, promocional = 0): Veiculo =>
    ({ id, preco_original: preco, preco_promocional: promocional }) as unknown as Veiculo;

  /** Nove carros de R$ 20 mil a R$ 100 mil, na ordem que `getEstoque` devolve. */
  const patio = () =>
    [100, 90, 80, 70, 60, 50, 40, 30, 20].map((mil) => carro(`p${mil}`, mil * 1000));

  it("não devolve os mais caros — é a regressão que isto guarda", () => {
    const ids = patioEmDestaque(patio(), 3).map((v) => v.id);

    expect(ids).not.toEqual(["p100", "p90", "p80"]);
  });

  it("cobre do mais barato ao mais caro", () => {
    const ids = patioEmDestaque(patio(), 3).map((v) => v.id);

    expect(ids[0]).toBe("p20");
    expect(ids[ids.length - 1]).toBe("p100");
  });

  it("passa pelo meio da faixa, e não só pelos extremos", () => {
    expect(patioEmDestaque(patio(), 3).map((v) => v.id)).toEqual(["p20", "p60", "p100"]);
  });

  it("não repete carro", () => {
    const ids = patioEmDestaque(patio(), 6).map((v) => v.id);

    expect(new Set(ids).size).toBe(6);
  });

  it("respeita o teto", () => {
    expect(patioEmDestaque(patio(), 6)).toHaveLength(6);
  });

  it("com menos carros que o teto, devolve todos, do mais barato ao mais caro", () => {
    const ids = patioEmDestaque([carro("caro", 90000), carro("barato", 20000)], 6).map(
      (v) => v.id,
    );

    expect(ids).toEqual(["barato", "caro"]);
  });

  it("pátio vazio não quebra", () => {
    expect(patioEmDestaque([], 6)).toEqual([]);
  });

  /**
   * O teto 1 é o degrau que a aritmética não atravessa: com `limite = 1` o
   * divisor `limite - 1` zera, `(0 * ultimo) / 0` é `NaN`, e `porPreco[NaN]`
   * devolve `undefined` — a grade receberia `[undefined]` e `GradeDeVeiculos`
   * estouraria no `veiculo.id`. A guarda existe para isso e não tinha teste.
   */
  it("teto 1 devolve um carro, e não um buraco", () => {
    const amostra = patioEmDestaque(patio(), 1);

    expect(amostra).toHaveLength(1);
    expect(amostra[0]?.id).toBe("p20");
  });

  it("teto 0 e teto negativo devolvem lista vazia", () => {
    expect(patioEmDestaque(patio(), 0)).toEqual([]);
    expect(patioEmDestaque(patio(), -2)).toEqual([]);
  });

  it("usa o preço vigente, não o de tabela", () => {
    // O promocional de R$ 15 mil faz deste o mais barato, apesar do `original`.
    const ids = patioEmDestaque(
      [carro("promo", 200000, 15000), carro("a", 30000), carro("b", 90000)],
      2,
    ).map((v) => v.id);

    expect(ids).toEqual(["promo", "b"]);
  });

  it("desempata por id, para a ordem não trocar entre builds", () => {
    const ids = patioEmDestaque([carro("b", 50000), carro("a", 50000)], 2).map((v) => v.id);

    expect(ids).toEqual(["a", "b"]);
  });

  it("não muta o pátio recebido", () => {
    const original = patio();
    const antes = original.map((v) => v.id);

    patioEmDestaque(original, 3);

    expect(original.map((v) => v.id)).toEqual(antes);
  });
});
