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

    // 10 arquivos, 16 pontos de acesso — o inventário atual:
    //   lib/supabase.ts (5), lib/estoqueEscrita.ts (2),
    //   api/ciclo/vendas/estoque/route.ts (1),
    //   api/estoque/[id]/route.ts (2, sendo 1 em comentário),
    //   api/estoque/route.ts (1),
    //   lib/webhook-dispatcher.ts (1), app/investidor/page.tsx (1),
    //   api/investidores/participacoes/route.ts (1),
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
    //
    // Em 2026-08-17 `lib/supabase.ts` ganhou dois acessos, os dois lendo duas
    // colunas só: `getSinaisDeEstoque` (id, last_seen_at) decide se a PDP
    // anuncia o carro ou o marca como indisponível, e `getCarimbosDeConteudo`
    // (id, conteudo_atualizado_em) alimenta o `lastmod` do sitemap. Nenhum
    // arquivo novo entrou na lista — `lib/publicacao.ts`, criado no mesmo dia,
    // lê `veiculos_vendidos`, que é outra tabela.
    //
    // E o nono arquivo entrou no mesmo dia:
    // `api/ciclo/vendas/estoque/route.ts`, que serve o seletor de veículo do
    // fechamento de venda (A19). É a única leitura que devolve `chassi` e
    // `placa` — documentação interna —, e por isso tem o gate da venda, não o
    // do estoque público.
    //
    // Em 2026-08-22 entrou o décimo: `app/investidor/page.tsx`, a área do
    // investidor. Ele lê SÓ o cartão de identificação do carro (marca, modelo,
    // versão, ano, vendido) para os veículos em que a pessoa entrou na compra.
    // `preco_compra` fica de fora de propósito — o investidor vê o dinheiro
    // dele, não o custo da loja —, e o recorte por pessoa é da RLS de
    // `investidor_veiculos`, não deste `.in()`.
    //
    // E o décimo primeiro, no mesmo dia: a rota de participações de
    // investidor (hoje `api/investidores/participacoes/route.ts`), que serve
    // o seletor de veículo do lançamento. O recorte era o da tela de margens
    // (id, marca, modelo, versao, ano, preco, vendido) — sem `placa`,
    // `chassi` ou `preco_compra`: escolher um carro numa lista não alarga o
    // que o perfil enxerga.
    //
    // Em 2026-08-28 a lista ENCOLHEU pela primeira vez: a aposentadoria do
    // módulo de caixa (decisão do dono — o financeiro renasce sobre o razão
    // do handoff) levou os 4 acessos das duas rotas de margens, e as rotas de
    // investidor mudaram de endereço (/api/financeiro/investidores →
    // /api/investidores). De 11 arquivos e 19 acessos para 9 e 15.
    //
    // Em 2026-08-29 entrou o décimo, e é o primeiro INSERT da lista:
    // `api/estoque/route.ts` ganhou o POST do cadastro nativo (adendo do dono,
    // migração 20260829130000). Até aqui todo acesso era leitura ou UPDATE —
    // veículo só nascia pelo sync do RevendaMais. A escrita continua sendo por
    // rota autenticada, nunca pelo cliente com a anon key (`AUDITORIA.md §3.4`).
    //
    // E no mesmo dia o acesso nº 17, sem arquivo novo: `api/estoque/[id]` passou
    // a ler `origem` antes de montar a atualização, porque é ela que decide se
    // o PREÇO é gravável (só no veículo do painel — no do feed o sync
    // desfaria). A leitura é do BANCO de propósito: aceitar `origem` do corpo
    // deixaria qualquer um reprecificar carro do RevendaMais.
    expect(comAcesso.length).toBe(10);

    const total = arquivos.reduce((soma, a) => {
      const ocorrencias = readFileSync(a, "utf8").match(
        /\.from\(\s*["'`]estoque_motors["'`]\s*\)/g
      );
      return soma + (ocorrencias?.length ?? 0);
    }, 0);
    expect(total).toBe(17);
  });
});
