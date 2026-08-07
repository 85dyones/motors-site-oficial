import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guarda contra edição do painel que não chega ao banco.
 *
 * O incidente, encontrado em 2026-08-07: o painel gravava `vendido`,
 * `status_tag` e `status_tag_color` APENAS no blob JSON de `stock_overrides`,
 * embora as três sejam colunas reais de `estoque_motors`.
 *
 * Por que passava despercebido: `applyLocalOverrides` (src/lib/supabase.ts)
 * devolve a lista intacta quando roda no servidor —
 * `if (typeof window === "undefined") return veiculos`. A home é Server
 * Component e filtra o estoque com `estoque.filter((v) => !v.vendido)`, lendo
 * a COLUNA. Resultado: marcar um carro como VENDIDO no painel não o tirava da
 * vitrine. Ele seguia anunciado, com CTA de WhatsApp ativo, para um veículo
 * que a loja acabou de vender. No navegador de quem tinha o `localStorage`
 * preenchido o override aparecia — então quem testava do próprio painel via
 * "funcionando".
 *
 * Este teste cruza os três lados: o que o painel deixa editar, o que ele
 * envia ao banco, e o que existe como coluna. Campo editável que é coluna
 * real e não é enviado = violação.
 *
 * Alcance: leitura estática do arquivo do painel. Não prova que a escrita
 * chega ao Postgres (só um teste de integração provaria) — prova que a
 * intenção de gravar existe no código, que é onde o bug morava.
 */

const RAIZ = join(__dirname, "..");
const PAINEL = join(RAIZ, "src", "components", "ConfiguracoesClientWrapper.tsx");
const BASELINE = join(
  RAIZ,
  "supabase",
  "migrations",
  "20260803120000_baseline_inventario.sql",
);

/** Colunas de `estoque_motors`, do baseline + migrações posteriores. */
function colunasDaTabela(): Set<string> {
  const sql = readFileSync(BASELINE, "utf8");
  const inicio = sql.search(/CREATE TABLE IF NOT EXISTS public\.veiculos\s*\(/i);
  const corpo = sql.slice(sql.indexOf("(", inicio) + 1);
  const fim = corpo.search(/^\s*\);/m);

  const colunas = new Set<string>();
  for (const linha of corpo.slice(0, fim).split("\n")) {
    const limpa = linha.trimStart();
    if (limpa.startsWith("--") || limpa === "") continue;
    const m = limpa.match(/^([a-z_][a-z0-9_]*)\s+\S/i);
    if (m) colunas.add(m[1]);
  }

  const dir = join(RAIZ, "supabase", "migrations");
  for (const arq of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (arq === "20260803120000_baseline_inventario.sql") continue;
    const exec = readFileSync(join(dir, arq), "utf8")
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    let m: RegExpExecArray | null;
    const add = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi;
    while ((m = add.exec(exec)) !== null) colunas.add(m[1]);
    const drop = /DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi;
    while ((m = drop.exec(exec)) !== null) colunas.delete(m[1]);
  }
  return colunas;
}

const codigoDoPainel = readFileSync(PAINEL, "utf8");

/**
 * Campos que o painel deixa editar, lidos da união de tipos aceita por
 * `handleOverrideChange` — a porta única por onde toda edição de veículo
 * passa.
 */
function camposEditaveis(): string[] {
  const assinatura = codigoDoPainel.match(
    /const handleOverrideChange\s*=\s*\(\s*id:\s*string,\s*field:\s*([^,]+),/,
  );
  if (!assinatura) throw new Error("Assinatura de handleOverrideChange não encontrada.");
  return [...assinatura[1].matchAll(/"([a-z_][a-z0-9_]*)"/gi)].map((m) => m[1]);
}

/** Campos que o painel envia ao banco (`dbUpdates.<campo> = ...`). */
function camposEnviadosAoBanco(): Set<string> {
  return new Set(
    [...codigoDoPainel.matchAll(/dbUpdates\.([a-z_][a-z0-9_]*)\s*=/gi)].map((m) => m[1]),
  );
}

/**
 * Campos que vivem só no JSON de overrides, por não serem coluna. Lista
 * explícita: se um campo novo do painel não for coluna, ou ele entra aqui
 * com justificativa, ou vira migração.
 */
const SOMENTE_JSON = new Set([
  // Vínculo veículo ↔ destaque rápido. Mora no blob porque as tags são
  // definidas em `site_settings`, não em `estoque_motors`.
  "quick_tags",
]);

describe("o que o painel edita chega ao banco", () => {
  const colunas = colunasDaTabela();
  const editaveis = camposEditaveis();
  const enviados = camposEnviadosAoBanco();

  it("o parser leu os três lados — sem vacuidade", () => {
    // Sem isto, uma regex quebrada faria o teste passar vazio.
    expect(colunas.size).toBeGreaterThan(20);
    expect(editaveis.length).toBeGreaterThan(8);
    expect(enviados.size).toBeGreaterThan(8);
  });

  it("todo campo editável que é coluna real é enviado ao banco", () => {
    const faltando = editaveis
      .filter((campo) => colunas.has(campo) && !enviados.has(campo))
      .filter((campo) => !SOMENTE_JSON.has(campo));

    expect(
      faltando,
      "Campo editável no painel que é COLUNA de estoque_motors mas nunca é\n" +
        "gravado nela. O valor fica só no JSON de stock_overrides, e\n" +
        "`applyLocalOverrides` não roda no servidor — então o site renderizado\n" +
        "no servidor NÃO enxerga a edição. Foi assim que 'marcar como vendido'\n" +
        "deixou de tirar o carro da vitrine.\n" +
        "Campos: " + faltando.join(", "),
    ).toEqual([]);
  });

  it("`vendido` chega ao banco — é o que tira o carro da vitrine", () => {
    // Pino nomeado no campo de maior consequência comercial: a home faz
    // `estoque.filter((v) => !v.vendido)` sobre a coluna.
    expect(enviados.has("vendido")).toBe(true);
  });

  it("campo que só existe no JSON está declarado como tal", () => {
    // Contraprova da lista de exceção: se `quick_tags` virar coluna um dia,
    // esta expectativa falha e obriga a revisar a exceção.
    for (const campo of SOMENTE_JSON) {
      expect(
        colunas.has(campo),
        `\`${campo}\` está em SOMENTE_JSON mas agora é coluna de estoque_motors.\n` +
          "Tire-o da lista e grave no banco.",
      ).toBe(false);
    }
  });
});
