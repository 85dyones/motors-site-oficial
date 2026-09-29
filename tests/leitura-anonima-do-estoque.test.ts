import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { ler, lerCodigo } from "./fonte";
import {
  COLUNAS_INTERNAS_DO_ESTOQUE,
  COLUNAS_PUBLICAS_DO_ESTOQUE,
  SELECT_PUBLICO_DO_ESTOQUE,
} from "../src/lib/colunasDoEstoque";

/**
 * A chave pública não lê placa, chassi, renavam nem custo — 2026-09-29.
 *
 * `estoque_motors` tinha `USING (true)` e o `anon` com SELECT em todas as
 * colunas: com a chave do bundle, qualquer um lia documentos e custo. O
 * conserto tem duas pontas, e cada bloco abaixo trava uma:
 *   - o banco concede ao `anon` só as colunas públicas (migração
 *     20260929220000);
 *   - o código pede só essas colunas — `select("*")` o PostgREST recusaria
 *     inteiro, e a vitrine cairia.
 * As duas leem a mesma lista (`lib/colunasDoEstoque.ts`).
 */

const PASTA = "supabase/migrations";
const MIGRACAO = "20260929220000_leitura_anonima_sem_documento_nem_custo.sql";

const executavel = (arquivo: string) =>
  ler(`${PASTA}/${arquivo}`)
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

const colunasDe = (lista: string) =>
  lista
    .split(",")
    .map((c) => c.trim().replace(/^'|'$/g, ""))
    .filter(Boolean);

describe("as duas listas", () => {
  it("documento e custo são internos — e nenhuma coluna está nas duas", () => {
    for (const interna of ["placa", "chassi", "renavam", "preco_compra"]) {
      expect(COLUNAS_INTERNAS_DO_ESTOQUE as readonly string[], interna).toContain(interna);
      expect(COLUNAS_PUBLICAS_DO_ESTOQUE as readonly string[], interna).not.toContain(interna);
    }
    const publicas = new Set<string>(COLUNAS_PUBLICAS_DO_ESTOQUE);
    expect(COLUNAS_INTERNAS_DO_ESTOQUE.filter((c) => publicas.has(c))).toEqual([]);
    expect(new Set(COLUNAS_PUBLICAS_DO_ESTOQUE).size).toBe(COLUNAS_PUBLICAS_DO_ESTOQUE.length);
  });

  it("o select público é a lista, sem nenhuma interna", () => {
    expect(SELECT_PUBLICO_DO_ESTOQUE.split(",")).toEqual([...COLUNAS_PUBLICAS_DO_ESTOQUE]);
  });
});

describe("o banco concede ao anon exatamente a lista pública", () => {
  // Todas as migrações que concedem colunas de estoque_motors ao anon: coluna
  // pública nova entra por um `grant` novo, e a soma tem de bater com o código.
  const concedidas = readdirSync(join(__dirname, "..", PASTA))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .flatMap((f) =>
      [...executavel(f).matchAll(/grant\s+select\s*\(([^)]*)\)\s*on\s+public\.estoque_motors\s+to\s+anon\s*;/gi)].flatMap(
        (m) => colunasDe(m[1]),
      ),
    );

  it("a soma dos grants é a constante do código — nem mais, nem menos", () => {
    expect([...new Set(concedidas)].sort()).toEqual([...COLUNAS_PUBLICAS_DO_ESTOQUE].sort());
  });

  it("nenhum grant ao anon toca coluna interna", () => {
    for (const interna of COLUNAS_INTERNAS_DO_ESTOQUE) {
      expect(concedidas, interna).not.toContain(interna);
    }
  });

  const sql = executavel(MIGRACAO);

  it("revoga o SELECT de TABELA antes de conceder por coluna", () => {
    // Privilégio de coluna não recorta um SELECT de tabela: sem o revoke, o
    // grant por coluna não fecharia nada.
    const revoga = sql.search(/revoke select on public\.estoque_motors from anon;/);
    const concede = sql.search(/grant select \(/);
    expect(revoga).toBeGreaterThan(-1);
    expect(concede).toBeGreaterThan(revoga);
  });

  it("a autoconferência usa as mesmas duas listas", () => {
    const publicas = sql.match(/publicas text\[\] := array\[([\s\S]*?)\];/);
    const internas = sql.match(/internas text\[\] := array\[([\s\S]*?)\];/);
    expect(publicas && colunasDe(publicas[1])).toEqual([...COLUNAS_PUBLICAS_DO_ESTOQUE]);
    expect(internas && colunasDe(internas[1])).toEqual([...COLUNAS_INTERNAS_DO_ESTOQUE]);
  });

  it("e prova na prática: anon não lê a placa nem select *, e o painel segue lendo tudo", () => {
    expect(sql).toMatch(/set local role anon;[\s\S]*perform placa from public\.estoque_motors limit 1;[\s\S]*exception when insufficient_privilege/);
    expect(sql).toMatch(/perform \* from public\.estoque_motors limit 1;[\s\S]*exception when insufficient_privilege/);
    expect(sql).toMatch(/has_table_privilege\('authenticated', 'public\.estoque_motors', 'select'\)/);
    expect(sql).toMatch(/fora das duas listas/);
  });

  it("termina com o rodapé do livro-razão", () => {
    expect(sql).toMatch(
      /insert into supabase_migrations\.schema_migrations \(version, name\)\s+values \('20260929220000', 'leitura_anonima_sem_documento_nem_custo'\)\s+on conflict \(version\) do nothing;\s*$/,
    );
  });
});

