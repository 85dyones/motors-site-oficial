import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { CardVeiculo } from "../src/components/modernist/primitivos";
import type { Veiculo } from "../src/types";

/**
 * O ponto de chamada, e não a função.
 *
 * A regra da grade tem teste próprio em `destaques-da-semana.test.ts`. Este
 * arquivo responde a outra pergunta: **a home usa o que a regra devolveu?**
 * Mutar a função e ver o teste dela ficar vermelho não responde isso.
 */

const carro = (id: string): Veiculo =>
  ({ id, marca: "Marca", modelo: "Modelo", versao: "V", vendido: false }) as unknown as Veiculo;

const ESTOQUE = Array.from({ length: 12 }, (_, i) => carro(`c${i + 1}`));

vi.mock("../src/lib/supabase", async (original) => ({
  ...(await original<typeof import("../src/lib/supabase")>()),
  getEstoque: async () => ESTOQUE,
}));

vi.mock("../src/lib/avaliacoesGoogle", () => ({
  getReputacaoGoogle: async () => null,
}));

vi.mock("../src/lib/settings", async (original) => ({
  ...(await original<typeof import("../src/lib/settings")>()),
  getCachedSettings: async () => ({
    companySettings: null,
    aboutSettings: null,
    webhooks: null,
    popups: null,
    quickTags: null,
    stockOverrides: null,
    // O banner fica com c1..c3; a grade não pode repeti-los.
    carouselVehicleIds: ["c1", "c2", "c3"],
    bankBalances: null,
    procedencia: null,
    instagramCuradoria: null,
    areasHome: null,
    ga4: null,
    destaquesDaSemana: ["c9", "c7", "c5"],
  }),
}));

beforeEach(() => {
  // A home não injeta sorteador — `montarDestaquesDaSemana` cai em
  // `Math.random`. Sem travar isso, a guarda do `excluir` abaixo só acusa a
  // regressão em ~76% das rodadas: medido, 3 verdes em 12 execuções com a
  // fiação quebrada. Uma guarda que passa 1 em cada 4 vezes que deveria
  // reprovar não é guarda.
  vi.spyOn(Math, "random").mockReturnValue(0);
});

/**
 * Todo `CardVeiculo` da árvore, na ordem em que aparece.
 *
 * Varre `props` inteiro, não só `children`: elemento passado como prop não é
 * filho de ninguém, e some de um varredor que só desce por `children`.
 * Compara por referência ao componente, não pelo nome — nome de função
 * sobrevive à transpilação, mas depender disso é frágil à toa.
 */
function cards(no: unknown, achados: Array<Record<string, unknown>> = []) {
  if (Array.isArray(no)) {
    no.forEach((n) => cards(n, achados));
    return achados;
  }
  if (!no || typeof no !== "object") return achados;
  const elemento = no as ReactElement<Record<string, unknown>>;
  if (!elemento.props) return achados;
  if (elemento.type === CardVeiculo) achados.push(elemento.props);
  Object.values(elemento.props).forEach((valor) => cards(valor, achados));
  return achados;
}

describe("a home renderiza a grade que a regra montou", () => {
  it("mostra 6 cards, com os marcados na frente e na ordem da marcação", async () => {
    const Home = (await import("../src/app/page")).default;
    const grade = cards(await Home());

    const ids = grade.map((p) => (p.veiculo as Veiculo).id);

    expect(ids, `a grade veio com ${ids.length} cards`).toHaveLength(6);
    expect(ids.slice(0, 3)).toEqual(["c9", "c7", "c5"]);
  });

  it("o sorteio não repete na grade quem está no banner", async () => {
    const Home = (await import("../src/app/page")).default;
    const ids = cards(await Home()).map((p) => (p.veiculo as Veiculo).id);

    expect(ids).not.toContain("c1");
    expect(ids).not.toContain("c2");
    expect(ids).not.toContain("c3");
  });

  it("nenhum card sai sem veículo", async () => {
    // O sorteio fatiando além do fim devolveria `undefined` aqui — e a página
    // quebraria em produção, não no teste da função.
    const Home = (await import("../src/app/page")).default;
    const grade = cards(await Home());

    expect(grade.every((p) => Boolean((p.veiculo as Veiculo | undefined)?.id))).toBe(true);
  });
});
