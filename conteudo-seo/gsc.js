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
const REFRESH = process.env.GSC_REFRESH_TOKEN;
const DIAS = Number((process.argv.find((a) => a === "--dias") && process.argv[process.argv.indexOf("--dias") + 1]) || 90);
const POR_PAGINA = process.argv.includes("--paginas");
const SO_VEICULOS = process.argv.includes("--veiculos");

// `--conferir` só diz QUE TIPO de credencial é a sua e o que falta. Não
// imprime client_id, secret nem chave — só nomes de campo.
if (process.argv.includes("--conferir")) {
  if (!CHAVE) {
    console.error("Defina GSC_CHAVE com o caminho do JSON baixado do Google Cloud.");
    process.exit(1);
  }
  const bruto = fs.readFileSync(CHAVE, "utf8");
  const j = JSON.parse(bruto);
  const campos = Object.keys(j.installed || j.web || j);

  console.log(`arquivo: ${CHAVE}`);
  console.log(`campos presentes: ${campos.join(", ")}`);

  if (j.type === "service_account" && j.private_key) {
    console.log("\n✔ CONTA DE SERVIÇO — é a que roda sozinha.");
    console.log(`  Adicione este e-mail como usuário no Search Console:\n    ${j.client_email}`);
    console.log(`  Falta só: GSC_SITE=${SITE ? "(definido)" : "sc-domain:motorsstore.com.br"}`);
  } else if ((j.installed || j.web || j).client_secret) {
    console.log("\n⚠ ID DO CLIENTE OAUTH — precisa de um consentimento no navegador.");
    console.log("  Para uso automático, o melhor é criar uma conta de serviço.");
    console.log(`  Se quiser seguir com este: falta GSC_REFRESH_TOKEN ${REFRESH ? "(definido)" : "(AUSENTE)"}`);
  } else {
    console.log("\n✖ Não reconheci o formato.");
  }
  process.exit(0);
}

const TEM_ENVS = process.env.GSC_CLIENT_EMAIL && process.env.GSC_PRIVATE_KEY;

if ((!CHAVE && !TEM_ENVS) || !SITE) {
  console.error(
    "Faltam variáveis. Duas formas de configurar:\n\n" +
      "  A) Convenção do projeto (funciona na Vercel — mesma forma do GA4):\n" +
      "       GSC_CLIENT_EMAIL=algo@projeto.iam.gserviceaccount.com\n" +
      '       GSC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----\\n"\n\n' +
      "  B) Só para uso local, apontando o JSON baixado:\n" +
      "       GSC_CHAVE=C:/caminho/para/chave.json\n\n" +
      "  Em ambas: GSC_SITE=sc-domain:motorsstore.com.br\n\n" +
      "Rode `node conteudo-seo/gsc.js --conferir` para ver que tipo de\n" +
      "credencial você tem e o que ainda falta."
  );
  process.exit(1);
}

const b64url = (b) => Buffer.from(b).toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * O Google Cloud entrega DOIS JSONs diferentes, e só um roda sem navegador.
 * Esta função identifica qual chegou pelos NOMES dos campos — nunca imprime
 * valor nenhum.
 *
 *   conta de serviço ..... tem `"type": "service_account"`, `client_email` e
 *                          `private_key`. Autentica sozinha, para sempre.
 *   ID do cliente OAuth .. vem embrulhado em `"installed"` ou `"web"`, com
 *                          `client_secret` e `redirect_uris`, e SEM
 *                          `private_key`. Exige um consentimento no navegador
 *                          uma vez, que devolve o refresh token.
 */
function identificar(bruto) {
  const j = JSON.parse(bruto);
  if (j.type === "service_account" && j.private_key) return { tipo: "servico", j };
  const oauth = j.installed || j.web || j;
  if (oauth.client_id && oauth.client_secret) {
    return { tipo: "oauth", j: oauth };
  }
  return { tipo: "desconhecido", j };
}

