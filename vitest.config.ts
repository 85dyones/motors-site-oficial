import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Configuração do runner de testes (Pacote 0.5, item 4).
 *
 * Os critérios de aceite dos Pacotes 1–9 exigem prova por teste automatizado
 * ("confirme por teste, não por inspeção visual"). Este arquivo inaugura essa
 * infraestrutura — até aqui o projeto não tinha nenhuma.
 *
 * Ambiente `node` por PADRÃO: a maior parte dos testes cobre lógica pura,
 * migrações e invariantes do repositório, e `jsdom` cobra ~1 s de ambiente no
 * arquivo que o declara — medido três vezes, 1,03 a 1,05 s. (A primeira versão
 * desta linha dizia "~17 s". Era número inventado, e a revisão mediu: o
 * `environment` somado dos 134 arquivos é 3,1 s, então 17 não cabia nem no
 * total. Número sem medição num docblock é o que o CLAUDE.md proíbe.)
 *
 * Ele chegou em 07/09, por decisão do dono, e chegou por necessidade e não por
 * gosto: quatro rodadas de revisão mostraram que a FIAÇÃO de um client
 * component — o `onClick` de um botão, o `setState` de um efeito — é invisível
 * para `renderToStaticMarkup`, e que mutações DESTRUTIVAS ali passavam verdes
 * na suíte inteira. O caso era um clique que apagava o texto do dono.
 *
 * Quem precisa dele declara NO ARQUIVO, com `// @vitest-environment jsdom` na
 * primeira linha. Assim o custo fica com quem o usa e nenhum outro teste muda
 * de ambiente. Ver `tests/painel-de-guias-fiacao.test.ts`.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    /**
     * 15 s, e não os 5 s de fábrica.
     *
     * Boa parte das travas deste repositório é asserção de FONTE: varrem
     * `src/` inteiro pelo sistema de arquivos e comparam o que acharam
     * (`nomenclatura-estoque`, `turnstile-estabilidade`, `whatsapp-numero-unico`).
     * Isso é I/O, não cálculo, e no Windows o custo é outro.
     *
     * Medido em 04/09/2026: sozinho o teste mais lento leva 3,1 s — 1,6x de
     * folga contra os 5 s. Não sobra nada para a contenção da suíte cheia, e o
     * resultado é um vermelho SORTEADO: duas rodadas seguidas da mesma árvore
     * acusaram arquivos diferentes, todos com `Test timed out in 5000ms`, todos
     * passando isolados. Vermelho que muda a cada rodada ensina a ignorar
     * vermelho — que é o único jeito de uma regressão de verdade passar.
     *
     * O teto continua existindo: teste realmente pendurado morre em 15 s. O que
     * ele para de fazer é matar teste que só estava na fila.
     */
    testTimeout: 15000,
    // Sem acesso a banco nesta fase: nenhum teste aqui abre conexão.
    // Os testes de RLS do Pacote 1 exigem instância Supabase de teste (ver
    // AUDITORIA.md §5.7) e vão precisar de um projeto/branch dedicado.
  },
});
