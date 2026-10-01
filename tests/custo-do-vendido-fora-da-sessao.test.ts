import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ler, lerCodigo } from "./fonte";

/**
 * O custo de aquisição do carro vendido não sai pela sessão — 2026-10-01.
 *
 * `veiculos_vendidos` tem a policy `veiculos_vendidos_cliente_le`
 * (`USING (cliente_id = cliente_atual())`), e o `authenticated` tinha SELECT
 * na tabela inteira. Com a própria sessão, o cliente da Garagem fazia
 *
 *   GET /rest/v1/veiculos_vendidos?select=valor_venda,custo_aquisicao
 *
 * e recebia, do carro que comprou, quanto pagou E quanto a loja pagou — a
 * margem da venda. A matriz de permissões dá custo só a Admin, Gestor e
 * Financeiro. Medido em 01/10: 1 venda, custo nulo — o furo era de desenho.
 *
 * RLS não recorta coluna, e privilégio de coluna não distingue usuário: o
 * cliente e o vendedor são o mesmo papel `authenticated`. Então a coluna sai
 * do `authenticated` inteiro (migração 20261001180000), e NINGUÉM a lê pela
 * sessão — hoje ninguém lê: nem a Garagem, nem o painel do Ciclo. Escrever
 * continua: o fechamento da venda (`fechar_venda_ciclo`, invoker) grava o
 * custo, e escrever não exige ler.
 *
 * O dia em que o painel precisar MOSTRAR esse custo, ele sai por uma porta da
 * equipe (view com `pode ver custo`, molde de `estoque_motors_equipe`) — não
 * devolvendo a coluna ao `authenticated`. Os blocos abaixo travam as duas
 * metades: o grant final no banco e as leituras do código, que pedindo a
 * coluna (ou `*`) seriam recusadas INTEIRAS pelo PostgREST — a Garagem do
 * cliente cairia.
 */

const MIGRACAO = "20261001180000_custo_do_vendido_fora_da_sessao.sql";
const PASTA = "supabase/migrations";
const REVERSAO = "supabase/manutencao/reversao/custo-do-vendido-2026-10-01.sql";

/** O que o `authenticated` lê de `veiculos_vendidos`: tudo menos o custo. */
const PELA_SESSAO = [
  "id", "cliente_id", "estoque_id", "chassi", "placa", "marca", "modelo",
  "versao", "ano_fabricacao", "ano_modelo", "data_venda", "km_na_venda",
  "valor_venda", "aderiu_ciclo", "vendedor", "created_at", "vendedor_id",
  "saiu_em", "motivo_saida",
];
/** O que só a chave de serviço lê. */
const FORA_DA_SESSAO = ["custo_aquisicao"];

const semComentario = (sql: string) =>
  sql
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

const migracoes = readdirSync(join(__dirname, "..", PASTA))
  .filter((f) => f.endsWith(".sql"))
  .sort();

const executavel = (arquivo: string) => semComentario(ler(`${PASTA}/${arquivo}`));

/** Arquivo ausente vira texto vazio: cada afirmação reprova pelo seu motivo. */
const sqlDe = (caminho: string) =>
  existsSync(join(__dirname, "..", caminho)) ? semComentario(ler(caminho)) : "";

const colunasDe = (lista: string) =>
  lista
    .split(",")
    .map((c) => c.trim().replace(/^'|'$/g, "").toLowerCase())
    .filter(Boolean);

const ordenada = (xs: Iterable<string>) => [...xs].sort();

// ===========================================================================
// O banco
// ===========================================================================

