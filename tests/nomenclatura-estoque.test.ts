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

    // 8 arquivos, 14 pontos de acesso — o inventário atual:
    //   lib/supabase.ts (3), lib/estoqueEscrita.ts (2),
    //   api/estoque/[id]/route.ts (2, sendo 1 em comentário),
    //   api/financeiro/margens/consulta/route.ts (2),
    //   api/financeiro/margens/route.ts (2), lib/webhook-dispatcher.ts (1),
    //   app/admin/estoque/page.tsx (1), app/admin/estoque/[id]/page.tsx (1)
    //
    // Eram 10 acessos em 5 arquivos até 2026-08-03. A consulta perdeu um
    // quando a busca por placa foi removida (a coluna não existia então).
    // Em 2026-08-07 entraram os dois arquivos do editor de veículo (tela A15
    // do design doc): a página que carrega o carro e a rota que o grava.
    //
    // Em 2026-08-08 a tabela A6 mudou a distribuição sem mudar o total: a
    // gravação da rota do editor virou `lib/estoqueEscrita.ts`, compartilhada
    // com a rota de lote, e `ConfiguracoesClientWrapper` PERDEU o seu acesso —
    // era o `.update()` do lado do cliente com a anon key que `AUDITORIA.md
    // §3.4` registra como risco. Se ele reaparecer nesta lista, a escrita
    // direta voltou.
    expect(comAcesso.length).toBe(8);

    const total = arquivos.reduce((soma, a) => {
      const ocorrencias = readFileSync(a, "utf8").match(
        /\.from\(\s*["'`]estoque_motors["'`]\s*\)/g
      );
      return soma + (ocorrencias?.length ?? 0);
    }, 0);
    expect(total).toBe(14);
  });
});
