import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CARROCERIAS_DA_LISTA } from "../src/lib/leadDoRepasse";
import { CARROCERIAS_DO_REPASSE } from "../src/lib/repasse";

/**
 * A moto com carroceria própria no repasse (dono, 02/10). O ensaio no banco
 * prova o comportamento; este arquivo prova que o texto da migração concorda
 * com o código.
 */
const VERSAO = "20261002120000";
const NOME = "repasse_moto";
const ARQUIVO = join(__dirname, "..", "supabase", "migrations", `${VERSAO}_${NOME}.sql`);
const sql = existsSync(ARQUIVO) ? readFileSync(ARQUIVO, "utf8").replace(/--[^\n]*/g, "") : "";

const entreAspas = (trecho: string) => [...trecho.matchAll(/'([^']+)'/g)].map((m) => m[1]);

describe("migração: a moto no repasse", () => {
  it("o arquivo existe", () => {
    expect(existsSync(ARQUIVO)).toBe(true);
  });

  it("a carroceria do carro é exatamente a do código, na mesma ordem", () => {
    const trecho = sql.match(
      /add\s+constraint\s+repasses_carroceria_check\s+check\s*\(\s*carroceria\s+is\s+null\s+or\s+carroceria\s+in\s*\(([^)]*)\)\s*\)/i,
    );
    expect(trecho, "não achei repasses_carroceria_check").not.toBeNull();
    expect(entreAspas(trecho![1])).toEqual([...CARROCERIAS_DO_REPASSE]);
  });

  it("a carroceria da lista é a mesma do carro, e cabe o que o formulário oferece", () => {
    const trecho = sql.match(
      /add\s+constraint\s+inscrito_carrocerias_da_lista\s+check\s*\(\s*carrocerias\s*<@\s*array\[([^\]]*)\]::text\[\]\s*\)/i,
    );
    expect(trecho, "não achei inscrito_carrocerias_da_lista").not.toBeNull();
    expect(entreAspas(trecho![1])).toEqual([...CARROCERIAS_DO_REPASSE]);
    for (const c of CARROCERIAS_DA_LISTA) expect([...CARROCERIAS_DO_REPASSE]).toContain(c);
  });

  it("a moto está no código, no carro e no formulário da lista", () => {
    expect([...CARROCERIAS_DO_REPASSE]).toContain("moto");
    expect([...CARROCERIAS_DA_LISTA]).toContain("moto");
  });

  it("o aceite confere cada recusa PELO NOME e tem controle positivo", () => {
    expect(sql).toContain("ACEITE FALHOU");
    expect(sql).toMatch(/restricao\s*<>\s*'repasses_carroceria_check'/);
    expect(sql).toMatch(/restricao\s*<>\s*'inscrito_carrocerias_da_lista'/);
    expect(sql).toMatch(/a moto foi recusada/);
  });

  it("não mexe em mais nada", () => {
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);
    expect(sql).not.toMatch(/\b(add|drop)\s+column\b/i);
    expect(sql).not.toMatch(/\bcreate\s+policy\b/i);
    expect(sql).not.toMatch(/\b(grant|revoke)\b/i);
    expect(sql).not.toMatch(/estoque_motors/i);
  });

  it("se registra no livro-razão", () => {
    expect(sql).toMatch(new RegExp(`values\\s*\\('${VERSAO}',\\s*'${NOME}'\\)`));
  });
});
