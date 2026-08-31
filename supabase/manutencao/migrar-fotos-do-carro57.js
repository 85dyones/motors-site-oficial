/**
 * Traz as fotos dos veículos ATIVOS do carro57 para o Storage do Supabase e
 * reescreve as colunas do anúncio para o endereço novo.
 *
 *   node supabase/manutencao/migrar-fotos-do-carro57.js            # ENSAIO (não grava nada)
 *   node supabase/manutencao/migrar-fotos-do-carro57.js --gravar   # sobe e reescreve as colunas
 *
 *   --veiculo 7416830[,8100652]  só estes ids (para provar um antes de soltar o lote)
 *   --limite 3                   só os N primeiros veículos do alvo
 *   --intervalo 250              pausa entre downloads, em ms (padrão 250)
 *
 * ---------------------------------------------------------------------------
 * A decisão que este script executa
 * ---------------------------------------------------------------------------
 * Do dono, em 2026-08-30: *"trazendo todas as fotos para o storage do supabase,
 * mas apenas dos carros ativos, o que estiver marcado como indisponível,
 * vendido ou fora de estoque, pode descartar."*
 *
 * "Ativo" aqui tem endereço no banco desde a F0-q: `estado_cadastro =
 * 'publicado' and not vendido`. Os vendidos (que seguem publicados por causa da
 * carência de SEO de `publicacao.ts`) e os arquivados ficam apontando para o
 * carro57 — e é isso que se quer: quando aquele link morrer, essas fichas já
 * terão saído do ar pela régua de carência.
 *
 * ---------------------------------------------------------------------------
 * Por que reescrever a coluna, e não só copiar o arquivo
 * ---------------------------------------------------------------------------
 * A foto no bucket sem a coluna apontando para ela não serve a ninguém: o site
 * continuaria pedindo ao carro57. E a coluna é o anúncio — `whatsapp_images[0]`
 * é o `og:image` e o `<g:image_link>` do feed. Por isso as três colunas
 * (`whatsapp_images`, `web_full_images`, `url_imagem`) são gravadas juntas, na
 * mesma instrução, pela mão de `colunasDasFotos()`.
 *
 * ---------------------------------------------------------------------------
 * O que este script REUSA — e por que não reimplementa nada
 * ---------------------------------------------------------------------------
 * Todo o miolo vem de `src/lib`, não daqui:
 *
 *   • `fotosDoVeiculo()`   — parear as duas colunas por índice (e descartar
 *                            entrada vazia, que o feed às vezes deixa);
 *   • `processarFotoDeVeiculo()` — as duas versões, com os tamanhos (1280 web /
 *                            1600 zap), as qualidades (0,82 / 0,84), o fundo
 *                            branco, o "nunca amplia" e a conferência de mime;
 *   • `caminhoDaFoto()`    — o desenho `{estoque_id}/{lote}-{variante}.{ext}`
 *                            fixado pela migração F0-p;
 *   • `colunasDasFotos()`  — a ordem e a capa (a primeira, e é o JPEG);
 *   • `ehFotoPropria()`    — o que já é nosso e não se migra de novo.
 *
 * Nenhum número de tratamento mora neste arquivo. Se o lado maior mudar em
 * `imageProcessor.ts`, muda aqui junto, sem ninguém lembrar de nada.
 *
 * `processarFotoDeVeiculo` é código de NAVEGADOR (canvas). Para rodá-lo no
 * node, `instalarCanvasDeMentira()` põe de pé um `document.createElement
 * ("canvas")` e um `createImageBitmap` que fazem, com o sharp, exatamente as
 * operações que a função pede — e nada além. A alternativa era copiar os
 * números para cá, que é como duas versões da mesma foto começam a divergir.
 *
 * ---------------------------------------------------------------------------
 * Uma foto só é baixada uma vez (idempotência)
 * ---------------------------------------------------------------------------
 * O `lote` NÃO é o `novoLote()` aleatório do painel: é derivado da URL de
 * origem (`c57-<sha1 da url>`). Duas consequências, as duas necessárias:
 *
 *   1. rodar de novo calcula o MESMO caminho, vê o arquivo no bucket e nem
 *      baixa do carro57 — nada duplica e nada rebaixa;
 *   2. o nome do arquivo diz de onde ele veio. `c57-…` é foto importada;
 *      `<base36>-<aleatório>` é foto que alguém enviou pelo painel.
 *
 * ---------------------------------------------------------------------------
 * Ou o veículo inteiro entra, ou ele fica como está
 * ---------------------------------------------------------------------------
 * Falha em UMA foto aborta o veículo INTEIRO: nada é gravado nas colunas dele e
 * o relatório o nomeia. Meia galeria migrada seria pior que nenhuma — a ordem
 * quebraria e a capa poderia trocar. Os arquivos que já tinham subido ficam no
 * bucket como órfãos (ninguém os vê) e a próxima rodada os reaproveita, porque
 * o caminho é o mesmo.
 *
 * A gravação é UMA instrução por veículo. É ela que é atômica, não este script.
 *
 * ---------------------------------------------------------------------------
 * Como reverter
 * ---------------------------------------------------------------------------
 * Antes de qualquer gravação, o script dumpa as três colunas de TODOS os
 * veículos do alvo em `supabase/manutencao/reversao/fotos-carro57-<carimbo>.sql`
 * e imprime o caminho. Reverter é aplicar aquele arquivo:
 *
 *   node supabase/manutencao/aplicar-migracao.js <arquivo>            # ensaio
 *   node supabase/manutencao/aplicar-migracao.js <arquivo> --gravar
 *
 * (Ele é UPDATE de dado, não schema: não leva rodapé de livro-razão.) As fotos
 * no bucket podem ficar — a reversão só desfaz o endereço das colunas.
 *
 * ---------------------------------------------------------------------------
 * O que este script NÃO faz
 * ---------------------------------------------------------------------------
 * • não toca em veículo vendido, arquivado ou rascunho;
 * • não apaga nada, nem no carro57 nem no bucket;
 * • não usa a chave de serviço no banco. O UPDATE vai pela conexão `pg` do
 *   `SUPABASE_DB_URL`, como `aplicar-migracao.js` — e isso é requisito, não
 *   gosto: o gatilho `estoque_motors_trava_do_sync` DEVOLVE INTACTA toda escrita
 *   feita como `service_role`. Com a chave de serviço, este script rodaria
 *   inteiro, diria "gravado" e não teria mudado uma linha. A chave de serviço
 *   fica só onde ela é o caminho: o upload no Storage.
 *
 * Efeito colateral esperado e legítimo: o gatilho `marcar_conteudo_atualizado`
 * enxerga a troca das colunas de imagem e sobe `conteudo_atualizado_em` — ou
 * seja, o `lastmod` do sitemap dos 38 muda. É verdade: a foto do anúncio mudou.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { registerHooks } = require("node:module");

const RAIZ = path.join(__dirname, "..", "..");

// ---------------------------------------------------------------------------
// Carregar os módulos de `src/lib` num script de node
// ---------------------------------------------------------------------------
// O node 24 lê TypeScript sozinho (type stripping) e já sabe `require()` de
// módulo ESM. O que ele NÃO faz é resolver import sem extensão — e
// `imageProcessor.ts` importa `"./fotosDoVeiculo"`, como todo o repositório.
// O gancho abaixo tenta a resolução normal e, só quando ela falha, repete com
// `.ts`. É o mínimo para reusar o lib em vez de copiá-lo.
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
const { Client } = require(path.join(RAIZ, "node_modules", "pg"));
const { createClient } = require(path.join(RAIZ, "node_modules", "@supabase", "supabase-js"));

const {
  BUCKET_DE_FOTOS,
  caminhoDaFoto,
  colunasDasFotos,
  ehFotoPropria,
  fotosDoVeiculo,
} = require(path.join(RAIZ, "src", "lib", "fotosDoVeiculo.ts"));

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const GRAVAR = argv.includes("--gravar");

function opcao(nome, padrao) {
  const i = argv.indexOf(nome);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : padrao;
}

const SO_ESTES = String(opcao("--veiculo", ""))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number);
const LIMITE = Number(opcao("--limite", "0")) || 0;
const INTERVALO_MS = Number(opcao("--intervalo", "250"));
const TIMEOUT_MS = 30_000;
const TENTATIVAS = 3;

// ---------------------------------------------------------------------------
// Ambiente
// ---------------------------------------------------------------------------
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
  ["SUPABASE_DB_URL", env.SUPABASE_DB_URL],
  ["NEXT_PUBLIC_SUPABASE_URL", URL_SUPABASE],
  ["SUPABASE_SERVICE_ROLE_KEY", CHAVE_DE_SERVICO],
]) {
  if (!valor) {
    console.error(`${nome} ausente no .env.local — ver o runbook do supabase/README.md.`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// O canvas de mentira — o mínimo para `processarFotoDeVeiculo` rodar no node
// ---------------------------------------------------------------------------
// Não é um canvas: é um gravador das três chamadas que aquela função faz
// (`fillRect`, `drawImage`, `toBlob`), que no fim traduz para uma passada de
// sharp. Deliberadamente burro — qualquer coisa além disso estoura, para que um
// dia em que `imageProcessor.ts` passe a desenhar outra coisa este script pare
// em vez de produzir foto errada em silêncio.
//
// `createImageBitmap(arquivo, { imageOrientation: "from-image" })` vira
// `sharp().rotate()` sem argumento, que é exatamente "gire conforme o EXIF" —
// o que impede o carro de chegar deitado na vitrine.
function instalarCanvasDeMentira() {
  globalThis.createImageBitmap = async (arquivo) => {
    const bytes = Buffer.from(await arquivo.arrayBuffer());
    const { data, info } = await sharp(bytes, { failOn: "none" })
      .rotate()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      __cru: data,
      __canais: info.channels,
      width: info.width,
      height: info.height,
      close() {},
    };
  };

  globalThis.document = {
    createElement(tag) {
      if (tag !== "canvas") {
        throw new Error(`O canvas de mentira só faz <canvas>; pediram <${tag}>.`);
      }
      const canvas = {
        width: 0,
        height: 0,
        getContext(tipo) {
          if (tipo !== "2d") return null;
          return {
            fillStyle: "",
            fillRect() {
              canvas.__fundo = this.fillStyle;
            },
            drawImage(fonte, _dx, _dy, larguraAlvo, alturaAlvo) {
              canvas.__fonte = fonte;
              canvas.__largura = larguraAlvo;
              canvas.__altura = alturaAlvo;
            },
          };
        },
        toBlob(devolver, mime, qualidade) {
          const fonte = canvas.__fonte;
          if (!fonte) return devolver(null);
          const q = Math.round((qualidade ?? 0.85) * 100);
          let passada = sharp(fonte.__cru, {
            raw: { width: fonte.width, height: fonte.height, channels: fonte.__canais },
          })
            .resize(canvas.__largura, canvas.__altura, { fit: "fill", kernel: "lanczos3" })
            // O `fillRect` branco do lib, que impede PNG transparente de virar
            // fundo preto no JPEG do card do WhatsApp.
            .flatten({ background: canvas.__fundo || "#ffffff" });

          if (mime === "image/webp") passada = passada.webp({ quality: q });
          else if (mime === "image/png") passada = passada.png();
          else passada = passada.jpeg({ quality: q });

          passada
            .toBuffer()
            .then((saida) => devolver(new Blob([saida], { type: mime })))
            .catch(() => devolver(null));
        },
      };
      return canvas;
    },
  };
}

instalarCanvasDeMentira();
const { processarFotoDeVeiculo } = require(path.join(RAIZ, "src", "lib", "imageProcessor.ts"));

// ---------------------------------------------------------------------------
// Ferramentas
// ---------------------------------------------------------------------------
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);

/**
 * O lote determinístico. Ver "Uma foto só é baixada uma vez" no cabeçalho.
 * 12 hex de sha1 bastam: são 526 fotos, não 2^48.
 */
