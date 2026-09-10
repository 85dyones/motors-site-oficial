import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, extname, relative, sep } from "node:path";
import { lerCodigo, semComentarios } from "./fonte";

/**
 * As fronteiras da observabilidade.
 *
 * ---------------------------------------------------------------------------
 * Por que uma trava, e não confiança
 * ---------------------------------------------------------------------------
 * `src/lib/observabilidade.ts` é importada por `src/lib/supabase.ts`, que é
 * importada por NOVE client components. Ou seja: a costura chega ao bundle do
 * navegador de carona, e nada no `tsc` avisa quando isso quebra — o erro
 * aparece no `next build`, ou pior, só em produção.
 *
 * Três fronteiras, e cada uma tem um jeito próprio de ser furada sem querer:
 *
 *  1. **A costura não pode importar servidor.** `server-only` (que nem está
 *     instalado), `next/headers`, `./supabase-server` ou `crypto` no topo
 *     quebram o build do cliente.
 *  2. **O cliente não pode importar a costura.** Ela carrega
 *     `@supabase/supabase-js` e a lógica de gravação; puxá-la para
 *     `observabilidade-cliente.ts` levaria tudo isso ao navegador.
 *  3. **O rastreamento não pode depender de nenhuma das duas.**
 *     `dataLayer.ts` e `telemetry.ts` são o caminho da conversão. Um import
 *     daqui os acoplaria à observabilidade, e `tests/camada-de-dados.test.ts`
 *     já reprova quando `dataLayer.ts` alcança `./supabase`.
 */

const RAIZ = join(__dirname, "..");

function arquivosDeSrc(): string[] {
  const achados: string[] = [];
  function anda(dir: string) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules") anda(caminho);
        continue;
      }
      if ([".ts", ".tsx"].includes(extname(e.name))) achados.push(caminho);
    }
  }
  anda(join(RAIZ, "src"));
  // O CI é Linux e quem escreve está no Windows: sem normalizar, todo
  // `endsWith("/lib/x.ts")` falha em silêncio e a trava fica verde por engano.
  return achados.map((c) => relative(RAIZ, c).split(sep).join("/"));
}

const ARQUIVOS = arquivosDeSrc();

describe("a varredura enxergou o código", () => {
  it("sem vacuidade", () => {
    /* Trava que varre e não acha nada fica verde para sempre. */
    expect(ARQUIVOS.length).toBeGreaterThan(200);
    expect(ARQUIVOS).toContain("src/lib/observabilidade.ts");
    expect(ARQUIVOS).toContain("src/lib/observabilidade-cliente.ts");
    expect(ARQUIVOS).toContain("src/instrumentation.ts");
  });
});

describe("a costura vai ao navegador de carona — e por isso é isomórfica", () => {
  const fonte = lerCodigo("src/lib/observabilidade.ts");

  it.each(['"server-only"', '"next/headers"', "./supabase-server", 'from "crypto"', '"node:'])(
    "não importa %s",
    (proibido) => {
      expect(fonte, `${proibido} quebra o build do cliente`).not.toContain(proibido);
    },
  );

  it("tem guarda explícita de `typeof window`", () => {
    /* A chave de serviço não existe no navegador (`SUPABASE_SERVICE_ROLE_KEY`
       não é `NEXT_PUBLIC_`), então o cliente já nasceria nulo. A guarda é a
       segunda camada, e é ela que documenta a intenção. */
    expect(fonte).toContain('typeof window !== "undefined"');
  });
});

describe("o capturador do navegador não puxa o servidor", () => {
  const fonte = lerCodigo("src/lib/observabilidade-cliente.ts");

  it.each(['"./supabase', '"./observabilidade"', "@supabase", 'from "next/'])(
    "não importa %s",
    (proibido) => {
      expect(fonte, `${proibido} levaria o servidor para o bundle do cliente`).not.toContain(
        proibido,
      );
    },
  );
});

describe("o caminho de conversão não depende da observabilidade", () => {
  it.each([
    "src/lib/dataLayer.ts",
    "src/lib/telemetry.ts",
    "src/components/Turnstile.tsx",
    "src/components/IntegrationsTracker.tsx",
    "src/components/LeadCaptureModal.tsx",
  ])("%s não importa observabilidade", (arquivo) => {
    const fonte = lerCodigo(arquivo);
    expect(fonte).not.toContain("observabilidade");
  });

  it("`next.config.ts` continua sem saber que isto existe", () => {
    /* Era o risco número 1 do desenho com Sentry: o `withSentryConfig` envolve
       este arquivo, que carrega o `redirects()` do alias com o negativo
       `(?!api/)` de que quatro workflows do n8n dependem. Sem fornecedor, o
       arquivo não é tocado — e esta trava é o que mantém assim. */
    expect(lerCodigo("next.config.ts")).not.toContain("observabilidade");
  });
});

describe("só a costura fala com o alertaDeFalha", () => {
  it("nenhum outro arquivo o importa direto", () => {
    /* `alertarFalha` continua sendo o destino do aviso de PARADA — mas quem
       decide o destino é `registrarFalha`. Import direto em outro lugar
       devolveria ao ponto de chamada a decisão que a costura existe para
       obrigar. */
    const infratores = ARQUIVOS.filter((arquivo) => {
      if (arquivo === "src/lib/observabilidade.ts" || arquivo === "src/lib/alertaDeFalha.ts") {
        return false;
      }
      const fonte = semComentarios(readFileSync(join(RAIZ, arquivo), "utf8"));
      return fonte.includes("alertaDeFalha");
    });

    expect(infratores, "o aviso saiu por fora da costura").toEqual([]);
  });
});
