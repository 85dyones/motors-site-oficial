import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * Guarda contra colunas fantasma em `estoque_motors`.
 *
 * Por que este teste existe:
 *
 * Em 2026-08-03 o painel de margens estava morto em produção porque
 * `/api/financeiro/margens` selecionava `preco_compra`, uma coluna que nunca
 * existiu. O PostgREST não ignora coluna desconhecida — ele rejeita a query
 * INTEIRA com 42703 ("column ... does not exist"). E como o código destrutura
 * só `{ data }` e descarta o `error`, o resultado vira `undefined`, o
 * `forEach` itera sobre vazio e a tela mostra "nenhum veículo" em vez de um
 * erro. O mesmo padrão escondeu a busca por `placa` na rota de consulta desde
 * sempre: falhava, o erro sumia, e o fallback por ID respondia no lugar.
 *
 * As duas colunas nunca existiram — não foi regressão do rename do Pacote 0.5.
 * O rename só forçou a primeira leitura real do schema, que as expôs.
 *
 * O que torna essa classe de bug cara é que ela não aparece em lugar nenhum:
 * compila, passa no lint, passa no code review, e quebra em runtime numa rota
 * interna que ninguém abre. Só o banco sabe. Este teste traz esse conhecimento
 * para dentro da suíte: cruza cada coluna citada em query com o baseline
 * versionado, que é verificado contra produção.
 *
 * Alcance, sem exagero: o scanner só enxerga cadeias diretas
 * (`.from("estoque_motors").select(...).eq(...)`). Onde a query é montada em
 * etapas por variável — `let q = supabase.from(...); q = q.eq(...)` — os
 * filtros da segunda etapa escapam. Cobre o formato em que os dois bugs
 * nasceram, não todo uso possível do client.
 */

const RAIZ = join(__dirname, "..");
const RAIZ_SRC = join(RAIZ, "src");
const BASELINE = join(
  RAIZ,
  "supabase",
  "migrations",
  "20260803120000_baseline_inventario.sql"
);
const EXTENSOES = new Set([".ts", ".tsx"]);

/** Palavras que abrem uma cláusula de tabela, não uma coluna. */
const NAO_E_COLUNA = new Set([
  "constraint",
  "primary",
  "unique",
  "foreign",
  "check",
  "exclude",
  "like",
]);

/**
 * Colunas da tabela de inventário, montadas a partir do histórico completo de
 * migrações — não só do baseline.
 *
 * O baseline cria a tabela com o nome ANTIGO (`veiculos`): ele é anterior à
 * migração de rename, e essa ordem é proposital (ver migracoes.test.ts). O
 * conjunto de colunas é o mesmo; o rename não mexe em coluna.
 *
 * Migrações posteriores somam (`ADD COLUMN`) e subtraem (`DROP COLUMN`). Ler só
 * o baseline faria toda coluna nova nascer acusada de não existir — o guarda
 * viraria obstáculo a mudança legítima de schema em vez de proteção. Seria o
 * caso de `last_seen_at`, adicionada em 2026-08-04.
 */
function colunasDaTabela(): Set<string> {
  const sql = readFileSync(BASELINE, "utf8");
  const inicio = sql.search(/CREATE TABLE IF NOT EXISTS public\.veiculos\s*\(/i);
  if (inicio < 0) throw new Error("CREATE TABLE do baseline não encontrado.");

  const corpo = sql.slice(sql.indexOf("(", inicio) + 1);
  const fim = corpo.search(/^\s*\);/m);
  if (fim < 0) throw new Error("Fim do CREATE TABLE do baseline não encontrado.");

  const colunas = new Set<string>();
  for (const linha of corpo.slice(0, fim).split("\n")) {
    const limpa = linha.trimStart();
    if (limpa.startsWith("--") || limpa === "") continue;
    const m = limpa.match(/^([a-z_][a-z0-9_]*)\s+\S/i);
    if (m && !NAO_E_COLUNA.has(m[1].toLowerCase())) colunas.add(m[1]);
  }

  // Aplica as migrações seguintes em ordem cronológica — o nome começa com
  // timestamp, então ordenar por nome é ordenar por tempo.
  const dirMigracoes = join(RAIZ, "supabase", "migrations");
  for (const arquivo of readdirSync(dirMigracoes).filter((f) => f.endsWith(".sql")).sort()) {
    if (arquivo === "20260803120000_baseline_inventario.sql") continue;
    const executavel = readFileSync(join(dirMigracoes, arquivo), "utf8")
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");

    let m: RegExpExecArray | null;
    const add = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi;
    while ((m = add.exec(executavel)) !== null) colunas.add(m[1]);

    const drop = /DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi;
    while ((m = drop.exec(executavel)) !== null) colunas.delete(m[1]);
  }

  return colunas;
}

function arquivosFonte(dir: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) {
      encontrados.push(...arquivosFonte(caminho));
    } else if (EXTENSOES.has(extname(entrada))) {
      encontrados.push(caminho);
    }
  }
  return encontrados;
}

type Citacao = { arquivo: string; coluna: string; origem: string };

