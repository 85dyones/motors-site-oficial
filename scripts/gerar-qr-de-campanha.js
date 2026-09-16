#!/usr/bin/env node
/**
 * Gera os QR codes de uma campanha, com UTM por peça, e CONFERE cada um
 * decodificando de volta.
 *
 * A conferência não é zelo: QR vai para gráfica, e um código errado só se
 * descobre depois de impresso. O script lê o próprio PNG que acabou de gerar e
 * compara com a URL de origem; se divergir, sai com erro e não escreve o
 * manifesto.
 *
 * ---------------------------------------------------------------------------
 * AS DEPENDÊNCIAS NÃO ESTÃO NO PROJETO, E ISSO É DE PROPÓSITO
 * ---------------------------------------------------------------------------
 * `qrcode` e `jsqr` somam ~30 pacotes para uma tarefa que acontece uma vez por
 * campanha. Em vez de carregá-los no `package.json` de um site em produção,
 * instale-os num diretório descartável:
 *
 *   mkdir -p /tmp/qr && cd /tmp/qr && npm init -y && npm install qrcode jsqr
 *   cd -
 *   NODE_PATH=/tmp/qr/node_modules node scripts/gerar-qr-de-campanha.js pole-position-2026
 *
 * `sharp` vem do próprio projeto (o Next já o traz), então só os dois de cima
 * precisam do diretório extra.
 *
 * ---------------------------------------------------------------------------
 * USO
 * ---------------------------------------------------------------------------
 *   node scripts/gerar-qr-de-campanha.js <slug> [--gravar]
 *
 * Sem `--gravar`, só relata as URLs que cada peça carregaria.
 *
 * As peças e o `utm_content` de cada uma estão em `PECAS`, abaixo. Acrescentar
 * uma peça é acrescentar uma linha — e `utm_content` é o que distingue de onde
 * veio o lead: sem ele você sabe que veio de QR, mas não de QUAL material.
 */

const fs = require("fs");
const path = require("path");

const SITE = "https://motorsstore.com.br";

/** Uma linha por material impresso. `content` vira `utm_content` no lead. */
const PECAS = [
  { arquivo: "folder", content: "folder", rotulo: "Folder impresso" },
  { arquivo: "banner", content: "banner", rotulo: "Banners de divulgação" },
];

/*
 * Correção de erro NÍVEL H (30%) — o mais alto que a especificação define.
 *
 * O motivo é físico: folder dobra no bolso e banner de rua pega sol, chuva e
 * dedo. Com H, até 30% do código pode estar ilegível e a leitura ainda
 * acontece. Custa densidade (mais módulos), e é por isso que o tamanho mínimo
 * de impressão importa — o script o calcula no fim.
 */
const NIVEL = "H";
const MARGEM = 2;
const LARGURA_PNG = 1024;

function carregar(nome) {
  try {
    return require(nome);
  } catch {
    console.error(`
ERRO: falta a dependência "${nome}".

Ela não está no package.json de propósito — ver o cabeçalho deste arquivo.
Instale num diretório descartável e aponte o NODE_PATH:

  mkdir -p /tmp/qr && cd /tmp/qr && npm init -y && npm install qrcode jsqr && cd -
  NODE_PATH=/tmp/qr/node_modules node scripts/gerar-qr-de-campanha.js <slug>
`);
    process.exit(1);
  }
}

function urlDa(slug, peca) {
  const p = new URLSearchParams({
    utm_source: "qr",
    utm_medium: "impresso",
    utm_campaign: slug,
    utm_content: peca.content,
  });
  return `${SITE}/${slug}?${p.toString()}`;
}

async function main() {
  const args = process.argv.slice(2);
  const gravar = args.includes("--gravar");
  const slug = args.find((a) => !a.startsWith("--"));

  if (!slug) {
    console.error("\nuso: node scripts/gerar-qr-de-campanha.js <slug> [--gravar]\n");
    process.exit(1);
  }
  if (!/^[a-z0-9-]+-20\d{2}$/.test(slug)) {
    console.error(`\nERRO: slug fora do padrão: "${slug}". Ele carrega o ano.\n`);
    process.exit(1);
  }

  const QRCode = carregar("qrcode");
  const jsQR = carregar("jsqr");
  const sharp = require("sharp");

  const destino = path.join(process.cwd(), "docs", "campanhas", slug);

  if (!gravar) {
    console.log("\nENSAIO (nada foi gravado):\n");
    for (const peca of PECAS) {
      console.log(`  ${peca.rotulo}`);
      console.log(`    qr-${slug}-${peca.arquivo}.svg + .png`);
      console.log(`    ${urlDa(slug, peca)}\n`);
    }
    console.log("Confira as URLs e rode de novo com --gravar.\n");
    return;
  }

  fs.mkdirSync(destino, { recursive: true });
  const manifesto = { slug, geradoEm: new Date().toISOString().slice(0, 10), pecas: [] };
  let todosOk = true;

  for (const peca of PECAS) {
    const url = urlDa(slug, peca);
    const base = `qr-${slug}-${peca.arquivo}`;

    const svg = await QRCode.toString(url, {
      errorCorrectionLevel: NIVEL,
      type: "svg",
      margin: MARGEM,
      width: LARGURA_PNG,
    });
    fs.writeFileSync(path.join(destino, base + ".svg"), svg, "utf8");
    await QRCode.toFile(path.join(destino, base + ".png"), url, {
      errorCorrectionLevel: NIVEL,
      margin: MARGEM,
      width: LARGURA_PNG,
    });

    // A CONFERÊNCIA: decodifica o PNG recém-gravado e compara com a origem.
    const { data, info } = await sharp(path.join(destino, base + ".png"))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const lido = jsQR(new Uint8ClampedArray(data), info.width, info.height);
    const ok = Boolean(lido) && lido.data === url;
    if (!ok) todosOk = false;

    console.log(`${peca.rotulo}`);
    console.log(`  ${base}.svg + .png`);
    console.log(`  ${url}`);
    console.log(`  leitura: ${ok ? "CONFERE" : "FALHOU — não mande para a gráfica"}`);
    if (!ok) console.log(`  decodificou: ${lido ? lido.data : "(ilegível)"}`);
    console.log("");

    manifesto.pecas.push({ arquivo: base, rotulo: peca.rotulo, utm_content: peca.content, url });
  }

  if (!todosOk) {
    console.error("HOUVE FALHA de leitura. O manifesto NÃO foi escrito.\n");
    process.exit(1);
  }

  const teste = QRCode.create(urlDa(slug, PECAS[0]), { errorCorrectionLevel: NIVEL });
  const modulos = teste.modules.size;
  manifesto.modulos = modulos;
  manifesto.tamanhoMinimoMm = Math.ceil((modulos * 0.5) / 10) * 10;
  manifesto.nivelDeCorrecao = NIVEL;

  fs.writeFileSync(
    path.join(destino, "qr-codes.json"),
    JSON.stringify(manifesto, null, 2) + "\n",
    "utf8",
  );

  console.log(`módulos: ${modulos}×${modulos} (nível ${NIVEL}, 30% de correção)`);
  console.log(`tamanho mínimo de impressão: ${manifesto.tamanhoMinimoMm} mm de lado`);
  console.log(`\nmanifesto: docs/campanhas/${slug}/qr-codes.json`);
  console.log("TODOS CONFEREM\n");
}

main().catch((e) => {
  console.error(`\nFALHOU: ${e.message}\n`);
  process.exit(1);
});
