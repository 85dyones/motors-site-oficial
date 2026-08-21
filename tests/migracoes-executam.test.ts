import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * As migrações rodam de verdade — e o aceite delas é cobrado (AUDITORIA §5.7).
 *
 * Toda migração séria deste projeto carrega **autoconferência**: um bloco
 * `do $$` que levanta exceção se a promessa do arquivo não valer contra o
 * banco real. O problema é que ninguém nunca as executava antes de empurrar —
 * o aceite só era conhecido quando o `db push` rodava em PRODUÇÃO. Um erro de
 * sintaxe no meio de um `do $$`, ou uma promessa que o SQL não cumpre, só
 * aparecia lá.
 *
 * A auditoria registrou isso como bloqueio ("testes de RLS exigem instância
 * Supabase de teste... Docker não está instalado nesta máquina") e ficou
 * parado. Um Postgres local basta: o que faltava era escrever o pedaço de
 * Supabase que as migrações pressupõem — `auth.users`, `auth.uid()`, os
 * papéis do PostgREST, os default privileges do schema `public`. É o
 * `supabase/testes/andaime.sql`.
 *
 * O que este arquivo prova, a cada `npm test` numa máquina com Postgres:
 *
 *  1. a cadeia aplica limpa, na ordem, num banco do zero;
 *  2. **cada autoconferência levanta o próprio "Aceite verificado"** — não
 *     basta não explodir, o aceite tem que ter rodado;
 *  3. o estado final é o prometido: quem é staff, quem abre o financeiro,
 *     quem apaga.
 *
 * **Sem Postgres alcançável, os testes são PULADOS, não falham.** A máquina de
 * quem só mexe em front-end não precisa de banco, e um teste vermelho por
 * ausência de infraestrutura é ruído que ensina a ignorar vermelho.
 */

const RAIZ = join(__dirname, "..");
const ANDAIME = join(RAIZ, "supabase", "testes", "andaime.sql");
const DIR_MIGRACOES = join(RAIZ, "supabase", "migrations");
const BANCO = "motors_teste";

/**
 * A cadeia coberta hoje: papéis e financeiro. É uma lista EXPLÍCITA porque o
 * andaime é um recorte — varrer a pasta inteira faria o teste falhar em
 * migração que toca tabela que o andaime não tem, e o vermelho seria sobre o
 * andaime, não sobre a migração.
 *
 * Acrescentar migração aqui é o gesto que a põe sob teste. Se ela precisar de
 * uma tabela nova, a tabela entra no andaime junto.
 */
const CADEIA = [
  "20260819150000_papeis_multiplos.sql",
  "20260821120000_financeiro_operacional.sql",
  "20260821150000_alcada_de_aprovacao.sql",
  "20260821180000_papeis_gestor_e_investidor.sql",
  "20260821210000_exclusao_financeira_so_admin.sql",
  "20260822120000_conciliacao_bancaria.sql",
];

/**
 * Como falar com o Postgres desta máquina.
 *
 * `PSQL_TESTE` permite apontar para outro caminho ou outra forma de conexão
 * (`PSQL_TESTE="psql -h localhost -U postgres"`, por exemplo). Sem ela, tenta
 * o `psql` do usuário atual e, se não der, o do usuário `postgres` — que é
 * como um Postgres recém-instalado em Debian/Ubuntu se apresenta.
 */
function descobrirPsql(): ((sql: string, banco?: string) => string) | null {
  const tentativas: string[][] = [];
  if (process.env.PSQL_TESTE) {
    tentativas.push(process.env.PSQL_TESTE.split(" "));
  }
  tentativas.push(["psql"]);
  tentativas.push(["su", "postgres", "-c", "PSQL"]);

  for (const t of tentativas) {
    const rodar = montar(t);
    try {
      rodar("select 1", "postgres");
      return rodar;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Roda psql e devolve **stdout + stderr juntos**.
 *
 * O `RAISE NOTICE` das autoconferências sai em stderr — capturar só stdout
 * faria o teste do aceite procurar a frase no lugar errado e acusar todas as
 * migrações de silenciosas. (Foi o que aconteceu na primeira versão deste
 * arquivo: o teste pegou o próprio bug antes de pegar o de alguém.)
 */
function rodar(prefixo: string[], modo: "-c" | "-f", valor: string, banco: string): string {
  const args = [...prefixo];
  const i = args.indexOf("PSQL");
  const r =
    i >= 0
      ? // Forma `su postgres -c "psql ..."`: o comando inteiro é um argumento só.
        (() => {
          const copia = [...args];
          copia[i] = `psql -v ON_ERROR_STOP=1 -X -q -d ${banco} ${modo} ${aspas(valor)}`;
          return spawnSync(copia[0], copia.slice(1), { encoding: "utf-8" });
        })()
      : spawnSync(
          args[0],
          [...args.slice(1), "-v", "ON_ERROR_STOP=1", "-X", "-q", "-d", banco, modo, valor],
          { encoding: "utf-8" },
        );

  const saida = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.status !== 0) throw new Error(`psql falhou (${r.status}): ${saida}`);
  return saida;
}

function montar(prefixo: string[]) {
  return (sql: string, banco = BANCO): string => rodar(prefixo, "-c", sql, banco);
}

/** Aspas para o SQL sobreviver à camada de shell do `su -c`. */
function aspas(valor: string): string {
  return `'${valor.replace(/'/g, "'\\''")}'`;
}

function arquivo(prefixo: string[], caminho: string, banco = BANCO): string {
  return rodar(prefixo, "-f", caminho, banco);
}

const psql = descobrirPsql();
const temBanco = psql !== null;

/** O prefixo que funcionou, para os `-f` reusarem a mesma forma de conexão. */
const PREFIXO = process.env.PSQL_TESTE
  ? process.env.PSQL_TESTE.split(" ")
  : (() => {
      const r = spawnSync("psql", ["-X", "-q", "-d", "postgres", "-c", "select 1"], {
        encoding: "utf-8",
      });
      return r.status === 0 ? ["psql"] : ["su", "postgres", "-c", "PSQL"];
    })();

describe.skipIf(!temBanco)("as migrações aplicam num Postgres limpo", () => {
  /** A saída de cada migração, para as asserções lerem os avisos. */
  const saidas = new Map<string, string>();

  beforeAll(() => {
    // Banco descartável: `dropdb` antes garante que o teste parte do zero
    // mesmo depois de uma execução interrompida no meio.
    const admin = montar(PREFIXO);
    admin(`drop database if exists ${BANCO}`, "postgres");
    admin(`create database ${BANCO}`, "postgres");
    arquivo(PREFIXO, ANDAIME);

    for (const m of CADEIA) {
      saidas.set(m, arquivo(PREFIXO, join(DIR_MIGRACOES, m)));
    }
  }, 120_000);

  it("o andaime existe e a cadeia declarada aponta para arquivos reais", () => {
    expect(existsSync(ANDAIME)).toBe(true);
    for (const m of CADEIA) {
      expect(existsSync(join(DIR_MIGRACOES, m)), `migração sumiu: ${m}`).toBe(true);
    }
  });

  it("toda migração da cadeia levanta o próprio aceite", () => {
    // A asserção que dá sentido ao arquivo: não basta a migração não explodir.
    // Um `do $$` com o bloco de aceite comentado por engano aplicaria em
    // silêncio — e é justamente o aceite que prova a promessa.
    for (const m of CADEIA) {
      expect(saidas.get(m), `sem "Aceite verificado" em ${m}`).toContain("Aceite verificado");
    }
  });

  it("nenhuma delas deixou ERROR no caminho", () => {
    for (const m of CADEIA) {
      expect(saidas.get(m), `ERROR em ${m}`).not.toMatch(/^psql.*ERROR:/m);
    }
  });
});

describe.skipIf(!temBanco)("o estado final é o prometido", () => {
  /** `t`/`f` do psql viram boolean, com o resto do ruído fora. */
  const ehVerdade = (sql: string): boolean =>
    psql!(`select ${sql}`).replace(/[\s|-]/g, "").includes("t");

  it("o vocabulário de papéis tem os sete, e recusa inventado", () => {
    expect(
      ehVerdade(
        "public.papeis_validos(array['admin','gestor','comercial','financeiro','marketing','cliente','investidor'])",
      ),
    ).toBe(true);
    expect(ehVerdade("not public.papeis_validos(array['chefe'])")).toBe(true);
  });

  it("gestor é staff e abre o financeiro; investidor não é nem uma coisa nem outra", () => {
    expect(ehVerdade("(select prosrc like '%gestor%' from pg_proc where proname='is_staff')")).toBe(true);
    expect(
      ehVerdade("(select prosrc not like '%investidor%' from pg_proc where proname='is_staff')"),
    ).toBe(true);
    expect(
      ehVerdade("(select prosrc like '%gestor%' from pg_proc where proname='has_finance_access')"),
    ).toBe(true);
  });

  it("is_admin lê `papeis`, não `role` — o terceiro gêmeo do bug multi-papel", () => {
    expect(ehVerdade("(select prosrc like '%papeis%' from pg_proc where proname='is_admin')")).toBe(true);
    expect(ehVerdade("(select prosrc not like '%role =%' from pg_proc where proname='is_admin')")).toBe(true);
  });

  it("as quatro tabelas de lançamento só deixam o admin apagar", () => {
    expect(
      ehVerdade(
        `(select count(*)=4 from pg_policies where schemaname='public' and cmd='DELETE'
            and tablename in ('contas','movimentacoes','compras_produtos','movimentacoes_investidor')
            and qual like '%is_admin%')`,
      ),
    ).toBe(true);
  });

  it("a leitura própria do investidor sobreviveu à varredura de policies", () => {
    // `20260821210000` derruba TODA policy das tabelas alvo para recriá-las.
    // Sem recriar esta, a área do investidor ficaria vazia sem erro nenhum —
    // exatamente o tipo de silêncio que este projeto já pagou caro.
    expect(
      ehVerdade(
        `exists (select 1 from pg_policies where tablename='movimentacoes_investidor'
                   and policyname='Investidor le o proprio extrato')`,
      ),
    ).toBe(true);
  });

  it("cada migração da cadeia se registrou no livro-razão (D6)", () => {
    const versoes = CADEIA.map((m) => `'${m.slice(0, 14)}'`).join(",");
    expect(
      ehVerdade(
        `(select count(*)=${CADEIA.length} from supabase_migrations.schema_migrations where version in (${versoes}))`,
      ),
    ).toBe(true);
  });
});

// Sem banco, o arquivo não fica mudo: um teste que passa dizendo por que os
// outros não rodaram. Um `skip` silencioso vira "a suíte está verde" quando na
// verdade a parte que toca SQL nunca correu.
describe.skipIf(temBanco)("sem Postgres alcançável", () => {
  it("os testes de migração ficam de fora — instale Postgres ou aponte PSQL_TESTE", () => {
    expect(temBanco).toBe(false);
  });
});
