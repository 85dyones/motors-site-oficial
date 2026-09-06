#!/usr/bin/env node
/**
 * Tira o alias da Vercel dos workflows do n8n.
 *
 * O alias `motors-site-oficial.vercel.app` era o endereço do site antes da
 * virada de domínio (2026-08-15). Desde o P4 da `docs/RECOMENDACAO_SEO.md` as
 * PÁGINAS do alias levam 308 para o apex, mas `/api/*` ficou de fora de
 * propósito: os workflows do n8n entravam por lá, e redirect em POST
 * autenticado é como se perde o cabeçalho `Authorization`.
 *
 * Este script fecha a outra ponta — leva os workflows para `motorsstore.com.br`,
 * que é o que permite, depois, derrubar a exceção `(?!api/)` no `next.config.ts`
 * e enfim tirar o alias do circuito.
 *
 * Ensaio por padrão, como `supabase/manutencao/aplicar-migracao.js`:
 *
 *   node scripts/migrar-workflows-para-o-dominio.js            # só mostra
 *   node scripts/migrar-workflows-para-o-dominio.js --gravar   # grava
 *
 * ⚠️ Editar workflow ATIVO com gatilho de agenda pela API já congelou o cron
 * nesta instância (2026-09-04): ele segue `active: true` e não dispara.
 * Depois de gravar, NÃO confie no campo `active` — exija uma execução nova.
 * Se o cron congelar, o conserto conhecido é recriar o workflow (POST), não
 * desativar/ativar.
 */

const fs = require("fs");
const path = require("path");

const ALIAS = "motors-site-oficial.vercel.app";
const APEX = "motorsstore.com.br";
const BASE = "https://n8n.v2o5.com.br/api/v1";

/**
 * Lista explícita, e não "procure e troque em tudo": workflow de outro
 * cliente vive nesta mesma instância (ver a nota sobre 16VC/AENT), e uma
 * troca cega alcançaria o que não é nosso.
 *
 * `Consulta Margens Mínimo - Motors` (CksEZVqbldVmQur3) NÃO entra: a rota
 * `/api/financeiro/margens/consulta` responde 404 desde a aposentadoria do
 * financeiro (2026-08-28). Trocar o host ali seria mudar um ponteiro morto de
 * endereço e dar a impressão de que ele voltou a funcionar.
 */
const ALVOS = [
  "3XdmPXpPxoiP4JWe", // Motors Ciclo — Aviso de Verificação (equipe) — ATIVO, agenda
  "9zYClIJd22nEBWQO", // Motors Ciclo — Orquestrador Diário — ATIVO, agenda
  "4pksuDAXYvQHoVtO", // Motors Ciclo — Vendas Incompletas — inativo, agenda
];

/** O `PUT` público recusa as chaves que o próprio n8n grava (2026-08-12). */
const SETTINGS_PERMITIDAS = [
  "saveExecutionProgress",
  "saveManualExecutions",
  "saveDataErrorExecution",
  "saveDataSuccessExecution",
  "executionTimeout",
  "errorWorkflow",
  "timezone",
  "executionOrder",
];

function lerChave() {
  if (process.env.N8N_API_KEY) return process.env.N8N_API_KEY.trim();
  const env = path.join(__dirname, "..", ".env.local");
  const linha = fs
    .readFileSync(env, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("N8N_API_KEY="));
  if (!linha) throw new Error("N8N_API_KEY não encontrada em .env.local");
  return linha.slice("N8N_API_KEY=".length).trim();
}

const CHAVE = lerChave();

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers: { "X-N8N-API-KEY": CHAVE, "Content-Type": "application/json", ...(opcoes.headers || {}) },
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${opcoes.method || "GET"} ${caminho} -> ${r.status} ${texto.slice(0, 300)}`);
  return JSON.parse(texto);
}

/** Troca o host em toda string do objeto e devolve os caminhos alterados. */
function trocarHost(valor, caminho, achados) {
  if (typeof valor === "string") {
    if (!valor.includes(ALIAS)) return valor;
    achados.push({ caminho, de: valor, para: valor.split(ALIAS).join(APEX) });
    return valor.split(ALIAS).join(APEX);
  }
  if (Array.isArray(valor)) return valor.map((v, i) => trocarHost(v, `${caminho}[${i}]`, achados));
  if (valor && typeof valor === "object") {
    const saida = {};
    for (const [k, v] of Object.entries(valor)) saida[k] = trocarHost(v, `${caminho}.${k}`, achados);
    return saida;
  }
  return valor;
}

async function main() {
  const gravar = process.argv.includes("--gravar");
  console.log(gravar ? "MODO: GRAVAR\n" : "MODO: ensaio (nada é gravado — use --gravar)\n");

  let totalAchados = 0;

  for (const id of ALVOS) {
    const wf = await api(`/workflows/${id}`);
    const achados = [];
    const nodes = trocarHost(wf.nodes, "nodes", achados);
    const connections = trocarHost(wf.connections, "connections", achados);
    totalAchados += achados.length;

    console.log(`── ${wf.name}`);
    console.log(`   id ${id} · active: ${wf.active} · ${achados.length} ocorrência(s) do alias`);
    for (const a of achados) console.log(`   · ${a.caminho}\n     ${a.de}\n     ${a.para}`);
    if (achados.length === 0) {
      console.log("   nada a fazer.\n");
      continue;
    }

    if (!gravar) {
      console.log("   (ensaio — não gravado)\n");
      continue;
    }

    const settings = {};
    for (const k of SETTINGS_PERMITIDAS) {
      if (wf.settings && wf.settings[k] !== undefined) settings[k] = wf.settings[k];
    }

    await api(`/workflows/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name: wf.name, nodes, connections, settings }),
    });

    // Reler do servidor: o PUT devolve 200 sem provar o que ficou gravado.
    const depois = await api(`/workflows/${id}`);
    const sobrou = JSON.stringify(depois.nodes).includes(ALIAS);
    console.log(`   gravado. relido: active=${depois.active} · alias restante: ${sobrou ? "SIM ⚠️" : "não"}\n`);
    if (sobrou) process.exitCode = 1;
  }

  console.log(`total de ocorrências: ${totalAchados}`);
  if (gravar) {
    console.log(
      "\n⚠️ O campo `active` NÃO prova que o cron voltou a registrar.\n" +
        "   Confira uma execução nova antes de dar por feito:\n" +
        "   GET /executions?workflowId=<id>&limit=3",
    );
  }
}

main().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
