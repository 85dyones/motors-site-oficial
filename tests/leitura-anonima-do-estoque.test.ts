import { describe, it, expect, vi, afterEach } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
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
 *
 * A revisão adversarial da PR provou, por mutação, que a primeira versão
 * destes testes deixava passar: `select('*')` com aspas simples, leitura
 * pública nova fora de `supabase.ts`, função pública pedindo `placa`, um
 * `grant` de tabela que reabria tudo e um `revoke` de coluna que derrubava a
 * vitrine. Cada caso tem um bloco abaixo.
 */

const PUBLICAS = new Set<string>(COLUNAS_PUBLICAS_DO_ESTOQUE);
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

const migracoes = readdirSync(join(__dirname, "..", PASTA))
  .filter((f) => f.endsWith(".sql"))
  .sort();

describe("as duas listas", () => {
  it("documento e custo são internos — e nenhuma coluna está nas duas", () => {
    for (const interna of ["placa", "chassi", "renavam", "preco_compra"]) {
      expect(COLUNAS_INTERNAS_DO_ESTOQUE as readonly string[], interna).toContain(interna);
      expect(COLUNAS_PUBLICAS_DO_ESTOQUE as readonly string[], interna).not.toContain(interna);
    }
    expect(COLUNAS_INTERNAS_DO_ESTOQUE.filter((c) => PUBLICAS.has(c))).toEqual([]);
    expect(PUBLICAS.size).toBe(COLUNAS_PUBLICAS_DO_ESTOQUE.length);
  });

  it("o select público é a lista, sem nenhuma interna", () => {
    expect(SELECT_PUBLICO_DO_ESTOQUE.split(",")).toEqual([...COLUNAS_PUBLICAS_DO_ESTOQUE]);
  });
});

