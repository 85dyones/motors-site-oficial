#!/usr/bin/env node
/**
 * Cópias de TESTE dos workflows do atendimento, apontando para o preview do
 * branch na Vercel (2026-10-20).
 *
 * O dono decidiu testar o atendimento 2.0 no branch paralelo antes do merge
 * (*"só entra 100%"*). Os workflows versionados chamam `motorsstore.com.br`,
 * que roda a `main`; o teste precisa do preview do branch, que fica atrás da
 * proteção da Vercel. Este script gera, a partir dos versionados:
 *
 *   - nome com "TESTE", para não confundir com os de produção no n8n;
 *   - webhook da Evolution em outro caminho (`atendimento-evolution-teste`),
 *     para a importação não brigar com o workflow de produção;
 *   - toda chamada ao site trocada para o endereço do preview, com o cabeçalho
 *     `x-vercel-protection-bypass` (o segredo de "Protection Bypass for
 *     Automation" do projeto na Vercel);
 *   - importados DESLIGADOS, como os versionados.
 *
 * O segredo vem do ambiente, nunca da linha de comando nem do repositório
 * (ele é PÚBLICO), e a saída vai para `n8n-teste/`, que o `.gitignore` ignora:
 *
 *   VERCEL_AUTOMATION_BYPASS_SECRET=... node scripts/workflows-do-atendimento-para-teste.js \
 *     --site https://motors-site-oficial-git-claude-9d2369-dyones-projects-a2f07575.vercel.app
 *
 * Com a proteção dos previews desligada, `--sem-bypass` dispensa o segredo.
 */

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS, como os outros de scripts/: roda com `node` puro */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PRODUCAO = "https://motorsstore.com.br";
const PREFIXO_DAS_ROTAS = `${PRODUCAO}/api/atendimento/`;
const CABECALHO_DO_BYPASS = "x-vercel-protection-bypass";
const PASTA_DE_SAIDA = "n8n-teste";
const VERSIONADOS = ["Motors Atendimento — Entrada (Evolution).json", "Motors Atendimento — Rodada.json"];

/** O endereço do preview: https, sem caminho, e nunca o de produção. */
function siteDeTeste(site) {
  let url;
  try {
    url = new URL(String(site ?? ""));
  } catch {
    throw new Error("--site precisa ser o endereço do preview, como https://motors-site-oficial-git-….vercel.app");
  }
  if (url.protocol !== "https:") throw new Error("--site precisa ser https.");
  if (url.pathname !== "/" || url.search || url.hash) throw new Error("--site é só o endereço, sem caminho.");
  if (/(^|\.)motorsstore(oficial)?\.com\.br$/.test(url.hostname)) {
    throw new Error("--site não pode ser o domínio de produção: ele roda a main, e o teste é do branch.");
  }
  return url.origin;
}

/**
 * Um workflow versionado virando a cópia de teste. Não mexe no original.
 * Recusa o que não reconhece em vez de trocar às cegas: uma URL fora das rotas
 * do atendimento ou um nó que já manda cabeçalho próprio.
 */
function paraTeste(workflow, opcoes) {
  const site = siteDeTeste(opcoes.site);
  const bypass = opcoes.bypass == null ? null : String(opcoes.bypass).trim();
  if (opcoes.bypass != null && !bypass) throw new Error("O segredo do bypass veio vazio.");

  const copia = structuredClone(workflow);
  copia.name = String(copia.name).replace("Motors Atendimento", "Motors Atendimento TESTE");
  copia.active = false;

  for (const no of copia.nodes) {
    const p = no.parameters ?? {};
    if (no.type === "n8n-nodes-base.webhook") {
      p.path = `${p.path}-teste`;
      no.webhookId = crypto.randomUUID();
    }
    if (no.type === "n8n-nodes-base.httpRequest") {
      if (typeof p.url !== "string" || !p.url.startsWith(PREFIXO_DAS_ROTAS)) {
        throw new Error(`O nó "${no.name}" chama um endereço que este script não conhece: ${p.url}`);
      }
      p.url = site + p.url.slice(PRODUCAO.length);
      if (bypass) {
        if (p.sendHeaders || p.headerParameters) throw new Error(`O nó "${no.name}" já manda cabeçalhos; revise o script.`);
        p.sendHeaders = true;
        p.specifyHeaders = "keypair";
        p.headerParameters = { parameters: [{ name: CABECALHO_DO_BYPASS, value: bypass }] };
      }
    }
  }
  return copia;
}

function principal(argv, env) {
  const i = argv.indexOf("--site");
  const site = i >= 0 ? argv[i + 1] : undefined;
  const semBypass = argv.includes("--sem-bypass");
  const bypass = semBypass ? null : env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!semBypass && !String(bypass ?? "").trim()) {
    throw new Error("Falta VERCEL_AUTOMATION_BYPASS_SECRET no ambiente (ou --sem-bypass, com a proteção dos previews desligada).");
  }
  const raiz = path.join(__dirname, "..");
  const saida = path.join(raiz, PASTA_DE_SAIDA);
  fs.mkdirSync(saida, { recursive: true });
  for (const nome of VERSIONADOS) {
    const original = JSON.parse(fs.readFileSync(path.join(raiz, nome), "utf-8"));
    const copia = paraTeste(original, { site, bypass });
    const destino = path.join(saida, `${copia.name}.json`);
    fs.writeFileSync(destino, `${JSON.stringify(copia, null, 2)}\n`);
    console.log(`Gravado: ${path.relative(raiz, destino)}`);
  }
  console.log("Importe no n8n DESLIGADOS. O webhook de teste da Evolution é .../webhook/atendimento-evolution-teste.");
}

if (require.main === module) {
  try {
    principal(process.argv.slice(2), process.env);
  } catch (erro) {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exit(1);
  }
}

module.exports = { paraTeste, siteDeTeste, CABECALHO_DO_BYPASS, PASTA_DE_SAIDA, VERSIONADOS };
