import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lerCopiloto } from "../src/lib/copilotoDeMidia-servidor";

/**
 * A leitura do painel (`lerCopiloto`), com o banco trocado por um falso que
 * anota cada consulta: cada aba lê só a sua plataforma — o retrato, as ações
 * abertas, o histórico, o pulso e as campanhas do pedido de verba — e o pulso
 * do Meta é só o da rodada agendada (a que aplica).
 */

type Consulta = { tabela: string; filtros: Array<[string, ...unknown[]]> };

function bancoFalso(respostas: Partial<Record<string, { data: unknown; error: { message: string; code?: string } | null }>> = {}) {
  const consultas: Consulta[] = [];
  const from = (tabela: string) => {
    const c: Consulta = { tabela, filtros: [] };
    consultas.push(c);
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "in", "gte", "lte", "lt", "is", "order", "limit"]) {
      b[m] = (...args: unknown[]) => {
        if (m !== "select") c.filtros.push([m, ...args]);
        return b;
      };
    }
    b.then = (ok: (r: unknown) => unknown) => Promise.resolve(respostas[tabela] ?? { data: [], error: null }).then(ok);
    return b;
  };
  return { cliente: { from } as unknown as SupabaseClient, consultas };
}

const AGORA = new Date("2026-10-17T12:00:00Z");
const daPlataforma = (c: Consulta, p: string) => c.filtros.some((f) => f[0] === "eq" && f[1] === "plataforma" && f[2] === p);

describe("lerCopiloto — cada aba lê só a sua plataforma", () => {
  for (const plataforma of ["google", "meta"] as const) {
    it(`aba ${plataforma}: retrato, ações, histórico, pulso e campanhas filtram a plataforma`, async () => {
      const { cliente, consultas } = bancoFalso();
      const r = await lerCopiloto(cliente, AGORA, plataforma);
      expect(r).toMatchObject({ ok: true, valor: { plataforma } });
      const porTabela = (t: string) => consultas.filter((c) => c.tabela === t);
      const filtradas = [
        ...porTabela("midia_copiloto_diagnosticos"),
        ...porTabela("midia_copiloto_acoes"),
        ...porTabela("midia_sincronizacoes"),
        ...porTabela("midia_campanhas"),
      ];
      // diagnóstico, abertas, histórico, pulso e campanhas.
      expect(filtradas).toHaveLength(5);
      for (const c of filtradas) expect(daPlataforma(c, plataforma), `${c.tabela} ${JSON.stringify(c.filtros)}`).toBe(true);
    });
  }

  it("o pulso do Meta é o da rodada agendada; o do Google, qualquer rodada do script", async () => {
    const meta = bancoFalso();
    await lerCopiloto(meta.cliente, AGORA, "meta");
    expect(meta.consultas.find((c) => c.tabela === "midia_sincronizacoes")!.filtros).toContainEqual(["eq", "gatilho", "agendado"]);

    const google = bancoFalso();
    await lerCopiloto(google.cliente, AGORA, "google");
    expect(google.consultas.find((c) => c.tabela === "midia_sincronizacoes")!.filtros.some((f) => f[1] === "gatilho")).toBe(false);
  });

  it("o retrato do Meta vai no resumo do Meta, não no do Google", async () => {
    const { cliente } = bancoFalso({
      midia_copiloto_diagnosticos: {
        data: [{ id: "d1", recebido_em: "2026-10-17T10:00:00Z", de: "2026-10-03", ate: "2026-10-16", previa: false, resumo: { plataforma: "meta", gasto: 10 }, erros: {}, dados: {} }],
        error: null,
      },
    });
    const r = await lerCopiloto(cliente, AGORA, "meta");
    expect(r.ok && r.valor.diagnostico).toMatchObject({ resumo: null, resumoMeta: { plataforma: "meta", gasto: 10 } });
  });

  it("site publicado antes da migração do Meta: as regras (colunas meta_*) são as primeiras a cair, e dizem qual migração falta", async () => {
    const { cliente } = bancoFalso({
      midia_copiloto_parametros: { data: null, error: { message: "column midia_copiloto_parametros.meta_gasto_minimo_conjunto does not exist", code: "42703" } },
    });
    expect(await lerCopiloto(cliente, AGORA, "meta")).toMatchObject({ ok: false, faltaMigracao: true, migracao: "20261017150000_copiloto_meta" });
  });

  it("site publicado antes da migração do Meta: o retrato também diz qual migração falta", async () => {
    const { cliente } = bancoFalso({
      midia_copiloto_diagnosticos: { data: null, error: { message: "column midia_copiloto_diagnosticos.plataforma does not exist", code: "42703" } },
    });
    expect(await lerCopiloto(cliente, AGORA, "google")).toMatchObject({ ok: false, faltaMigracao: true, migracao: "20261017150000_copiloto_meta" });
  });
});
