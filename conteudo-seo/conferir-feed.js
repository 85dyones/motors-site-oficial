/**
 * Confere, só lendo, o que o feed XML publicaria agora.
 *
 * Reproduz a cadeia de `src/app/api/feed/xml/route.ts`:
 *   descricao_seo || descricao || generico
 * e o corte de 155 do `truncateString` que vira meta description na PDP.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const RAIZ = path.join(__dirname, "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; })
);

const JANELA_MS = 30 * 60 * 1000;
const MARCADORES = ["sem descrição informada", "sem descricao informada"];
const util = (s) => {
  const t = (s || "").trim();
  return !t || MARCADORES.includes(t.toLowerCase()) ? "" : t;
};

(async () => {
  const c = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const { rows } = await c.query(`
    SELECT id, marca, modelo, descricao, descricao_seo, vendido, last_seen_at, conteudo_atualizado_em
    FROM public.estoque_motors`);
  await c.end();

  const carimbos = rows.map((r) => (r.last_seen_at ? new Date(r.last_seen_at).getTime() : NaN)).filter((t) => !Number.isNaN(t));
  const corte = Math.max(...carimbos) - JANELA_MS;
  // ⚠️ Este recorte NÃO é o do feed vivo, e a diferença é maior do que parece.
  // Medido em 2026-09-06: este script listaria 43 anúncios; o feed publica 36.
  //
  // São três divergências, e só a terceira é deliberada:
  //   1. a janela de `last_seen_at` acima foi aposentada em 30/08 — quem manda
  //      hoje é `estado_cadastro = 'publicado'` (`lib/supabase.ts`);
  //   2. o feed exige 4 fotos para publicar (`publicavel`, em
  //      `lib/coerenciaDoCadastro.ts`), e aqui não se conta foto;
  //   3. desde 06/09 o vendido permanece alguns dias no feed como
  //      `out_of_stock` (`decidirNoFeed`, em `lib/publicacao.ts`), enquanto
  //      aqui ele sai na hora — e isso está certo: o que se confere aqui é o
  //      TEXTO do anúncio, e carro vendido não tem texto a revisar.
  //
  // Ou seja: use este script para ler texto, nunca para responder "o que está
  // no feed". Para isso, a fonte é a rota.
  const noFeed = rows.filter((r) => !r.last_seen_at || new Date(r.last_seen_at).getTime() >= corte)
    .filter((r) => !r.vendido);

  const generico = (r) => `Aproveite as melhores condições para comprar seu ${r.marca} ${r.modelo}. Veículo periciado e com garantia.`;
  const publicado = noFeed.map((r) => ({
    id: String(r.id),
    fonte: util(r.descricao_seo) ? "descricao_seo" : util(r.descricao) ? "descricao" : "generico",
    texto: util(r.descricao_seo) || util(r.descricao) || generico(r),
    carimbo: r.conteudo_atualizado_em,
  }));

  const porFonte = publicado.reduce((a, p) => ((a[p.fonte] = (a[p.fonte] || 0) + 1), a), {});
  const distintas = new Set(publicado.map((p) => p.texto)).size;
  const metas = new Set(publicado.map((p) => p.texto.slice(0, 155))).size;

  console.log(`anúncios no feed: ${publicado.length}`);
  console.log("fonte do texto:", porFonte);
  console.log(`textos distintos: ${distintas}/${publicado.length}`);
  console.log(`meta descriptions distintas (155 primeiros): ${metas}/${publicado.length}`);

  const recentes = publicado.filter((p) => p.carimbo && Date.now() - new Date(p.carimbo).getTime() < 60 * 60 * 1000).length;
  console.log(`carimbados na última hora (portais vão reprocessar): ${recentes}`);

  const sobrando = publicado.filter((p) => p.fonte !== "descricao_seo");
  if (sobrando.length) {
    console.log(`\nainda sem descricao_seo (${sobrando.length}):`);
    sobrando.forEach((p) => console.log(`  ${p.id} — via ${p.fonte}`));
  }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
