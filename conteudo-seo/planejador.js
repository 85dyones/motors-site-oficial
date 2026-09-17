/**
 * Planejador de Palavras-Chave pela API — volume de busca por região, grátis.
 *
 * Por que esta e não o Semrush: o Semrush cobra por crédito e a conta está
 * zerada. O Planejador é o mesmo dado que o Google usa para vender clique,
 * sai de graça da conta de Ads que a loja já tem, e é a fonte que o
 * `PlanoMotorsStoreSEOGoogleAdsGA4Curitiba.md` §1.6 assume.
 *
 * E não substitui o `gsc.js`: o Planejador é estimativa de MERCADO e serve
 * para DESCOBRIR termo que ainda não temos; o Search Console é o que a
 * motorsstore.com.br de fato recebeu e serve para ORDENAR o que já temos.
 *
 * ----------------------------------------------------------------------
 * O QUE VOCÊ PRECISA FAZER UMA VEZ — sem isto, a API não devolve nada
 * ----------------------------------------------------------------------
 * Três coisas, e a primeira não é instantânea:
 *
 *   1. TOKEN DE DESENVOLVEDOR.  Só sai de uma conta ADMINISTRADORA (MCC) e
 *      passa por aprovação do Google. A conta 830-658-0678 é comum, então
 *      provavelmente falta criar a MCC antes. Sem token aprovado a API
 *      responde DEVELOPER_TOKEN_NOT_APPROVED, e não há como contornar por
 *      código. Peça "Acesso básico" — é o suficiente para este uso.
 *        Google Ads (MCC) → Ferramentas → Configuração → Central de API
 *
 *   2. A CONTA DE SERVIÇO COMO USUÁRIA DO GOOGLE ADS.  Até 2024 isto exigia
 *      Google Workspace com delegação de domínio; hoje não: basta adicionar
 *      o e-mail dela como usuário.
 *        Google Ads → Administrador → Acesso e segurança → Usuários
 *      É a MESMA conta de serviço do Search Console e do GA4 — o
 *      `configurar-gsc.js` já gravou as envs. Você não reconfigura credencial,
 *      só concede acesso. Rode `--conferir` para ver qual e-mail adicionar.
 *
 *   3. AS ENVS que faltam, em `.env.local`:
 *        ADS_DEVELOPER_TOKEN=...
 *        ADS_CUSTOMER_ID=8306580678        (sem hífens)
 *        ADS_LOGIN_CUSTOMER_ID=...         (só se entrar pela MCC)
 *
 * ----------------------------------------------------------------------
 * Sobre o número que volta
 * ----------------------------------------------------------------------
 * Com a conta SEM VEICULAÇÃO ATIVA — que é o estado de hoje — o Google
 * devolve o volume arredondado em faixas largas. Serve para ordenar cluster;
 * não serve para projetar lead nem receita. Ver a ressalva do §1.6.
 *
 * ----------------------------------------------------------------------
 *   node conteudo-seo/planejador.js --conferir     # o que tenho, o que falta
 *   node conteudo-seo/planejador.js --locais       # qual é o ID de Curitiba
 *   node conteudo-seo/planejador.js --validar      # volume dos termos do §1.6
 *   node conteudo-seo/planejador.js --descobrir    # termos novos
 *   node conteudo-seo/planejador.js --validar --json
 *   node conteudo-seo/planejador.js --validar --local "Bacacheri"
 */
const fs = require("fs");
const path = require("path");

// O `.env.local` entra em `process.env` ANTES de qualquer leitura — é a
// convenção dos outros scripts daqui (`levantar-estoque.js`, `conferir-feed.js`),
// e sem isto o header estaria mandando você gravar variável num arquivo que
// ninguém lê. Arquivo ausente não é erro: quem exporta a env na mão continua
// funcionando, e a env real vence a do arquivo.
(function carregarEnvLocal() {
  const arquivo = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(arquivo)) return;
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    if (!linha || linha.startsWith("#") || !linha.includes("=")) continue;
    const i = linha.indexOf("=");
    const nome = linha.slice(0, i).trim();
    if (process.env[nome] !== undefined) continue;
    process.env[nome] = linha.slice(i + 1).replace(/^["']|["']$/g, "");
  }
})();

