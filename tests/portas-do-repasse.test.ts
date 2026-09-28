import { describe, it, expect, vi, beforeEach } from "vitest";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * A regra das portas do repasse (spec 2026-09-24 §10; decisões 2, 3 e 6 do
 * plano do PR 4): a faixa do /estoque com 1 ou mais carros abertos a todos; a
 * da home com os 3 abertos mais recentes, e só com 3 ou mais; e a leitura que
 * troca a pane por lista vazia, registrando a falha para a faixa não sumir
 * sem ninguém saber.
 */
// `falha` é uma caixa, e não o erro solto: só assim o dublê consegue rejeitar
// com um valor falso (`undefined`), que `if (estado.falha)` deixaria passar.
const estado = vi.hoisted(() => ({
  repasses: [] as unknown[],
  falha: null as { valor: unknown } | null,
  rotas: [] as string[],
}));
const registrarFalha = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}));

vi.mock("../src/lib/leituraDosRepasses", () => ({
  lerRepassesPublicos: async (_agora: Date, rota: string) => {
    estado.rotas.push(rota);
    if (estado.falha) throw estado.falha.valor;
    return estado.repasses;
  },
}));
vi.mock("../src/lib/observabilidade", () => ({ registrarFalha }));

const { CARROS_NA_FAIXA_DA_HOME, faixaNaHome, faixaNoEstoque, lerRepassesDasPortas } = await import(
  "../src/lib/portasDoRepasse"
);

const AGORA = new Date("2026-09-24T15:00:00Z");
const aberto = (n: number, aberto_ao_publico_em: string) =>
  repasseDeTeste({
    id: `a${n}000000-0000-4000-8000-00000000000${n}`,
    slug: `aberto-${n}-a${n}0000`,
    situacao: "publicado",
    lojistas_desde: "2026-09-20T12:00:00Z",
    aberto_ao_publico_em,
  });
const ABERTO_1 = aberto(1, "2026-09-24T12:00:00Z"); // o aberto mais recente
const ABERTO_2 = aberto(2, "2026-09-23T12:00:00Z");
const ABERTO_3 = aberto(3, "2026-09-22T12:00:00Z");
const ABERTO_4 = aberto(4, "2026-09-21T12:00:00Z");
// Mais recentes que qualquer aberto, de propósito: a home não pode pegá-los.
const LOJISTAS = repasseDeTeste({
  id: "b1000000-0000-4000-8000-000000000001",
  slug: "lojistas-b10000",
  situacao: "publicado",
  lojistas_desde: "2026-09-24T14:00:00Z",
  aberto_ao_publico_em: null,
});
const RESERVADO = repasseDeTeste({
  id: "c1000000-0000-4000-8000-000000000001",
  slug: "reservado-c10000",
  situacao: "reservado",
  lojistas_desde: "2026-09-20T12:00:00Z",
  aberto_ao_publico_em: "2026-09-24T13:00:00Z",
  reservado_em: "2026-09-24T14:30:00Z",
});
const VENDIDO = repasseDeTeste({
  id: "d1000000-0000-4000-8000-000000000001",
  slug: "vendido-d10000",
  situacao: "vendido",
  lojistas_desde: "2026-09-10T12:00:00Z",
  aberto_ao_publico_em: "2026-09-10T12:00:00Z",
  vendido_em: "2026-09-22T12:00:00Z",
});

beforeEach(() => {
  estado.repasses = [];
  estado.falha = null;
  estado.rotas = [];
  registrarFalha.mockClear();
});

describe("a faixa do /estoque", () => {
  it("sem carro nenhum, não há faixa", () => {
    expect(faixaNoEstoque([], AGORA)).toBeNull();
  });

  it("com lote mas nenhum aberto a todos, também não: só-lojistas, reservado e vendido não contam", () => {
    expect(faixaNoEstoque([LOJISTAS, RESERVADO, VENDIDO], AGORA)).toBeNull();
  });

  it("um aberto basta, e a contagem é só dos abertos", () => {
    expect(faixaNoEstoque([ABERTO_1], AGORA)).toEqual({ abertos: 1 });
    expect(faixaNoEstoque([LOJISTAS, ABERTO_1, RESERVADO, ABERTO_2, VENDIDO], AGORA)).toEqual({ abertos: 2 });
  });
});

describe("a faixa da home", () => {
  it("com dois abertos some, mesmo com o lote maior que três", () => {
    expect(faixaNaHome([LOJISTAS, RESERVADO, ABERTO_1, ABERTO_2], AGORA)).toBeNull();
  });

  it("com exatamente três abertos, sai", () => {
    expect(faixaNaHome([ABERTO_3, ABERTO_1, ABERTO_2], AGORA)?.carros).toHaveLength(CARROS_NA_FAIXA_DA_HOME);
  });

  it("os três abertos mais recentes, na ordem do lote, qualquer que seja a ordem de entrada", () => {
    const faixa = faixaNaHome([ABERTO_4, LOJISTAS, ABERTO_2, RESERVADO, ABERTO_1, ABERTO_3, VENDIDO], AGORA);
    expect(faixa?.carros.map((r) => r.slug)).toEqual([ABERTO_1.slug, ABERTO_2.slug, ABERTO_3.slug]);
  });

  it("o total do CTA é o lote inteiro, o mesmo número do herói do /repasse", () => {
    // Publicado (aberto ou só-lojistas) e reservado: 4 abertos + 1 + 1. O
    // vendido fica fora, como em `resumoDoLote`.
    const faixa = faixaNaHome([ABERTO_4, LOJISTAS, ABERTO_2, RESERVADO, ABERTO_1, ABERTO_3, VENDIDO], AGORA);
    expect(faixa?.totalNoLote).toBe(6);
  });
});

describe("a leitura das portas", () => {
  it("passa a rota adiante e devolve o que a leitura devolveu", async () => {
    estado.repasses = [ABERTO_1];
    expect(await lerRepassesDasPortas(AGORA, "/estoque")).toEqual([ABERTO_1]);
    expect(estado.rotas).toEqual(["/estoque"]);
    expect(registrarFalha).not.toHaveBeenCalled();
  });

  it("pane vira lista vazia, e a falha é registrada como quebra, com a rota", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const erro = new Error("Leitura dos repasses falhou: relation \"repasses\" does not exist");
    estado.falha = { valor: erro };

    await expect(lerRepassesDasPortas(AGORA, "/")).resolves.toEqual([]);
    expect(registrarFalha).toHaveBeenCalledTimes(1);
    expect(registrarFalha).toHaveBeenCalledWith("quebra", "repasse-leitura-das-portas", erro, {
      rota: "/",
      origem: "servidor",
    });
  });

  // O `catch` não pode supor um `Error`: com `undefined`, `(erro as Error).message`
  // lança; com um objeto sem protótipo, `String(erro)` lança. Em qualquer dos
  // dois a página cairia pela mesma pane que a leitura devia absorver.
  it.each([
    ["undefined", undefined],
    ["um objeto sem protótipo", Object.create(null) as unknown],
  ])("rejeição sem Error (%s) também vira lista vazia, registrada com o valor cru", async (_nome, valor) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    estado.falha = { valor };

    await expect(lerRepassesDasPortas(AGORA, "/estoque")).resolves.toEqual([]);
    expect(registrarFalha).toHaveBeenCalledTimes(1);
    const [natureza, assunto, detalhe, contexto] = registrarFalha.mock.calls[0];
    expect([natureza, assunto, contexto]).toEqual(["quebra", "repasse-leitura-das-portas", { rota: "/estoque", origem: "servidor" }]);
    expect(detalhe).toBe(valor);
  });
});
