/**
 * Gera o SPOTIFY_REFRESH_TOKEN e grava em `.env.local`.
 *
 * Existe porque o passo manual erra fácil: o refresh token só sai da troca do
 * `code` por token, e copiar algo da barra do navegador traz junto parâmetros
 * que não são o token (`&ubi=…`, `%3D%3D` no fim). O Spotify então devolve
 * `invalid_grant` e não diz o que está errado.
 *
 * Uso, dentro da pasta do projeto:
 *
 *   1. node scripts/spotify-refresh-token.mjs
 *      → imprime a URL de autorização. Abra no navegador logado na conta
 *        Premium da loja e autorize.
 *      → o navegador vai falhar ao abrir 127.0.0.1:8888. É esperado.
 *        Copie o valor de `code=` da barra de endereço (só o code: até o
 *        próximo `&`, se houver).
 *
 *   2. node scripts/spotify-refresh-token.mjs SEU_CODE_AQUI
 *      → troca pelo refresh token e grava em .env.local.
 *
 * Lê CLIENT_ID e CLIENT_SECRET do próprio .env.local — nada de credencial
 * viajando por chat ou por argumento.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CAMINHO = resolve(process.cwd(), ".env.local");
const REDIRECT = "http://127.0.0.1:8888/callback";
const ESCOPOS = [
  // `streaming` é o que permite a TV ser o player (Web Playback SDK).
  "streaming",
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
];

function lerEnv() {
  let texto;
  try {
    texto = readFileSync(CAMINHO, "utf8");
  } catch {
    console.error(`Não achei ${CAMINHO}. Rode este script na raiz do projeto.`);
    process.exit(1);
  }
  const mapa = {};
  for (const linha of texto.split(/\r?\n/)) {
    const i = linha.indexOf("=");
    if (i > 0 && !linha.trimStart().startsWith("#")) {
      mapa[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
    }
  }
  return { texto, mapa };
}

function conferirCredenciais(mapa) {
  const id = mapa.SPOTIFY_CLIENT_ID;
  const segredo = mapa.SPOTIFY_CLIENT_SECRET;
  const problemas = [];

  if (!id) problemas.push("SPOTIFY_CLIENT_ID está vazia.");
  if (!segredo) problemas.push("SPOTIFY_CLIENT_SECRET está vazia.");
  // O engano mais comum: colar o Client ID nos dois campos. O secret fica
  // atrás de um "View client secret" no dashboard e passa despercebido.
  if (id && segredo && id === segredo) {
    problemas.push(
      "SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET têm o MESMO valor.\n" +
        "    O secret é outro: Dashboard → seu app → Settings → View client secret.",
    );
  }
  if (id && !/^[0-9a-f]{32}$/.test(id)) {
    problemas.push("SPOTIFY_CLIENT_ID não parece um ID do Spotify (32 caracteres hex).");
  }
  if (segredo && !/^[0-9a-f]{32}$/.test(segredo)) {
    problemas.push("SPOTIFY_CLIENT_SECRET não parece um secret do Spotify (32 caracteres hex).");
  }

  if (problemas.length) {
    console.error("\n✗ Credenciais do app com problema:\n");
    for (const p of problemas) console.error("  · " + p);
    console.error("");
    process.exit(1);
  }
  return { id, segredo };
}

function gravar(texto, refreshToken) {
  const linha = `SPOTIFY_REFRESH_TOKEN=${refreshToken}`;
  const novo = /^SPOTIFY_REFRESH_TOKEN=.*$/m.test(texto)
    ? texto.replace(/^SPOTIFY_REFRESH_TOKEN=.*$/m, linha)
    : texto.replace(/\s*$/, "\n") + linha + "\n";
  writeFileSync(CAMINHO, novo, "utf8");
}

const { texto, mapa } = lerEnv();
const { id, segredo } = conferirCredenciais(mapa);
const code = process.argv[2];

if (!code) {
  const url =
    "https://accounts.spotify.com/authorize?" +
    new URLSearchParams({
      client_id: id,
      response_type: "code",
      redirect_uri: REDIRECT,
      scope: ESCOPOS.join(" "),
    });
  console.log("\n1. Abra no navegador LOGADO NA CONTA PREMIUM DA LOJA:\n");
  console.log(url);
  console.log("\n2. Autorize. O navegador vai falhar ao abrir 127.0.0.1:8888 — é esperado.");
  console.log("   Na barra de endereço, copie SÓ o valor de `code=`");
  console.log("   (até o próximo `&`, se existir — nada de `&ubi=`, nada de `%3D%3D`).\n");
  console.log("3. Rode:\n");
  console.log("   node scripts/spotify-refresh-token.mjs SEU_CODE_AQUI\n");
  process.exit(0);
}

// Se veio uma URL inteira, uma query string ou um pedaço com fragmento,
// extrai o code em vez de reclamar — é exatamente o engano que este script
// existe para absorver. A ordem importa: fragmento (`#…`) sai por último,
// porque ele fica depois da query.
let limpo = code.trim();
if (limpo.includes("code=")) limpo = limpo.split("code=")[1];
if (limpo.includes("&")) limpo = limpo.split("&")[0];
if (limpo.includes("#")) limpo = limpo.split("#")[0];
if (limpo.includes("%")) limpo = decodeURIComponent(limpo);
limpo = limpo.trim();

if (!/^[A-Za-z0-9_-]+$/.test(limpo)) {
  console.error("\n✗ O code ainda tem caracteres estranhos depois da limpeza.");
  console.error("  Um code é uma string só: letras, números, `_` e `-`.\n");
  process.exit(1);
}

const r = await fetch("https://accounts.spotify.com/api/token", {
  method: "POST",
  headers: {
    Authorization: "Basic " + Buffer.from(`${id}:${segredo}`).toString("base64"),
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code: limpo,
    redirect_uri: REDIRECT,
  }),
});

const corpo = await r.json();

if (!r.ok) {
  console.error(`\n✗ O Spotify recusou (HTTP ${r.status}): ${corpo.error}`);
  console.error(`  ${corpo.error_description ?? ""}\n`);
  if (corpo.error === "invalid_grant") {
    console.error("  Causas usuais:");
    console.error("   · o code já foi usado (é de uso único — gere outro pelo passo 1);");
    console.error("   · o code expirou (vale poucos minutos);");
    console.error("   · o Redirect URI do app no dashboard não é exatamente");
    console.error(`     ${REDIRECT}\n`);
  }
  if (corpo.error === "invalid_client") {
    console.error("  O CLIENT_ID ou o CLIENT_SECRET estão errados.\n");
  }
  process.exit(1);
}

if (!corpo.refresh_token) {
  console.error("\n✗ A resposta veio sem refresh_token. Resposta:", Object.keys(corpo).join(", "), "\n");
  process.exit(1);
}

gravar(texto, corpo.refresh_token);

const concedidos = (corpo.scope ?? "").split(" ").filter(Boolean);
const faltando = ESCOPOS.filter((e) => !concedidos.includes(e));

console.log("\n✓ SPOTIFY_REFRESH_TOKEN gravado em .env.local");
console.log("  escopos concedidos:", concedidos.join(", ") || "(nenhum)");

if (faltando.length) {
  console.log("\n⚠ Faltaram escopos:", faltando.join(", "));
  if (faltando.includes("streaming")) {
    console.log("  Sem `streaming` a TV não vira player. No dashboard, em");
    console.log("  'Which API/SDKs are you planning to use?', marque Web Playback SDK");
    console.log("  e refaça o passo 1.");
  }
}

// Confere o plano na hora: descobrir que a conta é free só quando o primeiro
// comando der 403 é tarde.
//
// `/me` NÃO serve para isso. O campo `product` só vem com o escopo
// `user-read-private`, que este app não pede — e sem ele o campo chega
// `undefined`, que não significa "não é Premium". Uma versão anterior deste
// script tratava ausência como conta free e acusou Premium de graça.
//
// A prova real é mandar um comando de playback. O escolhido é um no-op:
// gravar no aparelho o MESMO volume que ele já reporta. Não muda o som, e
// distingue os dois casos sem ambiguidade — 403 é conta free, 204 é Premium.
const H = { Authorization: "Bearer " + corpo.access_token };

const me = await fetch("https://api.spotify.com/v1/me", { headers: H });
if (me.ok) console.log(`\n  conta: ${(await me.json()).id}`);

const dev = await fetch("https://api.spotify.com/v1/me/player/devices", { headers: H });
const aparelhos = dev.ok ? ((await dev.json()).devices ?? []) : [];

if (aparelhos.length === 0) {
  console.log("\n  Nenhum aparelho Spotify ligado agora — não deu para testar o plano.");
  console.log("  Abra o Spotify na TV ou na caixa da loja e rode de novo para confirmar.");
} else {
  console.log("  aparelhos:", aparelhos.map((d) => `${d.name} [${d.type}]`).join(" | "));
  const alvo = aparelhos.find((d) => d.volume_percent != null);
  if (alvo) {
    const r = await fetch(
      `https://api.spotify.com/v1/me/player/volume?volume_percent=${alvo.volume_percent}&device_id=${alvo.id}`,
      { method: "PUT", headers: H },
    );
    if (r.status === 403) {
      console.log("\n⚠ A conta NÃO é Premium (403 no comando de playback).");
      console.log("  Todo controle de música vai falhar. Não há contorno.");
    } else if (r.ok || r.status === 204) {
      console.log("  plano: Premium ✓ (comando de playback aceito)");
    } else {
      console.log(`  não deu para confirmar o plano: HTTP ${r.status}`);
    }
  }
}
console.log("");
