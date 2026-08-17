/**
 * Extrai `<ACCESSORIES>` do feed do RevendaMais para a coluna `opcionais`.
 *
 * A descoberta que dispensou o palpite: o feed SEMPRE trouxe os acessórios de
 * cada veículo, num campo que o workflow n8n nunca leu. O sync mapeia 21 tags
 * do XML e `ACCESSORIES` não é uma delas, então `opcionais` ficou preenchido
 * em 1 de 43 — não porque a loja não tem o dado, mas porque ele se perdia no
 * caminho.
 *
 * Isso é dado da própria loja sobre a própria unidade. Nenhuma inferência de
 * ficha de fábrica por versão sobrevive à comparação: aqui não há risco de
 * anunciar item que aquele carro não tem.
 *
 * ESTA É A CORREÇÃO DE UMA VEZ SÓ. A definitiva é acrescentar `ACCESSORIES` ao
 * mapeamento do n8n — enquanto isso não for feito, todo sync continua ignorando
 * o campo e este script precisa rodar de novo.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const RAIZ = path.join(__dirname, "..");
const GRAVAR = process.argv.includes("--gravar");

const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; })
);

/**
 * O XML não fica versionado: ele traz `<PLATE>` e `<CHASSI>` de cada veículo,
 * que são dados internos e não entram no repositório (mesma regra da `placa`
 * em `src/lib/supabase.ts`). Baixe antes de rodar — a URL do feed está no
 * workflow do sincronizador, na raiz do repo.
 */
const CAMINHO_XML = path.join(__dirname, "feed-bruto.xml");
if (!fs.existsSync(CAMINHO_XML)) {
  console.error(
    "feed-bruto.xml não encontrado. Baixe primeiro:\n\n" +
      "  curl -s \"$(node -e \"console.log(require('../Antigravity - Sincronizador de Estoque (estoque_motors).json')" +
      ".nodes.find(n=>n.name.includes('Buscar')).parameters.url)\")\" -o conteudo-seo/feed-bruto.xml\n\n" +
      "E apague depois de usar — o arquivo tem placa e chassi."
  );
  process.exit(1);
}
const xml = fs.readFileSync(CAMINHO_XML, "utf8");

/**
 * O feed grava tudo em caixa baixa e sem acento. A PDP mostra a lista como
 * está, então a normalização é de apresentação, não de conteúdo — nenhum item
 * é acrescentado ou removido aqui.
 */
const GRAFIA = {
  "abs": "Freios ABS",
  "abs+ebd": "Freios ABS + EBD",
  "airbag": "Airbag",
  "airbag duplo": "Airbag duplo",
  "ar-condicionado": "Ar-condicionado",
  "ar-condicionado digital": "Ar-condicionado digital",
  "ar quente": "Ar quente",
  "alarme": "Alarme",
  "apoio de braco": "Apoio de braço",
  "banco de couro": "Bancos em couro",
  "bancos de couro": "Bancos em couro",
  "camera de re": "Câmera de ré",
  "cambio automatico": "Câmbio automático",
  "cambio manual": "Câmbio manual",
  "cd controle no volante": "Controles no volante",
  "computador de bordo": "Computador de bordo",
  "desembacador traseiro": "Desembaçador traseiro",
  "direcao eletrica": "Direção elétrica",
  "direcao hidraulica": "Direção hidráulica",
  "direcao escamoteavel": "Direção com regulagem",
  "dvd": "DVD",
  "encosto de cabeca traseiro": "Encosto de cabeça traseiro",
  "gps": "GPS",
  "kit multimidia": "Kit multimídia",
  "limpador traseiro": "Limpador traseiro",
  "radio bluetooth": "Rádio com Bluetooth",
  "regulagem altura do banco": "Banco com regulagem de altura",
  "retrovisor eletrico": "Retrovisores elétricos",
  "rodas de liga leve": "Rodas de liga leve",
  "sensor de estacionamento": "Sensor de estacionamento",
  "som multimidia": "Central multimídia",
  "teto solar": "Teto solar",
  "trava eletrica": "Travas elétricas",
  "trio eletrico": "Trio elétrico",
  "vidros eletricos": "Vidros elétricos",

  // Segunda leva, vinda do que o feed realmente trouxe em 2026-08-17.
  "4x2": "Tração 4x2",
  "4x4": "Tração 4x4",
  "7 lugares": "7 lugares",
  "aerofolio": "Aerofólio",
  "airbag cortina": "Airbag de cortina",
  "airbag lateral": "Airbag lateral",
  "alarme inteligente": "Alarme inteligente",
  "assistente de rampa": "Assistente de partida em rampa",
  "auto hold": "Auto Hold",
  "banco bipartido": "Banco traseiro bipartido",
  "banco eletrico": "Banco com ajuste elétrico",
  "banco reclinavel": "Banco reclinável",
  "bancos esportivos": "Bancos esportivos",
  "capota maritima": "Capota marítima",
  "cd player": "CD player",
  "chave copiareserva": "Chave reserva",
  "chave presencial": "Chave presencial",
  "controle de estabilidade": "Controle de estabilidade",
  "controle de tracao": "Controle de tração",
  "descanso de braco central": "Apoio de braço central",
  "engate": "Engate para reboque",
  "entrada auxiliar": "Entrada auxiliar",
  "espelhamento de celular": "Espelhamento de celular",
  "espelho retrovisor retratil": "Retrovisores retráteis",
  "farol de led": "Faróis de LED",
  "farol de milha": "Farol de milha",
  "farol de neblina": "Faróis de neblina",
  "farol de xenon": "Faróis de xenônio",
  "freio a disco nas 4 rodas": "Freios a disco nas quatro rodas",
  "paddle shift": "Trocas no volante (paddle shift)",
  "porta malas eletrico": "Porta-malas elétrico",
  "sistema stopstart": "Start-stop",
  "turbo": "Motor turbo",
  "usb": "Entrada USB",
  "volante com multifuncao": "Volante multifuncional",

  // Estes NÃO são equipamento — são estado e documentação, e é a própria loja
  // que os declara no RevendaMais. Ficam porque é assim que o anúncio de
  // seminovo funciona no Brasil, mas repare que "IPVA pago" envelhece: vira
  // mentira na virada do ano se ninguém revisar.
  "ipva pago": "IPVA pago",
  "manual do proprietario": "Manual do proprietário",
  "revisoes em dia": "Revisões em dia",
  "revisoes feitas na concessionaria": "Revisões feitas na concessionária",
};

