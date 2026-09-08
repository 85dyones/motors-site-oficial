/**
 * Core Web Vitals de CAMPO, de graça, pelo CrUX.
 *
 * ---------------------------------------------------------------------------
 * Para que serve
 * ---------------------------------------------------------------------------
 * Todo diagnóstico de desempenho deste projeto foi de LABORATÓRIO — `next
 * build` e tamanho por rota, que medem a máquina que roda o build. O que
 * decide ranking é o CAMPO: o que o comprador sente, no aparelho e na rede
 * dele. Este script lê o CrUX, que é a mesma fonte do relatório de Core Web
 * Vitals do Search Console e o mesmo dado que o Google usa como sinal.
 *
 * A pergunta concreta que ele existe para responder, e que está parada desde
 * 08/09: **a ficha do veículo passa de 200 ms de INP em mobile?** É disso que
 * depende partir o `PDPClientWrapper` em `next/dynamic` (item 3.3 do handoff).
 *
 * Substituiu o `@vercel/speed-insights`, que exige um plano acima do que a
 * conta tem — sem o produto ligado ele injetava script em toda página e não
 * coletava nada.
 *
 * ---------------------------------------------------------------------------
 * A chave, e o 429 que vem antes dela
 * ---------------------------------------------------------------------------
 * Sem chave, a API do PageSpeed responde **429** — e a mensagem fala de
 * "Quota exceeded ... for consumer 'project_number:…'", que não diz "falta
 * chave". A cota anônima é compartilhada com o mundo inteiro e vive esgotada
 * (medido em 2026-09-08, todas as chamadas). Quem topar com isso sem aviso
 * conclui que o domínio não tem dado de campo, e conclui errado.
 *
 * A chave é gratuita e leva cinco minutos:
 *
 *   1. console.cloud.google.com → o mesmo projeto da conta de serviço do GSC
 *   2. "APIs e serviços" → ativar **PageSpeed Insights API**
 *   3. "Credenciais" → "Criar credenciais" → "Chave de API"
 *   4. no `.env.local`:  PAGESPEED_API_KEY=<a chave>
 *
 * Ela não dá acesso a nada da conta: é só um contador de cota. Ainda assim,
 * restrinja a chave à PageSpeed Insights API no painel — chave sem restrição é
 * chave que serve para outra coisa se vazar.
 *
 * ---------------------------------------------------------------------------
 * Uso
 * ---------------------------------------------------------------------------
 *   node conteudo-seo/cwv-de-campo.js              # mobile e desktop
 *   node conteudo-seo/cwv-de-campo.js --mobile     # só mobile
 *   node conteudo-seo/cwv-de-campo.js --csv        # uma linha por medição
 *
 * O `--csv` existe para a série histórica: uma linha por (data, rota,
 * estratégia, métrica), para colar na mesma planilha do baseline de IA
 * (`conteudo-seo/BASELINE_IA.md`). O número de um mês só não vale quase nada;
 * o valor aparece na terceira medição.
 *
 * ---------------------------------------------------------------------------
 * O limite honesto desta fonte
 * ---------------------------------------------------------------------------
 * O CrUX exige amostra mínima. Origem com pouco tráfego responde no TOTAL do
 * domínio e não por URL — e é justamente a URL de ficha que o item 3.3 pede.
 * Quando a linha da ficha vier "sem amostra", não é erro do script: é o CrUX
 * dizendo que não há visitas suficientes naquela URL.
 *
 * Nesse caso o caminho seguinte é `web-vitals` → `dataLayer` → GA4: mede por
 * rota, sem mínimo de amostra, é primeira-parte, e o GTM já está no ar. Custa
 * uma tag e um punhado de linhas — mais trabalho que este script, e a única
 * forma de ter o INP da ficha se o tráfego não bastar.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const CSV = process.argv.includes("--csv");
const ESTRATEGIAS = process.argv.includes("--mobile")
  ? ["mobile"]
  : process.argv.includes("--desktop")
    ? ["desktop"]
    : ["mobile", "desktop"];

const env = fs.existsSync(path.join(RAIZ, ".env.local"))
  ? Object.fromEntries(
      fs
        .readFileSync(path.join(RAIZ, ".env.local"), "utf8")
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
        }),
    )
  : {};

const CHAVE = process.env.PAGESPEED_API_KEY || env.PAGESPEED_API_KEY || "";
const SITE = (env.NEXT_PUBLIC_SITE_URL || "https://motorsstore.com.br").replace(/\/$/, "");

/**
 * As rotas medidas, e por que estas.
 *
 * Uma por TIPO de página, não uma por página: o CrUX agrupa por URL, e medir
 * cinco fichas daria cinco amostras pequenas em vez de uma resposta. A ficha
 * escolhida é a do veículo mais caro do estoque, que é a de galeria maior — o
 * pior caso do INP, que é o que interessa medir.
 */
