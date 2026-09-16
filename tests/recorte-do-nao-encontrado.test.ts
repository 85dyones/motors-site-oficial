import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Veiculo } from "../src/types";
import { EstoqueIndisponivelError } from "../src/lib/supabase";
import { slugificar } from "../src/lib/veiculoUrl";
import {
  montarRecorteDoNaoEncontrado,
  recorteDoNaoEncontrado,
} from "../src/lib/hubsDeEstoque";

/**
 * O que a página de não encontrado guarda no cache de dados — e o que não.
 *
 * Decisão do dono em 13/09: cache só no não encontrado. O motivo é o espaço de
 * endereços — os hubs são finitos, caminho falso é ilimitado, e cada caminho
 * inédito lia o estoque inteiro (~977 KB). O que se guarda é o recorte PRONTO,
 * não o estoque: é isso que deixa o item pequeno, longe do teto de 2 MB.
 *
 * Três coisas este arquivo trava:
 *   1. o recorte carrega só o que a página mostra — `Veiculo` apenas na amostra;
 *   2. a chave é fixa e a validade é uma hora;
 *   3. a falha do estoque ATRAVESSA a leitura com cache. Um `catch` lá dentro
 *      guardaria a pane por uma hora — é o que `navegacaoDoRodape.ts` faz com o
 *      rodapé, e é o desenho que aqui não pode ser copiado.
 */

const cacheDeDados = vi.hoisted(() => ({
  registros: [] as { chaves: unknown; opcoes: unknown }[],
}));

const estoque = vi.hoisted(() => ({ tentativas: 0, falha: null as Error | null }));

/* `unstable_cache` estoura fora de uma requisição do Next. O dublê faz com o
   resultado o que o servidor faz — `JSON.stringify` ao gravar e `JSON.parse` no
   acerto (`next/dist/server/web/spec-extension/unstable-cache.js`, l. 23 e
   168) — e deixa a rejeição atravessar, como no miss (l. 206). Um dublê que só
   repassasse seria mais permissivo que o servidor: `Date`, `Map` ou `undefined`
   no recorte passariam aqui e sumiriam em produção. */
vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => Promise<unknown>,
    chaves: unknown,
    opcoes: unknown,
  ) => {
    cacheDeDados.registros.push({ chaves, opcoes });
    return async (...args: unknown[]) => JSON.parse(JSON.stringify(await fn(...args)));
  },
}));

vi.mock("../src/lib/supabase", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  getEstoque: async (opts: { incluirForaDoFeed?: boolean } = {}) => {
    estoque.tentativas += 1;
    if (estoque.falha) throw estoque.falha;
    return opts.incluirForaDoFeed ? HISTORICO : DISPONIVEIS;
  },
}));

const veiculo = (
  id: string,
  marca: string,
  modelo: string,
  tipo: string,
  preco: number,
  vendido = false,
): Veiculo => ({
  id,
  marca,
  modelo,
  versao: "",
  ano: 2022,
  quilometragem: 30000,
  cambio: "Manual",
  combustivel: "Flex",
  cor: "Prata",
  fipe: "",
  tipo,
  preco_original: preco,
  preco_promocional: 0,
  pericia: "",
  opcionais: "",
  laudo_pericia: "",
  whatsapp_images: [],
  web_full_images: [],
  vendido,
});

/**
 * Quatro à venda e dois que já passaram, e cada filtro tem um caso que ele
 * precisa tirar:
 *   · Honda de carro E de moto — o bloco de marcas não pode repetir HONDA (R7);
 *   · Kia só no histórico — marca sem carro hoje fica fora dos links;
 *   · Strada só no histórico — `Picape` já existiu e hoje está vazia.
 */
const DISPONIVEIS = [
  veiculo("1", "Volkswagen", "Nivus", "SUV", 120000),
  veiculo("2", "Volkswagen", "Polo", "Hatch", 80000),
  veiculo("3", "Honda", "City", "Sedan", 100000),
  veiculo("4", "Honda", "CG 160", "Motocicleta", 20000),
];

const HISTORICO = [
  ...DISPONIVEIS,
  veiculo("5", "Kia", "Picanto", "Hatch", 50000, true),
  veiculo("6", "Fiat", "Strada", "Picape", 90000, true),
];

beforeEach(() => {
  estoque.tentativas = 0;
  estoque.falha = null;
});