function loteDaOrigem(url) {
  return `c57-${crypto.createHash("sha1").update(url).digest("hex").slice(0, 12)}`;
}

/**
 * Baixa uma foto do carro57 com timeout e sem martelar.
 *
 * Três tentativas com espera crescente: o S3 deles já respondeu 5xx esporádico,
 * e derrubar um veículo inteiro por uma piscada de rede seria desperdício de
 * banda — as outras 18 fotos dele teriam sido baixadas à toa.
 */
async function baixar(url) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    try {
      const resposta = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "motors-store/migracao-de-fotos (contato: motorsstore.com.br)" },
      });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      const bytes = Buffer.from(await resposta.arrayBuffer());
      if (bytes.length === 0) throw new Error("corpo vazio");
      return { bytes, tipo: resposta.headers.get("content-type") || "image/jpeg" };
    } catch (e) {
      ultimoErro = e;
      if (tentativa < TENTATIVAS) await dormir(1000 * tentativa);
    }
  }
  throw new Error(`falha ao baixar (${ultimoErro?.message || "erro desconhecido"})`);
}

/** Nome legível para as mensagens de erro do lib. */
function nomeDoArquivo(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || "foto.jpg");
  } catch {
    return "foto.jpg";
  }
}

// ---------------------------------------------------------------------------
// O trabalho
// ---------------------------------------------------------------------------
(async () => {
  const comecou = Date.now();
  const supabase = createClient(URL_SUPABASE, CHAVE_DE_SERVICO, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const banco = new Client({
    connectionString: env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await banco.connect();

  console.log(`\n=== Fotos do carro57 -> Storage do Supabase — ${GRAVAR ? "GRAVANDO" : "ENSAIO (nada é gravado)"} ===\n`);

  const { rows: veiculos } = await banco.query(
    `select id, marca, modelo, versao, whatsapp_images, web_full_images, url_imagem
       from public.estoque_motors
      where estado_cadastro = 'publicado' and not vendido
        ${SO_ESTES.length ? "and id = any($1::int[])" : ""}
      order by id`,
    SO_ESTES.length ? [SO_ESTES] : [],
  );

  const alvo = LIMITE ? veiculos.slice(0, LIMITE) : veiculos;
  console.log(`Alvo: ${alvo.length} veículo(s) publicado(s) e não vendido(s).`);

  // ---- a rede de segurança, antes de qualquer coisa ----
  const pastaReversao = path.join(__dirname, "reversao");
  fs.mkdirSync(pastaReversao, { recursive: true });
  const carimbo = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const arquivoReversao = path.join(
    pastaReversao,
    `fotos-carro57-${carimbo}${GRAVAR ? "" : "-ensaio"}.sql`,
  );
  const reversao = [
    `-- Estado das colunas de foto ANTES da migração de ${new Date().toISOString()}.`,
    `-- Reverter: node supabase/manutencao/aplicar-migracao.js <este arquivo> [--gravar]`,
    `-- Não é migração de schema: sem rodapé de livro-razão, de propósito.`,
    "",
  ];
  for (const v of alvo) {
    const j = (x) => `'${JSON.stringify(x ?? []).replace(/'/g, "''")}'::jsonb`;
    const t = (x) => (x == null ? "null" : `'${String(x).replace(/'/g, "''")}'`);
    reversao.push(
      `update public.estoque_motors set whatsapp_images = ${j(v.whatsapp_images)}, ` +
        `web_full_images = ${j(v.web_full_images)}, url_imagem = ${t(v.url_imagem)} where id = ${v.id};`,
    );
  }
  fs.writeFileSync(arquivoReversao, reversao.join("\n") + "\n", "utf8");
  console.log(`Reversão gravada em: ${arquivoReversao}\n`);

  const total = {
    veiculos: alvo.length,
    migrariam: 0,
    semMudanca: 0,
    semFoto: 0,
    falharam: 0,
    fotos: 0,
    jaNossas: 0,
    jaNoBucket: 0,
    baixadas: 0,
    fotosComFalha: 0,
    bytesBaixados: 0,
    bytesQueSobem: 0,
  };
  const falhados = [];
  const linhas = [];

  for (const veiculo of alvo) {
    const id = veiculo.id;
    const etiqueta = `${id} ${[veiculo.marca, veiculo.modelo].filter(Boolean).join(" ")}`.trim();
    const fotos = fotosDoVeiculo(veiculo.whatsapp_images, veiculo.web_full_images);

    if (fotos.length === 0) {
      total.semFoto += 1;
      linhas.push({ etiqueta, situacao: "sem foto", n: 0 });
      console.log(`- ${etiqueta}: sem foto, nada a fazer.`);
      continue;
    }
    total.fotos += fotos.length;

    // Uma listagem por veículo responde "o que já está no bucket?" para a
    // galeria inteira — em vez de uma consulta por arquivo.
    const noBucket = new Map();
    const { data: existentes, error: erroLista } = await supabase.storage
      .from(BUCKET_DE_FOTOS)
      .list(String(id), { limit: 1000 });
    if (erroLista) {
      total.falharam += 1;
      falhados.push({ etiqueta, motivo: `não deu para listar o bucket: ${erroLista.message}` });
      console.log(`- ${etiqueta}: FALHOU ao listar o bucket — ${erroLista.message}`);
      continue;
    }
    for (const o of existentes || []) {
      noBucket.set(o.name, o.metadata?.size ?? 0);
    }

    const novas = [];
    let falha = null;
    let mudou = false;

    for (let i = 0; i < fotos.length; i += 1) {
      const foto = fotos[i];

      // Já é nossa: fica como está. É o que faz a segunda rodada não rebaixar
      // nada, e o que preserva a foto que a loja enviou pelo painel.
      if (ehFotoPropria(foto.zap) && ehFotoPropria(foto.web)) {
        novas.push(foto);
        total.jaNossas += 1;
        continue;
      }

      const origem = (foto.zap || foto.web || "").trim();
      if (!origem) {
        falha = `foto ${i + 1}: sem URL de origem`;
        break;
      }

      const lote = loteDaOrigem(origem);
      const caminhos = {
        zap: caminhoDaFoto(id, lote, "zap"),
        web: caminhoDaFoto(id, lote, "web"),
      };
      const nomes = {
        zap: caminhos.zap.split("/").pop(),
        web: caminhos.web.split("/").pop(),
      };
      const jaLa = ["zap", "web"].every((v) => (noBucket.get(nomes[v]) ?? 0) > 0);

      if (jaLa) {
        // O arquivo é endereçado pela URL de origem: se ele está lá, é esta
        // foto. Não se baixa de novo.
        total.jaNoBucket += 1;
      } else {
        try {
          const baixada = await baixar(origem);
          total.baixadas += 1;
          total.bytesBaixados += baixada.bytes.length;

          const arquivo = new File([baixada.bytes], nomeDoArquivo(origem), { type: baixada.tipo });
          // `validarFoto()` não entra aqui de propósito: ela protege o teto de
          // 15 MB do bucket, e o original NUNCA sobe — sobem as duas versões
          // tratadas, sempre menores. Barrar um original grande recusaria
          // justamente a melhor fonte.
          const versoes = await processarFotoDeVeiculo(arquivo, lote);

          for (const variante of ["zap", "web"]) {
            total.bytesQueSobem += versoes[variante].size;

            if (!GRAVAR) continue;
            if ((noBucket.get(nomes[variante]) ?? 0) > 0) continue;

            // O `File` vai inteiro, como no painel (`GaleriaDeFotos`): o
            // storage-js tem ramo próprio para Blob e o `contentType` é quem
            // manda na entrega — o nome do arquivo é só nome.
            const { error } = await supabase.storage
              .from(BUCKET_DE_FOTOS)
              .upload(caminhos[variante], versoes[variante], {
                contentType: versoes[variante].type,
                upsert: false,
              });
            if (error) {
              const jaExiste =
                String(error.statusCode) === "409" || /already exists/i.test(error.message || "");
              if (!jaExiste) throw new Error(error.message);
            }
          }
          await dormir(INTERVALO_MS);
        } catch (e) {
          falha = `foto ${i + 1} (${nomeDoArquivo(origem)}): ${e.message}`;
          total.fotosComFalha += 1;
          break;
        }
      }

      novas.push({
        zap: supabase.storage.from(BUCKET_DE_FOTOS).getPublicUrl(caminhos.zap).data.publicUrl,
        web: supabase.storage.from(BUCKET_DE_FOTOS).getPublicUrl(caminhos.web).data.publicUrl,
      });
      mudou = true;
    }

    if (falha) {
      total.falharam += 1;
      falhados.push({ etiqueta, motivo: falha });
      console.log(`- ${etiqueta}: FALHOU — ${falha}. O veículo fica como está.`);
      continue;
    }

    if (!mudou) {
      total.semMudanca += 1;
      linhas.push({ etiqueta, situacao: "já migrado", n: fotos.length });
      console.log(`- ${etiqueta}: ${fotos.length} foto(s) já são nossas, nada a fazer.`);
      continue;
    }

    // Paranoia barata: se a lista mudou de tamanho, alguma foto se perdeu no
    // caminho e a galeria sairia diferente da que estava no ar.
    if (novas.length !== fotos.length) {
      total.falharam += 1;
      falhados.push({ etiqueta, motivo: `contagem divergente (${novas.length} de ${fotos.length})` });
      console.log(`- ${etiqueta}: FALHOU — contagem divergente. O veículo fica como está.`);
      continue;
    }

    const colunas = colunasDasFotos(novas);

    if (GRAVAR) {
      // UMA instrução: é ela que garante "ou entra inteiro, ou não entra".
      // O `where` repete o alvo — se o veículo tiver sido vendido ou arquivado
      // enquanto o script rodava, a gravação não acontece.
      const { rowCount } = await banco.query(
        `update public.estoque_motors
            set whatsapp_images = $1::jsonb, web_full_images = $2::jsonb, url_imagem = $3
          where id = $4 and estado_cadastro = 'publicado' and not vendido`,
        [
          JSON.stringify(colunas.whatsapp_images),
          JSON.stringify(colunas.web_full_images),
          colunas.url_imagem,
          id,
        ],
      );
      if (rowCount !== 1) {
        total.falharam += 1;
        falhados.push({ etiqueta, motivo: "o UPDATE não alcançou a linha (mudou de estado?)" });
        console.log(`- ${etiqueta}: FALHOU na gravação (rowCount=${rowCount}).`);
        continue;
      }
    }

    total.migrariam += 1;
    linhas.push({ etiqueta, situacao: GRAVAR ? "migrado" : "migraria", n: novas.length });
    console.log(
      `- ${etiqueta}: ${novas.length} foto(s) ${GRAVAR ? "migradas" : "prontas"}` +
        ` (capa: ${colunas.url_imagem.split("/").pop()})`,
    );
  }

  await banco.end();

  // ---- relatório ----
  const minutos = ((Date.now() - comecou) / 60000).toFixed(1);
  console.log(`\n${"=".repeat(72)}`);
  console.log(`RELATÓRIO — ${GRAVAR ? "GRAVADO" : "ENSAIO, nada foi gravado"}`);
  console.log("=".repeat(72));
  console.log(`Veículos no alvo ................ ${total.veiculos}`);
  console.log(`  ${GRAVAR ? "migrados" : "migrariam"} ...................... ${total.migrariam}`);
  console.log(`  já migrados (nada a fazer) .... ${total.semMudanca}`);
  console.log(`  sem foto ...................... ${total.semFoto}`);
  console.log(`  FALHARAM (ficam como estão) ... ${total.falharam}`);
  console.log(`Fotos no alvo ................... ${total.fotos}`);
  console.log(`  já eram nossas ................ ${total.jaNossas}`);
  console.log(`  já estavam no bucket .......... ${total.jaNoBucket}`);
  console.log(`  baixadas do carro57 ........... ${total.baixadas}`);
  console.log(`  falharam ...................... ${total.fotosComFalha}`);
  console.log(`Baixado do carro57 .............. ${mb(total.bytesBaixados)} MB`);
  console.log(
    `${GRAVAR ? "Subiu ao bucket" : "Subiria ao bucket"} ............... ${mb(total.bytesQueSobem)} MB` +
      (total.baixadas ? ` (${Math.round(total.bytesQueSobem / total.baixadas / 1024)} KB por foto, nas duas versões)` : ""),
  );
  console.log(`Tempo ........................... ${minutos} min`);

  if (linhas.length) {
    console.log(`\nPOR VEÍCULO:`);
    for (const l of linhas) {
      console.log(`  ${String(l.n).padStart(3)} foto(s)  ${l.situacao.padEnd(11)}  ${l.etiqueta}`);
    }
  }

  if (falhados.length) {
    console.log(`\nVEÍCULOS QUE FICARAM COMO ESTAVAM (${falhados.length}):`);
    for (const f of falhados) console.log(`  • ${f.etiqueta} — ${f.motivo}`);
    process.exitCode = 1;
  }

  if (!GRAVAR) {
    console.log(
      `\nEnsaio. Para valer: node supabase/manutencao/migrar-fotos-do-carro57.js --gravar`,
    );
  }
  console.log("");
})().catch((e) => {
  console.error("\nERRO FATAL:", e.message);
  process.exit(1);
});