const ROTAS = [
  ["home", `${SITE}/`],
  ["estoque", `${SITE}/estoque`],
  ["ficha", `${SITE}/carros/fiat/titano/volcano-2-2-16v-4x4-turbo-diesel-automatico-8171616`],
  ["financiamento", `${SITE}/financiamento`],
];

/** Os três que o Google usa como sinal, com o teto de cada um. */
const METRICAS = {
  LARGEST_CONTENTFUL_PAINT_MS: { rotulo: "LCP", bom: 2500, unidade: "ms" },
  INTERACTION_TO_NEXT_PAINT: { rotulo: "INP", bom: 200, unidade: "ms" },
  CUMULATIVE_LAYOUT_SHIFT_SCORE: { rotulo: "CLS", bom: 0.1, unidade: "" },
};

function formatar(chave, metrica) {
  const { rotulo, bom, unidade } = METRICAS[chave];
  if (!metrica) return `${rotulo} —`;
  // O CLS chega multiplicado por 100 (um inteiro), como o CrUX o publica.
  const valor = chave === "CUMULATIVE_LAYOUT_SHIFT_SCORE" ? metrica.percentile / 100 : metrica.percentile;
  const passa = valor <= bom;
  return `${rotulo} ${valor}${unidade} ${passa ? "ok" : "ACIMA"}`;
}

async function medir(url, estrategia) {
  const api =
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed` +
    `?url=${encodeURIComponent(url)}&strategy=${estrategia}&category=performance` +
    (CHAVE ? `&key=${encodeURIComponent(CHAVE)}` : "");

  const r = await fetch(api);
  if (r.status === 429) {
    return { erro: CHAVE ? "429 — cota da SUA chave esgotada; espere e repita" : "429 — sem chave. Ver o cabeçalho deste arquivo: PAGESPEED_API_KEY" };
  }
  if (!r.ok) return { erro: `HTTP ${r.status}` };

  const j = await r.json();
  return {
    url: j.loadingExperience?.metrics ?? null,
    origem: j.originLoadingExperience?.metrics ?? null,
  };
}

(async () => {
  if (!CHAVE) {
    console.log("⚠ Sem PAGESPEED_API_KEY. A cota anônima é compartilhada e vive esgotada —");
    console.log("  o mais provável é 429 em tudo. Ver o cabeçalho deste arquivo.\n");
  }
  if (CSV) console.log("data,rota,estrategia,escopo,metrica,valor,veredito");

  for (const estrategia of ESTRATEGIAS) {
    if (!CSV) console.log(`\n===== ${estrategia.toUpperCase()} =====`);

    for (const [nome, url] of ROTAS) {
      const r = await medir(url, estrategia);

      if (r.erro) {
        if (!CSV) console.log(`  ${nome.padEnd(14)} ${r.erro}`);
        continue;
      }

      // `url` é a medição daquela página; `origem` é o domínio inteiro. A
      // segunda existe porque é ela que responde quando a primeira não tem
      // amostra — e a diferença entre as duas precisa ficar visível, senão o
      // número do domínio passa por número da ficha.
      for (const [escopo, m] of [["url", r.url], ["origem", r.origem]]) {
        if (!m) {
          if (!CSV) console.log(`  ${nome.padEnd(14)} ${escopo.padEnd(7)} (sem amostra no CrUX)`);
          continue;
        }
        if (CSV) {
          const hoje = new Date().toISOString().slice(0, 10);
          for (const chave of Object.keys(METRICAS)) {
            if (!m[chave]) continue;
            const { rotulo, bom } = METRICAS[chave];
            const valor = chave === "CUMULATIVE_LAYOUT_SHIFT_SCORE" ? m[chave].percentile / 100 : m[chave].percentile;
            console.log(`${hoje},${nome},${estrategia},${escopo},${rotulo},${valor},${valor <= bom ? "ok" : "acima"}`);
          }
        } else {
          const linha = Object.keys(METRICAS).map((c) => formatar(c, m[c])).join("   ");
          console.log(`  ${nome.padEnd(14)} ${escopo.padEnd(7)} ${linha}`);
        }
      }
    }
  }

  if (!CSV) {
    console.log("\nO teto de cada um: LCP 2500ms, INP 200ms, CLS 0.1 (percentil 75 do CrUX).");
    console.log("A pergunta parada do item 3.3 é a linha `ficha` / `url` / INP em MOBILE.");
  }
})().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
