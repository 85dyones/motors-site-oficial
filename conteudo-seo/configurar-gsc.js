/**
 * Copia `client_email` e `private_key` do JSON da conta de serviço para o
 * `.env.local`, no formato que `analytics.ts` e `gsc.js` esperam.
 *
 * Existe para o segredo NÃO passar por copiar-e-colar: a chave privada é um
 * bloco PEM de várias linhas, e ela precisa virar uma linha só com `\n`
 * escapado. Feito à mão, o erro mais comum é justamente esse — e o sintoma é
 * "invalid_grant", que não diz nada sobre formatação.
 *
 *   node conteudo-seo/configurar-gsc.js <caminho-do-json>
 *
 * Nada é impresso além dos nomes das variáveis e do e-mail da conta, que não
 * é segredo — é o endereço que você adiciona como usuário no Search Console.
 */
const fs = require("fs");
const path = require("path");

const origem = process.argv[2];
if (!origem) {
  console.error("Uso: node conteudo-seo/configurar-gsc.js <caminho-do-json>");
  process.exit(1);
}

const j = JSON.parse(fs.readFileSync(origem, "utf8"));

if (j.type !== "service_account" || !j.private_key) {
  console.error(
    "Este JSON não é de conta de serviço.\n" +
    `Campos encontrados: ${Object.keys(j.installed || j.web || j).join(", ")}\n` +
    "Uma conta de serviço tem `type: service_account` e `private_key`."
  );
  process.exit(1);
}

if (!/BEGIN PRIVATE KEY/.test(j.private_key)) {
  console.error("O campo `private_key` não parece um bloco PEM. Arquivo corrompido?");
  process.exit(1);
}

const ENV = path.join(__dirname, "..", ".env.local");
let conteudo = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : "";

/** Substitui a linha se já existir; acrescenta se não. */
function definir(chave, valor) {
  const linha = `${chave}=${valor}`;
  const re = new RegExp(`^${chave}=.*$`, "m");
  conteudo = re.test(conteudo)
    ? conteudo.replace(re, linha)
    : conteudo.replace(/\s*$/, "\n") + linha + "\n";
}

// O `\n` vira literal: o arquivo .env é linha a linha, e um PEM cru quebraria
// o parsing. `gsc.js` e `analytics.ts` desfazem o escape ao assinar.
const pem = JSON.stringify(j.private_key); // já sai com \n escapado e aspas

definir("GSC_SITE", process.env.GSC_SITE || "sc-domain:motorsstore.com.br");
definir("GSC_CLIENT_EMAIL", j.client_email);
definir("GSC_PRIVATE_KEY", pem);

// A mesma credencial serve o GA4, que está no código e nunca foi configurado.
definir("GA4_CLIENT_EMAIL", j.client_email);
definir("GA4_PRIVATE_KEY", pem);

fs.writeFileSync(ENV, conteudo, "utf8");

console.log("Gravado em .env.local:");
console.log("  GSC_SITE, GSC_CLIENT_EMAIL, GSC_PRIVATE_KEY");
console.log("  GA4_CLIENT_EMAIL, GA4_PRIVATE_KEY  (mesma conta serve os dois)");
console.log(`\nprojeto: ${j.project_id}`);
console.log(`\nAdicione ESTE e-mail como usuário no Search Console`);
console.log(`(Configurações → Usuários e permissões → Adicionar, permissão de leitura):`);
console.log(`\n    ${j.client_email}\n`);
console.log("Falta também: GA4_PROPERTY_ID, se quiser destravar o GA4.");