describe("toda coluna de veiculos_vendidos tem decisão", () => {
  /**
   * As colunas como as migrações as deixam: o `create table` da fundação mais
   * cada `add/drop/rename column` posterior. Coluna nova nasce FECHADA para o
   * `authenticated` depois desta migração (o grant é por coluna) — se for de
   * ler pela sessão, precisa do grant na mesma migração que a cria.
   */
  function colunasNasMigracoes(): string[] {
    const colunas: string[] = [];
    for (const arquivo of migracoes) {
      const sql = executavel(arquivo);
      const criacao = sql.match(
        /create table (?:if not exists )?public\.veiculos_vendidos\s*\(([\s\S]*?)\n\s*\);/i,
      );
      if (criacao) {
        for (const linha of criacao[1].split(/\r?\n/)) {
          const m = linha.match(/^\s*([a-z_][a-z0-9_]*)\s+\S/i);
          if (m && !/^(constraint|primary|unique|foreign|check|exclude)$/i.test(m[1])) {
            colunas.push(m[1].toLowerCase());
          }
        }
      }
      for (const alter of sql.matchAll(
        /alter table (?:if exists )?(?:only )?public\.veiculos_vendidos\b([^;]*);/gi,
      )) {
        for (const m of alter[1].matchAll(/add column (?:if not exists )?([a-z_][a-z0-9_]*)/gi)) {
          if (!colunas.includes(m[1].toLowerCase())) colunas.push(m[1].toLowerCase());
        }
        for (const m of alter[1].matchAll(/drop column (?:if exists )?([a-z_][a-z0-9_]*)/gi)) {
          colunas.splice(colunas.indexOf(m[1].toLowerCase()), 1);
        }
        for (const m of alter[1].matchAll(/rename column ([a-z_][a-z0-9_]*) to ([a-z_][a-z0-9_]*)/gi)) {
          colunas[colunas.indexOf(m[1].toLowerCase())] = m[2].toLowerCase();
        }
      }
    }
    return colunas;
  }

  it("as colunas das migrações são exatamente as duas listas, sem sobra nem repetição", () => {
    expect(PELA_SESSAO.filter((c) => FORA_DA_SESSAO.includes(c))).toEqual([]);
    expect(
      ordenada(colunasNasMigracoes()),
      "coluna nova em veiculos_vendidos: decida se o authenticated a lê (grant por coluna na mesma migração) e ponha-a numa das listas",
    ).toEqual(ordenada([...PELA_SESSAO, ...FORA_DA_SESSAO]));
  });
});

describe("o authenticated lê da tabela tudo menos o custo", () => {
  it("a migração está em supabase/migrations", () => {
    expect(existsSync(join(__dirname, "..", PASTA, MIGRACAO)), MIGRACAO).toBe(true);
  });

  /**
   * Privilégio final do `authenticated` em `veiculos_vendidos` depois de todas
   * as migrações, com a semântica do Postgres: revoke de TABELA leva junto os
   * grants de coluna; revoke de coluna não mexe no de tabela. O SELECT de
   * tabela da fundação sai de um laço com `%I` e não aparece aqui — por isso o
   * ponto de partida é "não sei" (null), e o que importa é que a última
   * palavra sobre a tabela seja um revoke.
   */
  function privilegioFinalDoAuthenticated() {
    const PRIVILEGIO = String.raw`(?:select|insert|update|delete|truncate|references|trigger|all(?:\s+privileges)?)(?:\s*\([^)]*\))?`;
    const comando = new RegExp(
      String.raw`\b(grant|revoke)\s+(${PRIVILEGIO}(?:\s*,\s*${PRIVILEGIO})*)\s+on\s+(?:table\s+)?public\.veiculos_vendidos\s+(to|from)\s+([^;]+);`,
      "gi",
    );
    let tabela: boolean | null = null;
    const colunas = new Set<string>();
    const reabriuDepois: string[] = [];
    for (const arquivo of migracoes) {
      for (const m of executavel(arquivo).matchAll(comando)) {
        const papeis = m[4].toLowerCase().split(",").map((p) => p.trim());
        if (!papeis.includes("authenticated") && !papeis.includes("public")) continue;
        const concede = m[1].toLowerCase() === "grant";
        for (const item of m[2].matchAll(/(select|insert|update|delete|truncate|references|trigger|all)(?:\s+privileges)?\s*(?:\(([^)]*)\))?/gi)) {
          const nome = item[1].toLowerCase();
          if (nome !== "select" && nome !== "all") continue;
          if (item[2] === undefined) {
            tabela = concede;
            if (!concede) colunas.clear();
            if (concede && arquivo >= MIGRACAO) reabriuDepois.push(arquivo);
          } else {
            for (const c of colunasDe(item[2])) {
              if (concede) colunas.add(c);
              else colunas.delete(c);
            }
          }
        }
      }
    }
    return { tabela, colunas, reabriuDepois };
  }

  it("depois de todas as migrações: sem SELECT de tabela, e as colunas são as da sessão — sem o custo", () => {
    const { tabela, colunas } = privilegioFinalDoAuthenticated();
    expect(tabela, "o authenticated tem SELECT de tabela — o cliente lê o custo de aquisição do próprio carro").toBe(false);
    expect([...colunas].filter((c) => FORA_DA_SESSAO.includes(c)), "custo concedido por coluna").toEqual([]);
    expect(ordenada(colunas)).toEqual(ordenada(PELA_SESSAO));
  });

  it("nenhuma migração a partir desta devolve SELECT de tabela ao authenticated", () => {
    expect(privilegioFinalDoAuthenticated().reabriuDepois).toEqual([]);
    for (const arquivo of migracoes.filter((f) => f >= MIGRACAO)) {
      expect(executavel(arquivo), arquivo).not.toMatch(
        /grant\s+[^;]*on\s+all\s+tables\s+in\s+schema\s+public\s+to\s+[^;]*\b(authenticated|public)\b/i,
      );
    }
  });

  it("revoga o SELECT de TABELA antes de conceder por coluna — e só o SELECT", () => {
    const sql = sqlDe(`${PASTA}/${MIGRACAO}`);
    const revoga = sql.search(/revoke select on public\.veiculos_vendidos from authenticated;/);
    const concede = sql.search(/grant select \([^)]*\) on public\.veiculos_vendidos to authenticated;/);
    expect(revoga).toBeGreaterThan(-1);
    expect(concede).toBeGreaterThan(revoga);
    // INSERT, UPDATE e DELETE ficam: `fechar_venda_ciclo` roda como quem chama
    // e grava o custo; a saída da Garagem grava `saiu_em`. Escrever não exige ler.
    expect(sql).not.toMatch(/revoke\s+(all|insert|update|delete)[^;]*on\s+public\.veiculos_vendidos\s+from/i);
  });

  it("a autoconferência confere as mesmas duas listas que este teste", () => {
    const sql = sqlDe(`${PASTA}/${MIGRACAO}`);
    const lista = (nome: string) => {
      const m = sql.match(new RegExp(String.raw`\b${nome}\s+text\[\]\s*:=\s*array\[([^\]]*)\]`, "i"));
      return m ? ordenada(colunasDe(m[1])) : null;
    };
    expect(lista("pela_sessao")).toEqual(ordenada(PELA_SESSAO));
    expect(lista("fora_da_sessao")).toEqual(ordenada(FORA_DA_SESSAO));
  });

  it("a reversão existe, devolve a tabela na ordem certa e tira a versão do livro-razão", () => {
    const sql = sqlDe(REVERSAO);
    const revogaColunas = sql.match(/revoke select \(([^)]*)\) on public\.veiculos_vendidos from authenticated;/);
    expect(revogaColunas, "a reversão não revoga as colunas antes").not.toBeNull();
    expect(ordenada(colunasDe(revogaColunas![1]))).toEqual(ordenada(PELA_SESSAO));
    // Revogar coluna DEPOIS de conceder a tabela não teria efeito nenhum.
    const devolve = sql.search(/grant select on public\.veiculos_vendidos to authenticated;/);
    expect(devolve).toBeGreaterThan(sql.indexOf(revogaColunas![0]));
    expect(sql).toContain(`delete from supabase_migrations.schema_migrations where version = '${MIGRACAO.slice(0, 14)}';`);
  });
});

