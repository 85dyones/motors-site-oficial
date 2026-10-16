/**
 * Gera a versão `card` (640 px, WebP) das fotos que JÁ estão no bucket
 * `veiculos` — estoque e repasse — a partir da `web` gravada no envio.
 *
 *   node supabase/manutencao/gerar-card-das-fotos.js             # ENSAIO (lista o que faria)
 *   node supabase/manutencao/gerar-card-das-fotos.js --gravar    # gera e sobe
 *
 *   --pasta 8171616          só esta pasta (um veículo; `repasse/<id>` para um repasse)
 *   --limite 20              só as N primeiras fotos sem card
 *
 * ---------------------------------------------------------------------------
 * Por que existe
 * ---------------------------------------------------------------------------
 * Desde 16/10/2026 o envio pelo painel grava três versões de cada foto: `zap`
 * (1600, JPEG), `web` (1280, WebP) e `card` (640, WebP). O card do catálogo
 * pede a `card` e cai na `web` quando ela não existe (`FotoPropriaDoCard`).
 * Cair funciona, mas custa um 404 por card e os ~90 a 200 KB da `web` — e a
 * importação do repasse continua gravando só o par. Este script fecha a
 * conta para o que já está no bucket, e pode ser rodado de novo a qualquer
 * hora: só gera o que falta.
 *
 * O tamanho, a qualidade e o mime saem de `imageProcessor.ts`, como no
 * `migrar-fotos-do-carro57.js`: nenhum número de tratamento mora aqui.
 *
 * Precisa de `.env.local` com NEXT_PUBLIC_SUPABASE_URL e
 * SUPABASE_SERVICE_ROLE_KEY — a chave de serviço, porque o bucket é fechado
 * na escrita (política `veiculos_staff_*`).
 */

/* eslint-disable @typescript-eslint/no-require-imports -- script de manutenção em CommonJS, como os vizinhos desta pasta */
const fs = require("fs");
const path = require("path");
const { registerHooks } = require("node:module");

const RAIZ = path.join(__dirname, "..", "..");

// `require` de arquivo .ts sem extensão (o mesmo gancho do script de migração).
registerHooks({
  resolve(especificador, contexto, proximo) {
    try {
      return proximo(especificador, contexto);
    } catch (e) {
      if (especificador.startsWith(".") && !/\.[a-z]+$/i.test(especificador)) {
        return proximo(`${especificador}.ts`, contexto);
      }
      throw e;
    }
  },
});

const sharp = require(path.join(RAIZ, "node_modules", "sharp"));
const { createClient } = require(path.join(RAIZ, "node_modules", "@supabase", "supabase-js"));
const { BUCKET_DE_FOTOS, EXTENSAO_DA_VARIANTE } = require(path.join(RAIZ, "src", "lib", "fotosDoVeiculo.ts"));
const { LADO_DA_VARIANTE, QUALIDADE_DA_VARIANTE, MIME_DA_VARIANTE } = require(
  path.join(RAIZ, "src", "lib", "imageProcessor.ts"),
);

const argv = process.argv.slice(2);
const GRAVAR = argv.includes("--gravar");
function opcao(nome, padrao) {
  const i = argv.indexOf(nome);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : padrao;
}
const SO_A_PASTA = String(opcao("--pasta", "")).trim();
const LIMITE = Number(opcao("--limite", "0")) || 0;

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
    }),
);
const URL_SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const CHAVE_DE_SERVICO = env.SUPABASE_SERVICE_ROLE_KEY;
for (const [nome, valor] of [
  ["NEXT_PUBLIC_SUPABASE_URL", URL_SUPABASE],
  ["SUPABASE_SERVICE_ROLE_KEY", CHAVE_DE_SERVICO],
]) {
  if (!valor) {
    console.error(`Falta ${nome} no .env.local.`);
    process.exit(1);
  }
}

const SUFIXO_WEB = `-web.${EXTENSAO_DA_VARIANTE.web}`;
const SUFIXO_CARD = `-card.${EXTENSAO_DA_VARIANTE.card}`;

/** Lista o bucket inteiro, pasta por pasta (o Storage não lista recursivo). */
async function listarArquivos(balde, prefixo) {
  const arquivos = [];
  const { data, error } = await balde.list(prefixo, { limit: 1000 });
  if (error) throw new Error(`ao listar "${prefixo || "/"}": ${error.message}`);
  for (const item of data || []) {
    const caminho = prefixo ? `${prefixo}/${item.name}` : item.name;
    // Pasta: o Storage devolve sem `id` e sem `metadata`.
    if (!item.id && !item.metadata) {
      arquivos.push(...(await listarArquivos(balde, caminho)));
    } else {
      arquivos.push(caminho);
    }
  }
  return arquivos;
}

async function main() {
  const supabase = createClient(URL_SUPABASE, CHAVE_DE_SERVICO, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const balde = supabase.storage.from(BUCKET_DE_FOTOS);

  console.log(`${GRAVAR ? "GRAVANDO" : "ENSAIO"} — bucket "${BUCKET_DE_FOTOS}"${SO_A_PASTA ? `, pasta "${SO_A_PASTA}"` : ""}`);
  const todos = await listarArquivos(balde, SO_A_PASTA);
  const existentes = new Set(todos);
  let faltam = todos
    .filter((c) => c.endsWith(SUFIXO_WEB))
    .filter((c) => !existentes.has(c.slice(0, -SUFIXO_WEB.length) + SUFIXO_CARD));
  const jaTem = todos.filter((c) => c.endsWith(SUFIXO_WEB)).length - faltam.length;
  if (LIMITE > 0) faltam = faltam.slice(0, LIMITE);
  console.log(`${todos.length} arquivos; ${jaTem} fotos já com card; ${faltam.length} a gerar.`);

  let geradas = 0;
  let falhas = 0;
  for (const caminhoWeb of faltam) {
    const caminhoCard = caminhoWeb.slice(0, -SUFIXO_WEB.length) + SUFIXO_CARD;
    if (!GRAVAR) {
      console.log(`- ${caminhoCard}`);
      continue;
    }
    try {
      const { data: original, error: erroBaixa } = await balde.download(caminhoWeb);
      if (erroBaixa) throw new Error(erroBaixa.message);
      const bytes = Buffer.from(await original.arrayBuffer());
      const lado = LADO_DA_VARIANTE.card;
      const card = await sharp(bytes, { failOn: "none" })
        .rotate()
        .resize({ width: lado, height: lado, fit: "inside", withoutEnlargement: true })
        .webp({ quality: Math.round(QUALIDADE_DA_VARIANTE.card * 100) })
        .toBuffer();
      const { error: erroSobe } = await balde.upload(caminhoCard, card, {
        contentType: MIME_DA_VARIANTE.card,
        upsert: false,
        cacheControl: "31536000",
      });
      if (erroSobe) throw new Error(erroSobe.message);
      geradas += 1;
      console.log(`✓ ${caminhoCard} (${Math.round(card.byteLength / 1024)} KB)`);
    } catch (e) {
      falhas += 1;
      console.log(`✗ ${caminhoCard}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(GRAVAR ? `Fim: ${geradas} geradas, ${falhas} falhas.` : `Fim do ensaio: ${faltam.length} a gerar com --gravar.`);
  if (falhas > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
