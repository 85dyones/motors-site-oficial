import { describe, it, expect } from "vitest";
import { aplicarNosVeiculos } from "../src/lib/estoqueEscrita";
import { MINIMO_DE_FOTOS } from "../src/lib/coerenciaDoCadastro";

/**
 * A escrita do painel diante das duas colunas do carro em preparação — achados
 * da revisão final (28/09), executados contra um Supabase de mentira no molde
 * de `tests/preco-promocional.test.ts` e `tests/rascunho-e-publicacao.test.ts`.
 */

const AUTOR = { id: "u-1", nome: "Quem salvou" };
const COLUNAS_NOVAS = ["em_preparacao", "previsao_chegada_em"];

/**
 * O mínimo que `aplicarNosVeiculos` usa. Com `semAsColunas`, imita o banco em
 * que a migração 20260928150000 não foi aplicada (ou foi revertida): o
 * PostgREST recusa com `42703` o `select` e o `update` que citam as colunas.
 */
function bancoFalso(linhas: Array<Record<string, unknown>>, opts: { semAsColunas?: boolean } = {}) {
  const leituras: string[][] = [];
  const gravou: Array<{ patch: Record<string, unknown>; ids: unknown[] }> = [];
  const historico: Array<Record<string, unknown>> = [];
  const colunaAusente = (nome: string) => ({
    data: null,
    error: { code: "42703", message: `column estoque_motors.${nome} does not exist` },
  });

  const supabase = {
    from(tabela: string) {
      if (tabela === "historico_veiculo") {
        return {
          insert: async (novas: Array<Record<string, unknown>>) => {
            historico.push(...novas);
            return { error: null };
          },
        };
      }
      return {
        select: (colunas: string) => ({
          in: async (_col: string, ids: Array<string | number>) => {
            const lista = colunas.split(",");
            leituras.push(lista);
            const citada = COLUNAS_NOVAS.find((c) => lista.includes(c));
            if (opts.semAsColunas && citada) return colunaAusente(citada);
            return { data: linhas.filter((l) => ids.map(String).includes(String(l.id))), error: null };
          },
        }),
        update: (patch: Record<string, unknown>) => ({
          in: async (_col: string, ids: Array<string | number>) => {
            const citada = COLUNAS_NOVAS.find((c) => c in patch);
            if (opts.semAsColunas && citada) return colunaAusente(citada);
            gravou.push({ patch, ids });
            return { error: null };
          },
        }),
      };
    },
  };
  return { supabase, leituras, gravou, historico };
}

// ---------------------------------------------------------------------------
// I4 — a previsão é um INSTANTE, não um texto
// ---------------------------------------------------------------------------
describe("o histórico compara a previsão como instante", () => {
  // O PostgREST devolve `timestamptz` como "…+00:00"; o editor manda o
  // `toISOString()`, "….000Z". Como texto, os dois nunca eram iguais, e todo
  // salvamento seguinte na mesma sessão gravava uma "alteração" que não houve.
  const EM_PREPARACAO = {
    id: 8497421,
    origem: "sync",
    whatsapp_images: [],
    em_preparacao: true,
    previsao_chegada_em: "2026-10-03T17:00:00+00:00",
  };

  it("`+00:00` do banco contra `.000Z` do editor, mesmo instante: nada mudou", async () => {
    const { supabase, historico, gravou } = bancoFalso([EM_PREPARACAO]);
    const r = await aplicarNosVeiculos(
      supabase,
      [8497421],
      { em_preparacao: true, previsao_chegada_em: "2026-10-03T17:00:00.000Z" },
      AUTOR,
    );
    expect(r.erro).toBeUndefined();
    expect(gravou).toHaveLength(1);
    expect(r.mudancasRegistradas).toBe(0);
    expect(historico).toHaveLength(0);
  });

  it("instantes diferentes: a mudança é registrada", async () => {
    const { supabase, historico } = bancoFalso([EM_PREPARACAO]);
    const r = await aplicarNosVeiculos(
      supabase,
      [8497421],
      { previsao_chegada_em: "2026-10-04T17:00:00.000Z" },
      AUTOR,
    );
    expect(r.mudancasRegistradas).toBe(1);
    expect(historico[0]).toMatchObject({
      campo: "previsao_chegada_em",
      valor_anterior: "2026-10-03T17:00:00+00:00",
      valor_novo: "2026-10-04T17:00:00.000Z",
    });
  });

  it("nulo contra valor, nos dois sentidos: a mudança é registrada", async () => {
    const semData = bancoFalso([{ ...EM_PREPARACAO, em_preparacao: false, previsao_chegada_em: null }]);
    const marcou = await aplicarNosVeiculos(
      semData.supabase,
      [8497421],
      { previsao_chegada_em: "2026-10-03T17:00:00.000Z" },
      AUTOR,
    );
    expect(marcou.mudancasRegistradas).toBe(1);

    const comData = bancoFalso([EM_PREPARACAO]);
    const tirou = await aplicarNosVeiculos(comData.supabase, [8497421], { previsao_chegada_em: null }, AUTOR);
    expect(tirou.mudancasRegistradas).toBe(1);
    expect(comData.historico[0]).toMatchObject({ campo: "previsao_chegada_em", valor_novo: null });
  });
});