describe("o recorte que a página de não encontrado guarda", () => {
  it("leva só amostra, índice e links contados", () => {
    const recorte = montarRecorteDoNaoEncontrado(HISTORICO, DISPONIVEIS);
    const links = [...recorte.carrocerias, ...recorte.marcasComEstoque];

    expect(Object.keys(recorte).sort()).toEqual(["carrocerias", "marcas", "marcasComEstoque", "patio"]);
    // Guarda de não-vacuidade: laço sobre lista vazia não assere nada.
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(Object.keys(link).sort()).toEqual(["href", "rotulo", "total"]);
    }
  });

  it("a amostra é o pátio, do mais barato ao mais caro", () => {
    const { patio } = montarRecorteDoNaoEncontrado(HISTORICO, DISPONIVEIS);

    expect(patio.map((v) => v.id)).toEqual(["4", "2", "3", "1"]);
  });

  it("carroceria sem carro hoje fica fora — Picape já existiu e está vazia", () => {
    const { carrocerias } = montarRecorteDoNaoEncontrado(HISTORICO, DISPONIVEIS);

    expect(carrocerias.map((c) => c.rotulo).sort()).toEqual(["Hatch", "SUV", "Sedan"]);
    expect(
      carrocerias.every((c) => c.total === 1 && c.href === `/estoque/${slugificar(c.rotulo)}`),
    ).toBe(true);
  });

  it("o bloco de marcas é só de carro e só com carro hoje — HONDA não se repete (R7)", () => {
    const { marcasComEstoque } = montarRecorteDoNaoEncontrado(HISTORICO, DISPONIVEIS);

    expect(marcasComEstoque).toEqual([
      { rotulo: "Volkswagen", href: "/carros/volkswagen", total: 2 },
      { rotulo: "Honda", href: "/carros/honda", total: 1 },
    ]);
  });

  it("o índice guarda as motos e as marcas zeradas — é ele que resolve o caminho", () => {
    const { marcas } = montarRecorteDoNaoEncontrado(HISTORICO, DISPONIVEIS);

    expect(marcas.find((m) => m.slug === "honda" && m.segmento === "motos")?.total).toBe(1);
    expect(marcas.find((m) => m.slug === "kia")?.total).toBe(0);
  });

  it("o índice que atravessa para o cliente não carrega registro de veículo", () => {
    const { marcas } = montarRecorteDoNaoEncontrado(HISTORICO, DISPONIVEIS);

    expect(marcas.length).toBeGreaterThan(0);
    expect(JSON.stringify(marcas)).not.toContain("preco");
    expect(Object.keys(marcas[0]!).sort()).toEqual(["modelos", "nome", "segmento", "slug", "total"]);
  });

  it("sobrevive à ida e volta por JSON que o cache de dados faz", () => {
    const recorte = montarRecorteDoNaoEncontrado(HISTORICO, DISPONIVEIS);

    expect(JSON.parse(JSON.stringify(recorte))).toStrictEqual(recorte);
  });
});

describe("a leitura com cache", () => {
  it("é registrada com chave fixa e uma hora de validade", () => {
    const registro = cacheDeDados.registros.find(
      (r) => JSON.stringify(r.chaves) === JSON.stringify(["recorte-do-nao-encontrado"]),
    );

    expect(registro, "recorteDoNaoEncontrado não passou por unstable_cache").toBeDefined();
    expect(registro!.opcoes).toEqual({ revalidate: 3600 });
  });

  it("devolve o recorte montado a partir do estoque", async () => {
    const recorte = await recorteDoNaoEncontrado();

    expect(estoque.tentativas).toBe(2);
    expect(recorte).toStrictEqual(
      JSON.parse(JSON.stringify(montarRecorteDoNaoEncontrado(HISTORICO, DISPONIVEIS))),
    );
  });

  it("na pane, a falha atravessa — e não vira recorte vazio guardado por uma hora", async () => {
    estoque.falha = new EstoqueIndisponivelError("o banco recusou a consulta — teste");

    await expect(recorteDoNaoEncontrado()).rejects.toBeInstanceOf(EstoqueIndisponivelError);
    // Chegou ao estoque: a falha é a do banco, e não de um atalho antes dele.
    expect(estoque.tentativas).toBeGreaterThan(0);
  });
});