describe("o banco concede ao anon exatamente a lista pública", () => {
  /**
   * O que o `anon` lê depois de TODAS as migrações, na ordem em que rodam —
   * com a semântica do Postgres: o revoke de TABELA leva junto os grants de
   * coluna, o revoke de coluna tira só aquela, e o grant de tabela libera tudo.
   * Somar só os grants (a primeira versão) não via um `revoke select (descricao)`
   * que derrubaria a vitrine, nem um `grant select on … to anon` que reabriria
   * a placa.
   */
  function privilegioFinalDoAnon() {
    const comando =
      /\b(grant|revoke)\s+(select|all(?:\s+privileges)?)\s*(?:\(([^)]*)\))?\s+on\s+(?:table\s+)?public\.estoque_motors\s+(to|from)\s+([^;]+);/gi;
    let tabela = false;
    const colunas = new Set<string>();
    const reabriuDepois: string[] = [];
    for (const arquivo of migracoes) {
      for (const m of executavel(arquivo).matchAll(comando)) {
        const papeis = m[5].toLowerCase().split(",").map((p) => p.trim());
        if (!papeis.includes("anon") && !papeis.includes("public")) continue;
        const concede = m[1].toLowerCase() === "grant";
        if (m[3] === undefined) {
          tabela = concede;
          if (!concede) colunas.clear();
          if (concede && arquivo >= MIGRACAO) reabriuDepois.push(arquivo);
        } else {
          for (const c of colunasDe(m[3])) {
            if (concede) colunas.add(c);
            else colunas.delete(c);
          }
        }
      }
    }
    return { tabela, colunas, reabriuDepois };
  }

  it("depois de todas as migrações, o anon lê a constante do código — nem mais, nem menos", () => {
    const { tabela, colunas } = privilegioFinalDoAnon();
    expect(tabela, "o anon voltou a ter SELECT de tabela — a placa reabriu").toBe(false);
    expect([...colunas].sort()).toEqual([...COLUNAS_PUBLICAS_DO_ESTOQUE].sort());
  });

  it("nenhuma migração a partir desta devolve SELECT de tabela ao anon", () => {
    expect(privilegioFinalDoAnon().reabriuDepois).toEqual([]);
    // O atalho do schema inteiro também reabriria `estoque_motors`.
    for (const arquivo of migracoes.filter((f) => f >= MIGRACAO)) {
      expect(executavel(arquivo), arquivo).not.toMatch(
        /grant\s+(select|all)[^;]*on\s+all\s+tables\s+in\s+schema\s+public\s+to\s+[^;]*\b(anon|public)\b/i,
      );
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

  it("a autoconferência confere o próprio grant e as internas de 29/09", () => {
    // Retrato do dia, e não a constante: esta migração não muda mais depois de
    // aplicada, e a constante vai crescer quando surgir coluna pública nova (em
    // outro `grant`). Quem acompanha a constante é o teste do privilégio final.
    const grant = sql.match(/grant select \(([^)]*)\) on public\.estoque_motors to anon;/);
    const publicas = sql.match(/publicas text\[\] := array\[([\s\S]*?)\];/);
    const internas = sql.match(/internas text\[\] := array\[([\s\S]*?)\];/);
    expect(grant && publicas && colunasDe(publicas[1])).toEqual(grant && colunasDe(grant[1]));
    expect(internas && colunasDe(internas[1])).toEqual([
      "placa",
      "chassi",
      "renavam",
      "preco_compra",
      "valor_fipe",
      "codigo_fipe",
    ]);
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

  it("tem reversão, e ela devolve a tabela DEPOIS de tirar as colunas", () => {
    // Revogar coluna depois de conceder a tabela não tem efeito no Postgres.
    const reversao = ler("supabase/manutencao/reversao/leitura-anonima-2026-09-29.sql")
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    const tiraColunas = reversao.search(/revoke select \([\s\S]*?\) on public\.estoque_motors from anon;/);
    const devolveTabela = reversao.search(/grant select on public\.estoque_motors to anon;/);
    expect(tiraColunas).toBeGreaterThan(-1);
    expect(devolveTabela).toBeGreaterThan(tiraColunas);
    expect(reversao).toMatch(/delete from supabase_migrations\.schema_migrations where version = '20260929220000';/);
    expect(reversao).not.toMatch(/\b(begin|commit)\s*;/i);
  });
});

// ---------------------------------------------------------------------------
// O código
// ---------------------------------------------------------------------------

function arquivosDe(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivosDe(caminho);
    return /\.(ts|tsx)$/.test(nome) ? [caminho] : [];
  });
}

/**
 * Quem lê `estoque_motors` com a chave pública: o próprio `lib/supabase.ts`,
 * quem importa o cliente `supabase` dele, quem monta cliente com a chave anon
 * e todo componente de browser. Quem usa a sessão
 * (`createServerSupabaseClient`) ou recebe o cliente por parâmetro fica de fora
 * — ali o papel é `authenticated`, que segue lendo tudo.
 */
function usaAChavePublica(arquivo: string, codigo: string): boolean {
  if (arquivo === "src/lib/supabase.ts") return true;
  if (/NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(codigo)) return true;
  if (/createBrowserClient|createBrowserSupabaseClient|^\s*["']use client["']/m.test(codigo)) return true;
  return [...codigo.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'][^"']*(?:\/lib\/|\.\/)supabase["']/g)].some((m) =>
    /(^|[\s,])supabase(\s|,|$)/.test(m[1]),
  );
}

/** Colunas de um select literal do supabase-js; `null` se não for verificável. */
function colunasDoLiteral(argumento: string): string[] | null {
  const literal = argumento.match(/^(["'`])([^"'`$]*)\1$/);
  if (!literal) return null;
  return literal[2]
    .split(",")
    .map((c) => c.trim())
    .map((c) => c.split(":").pop()!.split("::")[0].trim());
}

describe("o código pede só o que a chave pública lê", () => {
  const supabaseTs = lerCodigo("src/lib/supabase.ts");

  it("toda leitura de estoque_motors com a chave pública pede colunas públicas — em qualquer arquivo", () => {
    const raiz = join(__dirname, "..");
    const leituras: string[] = [];
    const recusadas: string[] = [];
    for (const absoluto of arquivosDe(join(raiz, "src"))) {
      const arquivo = relative(raiz, absoluto).split("\\").join("/");
      const codigo = lerCodigo(arquivo);
      if (!/\.from\(\s*["'`]estoque_motors["'`]\s*\)/.test(codigo)) continue;
      if (!usaAChavePublica(arquivo, codigo)) continue;
      for (const m of codigo.matchAll(/\.from\(\s*["'`]estoque_motors["'`]\s*\)\s*\.select\(\s*([^)]*?)\s*\)/g)) {
        const argumento = m[1];
        leituras.push(`${arquivo}: ${argumento}`);
        if (argumento === "SELECT_PUBLICO_DO_ESTOQUE") continue;
        // A lista dinâmica do `getEstoque` — travada no teste logo abaixo.
        if (arquivo === "src/lib/supabase.ts" && argumento === 'colunas as "*"') continue;
        const colunas = colunasDoLiteral(argumento);
        if (colunas === null) {
          recusadas.push(`${arquivo}: select(${argumento}) — argumento que o teste não consegue conferir`);
          continue;
        }
        const fora = colunas.filter((c) => !PUBLICAS.has(c));
        if (fora.length > 0) recusadas.push(`${arquivo}: select(${argumento}) pede ${fora.join(", ")}`);
      }
    }
    expect(recusadas).toEqual([]);
    // A varredura enxerga as leituras que existem hoje — se ela parar de ver, não protege.
    expect(leituras.length).toBeGreaterThanOrEqual(6);
  });

  it("a lista dinâmica do getEstoque só acrescenta a placa com a sessão de quem pediu", () => {
    expect(supabaseTs).toMatch(/const colunas = opts\.incluirPlaca \? `\$\{SELECT_PUBLICO_DO_ESTOQUE\},placa` : SELECT_PUBLICO_DO_ESTOQUE;/);
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
    const lidas = new Set([
      ...[...mapper.matchAll(/\b(?:dbItem|item)\.([a-z_]+)/g)].map((m) => m[1]),
      ...[...mapper.matchAll(/\b(?:dbItem|item)\[\s*["'`]([a-z_]+)["'`]\s*\]/g)].map((m) => m[1]),
    ]);
    const conhecidas = new Set<string>([...PUBLICAS, "fipe", "description"]);
    const fora = [...lidas].filter((c) => !conhecidas.has(c));
    expect(fora, "o mapper lê coluna fora da lista pública: " + fora.join(", ")).toEqual([]);
    expect(lidas.size).toBeGreaterThan(30);
    // Desestruturação, `in`, acesso por variável: nenhum nome de coluna interna
    // aparece no código do mapper, de jeito nenhum.
    for (const interna of COLUNAS_INTERNAS_DO_ESTOQUE) {
      expect(mapper, `o mapper cita ${interna}`).not.toMatch(new RegExp(`\\b${interna}\\b`));
    }
  });

  it("o bloqueio de publicação lê a linha crua — e só coluna pública", () => {
    // `publicavel(l)` roda sobre a linha do PostgREST, antes do mapper. Uma
    // regra nova que lesse `chassi` receberia undefined para TODO carro, e este
    // filtro não tem válvula: a vitrine esvaziaria sem erro nenhum.
    const codigo = lerCodigo("src/lib/coerenciaDoCadastro.ts");
    for (const funcao of ["bloqueiosDePublicacao", "publicavel"]) {
      const assinatura = codigo.match(new RegExp(`export function ${funcao}\\(veiculo: \\{([^}]*)\\}`));
      expect(assinatura, funcao).not.toBeNull();
      const campos = [...assinatura![1].matchAll(/([a-z_]+)\??:/g)].map((m) => m[1]);
      expect(campos.length, funcao).toBeGreaterThan(0);
      expect(campos.filter((c) => !PUBLICAS.has(c)), funcao).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Na prática: o módulo público contra um PostgREST com os privilégios do anon
// ---------------------------------------------------------------------------

/** Tudo o que chegou a `estoque_motors`, e o que o dublê recusou. */
const pedidos: string[] = [];
const recusados: string[] = [];

const LINHA = {
  id: 8009174,
  marca: "VOLKSWAGEN",
  modelo: "UP",
  versao: "DRIVE 1.0 FLEX",
  ano: 2019,
  preco: 54900,
  quilometragem: 52000,
  tipo: "Hatch",
  vendido: false,
  estado_cadastro: "publicado",
  last_seen_at: new Date().toISOString(),
  conteudo_atualizado_em: new Date().toISOString(),
  whatsapp_images: Array.from({ length: 8 }, (_, i) => `https://x/${i}.jpg`),
};

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

/**
 * O PostgREST como o `anon` o vê depois da migração: `select` ausente é `*`, e
 * `*` ou qualquer coluna fora da lista é recusado INTEIRO (42501) — sem
 * devolver as colunas que podia.
 */
function postgrestDoAnon(endereco: string, recusarTudo = false): Response {
  const url = new URL(endereco);
  if (!url.pathname.endsWith("/rest/v1/estoque_motors")) return resposta([]);
  const select = url.searchParams.get("select") ?? "*";
  pedidos.push(select);
  const colunas = select.split(",").map((c) => c.split(":").pop()!.trim());
  if (recusarTudo || colunas.some((c) => !PUBLICAS.has(c))) {
    recusados.push(select);
    return resposta({ code: "42501", details: null, hint: null, message: "permission denied for table estoque_motors" }, 401);
  }
  const id = url.searchParams.get("id");
  if (id !== null) return resposta(id === `eq.${LINHA.id}` ? [LINHA] : []);
  return resposta([LINHA]);
}

vi.mock("../src/lib/observabilidade", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  registrarFalha: vi.fn(async () => {}),
}));

/** `lib/supabase.ts` decide se há banco no IMPORT: env antes, módulo limpo. */
async function moduloPublico(recusarTudo = false) {
  vi.resetModules();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://dubledeteste.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-de-teste";
  pedidos.length = 0;
  recusados.length = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (entrada) =>
    postgrestDoAnon(entrada instanceof Request ? entrada.url : String(entrada), recusarTudo),
  );
  return import("../src/lib/supabase");
}

describe("as leituras públicas, rodando de verdade contra os privilégios do anon", () => {
  const envOriginal = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    chave: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    if (envOriginal.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = envOriginal.url;
    if (envOriginal.chave === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = envOriginal.chave;
  });

  it("vitrine, ficha, sinais do feed e os dois carimbos do sitemap: nenhuma ida recusada", async () => {
    const m = await moduloPublico();
    const estoque = await m.getEstoque();
    const ficha = await m.getVeiculoById(String(LINHA.id));
    await m.getSinaisDeEstoque(String(LINHA.id));
    await m.getCarimbosDeConteudo();
    await m.getUltimasPresencas();

    expect(recusados, "leitura pública pedindo coluna que o anon não lê").toEqual([]);
    expect(pedidos.length).toBeGreaterThanOrEqual(5);
    expect(estoque.map((v) => v.id)).toContain(String(LINHA.id));
    expect(ficha?.id).toBe(String(LINHA.id));
  });

  it("a ficha recusada pelo banco é falha avisada (500), não 404 calado", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const m = await moduloPublico(true);
    await expect(m.getVeiculoById(String(LINHA.id))).rejects.toBeInstanceOf(m.EstoqueIndisponivelError);
  });

  it("e o id que não existe continua sendo 404", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const m = await moduloPublico();
    await expect(m.getVeiculoById("1234567")).resolves.toBeNull();
  });
});