describe("o código pede só o que a chave pública lê", () => {
  const supabaseTs = lerCodigo("src/lib/supabase.ts");

  it("nenhum select('*') em estoque_motors no módulo do cliente público", () => {
    expect(supabaseTs).not.toMatch(/from\("estoque_motors"\)\s*\.select\("\*"\)/);
    expect(supabaseTs.match(/\.select\(SELECT_PUBLICO_DO_ESTOQUE\)/g)?.length ?? 0).toBe(2);
    expect(supabaseTs).toMatch(/const colunas = opts\.incluirPlaca \? `\$\{SELECT_PUBLICO_DO_ESTOQUE\},placa` : SELECT_PUBLICO_DO_ESTOQUE;/);
  });

  it("a placa só vem com o cliente de quem pediu — o tipo obriga", () => {
    expect(supabaseTs).toMatch(
      /type PlacaNaLeitura =\s*\|\s*\{ incluirPlaca\?: false; cliente\?: SupabaseClient \}\s*\|\s*\{ incluirPlaca: true; cliente: SupabaseClient \};/,
    );
    expect(supabaseTs).toMatch(/const fonte = opts\.cliente \?\? supabase;/);
  });

  it("quem pede a placa passa a sessão", () => {
    for (const arquivo of ["src/app/admin/page.tsx", "src/app/api/estoque/route.ts"]) {
      const codigo = lerCodigo(arquivo);
      expect(codigo, arquivo).toMatch(/getEstoque\(\{[^)]*incluirPlaca: true,[^)]*cliente: supabase,[^)]*\}\)/);
    }
  });

  it("o mapper só lê coluna pública (além de dois nomes antigos que nunca existiram)", () => {
    // `fipe` e `description` são leituras de fallback de colunas que não existem
    // na tabela — sempre undefined, e não podem entrar no select (o PostgREST
    // recusaria coluna inexistente).
    const inicio = supabaseTs.indexOf("export function mapVeiculoDbToVeiculo(");
    const fim = supabaseTs.indexOf("\nexport ", inicio + 10);
    const mapper = supabaseTs.slice(inicio, fim);
    const lidas = new Set(
      [...mapper.matchAll(/\b(?:dbItem|item)\.([a-z_]+)/g)].map((m) => m[1]),
    );
    const publicas = new Set<string>([...COLUNAS_PUBLICAS_DO_ESTOQUE, "fipe", "description"]);
    const fora = [...lidas].filter((c) => !publicas.has(c));
    expect(fora, "o mapper lê coluna fora da lista pública: " + fora.join(", ")).toEqual([]);
    expect(lidas.size).toBeGreaterThan(30);
  });
});
