import { describe, it, expect, vi, beforeEach } from "vitest";
import { Fragment, type ReactElement } from "react";
import type { Veiculo } from "../src/types";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * A faixa do repasse na home (spec 2026-09-24 §10; decisões 3 e 6 do plano do
 * PR 4), pelo ponto de chamada e não pela função: a home monta a faixa com os
 * três abertos mais recentes, some com menos de três, sobrevive a uma pane na
 * leitura, e a área nova aparece com a ordem salva em produção sem ninguém
 * mexer no painel. Árvore percorrida como em `destaques-da-semana-na-home`
 * (a home inteira não é renderizada: ela puxa reputação e Instagram).
 */
const estado = vi.hoisted(() => ({
  repasses: [] as unknown[],
  falha: null as Error | null,
  areasHome: null as unknown,
}));
const registrarFalha = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}));

const carro = (id: string): Veiculo =>
  ({ id, marca: "Marca", modelo: "Modelo", versao: "V", vendido: false }) as unknown as Veiculo;
const ESTOQUE = Array.from({ length: 12 }, (_, i) => carro(`c${i + 1}`));

vi.mock("../src/lib/supabase", async (original) => ({
  ...(await original<typeof import("../src/lib/supabase")>()),
  getEstoque: async () => ESTOQUE,
}));
vi.mock("../src/lib/avaliacoesGoogle", () => ({ getReputacaoGoogle: async () => null }));
vi.mock("../src/lib/settings", async (original) => ({
  ...(await original<typeof import("../src/lib/settings")>()),
  getCachedSettings: async () => ({
    companySettings: null,
    aboutSettings: null,
    webhooks: null,
    popups: null,
    quickTags: null,
    stockOverrides: null,
    carouselVehicleIds: null,
    bankBalances: null,
    procedencia: null,
    instagramCuradoria: null,
    areasHome: estado.areasHome,
    ga4: null,
    destaquesDaSemana: null,
  }),
}));
vi.mock("../src/lib/leituraDosRepasses", () => ({
  lerRepassesPublicos: async () => {
    if (estado.falha) throw estado.falha;
    return estado.repasses;
  },
}));
vi.mock("../src/lib/observabilidade", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  registrarFalha,
}));

const { default: Home } = await import("../src/app/page");
const { default: FaixaDoRepasseNaHome } = await import("../src/components/repasse/FaixaDoRepasseNaHome");

/** Todo elemento da árvore, em ordem, descendo por `props` inteiro (elemento passado como prop não é filho). */
function elementos(no: unknown, achados: ReactElement<Record<string, unknown>>[] = []) {
  if (Array.isArray(no)) {
    no.forEach((n) => elementos(n, achados));
    return achados;
  }
  if (!no || typeof no !== "object") return achados;
  const elemento = no as ReactElement<Record<string, unknown>>;
  if (!elemento.props) return achados;
  achados.push(elemento);
  Object.values(elemento.props).forEach((valor) => elementos(valor, achados));
  return achados;
}

const faixas = async () => elementos(await Home()).filter((e) => e.type === FaixaDoRepasseNaHome);
/** Os ids das áreas na ordem em que a home as monta: cada uma é um `<Fragment key={id}>`. */
const ordemDasAreas = async () =>
  elementos(await Home())
    .filter((e) => e.type === Fragment && e.key !== null)
    .map((e) => e.key);

const publicado = { situacao: "publicado" as const, lojistas_desde: "2026-09-20T12:00:00Z" };
const aberto = (n: number, dia: string) =>
  repasseDeTeste({ ...publicado, id: `a${n}000000-0000-4000-8000-00000000000${n}`, slug: `aberto-${n}-a${n}0000`, aberto_ao_publico_em: dia });
const ABERTO_1 = aberto(1, "2026-09-24T12:00:00Z");
const ABERTO_2 = aberto(2, "2026-09-23T12:00:00Z");
const ABERTO_3 = aberto(3, "2026-09-22T12:00:00Z");
const ABERTO_4 = aberto(4, "2026-09-21T12:00:00Z");
const LOJISTAS = repasseDeTeste({ ...publicado, id: "b1000000-0000-4000-8000-000000000001", slug: "lojistas-b10000", lojistas_desde: "2026-09-24T14:00:00Z", aberto_ao_publico_em: null });

/** A ordem salva em produção, lida de `site_settings.areas_home` em 05/09 (a mesma de `areas-do-site.test.ts`). */
const ORDEM_DE_PRODUCAO = [
  "hero",
  "busca",
  "destaques_rapidos",
  "estoque_selecionado",
  "consultoria",
  "venda_troca",
  "reputacao",
  "instagram",
  "contato",
];

beforeEach(() => {
  estado.repasses = [];
  estado.falha = null;
  estado.areasHome = null;
  registrarFalha.mockClear();
});

describe("a faixa do repasse na home", () => {
  it("com três ou mais abertos, sai com os três mais recentes e o lote inteiro no CTA", async () => {
    estado.repasses = [ABERTO_4, LOJISTAS, ABERTO_2, ABERTO_1, ABERTO_3];
    const achadas = await faixas();
    expect(achadas).toHaveLength(1);

    const { faixa } = achadas[0].props as { faixa: { carros: { slug: string }[]; totalNoLote: number } };
    expect(faixa.carros.map((r) => r.slug)).toEqual([ABERTO_1.slug, ABERTO_2.slug, ABERTO_3.slug]);
    expect(faixa.totalNoLote).toBe(5);
  });

  it("com dois abertos, a área some inteira", async () => {
    estado.repasses = [ABERTO_1, ABERTO_2, LOJISTAS];
    expect(await faixas()).toHaveLength(0);
  });

  it("pane na leitura do repasse: a home continua e a falha é registrada", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    estado.falha = new Error("Leitura dos repasses falhou: banco fora");

    expect(await faixas()).toHaveLength(0);
    expect(registrarFalha).toHaveBeenCalledWith("quebra", "repasse-leitura-das-portas", estado.falha, {
      rota: "/",
      origem: "servidor",
    });
  });

  it("com a ordem salva em produção, a área entra sozinha, logo depois das faixas de preço", async () => {
    // Nenhum passo no painel: `normalizarAreas` põe o id novo ao lado da
    // vizinha que o precede no catálogo (decisão 3 do plano do PR 4).
    estado.areasHome = { ordem: ORDEM_DE_PRODUCAO, ocultas: [] };
    estado.repasses = [ABERTO_1, ABERTO_2, ABERTO_3];

    const ordem = await ordemDasAreas();
    expect(ordem).toContain("faixas_de_preco");
    expect(ordem.indexOf("repasse")).toBe(ordem.indexOf("faixas_de_preco") + 1);
    expect(ordem.indexOf("repasse")).toBeLessThan(ordem.indexOf("contato"));
    expect(await faixas()).toHaveLength(1);
  });
});
