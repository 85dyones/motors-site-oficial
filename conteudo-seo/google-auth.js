/**
 * Autenticação no Google por conta de serviço — o pedaço comum dos scripts
 * de `conteudo-seo/`.
 *
 * Nasceu extraído do `gsc.js`, quando o `planejador.js` passou a precisar
 * exatamente das mesmas ~40 linhas de JWT mudando só o escopo. Duas cópias
 * do mesmo assinador divergiriam no primeiro conserto.
 *
 * ----------------------------------------------------------------------
 * Zero dependências
 * ----------------------------------------------------------------------
 * Um JWT assinado com a chave da conta de serviço, trocado por access token.
 * É `crypto` do próprio Node — o `googleapis` arrasta dezenas de megabytes
 * para fazer isto.
 *
 * ----------------------------------------------------------------------
 * Uma credencial serve vários produtos
 * ----------------------------------------------------------------------
 * A mesma conta de serviço vale para Search Console, GA4 e Google Ads: o que
 * muda é o ESCOPO pedido no JWT e onde o e-mail dela foi adicionado como
 * usuário. Por isso `prefixos` aceita mais de um: o `planejador.js` procura
 * `ADS_*` primeiro e cai para `GSC_*`, que o `configurar-gsc.js` já gravou.
 * Quem já ligou o Search Console não reconfigura nada.
 */
const fs = require("fs");
const crypto = require("crypto");

const b64url = (b) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * O Google Cloud entrega DOIS JSONs diferentes, e só um roda sem navegador.
 * Identifica qual chegou pelos NOMES dos campos — nunca lê valor nenhum.
 *
 *   conta de serviço ..... `"type": "service_account"`, `client_email` e
 *                          `private_key`. Autentica sozinha, para sempre.
 *   ID do cliente OAuth .. embrulhado em `installed` ou `web`, com
 *                          `client_secret` e SEM `private_key`. Exige um
 *                          consentimento no navegador, uma vez.
 */
function identificar(bruto) {
  const j = JSON.parse(bruto);
  if (j.type === "service_account" && j.private_key) return { tipo: "servico", j };
  const oauth = j.installed || j.web || j;
  if (oauth.client_id && oauth.client_secret) return { tipo: "oauth", j: oauth };
  return { tipo: "desconhecido", j };
}

/**
 * Conta de serviço vinda de duas envs soltas — a convenção do projeto, porque
 * a Vercel guarda variável e não arquivo (é a forma do `src/lib/analytics.ts`).
 * Devolve também de QUAL prefixo veio, para o `--conferir` poder dizer.
 */
function credencialDoAmbiente(prefixos) {
  for (const p of prefixos) {
    const email = process.env[`${p}_CLIENT_EMAIL`];
    const chave = process.env[`${p}_PRIVATE_KEY`];
    if (email && chave) {
      return {
        origem: `${p}_CLIENT_EMAIL + ${p}_PRIVATE_KEY`,
        client_email: email,
        // O `\n` chega escapado quando o PEM viaja dentro de uma env.
        private_key: chave.replace(/\\n/g, "\n"),
      };
    }
  }
  return null;
}

/** Caminho do JSON baixado — só para uso local. */
function arquivoDoAmbiente(prefixos) {
  for (const p of prefixos) {
    if (process.env[`${p}_CHAVE`]) {
      return { origem: `${p}_CHAVE`, caminho: process.env[`${p}_CHAVE`] };
    }
  }
  return null;
}

/** JWT assinado, trocado por access token. Sem navegador, sem expirar. */
async function tokenDeContaDeServico(cred, escopo) {
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = b64url(
    JSON.stringify({
      iss: cred.client_email,
      scope: escopo,
      aud: "https://oauth2.googleapis.com/token",
      exp: agora + 3600,
      iat: agora,
    })
  );

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

/**
 * Access token de leitura, pelo caminho que a credencial permitir.
 *
 *   escopo ....... string de escopo OAuth do produto que você vai consultar
 *   prefixos ..... prefixos de env a tentar, em ordem (ex.: ["ADS", "GSC"])
 *   refreshToken . só usado se a credencial for ID do cliente OAuth
 */
async function tokenDeAcesso({ escopo, prefixos = ["GSC"], refreshToken }) {
  const doAmbiente = credencialDoAmbiente(prefixos);
  if (doAmbiente) return tokenDeContaDeServico(doAmbiente, escopo);

  const arquivo = arquivoDoAmbiente(prefixos);
  if (!arquivo) {
    throw new Error(
      `Nenhuma credencial encontrada. Procurei, nesta ordem:\n` +
        prefixos.map((p) => `  ${p}_CLIENT_EMAIL + ${p}_PRIVATE_KEY  ou  ${p}_CHAVE`).join("\n")
    );
  }

  const { tipo, j: cred } = identificar(fs.readFileSync(arquivo.caminho, "utf8"));

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
    if (!refreshToken) {
      throw new Error(
        "Este é um ID do cliente OAuth, e falta o refresh token.\n\n" +
          "Duas saídas:\n\n" +
          "  A) RECOMENDADA — crie uma CONTA DE SERVIÇO em vez disto.\n" +
          "     Google Cloud → Credenciais → Criar → Conta de serviço.\n" +
          "     Baixe a chave JSON e adicione o e-mail dela como usuário no\n" +
          "     produto. Autentica sozinha, sem navegador, sem expirar.\n\n" +
          "  B) Obtenha o refresh token uma vez pelo OAuth Playground:\n" +
          "     https://developers.google.com/oauthplayground\n" +
          "     Engrenagem → 'Use your own OAuth credentials' → cole Client ID\n" +
          "     e Secret. No passo 1 use o escopo:\n" +
          `       ${escopo}\n` +
          "     Antes disso, adicione o próprio Playground como URI de\n" +
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
        refresh_token: refreshToken,
      }),
    });
    const j = await r.json();
    if (!j.access_token) throw new Error(`refresh recusado: ${j.error_description || j.error}`);
    return j.access_token;
  }

  return tokenDeContaDeServico(cred, escopo);
}

module.exports = {
  identificar,
  credencialDoAmbiente,
  arquivoDoAmbiente,
  tokenDeAcesso,
  tokenDeContaDeServico,
};