// ---------------------------------------------------------------------------
// I5 — sem as colunas no banco, o resto da escrita continua de pé
// ---------------------------------------------------------------------------
describe("banco sem as colunas do carro em preparação", () => {
  // Migração não aplicada, ou revertida. A regra "migração antes do merge"
  // continua valendo; isto é a rede para quando ela falhar. Antes, o `select`
  // do "antes" falhava inteiro: publicar e promoção davam 500, e o resto
  // salvava com `antes = null` — sem histórico e SEM o piso de custo.
  const SAVEIRO = {
    id: 8335204,
    origem: "sync",
    preco: 68900,
    preco_original: 68900,
    preco_compra: null,
    descricao: "texto velho",
    whatsapp_images: [],
  };

  it("relê sem as duas colunas, e o piso de custo continua valendo", async () => {
    const { supabase, leituras, gravou } = bancoFalso([SAVEIRO], { semAsColunas: true });
    const r = await aplicarNosVeiculos(
      supabase,
      [8335204],
      { preco_compra: 80000, em_preparacao: false, previsao_chegada_em: null },
      AUTOR,
      { podeVerCusto: true },
    );

    expect(leituras).toHaveLength(2);
    expect(leituras[0]).toEqual(expect.arrayContaining(COLUNAS_NOVAS));
    for (const coluna of COLUNAS_NOVAS) expect(leituras[1]).not.toContain(coluna);
    // O custo acima do preço no ar é recusado — o piso leu a linha.
    expect(r.status).toBe(422);
    expect(r.erro).toMatch(/abaixo do preço de compra/i);
    expect(gravou).toHaveLength(0);
  });

  it("o resto salva sem os dois campos, e o histórico é registrado", async () => {
    const { supabase, gravou, historico } = bancoFalso([SAVEIRO], { semAsColunas: true });
    const r = await aplicarNosVeiculos(
      supabase,
      [8335204],
      { descricao: "texto novo", em_preparacao: false, previsao_chegada_em: null },
      AUTOR,
    );

    expect(r.erro).toBeUndefined();
    expect(gravou).toHaveLength(1);
    expect(gravou[0].patch).toEqual({ descricao: "texto novo" });
    expect(r.camposSalvos).toEqual(["descricao"]);
    expect(historico).toHaveLength(1);
    expect(historico[0]).toMatchObject({ campo: "descricao", valor_anterior: "texto velho" });
  });

  it("publicar não vira 500 — a régua é a de sempre", async () => {
    const fotos = Array.from({ length: MINIMO_DE_FOTOS }, (_, i) => `https://s3/foto-${i}.jpg`);
    const { supabase, gravou } = bancoFalso([{ ...SAVEIRO, whatsapp_images: fotos }], { semAsColunas: true });
    const r = await aplicarNosVeiculos(supabase, [8335204], { estado_cadastro: "publicado" }, AUTOR);

    expect(r.erro).toBeUndefined();
    expect(gravou[0].patch).toEqual({ estado_cadastro: "publicado" });
  });

  it("só os dois campos, sem onde guardá-los: recusa com a migração, nada gravado", async () => {
    const { supabase, gravou } = bancoFalso([SAVEIRO], { semAsColunas: true });
    const r = await aplicarNosVeiculos(
      supabase,
      [8335204],
      { em_preparacao: true, previsao_chegada_em: "2026-10-03T17:00:00.000Z" },
      AUTOR,
    );

    expect(r.status).toBe(500);
    expect(r.erro).toMatch(/migraç/i);
    expect(gravou).toHaveLength(0);
  });

  it("erro que NÃO é de coluna ausente não é relido às cegas", async () => {
    // A segunda leitura é só para o `42703`: uma falha de conexão continua
    // barrando a publicação, como em `rascunho-e-publicacao`.
    const leituras: string[] = [];
    const supabase = {
      from: () => ({
        select: (colunas: string) => ({
          in: async () => {
            leituras.push(colunas);
            return { data: null, error: { message: "conexão perdida" } };
          },
        }),
        update: () => ({ in: async () => ({ error: null }) }),
      }),
    };
    const r = await aplicarNosVeiculos(supabase, [8335204], { estado_cadastro: "publicado" }, AUTOR);
    expect(r.status).toBe(500);
    expect(leituras).toHaveLength(1);
  });
});