/** Trecho encadeado após cada `.from("estoque_motors")`, até o fim do statement. */
function cadeias(codigo: string): string[] {
  const achadas: string[] = [];
  const re = /\.from\(\s*["'`]estoque_motors["'`]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo)) !== null) {
    const resto = codigo.slice(m.index + m[0].length);
    const fim = resto.indexOf(";");
    achadas.push(fim < 0 ? resto : resto.slice(0, fim));
  }
  return achadas;
}

/**
 * Colunas citadas em queries a `estoque_motors`, em três formatos:
 *   - `.select("a, b, c")`
 *   - `.eq("coluna", v)` e demais filtros
 *   - `.or("modelo.ilike.%x%,marca.ilike.%x%")`
 *
 * `*` e embeds do PostgREST (`categoria:tabela(*)`) são ignorados: não são
 * coluna desta tabela e o servidor os resolve por outro caminho.
 */
function colunasCitadas(arquivos: string[]): Citacao[] {
  const citacoes: Citacao[] = [];
  const identificador = /^[a-z_][a-z0-9_]*$/i;

  for (const arquivo of arquivos) {
    const codigo = readFileSync(arquivo, "utf8");
    const curto = arquivo.replace(RAIZ_SRC, "src");

    for (const cadeia of cadeias(codigo)) {
      const select = cadeia.match(/^\s*\.select\(\s*(["'`])([\s\S]*?)\1/);
      if (select) {
        for (const bruto of select[2].split(",")) {
          const coluna = bruto.trim();
          if (coluna === "*" || coluna === "") continue;
          if (!identificador.test(coluna)) continue; // embed ou expressão
          citacoes.push({ arquivo: curto, coluna, origem: ".select()" });
        }
      }

      const filtros =
        /\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|order)\(\s*["'`]([a-z_][a-z0-9_]*)["'`]/gi;
      let f: RegExpExecArray | null;
      while ((f = filtros.exec(cadeia)) !== null) {
        citacoes.push({ arquivo: curto, coluna: f[2], origem: `.${f[1]}()` });
      }

      const ors = /\.or\(\s*["'`]([\s\S]*?)["'`]\s*\)/g;
      let o: RegExpExecArray | null;
      while ((o = ors.exec(cadeia)) !== null) {
        const dentro =
          /([a-z_][a-z0-9_]*)\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in)\./gi;
        let d: RegExpExecArray | null;
        while ((d = dentro.exec(o[1])) !== null) {
          citacoes.push({ arquivo: curto, coluna: d[1], origem: ".or()" });
        }
      }
    }
  }
  return citacoes;
}

describe("colunas de estoque_motors citadas em queries", () => {
  const colunas = colunasDaTabela();
  const citacoes = colunasCitadas(arquivosFonte(RAIZ_SRC));

  it("o histórico de migrações foi lido — o conjunto de colunas não está vazio", () => {
    // Se o parser do CREATE TABLE quebrar, `colunas` vira vazio e TODA citação
    // viraria violação. O teste falharia ruidosamente, mas pelo motivo errado.
    expect(colunas.size).toBeGreaterThan(20);
    expect(colunas.has("preco")).toBe(true);
    expect(colunas.has("vendido")).toBe(true);
  });

  it("colunas de migrações posteriores ao baseline entram no conjunto", () => {
    // Contraprova de que o histórico é aplicado, e não só o baseline: esta
    // coluna nasceu em 20260804200000, depois do CREATE TABLE.
    expect(colunas.has("last_seen_at")).toBe(true);
  });

  it("o scanner encontrou queries — a varredura não passa por vacuidade", () => {
    // Contraprova: sem isto, apagar todas as queries do projeto — ou quebrar a
    // regex — faria este arquivo inteiro passar em silêncio.
    expect(citacoes.length).toBeGreaterThan(0);
  });

  it("nenhuma query cita coluna que não existe na tabela", () => {
    const violacoes = citacoes
      .filter((c) => !colunas.has(c.coluna))
      .map((c) => `${c.arquivo} — ${c.origem} cita \`${c.coluna}\``);

    expect(
      violacoes,
      `Coluna citada em query mas ausente de estoque_motors.\n` +
        `O PostgREST rejeita a query inteira (42703) e o código descarta o\n` +
        `error — a falha vira lista vazia, não erro. Ou a coluna entra por\n` +
        `migração em supabase/migrations/, ou a citação sai da query.\n` +
        `Violações:\n  ${violacoes.join("\n  ")}`
    ).toEqual([]);
  });

  it("`preco_compra` e `placa` agora existem — por migração, não por descuido", () => {
    // Este teste substitui os dois pinos que proibiam as colunas em query e
    // no tipo `Veiculo`. Eles existiam porque as colunas eram FANTASMAS
    // (painel de margens morto, busca por placa silenciosamente quebrada), e
    // avisavam: reintroduzir exige decisão consciente, na ordem migração →
    // coluna → campo.
    //
    // A decisão veio do dono em 2026-08-07 ("o RevendaMais será
    // descontinuado; os campos passam a ser preenchidos por nós") e a ordem
    // foi respeitada: a migração 20260807160000_ficha_propria_do_painel.sql
    // cria as duas — junto de motor, cor_interna, donos_anteriores e
    // garantia_fabrica — como colunas do PAINEL, fora do mapeamento do sync.
    //
    // O guarda geral acima continua valendo para qualquer coluna: se alguém
    // citar uma que não esteja no histórico de migrações, o teste acusa. O
    // que este pino agora afirma é o contrário do antigo: as colunas têm de
    // constar do histórico — se a migração sumir, isto aqui grita.
    expect(colunas.has("placa")).toBe(true);
    expect(colunas.has("preco_compra")).toBe(true);
    expect(colunas.has("motor")).toBe(true);
    expect(colunas.has("cor_interna")).toBe(true);
    expect(colunas.has("donos_anteriores")).toBe(true);
    expect(colunas.has("garantia_fabrica")).toBe(true);
  });
});
