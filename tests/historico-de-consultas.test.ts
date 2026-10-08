import { describe, it, expect, vi } from "vitest";
import { juntarHistorico, lerFiltro, mesDaReferencia, termoDaPesquisa, type ItemDoHistorico } from "../src/lib/historicoDeConsultas";
import { lerHistoricoDeConsultas, registrarConsultaDeModelo } from "../src/lib/historicoDeConsultas-servidor";
import { abrirGuardado, type BancoDoHistorico } from "../src/lib/mercadoPorModelo-servidor";
import type { LinhaDoHistorico, PedidoDeModelo } from "../src/lib/mercadoPorModelo";

/**
 * O histórico de consultas (08/10/2026). O que estes testes seguram: abrir o
 * guardado não chama ninguém; a pesquisa não deixa passar sintaxe de filtro;
 * as três consultas aparecem numa lista só, do mais novo para o mais antigo;
 * sem a tabela do registro, a lista continua (pelo que está guardado).
 */

describe("a pesquisa", () => {
  it("tira curinga e sintaxe do filtro, corta em 60 e vazio é sem filtro", () => {
    expect(termoDaPesquisa("  T-Cross 1.4  ")).toBe("T-Cross 1.4");
    expect(termoDaPesquisa("100%_x,(y)*")).toBe("100 x y");
    expect(termoDaPesquisa("   ")).toBeNull();
    expect(termoDaPesquisa(42)).toBeNull();
    expect(termoDaPesquisa("a".repeat(80))?.length).toBe(60);
  });

  it("filtro desconhecido é 'todas'; o mês sai legível", () => {
    expect(lerFiltro("placa")).toBe("placa");
    expect(lerFiltro("drop table")).toBe("todas");
    expect(mesDaReferencia("2026-10-01")).toBe("out/2026");
  });

  it("junta as listas do mais novo para o mais antigo e corta", () => {
    const item = (chave: string, quando: string) => ({ chave, quando }) as ItemDoHistorico;
    expect(juntarHistorico([[item("a", "2026-10-01"), item("b", "2026-10-08")], [item("c", "2026-10-05")]], 2).map((i) => i.chave)).toEqual(["b", "c"]);
  });
});

// Um cliente do Supabase de mentira: cada tabela responde o que o teste disser, e as perguntas ficam anotadas.
function cliente(tabelas: Record<string, { data?: unknown[]; error?: { code?: string; message: string } }>) {
  const perguntas: Array<{ tabela: string; filtros: string[] }> = [];
  const inseridas: Array<{ tabela: string; linha: unknown }> = [];
  const from = (tabela: string) => {
    const filtros: string[] = [];
    perguntas.push({ tabela, filtros });
    const resposta = () => Promise.resolve({ data: tabelas[tabela]?.error ? null : (tabelas[tabela]?.data ?? []), error: tabelas[tabela]?.error ?? null });
    const q: Record<string, unknown> = {
      select: () => q,
      order: () => q,
      limit: () => q,
      not: () => q,
      eq: (c: string, v: string) => (filtros.push(`${c}=${v}`), q),
      ilike: (c: string, v: string) => (filtros.push(`${c}~${v}`), q),
      then: (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) => resposta().then(ok, erro),
      insert: async (linha: unknown) => (inseridas.push({ tabela, linha }), { error: tabelas[tabela]?.error ?? null }),
    };
    return q;
  };
  return { cliente: { from } as never, perguntas, inseridas };
}

const LINHA_DE_MODELO = {
  id: "m1",
  tipo: "carros",
  marca_codigo: "59",
  modelo_codigo: "5940",
  ano: "2022-1",
  rotulo: "VW - VolksWagen T-Cross 2022",
  modo: "completa",
  referencia: "2026-10-01",
  fipe_atual: "126000.00",
  meses_na_serie: 25,
  chamadas_pagas: 22,
  custo: "1.32",
  homologacao: false,
  criado_por_nome: "Dyones Oliveira",
  criado_em: "2026-10-08T17:25:00Z",
};
const LINHA_DE_PLACA = { id: "p1", placa: "ABC1D23", retrato: { veiculo: { descricao: "VW T-CROSS" } }, custo: "30", homologacao: false, criado_em: "2026-10-07T12:00:00Z", consultado_por_nome: "Ana" };

