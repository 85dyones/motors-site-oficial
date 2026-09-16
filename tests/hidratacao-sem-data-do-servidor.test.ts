import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";

/**
 * Trava de fonte para o #418 (erro de hidratação do React nas fichas).
 *
 * A causa, com prova: a ficha é ISR (`revalidate = 3600`) e o HTML sai com a
 * data calculada no SERVIDOR — em UTC, presa ao momento do build ou da
 * regeneração. Num aparelho em fuso adiantado o texto que o servidor mandou
 * já não bate com o que o cliente calcularia ao hidratar, e o React descarta
 * a árvore inteira em vez de só corrigir o texto. Reproduzido em produção: o
 * erro aparece com o relógio do Chromium em `Pacific/Kiritimati` e some com
 * `America/Sao_Paulo`. 21 ocorrências na tabela `erros`, só em fichas, só em
 * navegadores móveis — assinatura de fuso horário, não de aparelho.
 * `Footer.tsx` tem o mesmo padrão com `getFullYear()`; ali o gatilho não é o
 * dia, é a virada do ano.
 *
 * ---------------------------------------------------------------------------
 * Por que trava de fonte, e não renderizar `GeradoEm`/`AnoAtual`
 * ---------------------------------------------------------------------------
 * A preferência é teste de comportamento: montar o componente com
 * `react-dom/server` e conferir que o HTML do servidor não contém data. Duas
 * razões tiraram essa opção da mesa:
 *
 * 1. `GeradoEm` e `AnoAtual` não têm motivo para existir fora do arquivo onde
 *    nasceram — são função privada de um detalhe de renderização. Exportá-los
 *    seria só para este teste, exatamente o caso artificial a evitar.
 * 2. Este repositório TEM ambiente `jsdom` (por arquivo, via
 *    `// @vitest-environment jsdom` — ver `vitest.config.ts`), mas o único
 *    precedente real de uso, `tests/painel-de-guias-fiacao.test.ts`, monta o
 *    componente EXPORTADO de verdade, inteiro, com `createRoot`. Seguir o
 *    mesmo padrão aqui montaria `PDPClientWrapper` inteiro — contexto de
 *    tema, veículo completo, efeitos que chamam API de navegador — só para
 *    observar um `<span>` a dezenas de linhas de distância. Pesado, frágil, e
 *    sem como ensaiar localmente antes do CI (RAM curta nesta máquina: nada
 *    de `npm install` / `vitest` / build).
 *
 * A trava abaixo não precisa de nenhuma das duas coisas: lê o arquivo como
 * texto (via `lerCodigo`, que descarta comentário — ver `tests/fonte.ts`) e
 * confere posição. O preço é não enxergar SEMÂNTICA: ela prova que o padrão
 * `useSyncExternalStore(..., () => null)` está de pé, não que o React o
 * executa sem erro. Quem quiser essa prova mais forte tem o caminho 1 acima,
 * já mapeado, se um dia `jsdom` virar rotina neste arquivo.
 */

/**
 * O trecho de `fonte` entre dois marcadores, do início de um ao início do
 * outro. Assume que `ateMarcador` vem DEPOIS de `doMarcador` no arquivo — é o
 * caso das duas funções isoladas abaixo, que sempre precedem o componente
 * padrão exportado.
 */
function trecho(fonte: string, doMarcador: string, ateMarcador: string): string {
  const inicio = fonte.indexOf(doMarcador);
  expect(inicio, `marcador não encontrado: "${doMarcador}"`).toBeGreaterThan(-1);

  const fim = fonte.indexOf(ateMarcador, inicio);
  expect(fim, `marcador não encontrado depois de "${doMarcador}": "${ateMarcador}"`).toBeGreaterThan(
    inicio,
  );

  return fonte.slice(inicio, fim);
}

describe("ficha de veículo: nada recalcula data fora de GeradoEm", () => {
  const fonte = lerCodigo("src/components/PDPClientWrapper.tsx");

  it("a árvore renderizada não tem `new Date(` nem `toLocaleDateString(`", () => {
    const inicioDaArvore = fonte.indexOf('id="pdp-vehicle-root"');
    // Sem esta trava, um índice -1 vira "os últimos zero caracteres" no
    // `slice` abaixo, e as duas asserções seguintes passariam sem ler nada —
    // a mesma armadilha que a nota de `tests/fonte.ts` descreve.
    expect(inicioDaArvore, 'âncora da raiz "pdp-vehicle-root" não encontrada').toBeGreaterThan(-1);

    const arvoreRenderizada = fonte.slice(inicioDaArvore);
    expect(arvoreRenderizada).not.toMatch(/new Date\(/);
    expect(arvoreRenderizada).not.toMatch(/toLocaleDateString\(/);
  });

  it("`GeradoEm` existe e adia a data com `useSyncExternalStore(..., () => null)`", () => {
    // A asserção anterior só prova AUSÊNCIA na árvore — passaria verde mesmo
    // se `GeradoEm` tivesse sido apagado. Isolar o corpo da função (e não o
    // arquivo inteiro) evita o alarme falso do `import { useSyncExternalStore }`
    // do topo do arquivo, que bateria com `toMatch` mesmo sem o hook rodar.
    const corpo = trecho(fonte, "function GeradoEm", "export default function PDPClientWrapper");

    expect(corpo).toMatch(/useSyncExternalStore/);
    expect(corpo).toMatch(/\(\)\s*=>\s*null/);
  });
});

describe("rodapé: nada recalcula o ano fora de AnoAtual", () => {
  const fonte = lerCodigo("src/components/Footer.tsx");

  it("a árvore renderizada não tem `getFullYear()`", () => {
    const inicioDaArvore = fonte.indexOf("<footer");
    expect(inicioDaArvore, 'âncora da raiz "<footer" não encontrada').toBeGreaterThan(-1);

    const arvoreRenderizada = fonte.slice(inicioDaArvore);
    expect(arvoreRenderizada).not.toMatch(/getFullYear\(\)/);
  });

  it("`AnoAtual` existe e adia o ano com `useSyncExternalStore(..., () => null)`", () => {
    const corpo = trecho(fonte, "function AnoAtual", "export default function Footer");

    expect(corpo).toMatch(/useSyncExternalStore/);
    expect(corpo).toMatch(/\(\)\s*=>\s*null/);
  });
});
