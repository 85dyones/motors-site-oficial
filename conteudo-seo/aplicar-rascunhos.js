/**
 * Grava os rascunhos de `rascunhos.json` na coluna `descricao_seo`.
 *
 * Os textos ficam VISÍVEIS assim que gravados — vão para o feed dos portais e
 * para a meta description. A aprovação de marketing/admin acontece depois, no
 * painel (aba "Texto e SEO"), que é onde dá para editar. Decisão do dono em
 * 2026-08-17: sobe o rascunho, aprova em cima.
 *
 * Rodar sem `--gravar` faz a conferência e não escreve nada.
 *
 *   node conteudo-seo/aplicar-rascunhos.js            # confere
 *   node conteudo-seo/aplicar-rascunhos.js --gravar   # grava
 *   node conteudo-seo/aplicar-rascunhos.js --reverter # limpa o que foi gravado
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const RAIZ = path.join(__dirname, "..");
const GRAVAR = process.argv.includes("--gravar");
const REVERTER = process.argv.includes("--reverter");

/** O `truncateString` da PDP corta aqui. A primeira frase tem de caber. */
const LIMITE_META = 155;

const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; })
);

const { textos } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "rascunhos.json"), "utf8")
);

// ---- conferência que não precisa de banco ----
let problemas = 0;
const vistos = new Map();

for (const [id, texto] of Object.entries(textos)) {
  const t = texto.trim();
  const meta = t.slice(0, LIMITE_META);

  // A meta description é cortada no caractere 155, sem dó. Se a primeira frase
  // não terminar antes disso, o Google mostra uma frase pela metade.
  const fimDaFrase = meta.lastIndexOf(".");
  if (fimDaFrase < 60) {
    console.log(`  ⚠ ${id}: primeira frase não fecha dentro de ${LIMITE_META} caracteres`);
    problemas++;
  }

  // O defeito que originou este trabalho foi 41 anúncios com a mesma frase.
  // Repetir a abertura entre dois carros o reintroduziria em escala menor.
  const abertura = t.slice(0, 45).toLowerCase();
  if (vistos.has(abertura)) {
    console.log(`  ⚠ ${id}: abre igual ao ${vistos.get(abertura)}`);
    problemas++;
  }
  vistos.set(abertura, id);

  if (t.length < 120) {
    console.log(`  ⚠ ${id}: texto curto demais (${t.length})`);
    problemas++;
  }
}

const comprimentos = Object.values(textos).map((t) => t.trim().length);
console.log(`${Object.keys(textos).length} rascunhos | ${problemas} avisos`);
console.log(`tamanho: ${Math.min(...comprimentos)}–${Math.max(...comprimentos)} caracteres`);

if (!GRAVAR && !REVERTER) {
  console.log("\n(conferência apenas — use --gravar para escrever)");
  process.exit(problemas > 0 ? 1 : 0);
}

if (problemas > 0) {
  console.error("\nHá avisos. Corrija antes de gravar.");
  process.exit(1);
}

(async () => {
  const c = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const ids = Object.keys(textos);
  let gravados = 0;

  for (const id of ids) {
    const valor = REVERTER ? null : textos[id].trim();
    const r = await c.query(
      `UPDATE public.estoque_motors SET descricao_seo = $1 WHERE id = $2`,
      [valor, Number(id)]
    );
    if (r.rowCount === 1) gravados++;
    else console.log(`  ⚠ ${id}: nenhuma linha atingida`);
  }

  console.log(`\n${REVERTER ? "limpos" : "gravados"}: ${gravados}/${ids.length}`);

  // Prova pelo efeito: o trigger tinha de mover o carimbo de cada um deles.
  const { rows } = await c.query(`
    SELECT count(*) FILTER (WHERE descricao_seo IS NOT NULL AND descricao_seo <> '')::int AS com_texto,
           count(*) FILTER (WHERE conteudo_atualizado_em > now() - interval '5 minutes')::int AS carimbados
    FROM public.estoque_motors WHERE id = ANY($1::bigint[])`, [ids.map(Number)]);
  console.log(`com descricao_seo: ${rows[0].com_texto} | carimbados agora: ${rows[0].carimbados}`);

  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