describe("a leitura do histórico", () => {
  it("modelos e placas numa lista só, do mais novo para o mais antigo, com quem e quanto", async () => {
    const { cliente: c } = cliente({ consultas_de_modelo: { data: [LINHA_DE_MODELO, { ...LINHA_DE_MODELO, id: "m2", modo: "pontual", chamadas_pagas: 0, custo: null, criado_em: "2026-10-06T10:00:00Z" }] }, consultas_de_placa: { data: [LINHA_DE_PLACA] } });
    const r = await lerHistoricoDeConsultas(c, { termo: null, filtro: "todas" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens.map((i) => [i.tipo, i.chave])).toEqual([
      ["modelo", "m:m1"],
      ["placa", "p:p1"],
      ["fipe", "m:m2"],
    ]);
    expect(r.itens[0]).toMatchObject({ quem: "Dyones Oliveira", custo: 1.32, abrir: { tipo: "modelo", modo: "completa", marca: "59", modelo: "5940", ano: "2022-1" } });
    expect(r.itens[0].detalhe).toContain("out/2026");
    expect(r.itens[1]).toMatchObject({ titulo: "ABC1D23", detalhe: "VW T-CROSS", custo: 30, abrir: { tipo: "placa", placa: "ABC1D23" } });
    // A grátis é grátis, mesmo sem custo gravado.
    expect(r.itens[2].custo).toBe(0);
  });

  it("a pesquisa vai ao banco: rótulo do modelo; placa e carro da placa em perguntas separadas", async () => {
    const { cliente: c, perguntas } = cliente({ consultas_de_modelo: { data: [] }, consultas_de_placa: { data: [] } });
    await lerHistoricoDeConsultas(c, { termo: "t-cross 1.4", filtro: "todas" });
    expect(perguntas.find((p) => p.tabela === "consultas_de_modelo")?.filtros).toEqual(["rotulo~%t-cross 1.4%"]);
    const daPlaca = perguntas.filter((p) => p.tabela === "consultas_de_placa").map((p) => p.filtros);
    expect(daPlaca).toEqual([["placa~%TCROSS14%"], ["retrato->veiculo->>descricao~%t-cross 1.4%"]]);
  });

  it("o filtro escolhe as tabelas e o modo", async () => {
    const { cliente: c, perguntas } = cliente({ consultas_de_modelo: { data: [] }, consultas_de_placa: { data: [] } });
    await lerHistoricoDeConsultas(c, { termo: null, filtro: "fipe" });
    expect(perguntas.map((p) => p.tabela)).toEqual(["consultas_de_modelo"]);
    expect(perguntas[0].filtros).toEqual(["modo=pontual"]);
    const outro = cliente({ consultas_de_placa: { data: [] } });
    await lerHistoricoDeConsultas(outro.cliente, { termo: null, filtro: "placa" });
    expect(outro.perguntas.map((p) => p.tabela)).toEqual(["consultas_de_placa"]);
  });

  it("sem a tabela do registro: os modelos vêm do guardado, sem quem nem custo, e a resposta avisa", async () => {
    const { cliente: c } = cliente({
      consultas_de_modelo: { error: { code: "PGRST205", message: "Could not find the table" } },
      consultas_de_placa: { data: [] },
      fipe_historico: {
        data: [
          { tipo: "carros", marca_codigo: "59", modelo_codigo: "5940", ano: "2022-1", marca: "VW", modelo: "T-Cross", referencia: "2026-10-01", valor: 126000, criado_em: "2026-10-08T10:00:00Z" },
          { tipo: "carros", marca_codigo: "59", modelo_codigo: "5940", ano: "2022-1", marca: "VW", modelo: "T-Cross", referencia: "2026-09-01", valor: 127000, criado_em: "2026-10-08T10:00:00Z" },
          { tipo: "carros", marca_codigo: "59", modelo_codigo: "5940", ano: "2023-1", marca: "VW", modelo: "T-Cross", referencia: "2026-10-01", valor: 138000, criado_em: "2026-10-08T10:00:00Z" },
        ],
      },
    });
    const r = await lerHistoricoDeConsultas(c, { termo: null, filtro: "todas" });
    expect(r).toMatchObject({ ok: true, semRegistroDeModelo: true });
    if (!r.ok) return;
    expect(r.itens.map((i) => [i.tipo, i.abrir.tipo === "modelo" ? i.abrir.ano : ""])).toEqual(
      expect.arrayContaining([
        ["modelo", "2022-1"],
        ["fipe", "2023-1"],
      ]),
    );
    expect(r.itens.every((i) => i.quem === null && i.custo === null)).toBe(true);
  });

  it("erro de verdade vira motivo, e não lista vazia", async () => {
    const { cliente: c } = cliente({ consultas_de_modelo: { error: { code: "42501", message: "permission denied" } }, consultas_de_placa: { data: [] } });
    expect(await lerHistoricoDeConsultas(c, { termo: null, filtro: "todas" })).toMatchObject({ ok: false });
  });
});

describe("o registro", () => {
  const PEDIDO: PedidoDeModelo = { tipo: "carros", marca: "59", modelo: "5940", ano: "2022-1", outrosAnos: [] };
  const MERCADO = { marca: "VW - VolksWagen", modelo: "T-Cross", anoModelo: 2022, codigoFipe: "005510-1", referencia: "2026-10", fipeAtual: 126000, historico: new Array(25) } as never;

  it("grava o que a análise foi, sem quem nem quando (o banco carimba)", async () => {
    const { cliente: c, inseridas } = cliente({ consultas_de_modelo: {} });
    await registrarConsultaDeModelo(c, { pedido: PEDIDO, mercado: MERCADO, modo: "completa", chamadasPagas: 22, custo: 1.32, homologacao: false });
    expect(inseridas[0]).toEqual({
      tabela: "consultas_de_modelo",
      linha: {
        tipo: "carros",
        marca_codigo: "59",
        modelo_codigo: "5940",
        ano: "2022-1",
        rotulo: "VW - VolksWagen T-Cross 2022",
        codigo_fipe: "005510-1",
        modo: "completa",
        referencia: "2026-10-01",
        fipe_atual: 126000,
        meses_na_serie: 25,
        chamadas_pagas: 22,
        custo: 1.32,
        homologacao: false,
      },
    });
  });

  it("tabela ausente não faz barulho; outro erro vai para o log; nenhum lança", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    await registrarConsultaDeModelo(cliente({ consultas_de_modelo: { error: { code: "42P01", message: "does not exist" } } }).cliente, { pedido: PEDIDO, mercado: MERCADO, modo: "pontual", chamadasPagas: 0, custo: 0, homologacao: false });
    expect(aviso).not.toHaveBeenCalled();
    await registrarConsultaDeModelo(cliente({ consultas_de_modelo: { error: { code: "23514", message: "check" } } }).cliente, { pedido: PEDIDO, mercado: MERCADO, modo: "pontual", chamadasPagas: 0, custo: 0, homologacao: false });
    expect(aviso).toHaveBeenCalledTimes(1);
    aviso.mockRestore();
  });
});