// ===========================================================================
// O código
// ===========================================================================

type Leitura = { arquivo: string; tipo: "from" | "embed"; colunas: string[] };

function arquivosDoCodigo(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivosDoCodigo(caminho);
    return /\.(ts|tsx)$/.test(nome) ? [caminho] : [];
  });
}

/** Do `(` em `i`, o conteúdo até o `)` que o fecha — atento a string. */
function argumentosAPartirDe(fonte: string, i: number): { conteudo: string; fim: number } {
  let profundidade = 0;
  let aspas: string | null = null;
  for (let j = i; j < fonte.length; j++) {
    const ch = fonte[j];
    if (aspas) {
      if (ch === "\\") j++;
      else if (ch === aspas) aspas = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") aspas = ch;
    else if (ch === "(") profundidade++;
    else if (ch === ")" && --profundidade === 0) return { conteudo: fonte.slice(i + 1, j), fim: j + 1 };
  }
  throw new Error("parêntese sem fechamento");
}

/** O primeiro argumento, se for literal de string; `null` se for outra coisa. */
function literalInicial(args: string): string | null {
  const m = args.trim().match(/^(["'`])([\s\S]*?)\1/);
  if (!m) return null;
  if (m[2].includes("${")) return null;
  return m[2];
}

/** Colunas de primeiro nível de um `select` do PostgREST — sem os embeds. */
function colunasDoSelect(selecao: string): string[] {
  let s = selecao;
  for (let antes = ""; antes !== s; ) {
    antes = s;
    s = s.replace(/[\w!:.]+\s*\([^()]*\)/g, "");
  }
  return s
    .split(",")
    .map((t) => t.trim().replace(/^\w+:/, "").replace(/::\w+$/, "").replace(/->.*$/, "").toLowerCase())
    .filter(Boolean);
}

const FILTROS = new Set([
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "contains",
  "containedBy", "not", "filter", "order", "textSearch", "overlaps",
]);

function leiturasDeVeiculosVendidos(): Leitura[] {
  const raiz = join(__dirname, "..");
  const leituras: Leitura[] = [];
  for (const caminho of arquivosDoCodigo(join(raiz, "src"))) {
    const arquivo = relative(raiz, caminho).split("\\").join("/");
    const fonte = lerCodigo(arquivo);

    for (const abre of fonte.matchAll(/\.from\(\s*(["'`])veiculos_vendidos\1\s*\)/g)) {
      const colunas: string[] = [];
      let i = abre.index! + abre[0].length;
      for (;;) {
        const chamada = fonte.slice(i).match(/^\s*\.\s*(\w+)\s*(?=\()/);
        if (!chamada) break;
        const nome = chamada[1];
        const { conteudo, fim } = argumentosAPartirDe(fonte, i + chamada[0].length);
        i = fim;
        if (nome === "select") {
          if (conteudo.trim() === "") colunas.push("*");
          else {
            const selecao = literalInicial(conteudo);
            colunas.push(...(selecao === null ? ["<seleção que não é literal>"] : colunasDoSelect(selecao)));
          }
        } else if (FILTROS.has(nome)) {
          const coluna = literalInicial(conteudo);
          colunas.push(coluna === null ? `<${nome} sem coluna literal>` : coluna.replace(/->.*$/, "").toLowerCase());
        } else if (nome === "or") {
          const expr = literalInicial(conteudo) ?? "<or sem literal>";
          colunas.push(...expr.split(",").map((t) => t.trim().split(".")[0].toLowerCase()));
        } else if (nome === "match" || nome === "upsert") {
          colunas.push(`<${nome}: confira à mão>`);
        }
      }
      leituras.push({ arquivo, tipo: "from", colunas });
    }

    for (const embed of fonte.matchAll(/\b(?:veiculos_vendidos|veiculo_vendido_id)(?:!\w+)?\s*\(/g)) {
      const { conteudo } = argumentosAPartirDe(fonte, embed.index! + embed[0].length - 1);
      leituras.push({ arquivo, tipo: "embed", colunas: colunasDoSelect(conteudo) });
    }
  }
  return leituras;
}

describe("o código não pede o custo do vendido (nem `*`)", () => {
  const leituras = leiturasDeVeiculosVendidos();

  it("o leitor acha as leituras que existem hoje — não ficou cego", () => {
    const achadas = leituras.map((l) => `${l.tipo} ${l.arquivo}`);
    expect(achadas).toEqual(
      expect.arrayContaining([
        "from src/app/garagem/page.tsx",
        "from src/app/garagem/meus-dados/page.tsx",
        "from src/app/api/ciclo/revisoes/route.ts",
        "embed src/app/api/ciclo/revisoes/route.ts",
        "from src/app/api/ciclo/vendas/estoque/route.ts",
        "from src/app/api/ciclo/veiculos/[id]/saida/route.ts",
        "embed src/app/api/ciclo/motor/verificacao/route.ts",
        "from src/lib/publicacao.ts",
      ]),
    );
  });

  it("o leitor enxerga filtro e ordenação, não só o select", () => {
    const daGaragem = leituras.find((l) => l.tipo === "from" && l.arquivo === "src/app/garagem/page.tsx")!;
    expect(daGaragem.colunas).toEqual(expect.arrayContaining(["saiu_em", "cliente_id", "data_venda"]));
    const doPainel = leituras.find((l) => l.tipo === "from" && l.arquivo === "src/app/api/ciclo/revisoes/route.ts")!;
    expect(doPainel.colunas).toContain("created_at");
  });

  it("toda leitura de veiculos_vendidos pede só colunas que o authenticated lê", () => {
    // Pedir uma coluna fora da lista — o custo, ou `*` — faz o PostgREST
    // recusar a leitura INTEIRA (42501) depois da migração 20261001180000:
    // a Garagem do cliente e o painel do Ciclo cairiam. Custo para quem pode
    // ver custo sai por uma porta da equipe, não por esta tabela.
    const fora = leituras.flatMap((l) =>
      l.colunas.filter((c) => !PELA_SESSAO.includes(c)).map((c) => `${l.tipo} ${l.arquivo}: ${c}`),
    );
    expect(fora, fora.join(" | ")).toEqual([]);
  });
});