const { tokenDeAcesso, credencialDoAmbiente, arquivoDoAmbiente } = require("./google-auth");
const { montarTermos, sementesDeDescoberta } = require("./termos");

const ESCOPO = "https://www.googleapis.com/auth/adwords";
const PREFIXOS = ["ADS", "GSC"]; // ADS primeiro; cai para a credencial do GSC
const VERSAO = process.env.ADS_API_VERSAO || "v25";
const BASE = `https://googleads.googleapis.com/${VERSAO}`;

const semHifen = (s) => String(s || "").replace(/\D/g, "");
const CLIENTE = semHifen(process.env.ADS_CUSTOMER_ID);
const LOGIN = semHifen(process.env.ADS_LOGIN_CUSTOMER_ID);
const TOKEN_DEV = process.env.ADS_DEVELOPER_TOKEN;

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : padrao;
};
const tem = (nome) => process.argv.includes(nome);

const LOCAL = arg("--local", "Curitiba");
const GRAVAR_JSON = tem("--json");
const CRU = tem("--raw");

/** Chamada REST à Ads API, com os três cabeçalhos que ela exige. */
async function chamar(acesso, caminho, corpo) {
  const cabecalhos = {
    Authorization: `Bearer ${acesso}`,
    "developer-token": TOKEN_DEV,
    "Content-Type": "application/json",
  };
  // Só quando a autorização entra por uma administradora. Mandar à toa faz a
  // API recusar com um erro que não parece ter relação com isto.
  if (LOGIN) cabecalhos["login-customer-id"] = LOGIN;

  const r = await fetch(`${BASE}/${caminho}`, {
    method: "POST",
    headers: cabecalhos,
    body: JSON.stringify(corpo),
  });

  const texto = await r.text();
  if (CRU) console.log(`\n--- ${caminho} → HTTP ${r.status}\n${texto.slice(0, 1500)}\n`);

  let j;
  try {
    j = JSON.parse(texto);
  } catch {
    throw new Error(`resposta não-JSON (HTTP ${r.status}): ${texto.slice(0, 300)}`);
  }

  if (!r.ok) throw new Error(explicar(r.status, j, texto));
  return j;
}

/**
 * O erro da Ads API vem embrulhado em três níveis e o que importa fica no
 * fundo. Traduz os que a gente sabe que vai encontrar, em vez de despejar o
 * JSON e deixar o operador adivinhando.
 */
function explicar(status, j, texto) {
  const erro = j.error || {};
  const detalhe = (erro.details || [])
    .flatMap((d) => d.errors || [])
    .map((e) => `${JSON.stringify(e.errorCode || {})}: ${e.message}`)
    .join(" | ");
  const msg = detalhe || erro.message || texto.slice(0, 300);

  if (/DEVELOPER_TOKEN_NOT_APPROVED/.test(msg)) {
    return (
      "O token de desenvolvedor existe mas NÃO está aprovado.\n" +
      "Com token não aprovado a API só fala com contas de teste, que não têm\n" +
      "volume de busca real. Peça Acesso Básico na Central de API da MCC.\n\n" +
      msg
    );
  }
  if (/DEVELOPER_TOKEN_PROHIBITED|invalid developer token|DEVELOPER_TOKEN/i.test(msg)) {
    return `Problema com ADS_DEVELOPER_TOKEN — veja o passo 1 do cabeçalho.\n\n${msg}`;
  }
  if (/USER_PERMISSION_DENIED|NOT_ADS_USER/.test(msg)) {
    return (
      "A credencial autenticou, mas não tem acesso a esta conta de Ads.\n" +
      "É o passo 2 do cabeçalho: adicione o e-mail da conta de serviço em\n" +
      "Google Ads → Administrador → Acesso e segurança → Usuários.\n" +
      `Conta pedida: ${CLIENTE || "(ADS_CUSTOMER_ID vazio)"}\n\n${msg}`
    );
  }
  if (status === 404 && /not found|Requested entity/i.test(msg)) {
    return (
      `A API respondeu 404 para a versão ${VERSAO}. Versões saem do ar depois\n` +
      "de cerca de um ano. Tente outra:  ADS_API_VERSAO=v24 node ...\n\n" +
      msg
    );
  }
  return `HTTP ${status} — ${msg}`;
}

