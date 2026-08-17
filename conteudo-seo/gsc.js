/**
 * Google Search Console pela API — as buscas reais que trazem gente ao site.
 *
 * Por que esta e não outra: o Keyword Planner e o Trends dão estimativa de
 * mercado; o Search Console dá o SEU dado. Ele responde "para que termos a
 * motorsstore.com.br já aparece, em que posição e quantos clicam", que é a
 * pergunta que ordena a fila de conteúdo. E é grátis, oficial e sem limite
 * prático de uso.
 *
 * ----------------------------------------------------------------------
 * Zero dependências novas
 * ----------------------------------------------------------------------
 * A autenticação é um JWT assinado com a chave da conta de serviço, trocado
 * por um access token. São ~30 linhas com o `crypto` do próprio Node, então
 * não entra `googleapis` (que arrasta dezenas de megabytes) no projeto.
 *
 * ----------------------------------------------------------------------
 * O que VOCÊ precisa fazer uma vez — eu não posso, e não devo
 * ----------------------------------------------------------------------
 * Criar credencial é ação de conta, com segredo que eu não manipulo:
 *
 *   1. Verifique motorsstore.com.br no Search Console, se ainda não estiver.
 *      Não achei tag de verificação no código, então provavelmente falta.
 *      O caminho mais limpo é registro DNS TXT, que não depende de deploy.
 *   2. No Google Cloud Console: crie um projeto, ative a "Google Search
 *      Console API" e crie uma CONTA DE SERVIÇO. Baixe a chave em JSON.
 *   3. No Search Console, em Configurações → Usuários e permissões, adicione
 *      o e-mail da conta de serviço (algo@projeto.iam.gserviceaccount.com)
 *      como usuário com permissão de leitura. Este passo é o que costuma ser
 *      esquecido — sem ele a API responde 403 mesmo com a chave correta.
 *   4. Guarde o JSON fora do repositório e aponte:
 *
 *        GSC_CHAVE=C:/caminho/para/chave.json
 *        GSC_SITE=sc-domain:motorsstore.com.br
 *
 *      Use `sc-domain:` se a propriedade for de domínio; se for de prefixo de
 *      URL, use a URL inteira: https://motorsstore.com.br/
 *
 * ----------------------------------------------------------------------
 *   node conteudo-seo/gsc.js                    # top 50 buscas, 90 dias
 *   node conteudo-seo/gsc.js --dias 28
 *   node conteudo-seo/gsc.js --paginas          # por página, não por termo
 *   node conteudo-seo/gsc.js --veiculos         # só as PDPs de carro
 */
const fs = require("fs");
const crypto = require("crypto");

const CHAVE = process.env.GSC_CHAVE;
const SITE = process.env.GSC_SITE;
const DIAS = Number((process.argv.find((a) => a === "--dias") && process.argv[process.argv.indexOf("--dias") + 1]) || 90);
const POR_PAGINA = process.argv.includes("--paginas");
const SO_VEICULOS = process.argv.includes("--veiculos");

if (!CHAVE || !SITE) {
  console.error(
    "Faltam as variáveis. Veja o cabeçalho deste arquivo para os 4 passos.\n\n" +
      "  GSC_CHAVE=caminho/para/chave.json\n" +
      "  GSC_SITE=sc-domain:motorsstore.com.br\n"
  );
  process.exit(1);
}

const b64url = (b) => Buffer.from(b).toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Troca a chave da conta de serviço por um access token de leitura. */
async function token() {
  const chave = JSON.parse(fs.readFileSync(CHAVE, "utf8"));
  const agora = Math.floor(Date.now() / 1000);

  const cabecalho = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = b64url(JSON.stringify({
    iss: chave.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: agora + 3600,
    iat: agora,
  }));

  const assinatura = b64url(
    crypto.createSign("RSA-SHA256").update(`${cabecalho}.${corpo}`).sign(chave.private_key)
  );

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${cabecalho}.${corpo}.${assinatura}`,
    }),
  });

  const j = await r.json();
  if (!j.access_token) throw new Error(`token negado: ${JSON.stringify(j)}`);
  return j.access_token;
}

const iso = (d) => d.toISOString().slice(0, 10);

(async () => {
  const acesso = await token();

  const fim = new Date(Date.now() - 2 * 86400000); // GSC atrasa ~2 dias
  const inicio = new Date(fim.getTime() - DIAS * 86400000);

  const corpo = {
    startDate: iso(inicio),
    endDate: iso(fim),
    dimensions: POR_PAGINA ? ["page"] : ["query"],
    rowLimit: 100,
  };
  if (SO_VEICULOS) {
    corpo.dimensionFilterGroups = [{
      filters: [{ dimension: "page", operator: "contains", expression: "/carros/" }],
    }];
  }

  const r = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${acesso}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }
  );

  const j = await r.json();
  if (j.error) {
    // O 403 aqui quase sempre é o passo 3 do cabeçalho — a conta de serviço
    // existe e autentica, mas não foi adicionada como usuário na propriedade.
    throw new Error(`${j.error.code}: ${j.error.message}`);
  }

  const linhas = j.rows || [];
  if (linhas.length === 0) {
    console.log(`Nenhum dado entre ${iso(inicio)} e ${iso(fim)}.`);
    console.log("Propriedade recém-verificada leva alguns dias para acumular.");
    return;
  }

  console.log(`${iso(inicio)} a ${iso(fim)} — ${linhas.length} ${POR_PAGINA ? "páginas" : "termos"}\n`);
  console.log("impr.  cliques  pos.   " + (POR_PAGINA ? "página" : "busca"));
  for (const l of linhas.slice(0, 50)) {
    const chave = POR_PAGINA ? l.keys[0].replace(/^https?:\/\/[^/]+/, "") : l.keys[0];
    console.log(
      `${String(l.impressions).padStart(5)}  ${String(l.clicks).padStart(7)}  ` +
      `${l.position.toFixed(1).padStart(5)}   ${chave}`
    );
  }

  const totalImpr = linhas.reduce((s, l) => s + l.impressions, 0);
  const totalClq = linhas.reduce((s, l) => s + l.clicks, 0);
  console.log(`\ntotal: ${totalImpr} impressões, ${totalClq} cliques ` +
    `(CTR ${((totalClq / totalImpr) * 100).toFixed(1)}%)`);
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
