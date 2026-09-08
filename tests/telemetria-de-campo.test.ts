import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { lerCodigo } from "./fonte";

/**
 * Core Web Vitals de CAMPO — pelo caminho que não custa plano.
 *
 * ---------------------------------------------------------------------------
 * O problema, que continua de pé
 * ---------------------------------------------------------------------------
 * Todo diagnóstico de desempenho feito neste projeto foi de LABORATÓRIO:
 * `next build` e a tabela de tamanho por rota. Laboratório mede a máquina que
 * roda o build. Campo mede o que o comprador sente, no aparelho e na rede
 * dele — e é o campo que entra no sinal de busca.
 *
 * A consequência prática: a decisão de partir a ficha em `next/dynamic` (item
 * 3.3 do handoff de 08/09) depende de saber se ela passa de 200 ms de INP em
 * mobile, e isso não é observável em laboratório.
 *
 * ---------------------------------------------------------------------------
 * Por que o `@vercel/speed-insights` saiu
 * ---------------------------------------------------------------------------
 * Ele entrou pelo PR #24 e saiu em 2026-09-08: **o dono informou que Speed
 * Insights exige um plano acima do que a conta tem.** Sem o produto ligado no
 * painel, o componente não coleta nada — ele apenas injeta
 * `/_vercel/speed-insights/script.js` em toda página. Script morto no caminho
 * crítico é o oposto do que um pacote de desempenho deveria fazer.
 *
 * ---------------------------------------------------------------------------
 * O que entrou no lugar, e por que é melhor e não só mais barato
 * ---------------------------------------------------------------------------
 * O CrUX — o mesmo dado de campo que alimenta o relatório de Core Web Vitals
 * do Search Console e que o Google usa como sinal. Duas portas:
 *
 *   1. **Search Console → Core Web Vitals.** Zero credencial, zero código: o
 *      dono abre e lê, separado por mobile e desktop, agrupado por grupo de
 *      URL. É onde olhar primeiro.
 *   2. **`conteudo-seo/cwv-de-campo.js`**, para a série histórica. Lê o mesmo
 *      CrUX pela API do PageSpeed e imprime LCP, INP e CLS por rota. Precisa
 *      de uma chave gratuita (`PAGESPEED_API_KEY`): sem chave a API responde
 *      **429**, porque a cota anônima é compartilhada com o mundo inteiro e
 *      vive esgotada — medido em 08/09.
 *
 * A vantagem sobre o Speed Insights não é o preço: é que o CrUX é o dado que o
 * BUSCADOR enxerga. Uma ferramenta de fornecedor mede o que ela mede; o
 * relatório do Search Console mede o que decide o ranking.
 *
 * O limite honesto: o CrUX exige amostra mínima por URL. Origem com pouco
 * tráfego responde no total do domínio e não por ficha — e é justamente a
 * ficha que o item 3.3 precisa. Se o script voltar "sem amostra" para a rota
 * de ficha depois da chave, o caminho seguinte é `web-vitals` → `dataLayer` →
 * GA4: primeira-parte, por rota, sem mínimo, e o GTM já está no ar.
 */

const LAYOUT = "src/app/layout.tsx";
const COLETOR = "conteudo-seo/cwv-de-campo.js";

const pacote = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const dependencias = { ...pacote.dependencies, ...pacote.devDependencies };
const layout = lerCodigo(LAYOUT);

describe("nenhuma telemetria de fornecedor entra pela metade", () => {
  it.each(["@vercel/speed-insights", "@vercel/analytics"])(
    "%s: declarado no package.json e montado no layout andam juntos",
    (pkg) => {
      /*
       * O estado meio-a-meio é o que passa despercebido: dependência instalada
       * e componente não montado é peso no `node_modules` sem efeito;
       * componente montado sem a dependência quebra o build da Vercel, que
       * instala só o que o `package.json` declara.
       */
      const declarado = pkg in dependencias;
      const montado = layout.includes(pkg);

      expect(
        declarado,
        `\`${pkg}\` está ${declarado ? "declarado" : "ausente"} e ${montado ? "montado" : "não montado"} — os dois estados têm de bater`,
      ).toBe(montado);
    },
  );
});

describe("hoje o site não carrega nenhuma das duas", () => {
  it("Speed Insights fora — exige plano que a conta não tem", () => {
    expect(dependencias).not.toHaveProperty("@vercel/speed-insights");
    expect(layout).not.toMatch(/SpeedInsights/);
  });

  it("Analytics fora — a audiência já está no GA4", () => {
    // Este NÃO é sobre plano, e por isso continua valendo se o plano mudar:
    // dois contadores de pageview é ruído, não redundância.
    expect(dependencias).not.toHaveProperty("@vercel/analytics");
    expect(layout).not.toMatch(/@vercel\/analytics/);
  });
});

describe("o caminho de graça existe e é executável", () => {
  it("o coletor de CrUX está no repositório", () => {
    // Tirar o Speed Insights sem pôr nada no lugar deixaria o projeto sem
    // resposta para a mesma pergunta — e a pergunta é que importa, não a
    // ferramenta.
    expect(existsSync(join(process.cwd(), COLETOR)), `${COLETOR} não existe`).toBe(true);
  });

  it("ele lê a chave da env e não a carrega escrita", () => {
    const codigo = readFileSync(join(process.cwd(), COLETOR), "utf8");

    expect(codigo).toMatch(/PAGESPEED_API_KEY/);
    // Uma chave de API colada no repositório é o defeito clássico deste tipo
    // de script utilitário — e este arquivo é público.
    expect(codigo).not.toMatch(/AIza[0-9A-Za-z_-]{10}/);
  });

  it("ele explica o 429, que é o erro que qualquer um vai encontrar primeiro", () => {
    // Sem chave a API responde 429 pela cota anônima compartilhada, e a
    // mensagem do Google fala de "project_number" — não diz "falta chave".
    // Quem topar com isso sem aviso conclui que o domínio não tem dado.
    expect(readFileSync(join(process.cwd(), COLETOR), "utf8")).toMatch(/429/);
  });
});
