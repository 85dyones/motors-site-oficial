import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Invariantes de `supabase/migrations/` (Pacote 0.5, item 5).
 *
 * O projeto passou a existir sem migração versionada nenhuma — CLAUDE.md:62
 * exigia `supabase/migrations/`, e a pasta não existia. Estes testes protegem
 * as duas propriedades que, se quebradas, trazem o problema de volta:
 *
 *  1. o cutover do rename é idempotente e guardado — reexecutar não destrói;
 *  2. a remoção da view de compatibilidade NÃO está em `migrations/`, onde
 *     `supabase db push` a aplicaria junto com a migração que a cria.
 *
 * O item 2 é o que impede um cutover de virar incidente: a view existe para
 * cobrir a janela entre o deploy do código e a atualização do workflow n8n.
 */

const DIR_MIGRACOES = join(__dirname, "..", "supabase", "migrations");
const DIR_PENDENTE = join(__dirname, "..", "supabase", "pendente");

/**
 * Remove comentários de linha antes de inspecionar o SQL.
 *
 * Sem isto, um teste que procura "DROP POLICY" casa também com o comentário
 * que EXPLICA por que não fazemos DROP POLICY — e passa a reagir à prosa em
 * vez do código executável. Estes arquivos são muito comentados de propósito;
 * a asserção precisa olhar só o que o Postgres vai rodar.
 */
function sqlExecutavel(caminho: string): string {
  return readFileSync(caminho, "utf8")
    .split("\n")
    .filter((linha) => !linha.trimStart().startsWith("--"))
    .join("\n");
}

describe("supabase/migrations", () => {
  it("a pasta de migrações existe e não está vazia", () => {
    expect(existsSync(DIR_MIGRACOES)).toBe(true);
    expect(readdirSync(DIR_MIGRACOES).filter((f) => f.endsWith(".sql")).length)
      .toBeGreaterThan(0);
  });

  it("os nomes seguem o padrão de timestamp do Supabase CLI", () => {
    const migracoes = readdirSync(DIR_MIGRACOES).filter((f) => f.endsWith(".sql"));
    for (const m of migracoes) {
      expect(m, `Migração fora do padrão <timestamp>_<nome>.sql: ${m}`)
        .toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    }
  });

  it("o baseline do inventário vem antes do rename", () => {
    const migracoes = readdirSync(DIR_MIGRACOES)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const iBaseline = migracoes.findIndex((m) => m.includes("baseline_inventario"));
    const iRename = migracoes.findIndex((m) => m.includes("renomear_veiculos"));

    expect(iBaseline).toBeGreaterThanOrEqual(0);
    expect(iRename).toBeGreaterThanOrEqual(0);
    // Renomear antes de existir a tabela deixaria o histórico incoerente para
    // quem reconstruir o banco do zero.
    expect(iBaseline).toBeLessThan(iRename);
  });
});

describe("baseline do inventário", () => {
  const sql = sqlExecutavel(
    join(DIR_MIGRACOES, "20260803120000_baseline_inventario.sql")
  );

  it("não recria a tabela se ela já existe", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.veiculos/i);
  });

  it("não sobrescreve policies de RLS já existentes", () => {
    // AUDITORIA.md §3.4 alerta que produção pode ter sido endurecida à mão e
    // que isso não é verificável daqui. Um DROP POLICY + CREATE ... USING(true)
    // incondicional reabriria a brecha em silêncio, durante um `db push`,
    // sob o nome de "baseline". As policies só podem ser criadas se não houver
    // nenhuma.
    expect(sql).not.toMatch(/DROP POLICY/i);
    expect(sql).toMatch(/FROM pg_policies/i);

    // A criação precisa estar depois da checagem de existência, não antes.
    const posGuarda = sql.search(/FROM pg_policies/i);
    const posPrimeiroCreate = sql.search(/CREATE POLICY/i);
    expect(posGuarda).toBeGreaterThanOrEqual(0);
    expect(posPrimeiroCreate).toBeGreaterThan(posGuarda);
  });
});

describe("migração de rename — cutover", () => {
  const sql = sqlExecutavel(
    join(DIR_MIGRACOES, "20260803120100_renomear_veiculos_para_estoque_motors.sql")
  );

  it("o rename é guardado — não roda se já foi aplicado", () => {
    // Sem a guarda, uma segunda execução aborta com erro e pode travar o
    // `db push` inteiro no meio de um deploy.
    expect(sql).toMatch(/IF EXISTS\s*\(/i);
    expect(sql).toMatch(/NOT EXISTS\s*\(/i);
    expect(sql).toMatch(/ALTER TABLE public\.veiculos RENAME TO estoque_motors/i);
  });

  it("cria a view de compatibilidade para o nome antigo", () => {
    expect(sql).toMatch(/CREATE VIEW public\.veiculos/i);
    expect(sql).toMatch(/SELECT \* FROM public\.estoque_motors/i);
  });

  it("a view de compatibilidade respeita a RLS de quem consulta", () => {
    // Sem `security_invoker`, uma view roda com os privilégios do dono e vira
    // caminho para contornar a RLS da tabela — o oposto do que CLAUDE.md exige.
    expect(sql).toMatch(/security_invoker\s*=\s*true/i);
  });

  it("não remove a view de compatibilidade que acabou de criar", () => {
    // A ordem importa: existe um único DROP VIEW, e ele é o que limpa um
    // resquício ANTES do CREATE. Um DROP depois do CREATE anularia o cutover.
    const posCreate = sql.search(/CREATE VIEW public\.veiculos/i);
    const dropsDepois = sql
      .slice(posCreate)
      .match(/DROP VIEW IF EXISTS public\.veiculos/gi);
    expect(dropsDepois).toBeNull();
  });
});

describe("passo 4 do cutover — remoção da view", () => {
  it("está fora de supabase/migrations/", () => {
    // Se estivesse dentro, `supabase db push` aplicaria a remoção na mesma
    // execução que cria a view, fechando a janela de compatibilidade no
    // instante em que ela é aberta — e derrubando o sync de estoque do n8n.
    const migracoes = readdirSync(DIR_MIGRACOES);
    const infrator = migracoes.find(
      (m) => /remover.*view|drop.*view|view.*compat/i.test(m)
    );
    expect(
      infrator,
      `A remoção da view de compatibilidade não pode viver em migrations/: ${infrator}`
    ).toBeUndefined();
  });

  it("existe, versionado, na pasta de pendentes", () => {
    expect(existsSync(DIR_PENDENTE)).toBe(true);
    const pendentes = readdirSync(DIR_PENDENTE);
    expect(pendentes.some((f) => f.includes("remover_view_compat"))).toBe(true);
  });
});
