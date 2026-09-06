/**
 * Aplica UMA migração numa transação única contra o SUPABASE_DB_URL do
 * `.env.local` (a URI do session pooler — ver o runbook no README).
 *
 * Existe porque o CLI do Supabase não está instalado nesta máquina e a API
 * de gerenciamento (`api.supabase.com`) já falhou antes. O pooler tem IPv4 —
 * é o transporte que comprovadamente funciona aqui, o mesmo de
 * `conteudo-seo/aplicar-rascunhos.js`.
 *
 * ⚠️ `pg` NÃO é dependência do projeto. Esta linha dizia que ele "já está em
 * `node_modules`" e isso era falso em 2026-09-06: não está no `package.json`,
 * não vem no `npm ci`, e o `require` abaixo estoura com MODULE_NOT_FOUND.
 * Antes de rodar:
 *
 *   npm i --no-save pg
 *
 * `--no-save` de propósito: o site não usa `pg` em runtime (fala com o
 * Supabase por HTTP), e promovê-lo a dependência do build carregaria um
 * driver de banco para dentro da Vercel por causa de um script de manutenção.
 * Em worktree, `.env.local` também não vem junto — copie o da raiz.
 *
 *   node supabase/manutencao/aplicar-migracao.js <arquivo.sql>           # ensaio: BEGIN … ROLLBACK
 *   node supabase/manutencao/aplicar-migracao.js <arquivo.sql> --gravar  # BEGIN … COMMIT
 *
 * SEMPRE ensaiar antes de gravar. O ensaio roda a migração inteira contra a
 * produção e reverte — é o staging que o projeto não tem. Os RAISE NOTICE
 * das autoconferências são impressos: é por eles que a migração prova a si
 * mesma antes do commit.
 *
 * ⚠️ A migração precisa terminar com o rodapé de auto-registro no livro-razão
 * (`supabase_migrations.schema_migrations`) — ver o README. Este script NÃO
 * registra nada por fora: aplicar e registrar na MESMA transação é o que
 * mantém o livro-razão incapaz de mentir.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..", "..");
const { Client } = require(path.join(RAIZ, "node_modules", "pg"));

const arquivo = process.argv[2];
const GRAVAR = process.argv.includes("--gravar");
if (!arquivo) {
  console.error("Uso: node supabase/manutencao/aplicar-migracao.js <arquivo.sql> [--gravar]");
  process.exit(1);
}

const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; })
);

if (!env.SUPABASE_DB_URL) {
  console.error("SUPABASE_DB_URL ausente no .env.local — ver o runbook do README.");
  process.exit(1);
}

(async () => {
  const sql = fs.readFileSync(arquivo, "utf8");
  const c = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  c.on("notice", (n) => console.log("  NOTICE:", n.message));
  await c.connect();
  try {
    await c.query("begin");
    await c.query(sql);
    await c.query(GRAVAR ? "commit" : "rollback");
    console.log(`${GRAVAR ? "GRAVADA" : "Ensaio OK (revertido)"}: ${path.basename(arquivo)}`);
  } catch (e) {
    await c.query("rollback").catch(() => {});
    console.error(`FALHOU (revertida): ${path.basename(arquivo)}`);
    console.error("  " + e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
