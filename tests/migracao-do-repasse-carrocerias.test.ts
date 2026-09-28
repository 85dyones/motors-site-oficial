import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CARROCERIAS_DA_LISTA } from "../src/lib/leadDoRepasse";
import { CARROCERIAS_DO_REPASSE } from "../src/lib/repasse";

/**
 * A terceira migração do repasse: `repasse_inscritos.carrocerias` ganha o
 * CHECK que a revisão do PR 1 deixou anotado para quando o formulário
 * existisse (decisão 16 do PR 3). O ensaio no banco prova o comportamento;
 * este arquivo prova que o texto da migração concorda com o código.
 */
const ARQUIVO = join(__dirname, "..", "supabase", "migrations", "20260925120000_repasse_carrocerias_da_lista.sql");
const sql = existsSync(ARQUIVO) ? readFileSync(ARQUIVO, "utf8").replace(/--[^\n]*/g, "") : "";

describe("migração: as carrocerias da lista", () => {
  it("o arquivo existe", () => {
    expect(existsSync(ARQUIVO)).toBe(true);
  });

  it("a restrição nomeada lista exatamente as carrocerias do carro", () => {
    const trecho = sql.match(
      /add\s+constraint\s+inscrito_carrocerias_da_lista\s+check\s*\(\s*carrocerias\s*<@\s*array\[([^\]]*)\]::text\[\]\s*\)/i,
    );
    expect(trecho, "não achei a restrição inscrito_carrocerias_da_lista").not.toBeNull();
    const valores = [...trecho![1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(valores).toEqual([...CARROCERIAS_DO_REPASSE]);
  });

  it("o que o formulário oferece cabe na restrição", () => {
    for (const c of CARROCERIAS_DA_LISTA) expect([...CARROCERIAS_DO_REPASSE]).toContain(c);
  });

  it("o aceite confere a restrição PELO NOME e tem controle positivo", () => {
    expect(sql).toContain("ACEITE FALHOU");
    expect(sql).toMatch(/get\s+stacked\s+diagnostics\s+restricao\s*=\s*constraint_name/i);
    expect(sql).toMatch(/restricao\s*<>\s*'inscrito_carrocerias_da_lista'/);
    expect(sql).toMatch(/a lista legítima foi recusada/);
  });

  it("não mexe em mais nada", () => {
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);
    expect(sql).not.toMatch(/\bcreate\s+policy\b/i);
    expect(sql).not.toMatch(/\b(grant|revoke)\b/i);
    expect(sql).not.toMatch(/\bdrop\s+column\b/i);
  });

  it("se registra no livro-razão", () => {
    expect(sql).toMatch(/values\s*\('20260925120000',\s*'repasse_carrocerias_da_lista'\)/);
  });
});