const bonito = (bruto) => {
  const k = bruto.trim().toLowerCase();
  if (!k) return null;
  return GRAFIA[k] || k.charAt(0).toUpperCase() + k.slice(1);
};

// Um <AD> por veículo.
const anuncios = xml.split("<AD>").slice(1);
const porId = {};
const desconhecidos = new Set();

for (const bloco of anuncios) {
  const id = (bloco.match(/<ID>([^<]*)<\/ID>/) || [])[1];
  const acc = (bloco.match(/<ACCESSORIES>([^<]*)<\/ACCESSORIES>/) || [])[1] || "";
  if (!id) continue;

  const itens = [];
  for (const bruto of acc.split(",")) {
    const k = bruto.trim().toLowerCase();
    if (!k) continue;
    if (!GRAFIA[k]) desconhecidos.add(k);
    const b = bonito(bruto);
    if (b && !itens.includes(b)) itens.push(b);
  }
  porId[id.trim()] = itens;
}

const comItens = Object.entries(porId).filter(([, i]) => i.length > 0);
console.log(`veículos no feed: ${Object.keys(porId).length}`);
console.log(`com acessórios declarados: ${comItens.length}`);
console.log(`sem nenhum: ${Object.keys(porId).length - comItens.length}`);
const qtds = comItens.map(([, i]) => i.length);
if (qtds.length) console.log(`itens por veículo: ${Math.min(...qtds)}–${Math.max(...qtds)}`);
if (desconhecidos.size) {
  console.log(`\ngrafia não mapeada (${desconhecidos.size}) — saem capitalizados:`);
  console.log("  " + [...desconhecidos].join(", "));
}

fs.writeFileSync(path.join(__dirname, "opcionais-do-feed.json"),
  JSON.stringify(porId, null, 2), "utf8");

if (!GRAVAR) {
  console.log("\n(extração apenas — use --gravar para escrever em opcionais)");
  process.exit(0);
}

(async () => {
  const c = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  let gravados = 0;
  for (const [id, itens] of comItens) {
    const r = await c.query(
      `UPDATE public.estoque_motors SET opcionais = $1 WHERE id = $2`,
      [itens.join(", "), Number(id)]
    );
    if (r.rowCount === 1) gravados++;
  }
  console.log(`\ngravados: ${gravados}/${comItens.length}`);
  const { rows } = await c.query(`
    SELECT count(*) FILTER (WHERE opcionais IS NOT NULL AND opcionais <> '')::int AS com
    FROM public.estoque_motors`);
  console.log(`linhas com opcionais preenchidos: ${rows[0].com}`);
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
