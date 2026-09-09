#!/usr/bin/env node
/**
 * Prepara as artes de uma landing page de campanha a partir de UMA foto.
 *
 * A LP usa três imagens, e nenhuma delas é a foto crua:
 *
 *   <slug>-carro.jpg  2400×800   o banner de largura total, entre o texto e a zebra
 *   <slug>-og.jpg     1200×630   o card do WhatsApp, Facebook e Instagram
 *   <slug>-pista.jpg  1600×400   a faixa de fundo do fecho da página
 *
 * Mandar a mesma foto nos três tamanhos à mão é o tipo de trabalho que se
 * esquece pela metade — e o que fica esquecido é sempre o card, porque ele só
 * aparece quando alguém compartilha o link. Este script gera os três de uma vez.
 *
 * USO
 *
 *   node scripts/preparar-arte-de-campanha.js <foto> <slug> [--gravar]
 *
 * Sem `--gravar` ele só relata o que faria, com as medidas e o recorte — a
 * mesma régua do `aplicar-migracao.js`, para conferir antes de sobrescrever
 * arte que já está no ar.
 *
 *   node scripts/preparar-arte-de-campanha.js ~/Downloads/banner.jpg pole-position-2026
 *   node scripts/preparar-arte-de-campanha.js ~/Downloads/banner.jpg pole-position-2026 --gravar
 *
 * O QUE ELE ACEITA
 *
 * Qualquer JPG, PNG ou WebP acima de 2400px no lado maior. Foto de celular
 * serve. O recorte é sempre pelo CENTRO (`fit: cover`), então o assunto tem de
 * estar no meio do quadro — o que sobra nas pontas é o que se perde.
 *
 * ARTE EM CMYK
 *
 * Arquivo exportado de material impresso costuma vir em CMYK, e o navegador o
 * mostra com as cores INVERTIDAS. O script detecta e converte, avisando; sem
 * isso um carro branco chega azul-petróleo na página.
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const DESTINO = path.join(process.cwd(), "public", "campanhas");

/**
 * As três saídas. `fundo` é a cor com que se preenche o que sobrar quando a
 * foto não tem proporção suficiente — o creme da LP, para a emenda não
 * aparecer como um retângulo contra o fundo da página.
 */
const SAIDAS = [
  { sufixo: "carro", largura: 2400, altura: 800, nota: "banner de largura total" },
  { sufixo: "og", largura: 1200, altura: 630, nota: "card de compartilhamento" },
  { sufixo: "pista", largura: 1600, altura: 400, nota: "faixa do fecho" },
];

function uso(mensagem) {
  if (mensagem) console.error(`\nERRO: ${mensagem}`);
  console.error(`
uso: node scripts/preparar-arte-de-campanha.js <foto> <slug> [--gravar]

  <foto>   caminho da imagem de origem (jpg, png ou webp)
  <slug>   o slug da campanha, como está em src/lib/campanhas.ts
           ex.: pole-position-2026

  --gravar sobrescreve os arquivos em public/campanhas/.
           Sem ele, o script só RELATA o que faria.
`);
  process.exit(mensagem ? 1 : 0);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) uso();

  const gravar = args.includes("--gravar");
  /*
   *  existe porque UMA foto raramente serve as três posições.
   * A arte do banner é uma faixa 3:1 com o carro na direita; recortá-la em
   * 1,9:1 para o card cortaria justamente o carro. Cada peça pode vir de uma
   * foto própria, e esta opção é o que torna isso possível sem sobrescrever as
   * outras duas.
   */
  const apenasIdx = args.indexOf("--apenas");
  const apenas = apenasIdx >= 0 ? args[apenasIdx + 1] : null;
  const [origem, slug] = args.filter((a, i) => !a.startsWith("--") && i !== apenasIdx + 1);

  if (!origem) uso("falta o caminho da foto");
  if (!slug) uso("falta o slug da campanha");
  if (!fs.existsSync(origem)) uso(`não achei o arquivo: ${origem}`);
  if (!/^[a-z0-9-]+-20\d{2}$/.test(slug)) {
    uso(`slug fora do padrão: "${slug}". Ele carrega o ano — ex.: pole-position-2026`);
  }

  const meta = await sharp(origem).metadata();
  const maior = Math.max(meta.width ?? 0, meta.height ?? 0);

  console.log(`\norigem: ${origem}`);
  console.log(`        ${meta.width}×${meta.height}, espaço de cor ${meta.space}`);

  if (maior < 2400) {
    uso(
      `a foto tem ${maior}px no lado maior, e o banner precisa de 2400. ` +
        `Ampliar borra: mande uma maior.`,
    );
  }

  // Arte vinda de material impresso costuma ser CMYK, e o navegador a mostra
  // com as cores invertidas. Converter aqui é o que impede um carro branco de
  // chegar azul-petróleo na página.
  const precisaConverter = meta.space === "cmyk";
  if (precisaConverter) {
    console.log("        CMYK detectado — será convertido para sRGB");
  }

  const alvos = apenas ? SAIDAS.filter((s) => s.sufixo === apenas) : SAIDAS;
  if (apenas && alvos.length === 0) {
    const nomes = SAIDAS.map((s) => s.sufixo).join(", ");
    uso(`peça desconhecida: "${apenas}". Use uma de: ${nomes}`);
  }

  console.log(gravar ? "\nGRAVANDO:" : "\nENSAIO (nada foi gravado):");

  for (const saida of alvos) {
    const nome = `${slug}-${saida.sufixo}.jpg`;
    const caminho = path.join(DESTINO, nome);
    const existia = fs.existsSync(caminho);

    if (!gravar) {
      console.log(
        `  ${nome.padEnd(34)} ${String(saida.largura).padStart(4)}×${saida.altura}` +
          `  ${saida.nota}${existia ? "  (SOBRESCREVE o atual)" : "  (novo)"}`,
      );
      continue;
    }

    fs.mkdirSync(DESTINO, { recursive: true });
    let pipeline = sharp(origem);
    if (precisaConverter) pipeline = pipeline.toColourspace("srgb");

    await pipeline
      .resize({
        width: saida.largura,
        height: saida.altura,
        fit: "cover",
        position: "centre",
      })
      .jpeg({ quality: 86, mozjpeg: true })
      .toFile(caminho);

    const bytes = fs.statSync(caminho).size;
    console.log(
      `  ${nome.padEnd(34)} ${String(saida.largura).padStart(4)}×${saida.altura}` +
        `  ${String(Math.round(bytes / 1024)).padStart(4)} KB${existia ? "  (substituído)" : ""}`,
    );
  }

  if (!gravar) {
    console.log("\nConfira as medidas acima e rode de novo com --gravar.\n");
    return;
  }

  console.log(`
Pronto. Falta uma coisa que o script NÃO faz:

  As imagens vão com \`unoptimized\`, então o navegador baixa exatamente estes
  arquivos. Confira o peso acima — acima de ~300 KB o banner atrasa o
  carregamento no celular, que é de onde vem quase todo o tráfego de campanha.

  Depois: commit, e o card só passa a existir no domínio de produção
  depois do merge.
`);
}

main().catch((erro) => {
  console.error(`\nFALHOU: ${erro.message}\n`);
  process.exit(1);
});
