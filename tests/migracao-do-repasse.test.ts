import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COLUNAS_PUBLICAS_DO_REPASSE } from "../src/lib/leituraDosRepasses";
import {
  CARROCERIAS_DO_REPASSE,
  FAIXAS_DO_REPASSE,
  LAUDOS_DO_REPASSE,
  SITUACOES_DO_REPASSE,
} from "../src/lib/repasse";

const VERSAO = "20260924180000";
const NOME = "repasse_fundacao";
const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", `${VERSAO}_${NOME}.sql`), "utf8").replace(
  /--[^\n]*/g,
  "",
);

const entreAspas = (trecho: string) => [...trecho.matchAll(/'([^']+)'/g)].map((m) => m[1]);

function capturar(padrao: RegExp): string {
  const m = sql.match(padrao);
  expect(m, `não achei ${padrao}`).not.toBeNull();
  return m![1];
}

describe("migração do repasse", () => {
  it("o anônimo recebe exatamente as colunas públicas do código", () => {
    const colunas = capturar(/grant\s+select\s*\(([^)]*)\)\s*on\s+public\.repasses\s+to\s+anon/i)
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    expect(colunas).toHaveLength(COLUNAS_PUBLICAS_DO_REPASSE.length);
    expect(new Set(colunas)).toEqual(new Set(COLUNAS_PUBLICAS_DO_REPASSE));
  });

  it("os enums do banco são as listas do código, na mesma ordem", () => {
    expect(entreAspas(capturar(/create type public\.laudo_do_repasse as enum\s*\(([^)]*)\)/i))).toEqual([...LAUDOS_DO_REPASSE]);
    expect(entreAspas(capturar(/create type public\.situacao_do_repasse as enum\s*\(([^)]*)\)/i))).toEqual([
      ...SITUACOES_DO_REPASSE,
    ]);
  });

  it("carroceria e faixa do banco são as do código", () => {
    expect(entreAspas(capturar(/carroceria\s+in\s*\(([^)]*)\)/i))).toEqual([...CARROCERIAS_DO_REPASSE]);
    expect(entreAspas(capturar(/faixa\s+in\s*\(([^)]*)\)/i))).toEqual(FAIXAS_DO_REPASSE.map((f) => f.id));
  });

  it("só uma policy fala com o anônimo, e ela só lê repasses", () => {
    const policies = [...sql.matchAll(/create policy[\s\S]*?;/gi)].map((m) => m[0]);
    const abertas = policies.filter((p) => /\bto\s+(anon|public)\b/i.test(p));
    expect(abertas).toHaveLength(1);
    expect(abertas[0]).toMatch(/on\s+public\.repasses\s+for\s+select\s+to\s+anon/i);
  });

  it("tira do anônimo tudo o que o Supabase concede por padrão, nas três tabelas", () => {
    for (const tabela of ["repasses", "repasse_inscritos", "repasse_avisos"]) {
      expect(sql).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+public\\.${tabela}\\s+from\\s+anon`, "i"));
    }
  });

  it("registra a si mesma no livro-razão", () => {
    expect(sql).toMatch(
      new RegExp(
        `insert into supabase_migrations\\.schema_migrations \\(version, name\\)\\s*values \\('${VERSAO}', '${NOME}'\\)\\s*on conflict \\(version\\) do nothing;`,
      ),
    );
  });

  it("índices para as três FKs (leads.repasse_id, inscritos.lead_id, avisos.inscrito_id)", () => {
    expect(sql).toMatch(/create index if not exists leads_repasse_id_idx\s+on public\.leads \(repasse_id\)\s+where repasse_id is not null/i);
    expect(sql).toMatch(
      /create index if not exists repasse_inscritos_lead_id_idx\s+on public\.repasse_inscritos \(lead_id\)\s+where lead_id is not null/i,
    );
    expect(sql).toMatch(/create index if not exists repasse_avisos_inscrito_id_idx\s+on public\.repasse_avisos \(inscrito_id\)/i);
  });

  it("service_role recebe GRANT explícito nas três tabelas, não o default ACL", () => {
    expect(sql).toMatch(
      /grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+public\.repasses,\s*public\.repasse_inscritos,\s*public\.repasse_avisos\s+to\s+service_role/i,
    );
  });

  it("toda 'create policy' tem TO explícito — sem TO a policy vale para PUBLIC (M1)", () => {
    const policies = [...sql.matchAll(/create policy[\s\S]*?;/gi)].map((m) => m[0]);
    expect(policies.length).toBeGreaterThan(0);
    for (const p of policies) {
      expect(p, `sem TO explícito: ${p}`).toMatch(/\bto\s+(anon|authenticated|service_role)\b/i);
    }
  });

  it("a trava do M1 de fato reprova quando falta o TO — sabotagem provada em memória", () => {
    // Numa CÓPIA em memória do texto real, tira o "to authenticated" de uma
    // policy legítima e confere que a mesma checagem do teste acima acusa.
    // Sem isto, uma trava que sempre passa (fonte próxima, mas que não
    // distingue o bug real) daria falso verde — já aconteceu 5x neste repo.
    const original = "create policy repasse_staff_atualiza on public.repasses for update to authenticated\n  using (true);";
    expect(original).toMatch(/\bto\s+(anon|authenticated|service_role)\b/i);

    const sabotada = original.replace(/\s+to\s+authenticated\b/i, "");
    expect(sabotada).not.toMatch(/\bto\s+(anon|authenticated|service_role)\b/i);

    // E a mesma sabotagem, injetada no SQL real, faz a checagem principal
    // encontrar uma policy sem TO.
    const sqlSabotado = sql.replace(
      /create policy repasse_staff_atualiza on public\.repasses for update to authenticated/,
      "create policy repasse_staff_atualiza on public.repasses for update",
    );
    const policiesSabotadas = [...sqlSabotado.matchAll(/create policy[\s\S]*?;/gi)].map((m) => m[0]);
    const semTo = policiesSabotadas.filter((p) => !/\bto\s+(anon|authenticated|service_role)\b/i.test(p));
    expect(semTo.length).toBeGreaterThan(0);
  });
});
