import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Veiculo } from "../src/types";

/**
 * Uma leitura do estoque por render, e não duas.
 *
 * O hub chama `recortesDoEstoque` no `generateMetadata` e de novo na página, e
 * cada chamada eram duas consultas `select *` a `estoque_motors`. A pendência
 * do #70 é passar a função pelo `cache()` do React — o mesmo de
 * `lib/secaoDeGuias.ts` —, que memoiza dentro de UMA requisição e não guarda
 * nada entre elas.
 *
 * ⚠️ O dublê de `cache` é o que torna isto testável, e o motivo é medido: no
 * vitest, `react` resolve para o build de CLIENTE, em que `cache(fn)` devolve
 * uma função que só repassa a chamada (`node_modules/react/cjs/
 * react.development.js`, `exports.cache`). Quem memoiza é o build
 * `react-server`, que só existe dentro do render do Next. O dublê faz o que
 * esse build faz numa requisição — guarda o primeiro resultado, promessa
 * rejeitada inclusive —, e o teste mede se a função PASSA por ele.
 */

const leituras = vi.hoisted(() => ({ total: 0 }));

vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>();
  return {
    ...real,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      let guardado: { valor: R } | undefined;
      return (...args: A): R => {
        if (!guardado) guardado = { valor: fn(...args) };
        return guardado.valor;
      };
    },
  };
});

const veiculo = (id: string, vendido: boolean): Veiculo =>
  ({
    id,
    marca: "Volkswagen",
    modelo: "Nivus",
    versao: "",
    tipo: "SUV",
    vendido,
  }) as unknown as Veiculo;

/* O dublê responde conforme a opção, como o servidor: o histórico traz quem
   saiu do feed; a leitura sem opção traz o que está no ar — vendido incluso,
   porque quem tira o vendido é `disponiveisDe`, e é isso que o segundo teste
   cobra. */
vi.mock("../src/lib/supabase", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  getEstoque: async (opts: { incluirForaDoFeed?: boolean } = {}) => {
    leituras.total += 1;
    return opts.incluirForaDoFeed
      ? [veiculo("fora-do-feed", true), veiculo("vendido", true), veiculo("no-ar", false)]
      : [veiculo("vendido", true), veiculo("no-ar", false)];
  },
}));

/* Módulo novo a cada teste: o `cache` dublado guarda para sempre, e sem isto o
   segundo teste herdaria a leitura do primeiro. */
async function carregar() {
  vi.resetModules();
  return import("../src/lib/hubsDeEstoque");
}

beforeEach(() => {
  leituras.total = 0;
});

describe("recortesDoEstoque dentro de uma requisição", () => {
  it("duas chamadas fazem uma leitura de cada recorte, e não duas", async () => {
    const { recortesDoEstoque } = await carregar();

    const primeira = await recortesDoEstoque();
    const segunda = await recortesDoEstoque();

    expect(leituras.total).toBe(2);
    expect(segunda).toBe(primeira);
  });

  it("o recorte não muda: histórico inteiro, disponíveis sem vendido", async () => {
    const { recortesDoEstoque } = await carregar();

    const { historico, disponiveis } = await recortesDoEstoque();

    expect(historico.map((v) => v.id)).toEqual(["fora-do-feed", "vendido", "no-ar"]);
    expect(disponiveis.map((v) => v.id)).toEqual(["no-ar"]);
  });
});
