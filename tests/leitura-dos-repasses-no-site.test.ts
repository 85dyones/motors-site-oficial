import { describe, it, expect, beforeEach, vi } from "vitest";
import { lerRepassePorSufixo, lerRepassesPublicos } from "../src/lib/leituraDosRepasses";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * As duas coisas que o site pede à leitura do PR 1: avisar a linha que o
 * código recusa (decisão 15 do PR 3) e achar o carro pelo sufixo do slug
 * quando o slug mudou (decisão 13).
 */
const estado = vi.hoisted(() => ({
  resultado: { data: null as unknown, error: null as unknown },
  chamadas: [] as Array<[string, unknown[]]>,
}));

vi.mock("../src/lib/supabase", () => ({
  get supabase() {
    const q: Record<string, unknown> = {};
    for (const nome of ["from", "select", "in", "eq", "like", "order", "limit"]) {
      q[nome] = (...args: unknown[]) => {
        estado.chamadas.push([nome, args]);
        return q;
      };
    }
    q.maybeSingle = async () => estado.resultado;
    q.then = (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve(estado.resultado).then(ok, falha);
    return q;
  },
}));

const falhas = vi.hoisted(() => ({ chamadas: [] as unknown[][] }));
vi.mock("../src/lib/observabilidade", () => ({
  registrarFalha: async (...args: unknown[]) => {
    falhas.chamadas.push(args);
  },
}));

beforeEach(() => {
  estado.resultado = { data: null, error: null };
  estado.chamadas = [];
  falhas.chamadas = [];
});

const linhaPublica = (parcial: Record<string, unknown> = {}) => {
  const linha: Record<string, unknown> = {
    ...repasseDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z" }),
    ...parcial,
  };
  delete linha.arquivado_em;
  return linha;
};

describe("lerRepassesPublicos avisa a linha que o código recusa", () => {
  it("a linha malformada some da vitrine E vai para a triagem, com o id e a rota", async () => {
    estado.resultado = { data: [linhaPublica({ id: "x-1", preco: null }), linhaPublica({ slug: "bom" })], error: null };
    const repasses = await lerRepassesPublicos(new Date("2026-09-24T12:00:00Z"), "/sitemap.xml");
    expect(repasses.map((r) => r.slug)).toEqual(["bom"]);
    expect(falhas.chamadas).toEqual([
      ["quebra", "repasse-linha-malformada", { id: "x-1" }, { rota: "/sitemap.xml", origem: "servidor" }],
    ]);
  });

  it("linha boa não gera aviso", async () => {
    estado.resultado = { data: [linhaPublica()], error: null };
    await lerRepassesPublicos(new Date("2026-09-24T12:00:00Z"));
    expect(falhas.chamadas).toEqual([]);
  });
});

describe("lerRepassePorSufixo", () => {
  it("procura o slug que termina no sufixo, e pede só dois", async () => {
    estado.resultado = { data: [linhaPublica()], error: null };
    const achados = await lerRepassePorSufixo("3f9a1c");
    expect(achados.map((r) => r.slug)).toEqual(["renault-kwid-zen-1-0-2021-3f9a1c"]);
    expect(estado.chamadas).toContainEqual(["like", ["slug", "%-3f9a1c"]]);
    expect(estado.chamadas).toContainEqual(["limit", [2]]);
  });

  it("sufixo que não é o de um uuid nem chega ao banco", async () => {
    for (const sufixo of ["../x", "3F9A1C", "3f9a1", "zzzzzz", ""]) {
      expect(await lerRepassePorSufixo(sufixo)).toEqual([]);
    }
    expect(estado.chamadas).toEqual([]);
  });

  it("erro do banco lança, como a leitura por slug", async () => {
    estado.resultado = { data: null, error: { message: "boom" } };
    await expect(lerRepassePorSufixo("3f9a1c")).rejects.toThrow(/boom/);
  });
});