/** Access token de leitura, pelo caminho que a credencial permitir. */
async function token() {
  // Convenção do projeto primeiro: `src/lib/analytics.ts` já autentica no
  // Google por conta de serviço usando duas envs soltas, e não um arquivo —
  // porque a Vercel guarda variável, não arquivo. Mesma forma aqui, para uma
  // credencial só servir aos dois usos.
  if (process.env.GSC_CLIENT_EMAIL && process.env.GSC_PRIVATE_KEY) {
    return tokenDeContaDeServico({
      client_email: process.env.GSC_CLIENT_EMAIL,
      // O `\n` chega escapado quando a chave viaja dentro de uma env.
      private_key: process.env.GSC_PRIVATE_KEY.replace(/\\n/g, "\n"),
    });
  }

  const { tipo, j: cred } = identificar(fs.readFileSync(CHAVE, "utf8"));

  if (tipo === "desconhecido") {
    throw new Error(
      "O JSON não parece nem conta de serviço nem ID do cliente OAuth.\n" +
      "Conta de serviço tem `type: service_account` e `private_key`.\n" +
      "ID do cliente tem `client_secret` dentro de `installed` ou `web`."
    );
  }

  if (tipo === "oauth") {
    // Sem refresh token não há como seguir: o fluxo OAuth exige um
    // consentimento humano no navegador, e isso é uma vez só.
    if (!REFRESH) {
      throw new Error(
        "Este é um ID do cliente OAuth, e falta GSC_REFRESH_TOKEN.\n\n" +
        "Duas saídas:\n\n" +
        "  A) RECOMENDADA — crie uma CONTA DE SERVIÇO em vez disto.\n" +
        "     Google Cloud → Credenciais → Criar → Conta de serviço.\n" +
        "     Baixe a chave JSON e adicione o e-mail dela como usuário no\n" +
        "     Search Console. Autentica sozinha, sem navegador, sem expirar.\n\n" +
        "  B) Obtenha o refresh token uma vez pelo OAuth Playground:\n" +
        "     https://developers.google.com/oauthplayground\n" +
        "     Engrenagem → marque 'Use your own OAuth credentials' → cole seu\n" +
        "     Client ID e Secret. No passo 1 use o escopo\n" +
        "     https://www.googleapis.com/auth/webmasters.readonly\n" +
        "     Autorize, troque pelo token e guarde o refresh token em\n" +
        "     GSC_REFRESH_TOKEN. Antes disso, adicione\n" +
        "     https://developers.google.com/oauthplayground como URI de\n" +
        "     redirecionamento autorizado no seu ID do cliente."
      );
    }

    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: cred.client_id,
        client_secret: cred.client_secret,
        refresh_token: REFRESH,
      }),
    });
    const j = await r.json();
    if (!j.access_token) throw new Error(`refresh recusado: ${j.error_description || j.error}`);
    return j.access_token;
  }

  return tokenDeContaDeServico(cred);
}

/** JWT assinado, trocado por access token. Sem navegador, sem expirar. */
async function tokenDeContaDeServico(cred) {
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = b64url(JSON.stringify({
    iss: cred.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: agora + 3600,
    iat: agora,
  }));

  const assinatura = b64url(
    crypto.createSign("RSA-SHA256").update(`${cabecalho}.${corpo}`).sign(cred.private_key)
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
  if (!j.access_token) throw new Error(`token negado: ${j.error_description || JSON.stringify(j)}`);
  return j.access_token;
}

const iso = (d) => d.toISOString().slice(0, 10);

(async () => {
  const acesso = await token();

  // `--sites` pergunta à API o que ESTA conta enxerga. É o diagnóstico certo
  // para o 403: ele não distingue "não tenho permissão" de "essa propriedade
  // nem existe com esse identificador", e a diferença entre propriedade de
  // domínio (`sc-domain:`) e de prefixo de URL (`https://.../`) é a causa mais
  // comum — são registros separados no Search Console, com permissões
  // separadas.
  if (process.argv.includes("--sites")) {
    const r = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
      headers: { Authorization: `Bearer ${acesso}` },
    });
    const j = await r.json();
    if (j.error) throw new Error(`${j.error.code}: ${j.error.message}`);

    const sites = j.siteEntry || [];
    if (sites.length === 0) {
      console.log("A conta de serviço não enxerga NENHUMA propriedade.");
      console.log("O e-mail dela ainda não foi adicionado, ou foi adicionado");
      console.log("em outra propriedade que não a desta loja.");
      return;
    }
    console.log(`${sites.length} propriedade(s) visível(is):\n`);
    for (const s of sites) {
      console.log(`  ${s.permissionLevel.padEnd(14)} ${s.siteUrl}`);
    }
    console.log(`\nUse uma delas em GSC_SITE. O valor atual é: ${SITE}`);
    return;
  }

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
