import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * Guarda de regressão do rename `veiculos` → `estoque_motors` (Pacote 0.5, item 1).
 *
 * Por que este teste existe:
 *
 * O repositório usa o nome da tabela como string literal em `.from("...")`,
 * espalhado por 10 pontos de acesso. Não há constante central — e introduzir
 * uma seria trocar a convenção do repositório, o que CLAUDE.md:61 desaconselha.
 *
 * O risco dessa convenção é que um único ponto esquecido não quebra o build,
 * não quebra o lint e não aparece em code review: quebra em runtime, em
 * produção, e só na rota que ninguém abriu ainda. O painel de margens é o
 * exemplo óbvio — é interno, de baixo tráfego, e falharia silenciosamente.
 *
 * Este teste substitui a constante: varre o código-fonte e falha se o nome
 * antigo reaparecer como tabela. Custa uma varredura de arquivos e elimina a
 * classe inteira de erro.
 */

const RAIZ_SRC = join(__dirname, "..", "src");
const EXTENSOES = new Set([".ts", ".tsx"]);

function arquivosFonte(dir: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) {
      encontrados.push(...arquivosFonte(caminho));
    } else if (EXTENSOES.has(extname(entrada))) {
      encontrados.push(caminho);
    }
  }
  return encontrados;
}

describe("nomenclatura da tabela de inventário", () => {
  const arquivos = arquivosFonte(RAIZ_SRC);

  it("encontra arquivos de código para varrer", () => {
    // Sanidade: se a varredura voltar vazia, os testes abaixo passariam
    // por vacuidade e a guarda inteira seria teatro.
    expect(arquivos.length).toBeGreaterThan(20);
  });

  it("nenhum .from() aponta para a tabela antiga `veiculos`", () => {
    const padrao = /\.from\(\s*["'`]veiculos["'`]\s*\)/;
    const infratores = arquivos
      .filter((a) => padrao.test(readFileSync(a, "utf8")))
      .map((a) => a.replace(RAIZ_SRC, "src"));

    expect(
      infratores,
      `Ponto de acesso ainda apontando para a tabela antiga.\n` +
        `Após o cutover do Pacote 0.5 a tabela chama-se \`estoque_motors\`.\n` +
        `Arquivos: ${infratores.join(", ")}`
    ).toEqual([]);
  });

  it("a tabela nova é de fato referenciada — o rename não apagou os acessos", () => {
    // Contraprova do teste anterior: sem isto, apagar todas as queries do
    // projeto também faria a suíte passar.
    const padrao = /\.from\(\s*["'`]estoque_motors["'`]\s*\)/;
    const comAcesso = arquivos.filter((a) => padrao.test(readFileSync(a, "utf8")));

    // 5 arquivos, 9 pontos de acesso — o inventário completo mapeado no cutover:
    //   lib/supabase.ts (3), api/financeiro/margens/consulta/route.ts (2),
    //   api/financeiro/margens/route.ts (2), lib/webhook-dispatcher.ts (1),
    //   components/ConfiguracoesClientWrapper.tsx (1)
    //
    // Eram 10 até 2026-08-03. A consulta perdeu um acesso quando a busca por
    // placa foi removida — a coluna `placa` não existe e a query nunca achou
    // nada. Ver o comentário em api/financeiro/margens/consulta/route.ts.
    expect(comAcesso.length).toBe(5);

    const total = arquivos.reduce((soma, a) => {
      const ocorrencias = readFileSync(a, "utf8").match(
        /\.from\(\s*["'`]estoque_motors["'`]\s*\)/g
      );
      return soma + (ocorrencias?.length ?? 0);
    }, 0);
    expect(total).toBe(9);
  });
});
