import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PERFIS, podeFazer } from "../src/lib/permissoes";

/**
 * A segunda migração do repasse (decisão I4 da revisão final do PR 1): a
 * equipe deixa de escrever direto pelo PostgREST, e a lista do repasse passa
 * a ser lida só por quem valida. O ensaio no banco prova o comportamento; este
 * arquivo prova que o texto da migração concorda com o código.
 */
const ARQUIVO = join(__dirname, "..", "supabase", "migrations", "20260924200000_repasse_escrita_pela_rota.sql");
const sql = existsSync(ARQUIVO) ? readFileSync(ARQUIVO, "utf8").replace(/--[^\n]*/g, "") : "";

const TABELAS = ["repasses", "repasse_inscritos", "repasse_avisos"];

describe("migração: a escrita passa pela rota", () => {
  it("o arquivo existe", () => {
    expect(existsSync(ARQUIVO)).toBe(true);
  });

  it("nenhuma policy de escrita nasce aqui", () => {
    expect(sql).not.toMatch(/create\s+policy[^;]*\bfor\s+(insert|update|delete|all)\b/i);
  });

  it("derruba as seis policies de escrita da equipe", () => {
    for (const nome of [
      "repasse_staff_insere",
      "repasse_staff_atualiza",
      "inscrito_staff_atualiza",
      "inscrito_staff_apaga",
      "aviso_staff_insere",
      "aviso_staff_apaga",
    ]) {
      expect(sql).toMatch(new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+${nome}\\b`, "i"));
    }
  });

  it("authenticated perde tudo e recebe de volta só a leitura, nas três tabelas", () => {
    for (const tabela of TABELAS) {
      expect(sql).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+public\\.${tabela}\\s+from\\s+authenticated`, "i"));
      expect(sql).toMatch(new RegExp(`grant\\s+select\\s+on\\s+public\\.${tabela}\\s+to\\s+authenticated`, "i"));
    }
  });

  it("a lista é lida por quem valida — os mesmos papéis da matriz", () => {
    const validadores = PERFIS.filter((p) => podeFazer(p, "Validar e publicar repasse") === "faz");
    for (const policy of ["inscrito_validador_le", "aviso_validador_le"]) {
      const trecho = sql.match(new RegExp(`create\\s+policy\\s+${policy}[^;]*;`, "i"));
      expect(trecho, `não achei a policy ${policy}`).not.toBeNull();
      expect(trecho![0]).toMatch(/for\s+select\s+to\s+authenticated/i);
      const papeis = [...trecho![0].matchAll(/tem_papel\(auth\.uid\(\),\s*'([a-z]+)'\)/g)].map((m) => m[1]);
      expect(new Set(papeis)).toEqual(new Set(validadores));
    }
  });

  it("o reforço fora do rascunho cita cada campo do mínimo", () => {
    const trecho = sql.match(/add\s+constraint\s+repasse_completo_fora_do_rascunho[\s\S]*?\n\);/i);
    expect(trecho, "não achei repasse_completo_fora_do_rascunho").not.toBeNull();
    for (const coluna of [
      "laudo",
      "leilao_consta",
      "sinistro_consta",
      "historico_consultado_em",
      "fipe_valor",
      "fipe_mes_referencia",
      "carroceria",
      "resumo",
      "motivo",
      "leilao_detalhe",
      "sinistro_detalhe",
      "sem_defeitos_conhecidos",
      "oficina_do_orcamento",
      "orcamento_em",
    ]) {
      expect(trecho![0]).toContain(coluna);
    }
    expect(trecho![0]).toMatch(/situacao\s+in\s+\('rascunho',\s*'arquivado'\)/);
  });

  it("arquivado e reservado têm data", () => {
    expect(sql).toMatch(/repasse_arquivado_tem_data\s+check\s*\(\s*situacao\s*<>\s*'arquivado'\s+or\s+arquivado_em\s+is\s+not\s+null\s*\)/i);
    expect(sql).toMatch(/repasse_reservado_tem_data\s+check\s*\(\s*situacao\s*<>\s*'reservado'\s+or\s+reservado_em\s+is\s+not\s+null\s*\)/i);
  });

  it("tem aceite e se registra no livro-razão", () => {
    expect(sql).toContain("ACEITE FALHOU");
    expect(sql).toMatch(/values\s*\('20260924200000',\s*'repasse_escrita_pela_rota'\)/);
  });
});
