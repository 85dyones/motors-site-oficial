/**
 * Levanta o estoque visível e o estado do texto de cada veículo.
 *
 * Só lê. Gera `conteudo-seo/estoque.json`, o insumo do trabalho de conteúdo:
 * cada carro com o que já se sabe dele e o diagnóstico do texto atual.
 *
 * Uso:
 *   NODE_PATH=<repo>/node_modules node conteudo-seo/levantar-estoque.js
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

/** Mesma janela de `apenasDoUltimoSync` em src/lib/supabase.ts. */
const JANELA_MS = 30 * 60 * 1000;

/** Trecho do blurb institucional que o RevendaMais grava como `descricao`. */
const BLURB = "seja bem vindo a loja virtual";

(async () => {
  const c = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const { rows } = await c.query(`
    SELECT id, marca, modelo, versao, ano, ano_fabricacao, quilometragem,
           cambio, combustivel, cor, preco, preco_original, preco_promocional,
           tipo, opcionais, laudo_pericia, pericia, descricao, descricao_seo,
           vendido, last_seen_at,
           coalesce(array_length(
             (SELECT array_agg(x) FROM jsonb_array_elements_text(
                coalesce(whatsapp_images, '[]'::jsonb)) x), 1), 0) AS fotos
    FROM public.estoque_motors
    ORDER BY preco DESC NULLS LAST`);

  await c.end();

  // Recorte do último ciclo de sync — o mesmo que a vitrine mostra.
  const carimbos = rows.map((r) => (r.last_seen_at ? new Date(r.last_seen_at).getTime() : NaN))
    .filter((t) => !Number.isNaN(t));
  const corte = Math.max(...carimbos) - JANELA_MS;
  const noFeed = rows.filter((r) => !r.last_seen_at || new Date(r.last_seen_at).getTime() >= corte);

  const diagnosticar = (r) => {
    if (r.descricao_seo && r.descricao_seo.trim()) return "pronto";
    const d = (r.descricao || "").toLowerCase();
    if (!d.trim() || d.includes("sem descrição informada") || d.includes("sem descricao informada")) {
      return "sem-texto";
    }
    if (d.includes(BLURB)) return "blurb-institucional";
    return "texto-proprio";
  };

  const saida = noFeed.map((r) => ({
    id: String(r.id),
    veiculo: [r.marca, r.modelo, r.versao].filter(Boolean).join(" ").trim(),
    marca: r.marca, modelo: r.modelo, versao: r.versao,
    ano: r.ano, ano_fabricacao: r.ano_fabricacao,
    km: r.quilometragem, cambio: r.cambio, combustivel: r.combustivel, cor: r.cor,
    tipo: r.tipo,
    preco: Number(r.preco_promocional) > 0 ? Number(r.preco_promocional) : Number(r.preco_original || r.preco),
    fotos: r.fotos,
    vendido: r.vendido,
    opcionais: r.opcionais || "",
    laudo_pericia: r.laudo_pericia || "",
    pericia: r.pericia || "",
    descricao_atual: r.descricao || "",
    descricao_seo: r.descricao_seo || "",
    estado_do_texto: diagnosticar(r),
  }));

  const porEstado = saida.reduce((acc, v) => {
    acc[v.estado_do_texto] = (acc[v.estado_do_texto] || 0) + 1;
    return acc;
  }, {});

  const destino = path.join(__dirname, "estoque.json");
  fs.writeFileSync(destino, JSON.stringify({
    gerado_em: new Date().toISOString(),
    total_na_tabela: rows.length,
    no_feed: saida.length,
    por_estado_do_texto: porEstado,
    veiculos: saida,
  }, null, 2), "utf8");

  console.log(`tabela: ${rows.length} linhas | no feed: ${saida.length}`);
  console.log("estado do texto:", porEstado);
  console.log(`\ngravado em ${destino}`);
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
