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
});