const reais = (micros) =>
  micros == null ? "—" : `R$ ${(Number(micros) / 1e6).toFixed(2).replace(".", ",")}`;

/** `metrics` muda de nome entre os dois endpoints. Aceita os dois. */
const metricasDe = (r) => r.keywordIdeaMetrics || r.keywordMetrics || {};

/**
 * Pergunta ao Google qual é o identificador de Curitiba, em vez de eu chutar
 * um inteiro no código. Regra do projeto: não inventar número.
 */
async function resolverLocal(acesso, nome) {
  const j = await chamar(acesso, "geoTargetConstants:suggest", {
    locationNames: { names: [nome] },
    countryCode: "BR",
    locale: "pt",
  });
  return (j.geoTargetConstantSuggestions || []).map((s) => ({
    recurso: s.geoTargetConstant?.resourceName,
    nome: s.geoTargetConstant?.name,
    tipo: s.geoTargetConstant?.targetType,
    pai: s.geoTargetConstantParents?.map((p) => p.name).join(" › "),
  }));
}

/** Idioma pelo código, pelo mesmo motivo: sem número mágico no código. */
async function resolverIdioma(acesso, codigo = "pt") {
  const j = await chamar(acesso, `customers/${CLIENTE}/googleAds:search`, {
    query:
      "SELECT language_constant.id, language_constant.name, language_constant.code " +
      `FROM language_constant WHERE language_constant.code = '${codigo}' LIMIT 1`,
  });
  const l = (j.results || [])[0]?.languageConstant;
  if (!l) throw new Error(`Não achei o idioma de código '${codigo}'.`);
  return { recurso: `languageConstants/${l.id}`, nome: l.name };
}

function carregarEntrada() {
  const dir = __dirname;
  const estoque = JSON.parse(fs.readFileSync(path.join(dir, "estoque.json"), "utf8"));
  let extras = [];
  const semente = path.join(dir, "sementes.json");
  if (fs.existsSync(semente)) {
    extras = JSON.parse(fs.readFileSync(semente, "utf8")).extras || [];
  }
  return { veiculos: estoque.veiculos || [], extras };
}

function imprimirTabela(linhas) {
  console.log("volume  concor.  CPC topo (min–max)      termo");
  for (const l of linhas) {
    const faixa = `${reais(l.lanceMin)}–${reais(l.lanceMax)}`;
    console.log(
      `${String(l.volume ?? "—").padStart(6)}  ` +
        `${String(l.concorrencia || "—").padEnd(7)}  ` +
        `${faixa.padEnd(22)}  ${l.termo}${l.cluster ? `   [${l.cluster}]` : ""}`
    );
  }
}

function gravar(nome, dados) {
  const destino = path.join(__dirname, nome);
  fs.writeFileSync(destino, JSON.stringify(dados, null, 2) + "\n", "utf8");
  console.log(`\ngravado: conteudo-seo/${nome}`);
}

/** Em lotes: `generateKeywordIdeas` aceita no máximo 20 sementes por chamada. */
const emLotes = (lista, tamanho) => {
  const lotes = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
};