describe("abrir o guardado", () => {
  const PEDIDO: PedidoDeModelo = { tipo: "carros", marca: "59", modelo: "5940", ano: "2022-1", outrosAnos: ["2023-1"] };
  const linha = (ano: string, referencia: string, valor: number | null): LinhaDoHistorico => ({ ano, referencia, valor, marca: "VW", modelo: "T-Cross", combustivel: "Flex", codigoFipe: "005510-1" });
  const banco = (linhas: LinhaDoHistorico[]): BancoDoHistorico => ({
    ler: async () => ({ ok: true, linhas }),
    gravar: async () => {
      throw new Error("abrir o guardado não grava");
    },
  });

  it("monta o retrato só do banco, com o 'hoje' no mês mais novo guardado, e o vizinho do mesmo mês", async () => {
    const buscar = vi.fn();
    const r = await abrirGuardado(PEDIDO, { banco: banco([linha("2022-1", "2026-09-01", 127000), linha("2022-1", "2026-08-01", 128000), linha("2023-1", "2026-09-01", 138000)]) });
    expect(buscar).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.guardadoAte).toBe("2026-09");
    expect(r.mercado.fipeAtual).toBe(127000);
    expect(r.mercado.referencia).toBe("2026-09");
    expect(r.mercado.historico.map((p) => p.valor)).toEqual([128000, 127000]);
    expect(r.mercado.porAno.map((a) => a.ano)).toEqual(["2023-1", "2022-1"]);
  });

  it("nada guardado do ano escolhido (ou só 'sem valor') é 404, para a tela cair na consulta de sempre", async () => {
    expect(await abrirGuardado(PEDIDO, { banco: banco([linha("2023-1", "2026-09-01", 138000)]) })).toMatchObject({ ok: false, status: 404 });
    expect(await abrirGuardado(PEDIDO, { banco: banco([linha("2022-1", "2026-09-01", null)]) })).toMatchObject({ ok: false, status: 404 });
  });

  it("banco ilegível é 502, e sem a tabela diz a migração", async () => {
    const r = await abrirGuardado(PEDIDO, { banco: { ler: async () => ({ ok: false, faltaMigracao: true, motivo: "x" }), gravar: async () => ({ ok: true }) } });
    expect(r).toMatchObject({ ok: false, status: 502 });
    expect(!r.ok && r.motivo).toContain("20261006190000_fipe_historico");
  });
});
