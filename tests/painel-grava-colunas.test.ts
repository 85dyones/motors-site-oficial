import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CAMPOS_NOSSOS } from "../src/lib/estoqueEscrita";

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
 * O QUE MUDOU EM 2026-08-08. A aba de cards que continha essa escrita saiu do
 * painel: a tela A6 (`/admin/estoque`) e o editor A15 gravam por rota
 * autenticada, e a lista de campos que podem ser gravados é
 * `CAMPOS_NOSSOS`, em `lib/estoqueEscrita.ts`. A guarda mudou de alvo junto —
 * o risco não é mais "grava no JSON e esquece a coluna", é "declara um campo
 * que não é coluna" (o update falha inteiro) ou "volta a escrever do cliente
 * com a anon key".
 *
 * Alcance: leitura estática. Não prova que a escrita chega ao Postgres (só um
 * teste de integração provaria) — prova que a intenção de gravar existe no
 * código, que é onde o bug morava.
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
 * Campos que vivem só no JSON de overrides, por não serem coluna. Lista
 * explícita: se um campo novo do painel não for coluna, ou ele entra aqui
 * com justificativa, ou vira migração.
 */
const SOMENTE_JSON = new Set([
  // Vínculo veículo ↔ destaque rápido. Mora no blob porque as tags são
  // definidas em `site_settings`, não em `estoque_motors`. Quem escreve é a
  // ação em lote da tela A6, via `/api/settings`.
  "quick_tags",
]);

describe("o que o painel edita chega ao banco", () => {
  const colunas = colunasDaTabela();

  it("o parser leu os dois lados — sem vacuidade", () => {
    // Sem isto, uma regex quebrada faria o teste passar vazio.
    expect(colunas.size).toBeGreaterThan(20);
    expect(CAMPOS_NOSSOS.length).toBeGreaterThan(8);
  });

  it("todo campo gravável é coluna real de estoque_motors", () => {
    const fantasmas = CAMPOS_NOSSOS.filter(
      (campo) => !colunas.has(campo) && !SOMENTE_JSON.has(campo),
    );

    expect(
      fantasmas,
      "Campo em CAMPOS_NOSSOS que NÃO é coluna de estoque_motors.\n" +
        "O update do Supabase falha inteiro quando uma coluna não existe —\n" +
        "salvar o veículo passa a devolver erro para todos os campos, não só\n" +
        "para o novo. Crie a migração antes de declarar o campo.\n" +
        "Campos: " + fantasmas.join(", "),
    ).toEqual([]);
  });

  it("`vendido` é gravável — é o que tira o carro da vitrine", () => {
    // Pino nomeado no campo de maior consequência comercial: a home faz
    // `estoque.filter((v) => !v.vendido)` sobre a coluna.
    expect(CAMPOS_NOSSOS).toContain("vendido");
    expect(colunas.has("vendido")).toBe(true);
  });

  it("o painel de configurações não escreve mais em veículo pelo cliente", () => {
    // Era o `.update()` com a anon key dentro do componente — a razão de a
    // policy de UPDATE ser `USING (true)` (AUDITORIA.md §3.4). Se voltar,
    // volta junto a chance de gravar só no JSON.
    expect(
      /\.from\(\s*["'`]estoque_motors["'`]\s*\)/.test(codigoDoPainel),
      "ConfiguracoesClientWrapper voltou a escrever direto em estoque_motors.\n" +
        "A edição de veículo mora em /admin/estoque (A6) e no editor (A15),\n" +
        "que gravam por rota autenticada.",
    ).toBe(false);
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