(async () => {
  // ------------------------------------------------------------------
  // --conferir: diz o que existe e o que falta. Nunca imprime segredo —
  // só nomes de variável e o e-mail da conta de serviço, que não é segredo:
  // é justamente o endereço que você adiciona como usuário no Google Ads.
  // ------------------------------------------------------------------
  if (tem("--conferir")) {
    const doAmbiente = credencialDoAmbiente(PREFIXOS);
    const arquivo = arquivoDoAmbiente(PREFIXOS);

    console.log("CREDENCIAL");
    if (doAmbiente) {
      console.log(`  ✔ ${doAmbiente.origem}`);
      console.log(`  → adicione ESTE e-mail como usuário no Google Ads:`);
      console.log(`      ${doAmbiente.client_email}`);
    } else if (arquivo) {
      console.log(`  ✔ ${arquivo.origem} = ${arquivo.caminho}`);
    } else {
      console.log("  ✖ nenhuma. Rode antes: node conteudo-seo/configurar-gsc.js <json>");
    }

    console.log("\nVARIÁVEIS DA ADS API");
    console.log(`  ${TOKEN_DEV ? "✔" : "✖"} ADS_DEVELOPER_TOKEN  ${TOKEN_DEV ? "(definido)" : "(AUSENTE — passo 1 do cabeçalho)"}`);
    console.log(`  ${CLIENTE ? "✔" : "✖"} ADS_CUSTOMER_ID       ${CLIENTE || "(AUSENTE — ex.: 8306580678)"}`);
    console.log(`  ${LOGIN ? "✔" : "·"} ADS_LOGIN_CUSTOMER_ID ${LOGIN || "(opcional, só via MCC)"}`);
    console.log(`  · versão da API: ${VERSAO}  (mude com ADS_API_VERSAO)`);

    const { veiculos, extras } = carregarEntrada();
    const { termos, porCluster, modelos } = montarTermos({ veiculos, extras });
    console.log("\nTERMOS (não precisa de credencial)");
    console.log(`  ${termos.length} termos, ${modelos.length} modelos distintos no pátio`);
    for (const [c, l] of Object.entries(porCluster)) console.log(`    ${String(l.length).padStart(3)}  ${c}`);

    if (!doAmbiente && !arquivo) process.exit(1);
    if (!TOKEN_DEV || !CLIENTE) {
      console.log("\nFalta env para chegar na API — parei antes de tentar.");
      process.exit(1);
    }

    // Chamada mais barata que prova as três coisas de uma vez: token de
    // desenvolvedor válido, conta de serviço com acesso, e o customer id certo.
    console.log("\nPROVA DE ACESSO (consulta real à conta)");
    const acesso = await tokenDeAcesso({ escopo: ESCOPO, prefixos: PREFIXOS });
    const j = await chamar(acesso, `customers/${CLIENTE}/googleAds:search`, {
      query: "SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1",
    });
    const c = (j.results || [])[0]?.customer;
    console.log(`  ✔ conta ${c?.id} — ${c?.descriptiveName || "(sem nome)"} (${c?.currencyCode})`);
    return;
  }

  const acesso = await tokenDeAcesso({ escopo: ESCOPO, prefixos: PREFIXOS });

  // ------------------------------------------------------------------
  // --locais: mostra os identificadores que casam com o nome, para você
  // confirmar QUAL Curitiba antes de medir com ela. Mesmo espírito do
  // `gsc.js --sondar`: provar, não presumir.
  // ------------------------------------------------------------------
  if (tem("--locais")) {
    const achados = await resolverLocal(acesso, LOCAL);
    if (!achados.length) return console.log(`Nada casou com "${LOCAL}".`);
    console.log(`identificadores para "${LOCAL}":\n`);
    for (const a of achados) {
      console.log(`  ${String(a.recurso).padEnd(28)} ${a.nome} (${a.tipo})`);
      if (a.pai) console.log(`  ${"".padEnd(28)} em ${a.pai}`);
    }
    return;
  }

  if (!TOKEN_DEV || !CLIENTE) {
    console.error("Faltam ADS_DEVELOPER_TOKEN e/ou ADS_CUSTOMER_ID.");
    console.error("Rode `node conteudo-seo/planejador.js --conferir`.");
    process.exit(1);
  }

  const locais = await resolverLocal(acesso, LOCAL);
  if (!locais.length) throw new Error(`Não achei o local "${LOCAL}".`);
  const geo = locais[0].recurso;
  const idioma = await resolverIdioma(acesso, "pt");
  console.log(`local: ${locais[0].nome} (${geo}) · idioma: ${idioma.nome}\n`);

  const { veiculos, extras } = carregarEntrada();

  // ------------------------------------------------------------------
  // --descobrir: termos que ainda não estão no plano.
  // ------------------------------------------------------------------
  if (tem("--descobrir")) {
    const sementes = sementesDeDescoberta({ extras });
    const achados = new Map();

    for (const lote of emLotes(sementes, 20)) {
      const j = await chamar(acesso, `customers/${CLIENTE}:generateKeywordIdeas`, {
        language: idioma.recurso,
        geoTargetConstants: [geo],
        keywordPlanNetwork: "GOOGLE_SEARCH",
        includeAdultKeywords: false,
        keywordSeed: { keywords: lote },
      });
      for (const r of j.results || []) {
        const m = metricasDe(r);
        achados.set(r.text, {
          termo: r.text,
          volume: Number(m.avgMonthlySearches || 0),
          concorrencia: m.competition,
          lanceMin: m.lowTopOfPageBidMicros,
          lanceMax: m.highTopOfPageBidMicros,
        });
      }
    }

    const linhas = [...achados.values()].sort((a, b) => b.volume - a.volume);
    console.log(`${sementes.length} sementes → ${linhas.length} termos\n`);
    imprimirTabela(linhas.slice(0, 80));
    if (linhas.length > 80) console.log(`\n… e mais ${linhas.length - 80}. Use --json para todos.`);
    if (GRAVAR_JSON) gravar("volumes-descoberta.json", { local: locais[0], gerado_em: new Date().toISOString(), termos: linhas });
    return;
  }

  // ------------------------------------------------------------------
  // --validar (padrão): os termos que o plano já definiu.
  // ------------------------------------------------------------------
  const { termos, porCluster } = montarTermos({ veiculos, extras });
  const clusterDe = new Map(termos.map((t) => [t.termo, t.cluster]));
  const linhas = [];

  for (const lote of emLotes(termos.map((t) => t.termo), 1000)) {
    const j = await chamar(acesso, `customers/${CLIENTE}:generateKeywordHistoricalMetrics`, {
      keywords: lote,
      language: idioma.recurso,
      geoTargetConstants: [geo],
      keywordPlanNetwork: "GOOGLE_SEARCH",
    });
    for (const r of j.results || []) {
      const m = metricasDe(r);
      linhas.push({
        termo: r.text,
        cluster: clusterDe.get(r.text) || "",
        volume: Number(m.avgMonthlySearches || 0),
        concorrencia: m.competition,
        lanceMin: m.lowTopOfPageBidMicros,
        lanceMax: m.highTopOfPageBidMicros,
      });
    }
  }

  linhas.sort((a, b) => b.volume - a.volume);
  console.log(`${termos.length} termos pedidos, ${linhas.length} com resposta\n`);
  imprimirTabela(linhas);

  console.log("\npor cluster (soma do volume):");
  const soma = {};
  for (const l of linhas) soma[l.cluster] = (soma[l.cluster] || 0) + l.volume;
  for (const [c, v] of Object.entries(soma).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(8)}  ${c}  (${porCluster[c]?.length ?? 0} termos)`);
  }
  console.log(
    "\nLembrete: com a conta sem veiculação, estes números vêm arredondados\n" +
      "em faixas largas. Ordenam cluster; não projetam lead."
  );

  if (GRAVAR_JSON) gravar("volumes.json", { local: locais[0], gerado_em: new Date().toISOString(), termos: linhas });
})().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
