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

describe("todo campo do INSERT passa pela fronteira", () => {
  /**
   * A trava estrutural, e o motivo dela é um gesto que já foi feito.
   *
   * Na terceira revisão do pacote, plantaram um campo `referer` cru no objeto
   * do INSERT — do jeito exato que o comentário de `observabilidade.ts`
   * anuncia para o PR 3 ("43 `catch` jogando contexto de requisição aqui") — e
   * os 109 testes ficaram VERDES. A varredura de comportamento não viu porque
   * enumerava campos numa lista, e `referer` não estava nela.
   *
   * A varredura de comportamento foi consertada (agora percorre a saída), mas
   * ela só cobre o que o teste consegue envenenar. Esta aqui cobre o resto:
   * lê o literal do `.insert({…})` e exige que TODA linha de campo passe por
   * `campo(`, `campoObrigatorio(` ou `identificador(`.
   *
   * A allowlist é curta e cada entrada tem motivo escrito. Crescer a allowlist
   * é uma decisão consciente; adicionar campo cru sem tocar nela não compila
   * este teste.
   */

  /** Campos que legitimamente não passam pelos limpadores, e por quê. */
  const FORA_DA_FRONTEIRA: Record<string, string> = {
    origem: "valor fechado do nosso código, nunca do chamador",
    natureza: "valor fechado do nosso código",
    ambiente: "lido de env da Vercel",
    lead_id: "uuid gerado por nós; a coluna tem FK que recusa o resto",
    hash_agrupamento: "calculado aqui, hex por construção",
    suprimidas: "número, não texto",
    extra: "jsonb — passa por `extraSeguro`, que tem as duas garantias",
  };

  it("nenhum campo entra cru no `.insert({…})`", () => {
    const fonte = lerCodigo("src/lib/observabilidade.ts");

    const abre = fonte.indexOf(".insert({");
    expect(abre, "o literal do insert sumiu — a trava perdeu o alvo").toBeGreaterThan(-1);
    const fecha = fonte.indexOf("})", abre);
    expect(fecha, "não achei o fim do literal do insert").toBeGreaterThan(abre);

    const corpo = fonte.slice(abre + ".insert({".length, fecha);

    // `chave:` no começo de uma linha do literal — é a forma de um campo.
    const campos = corpo
      .split("\n")
      .map((l) => l.trim())
      .map((l) => /^([a-z_]+):/.exec(l)?.[1])
      .filter((c): c is string => Boolean(c));

    expect(campos.length, "a trava não enxergou campo nenhum").toBeGreaterThan(10);

    const crus = campos.filter((nome) => {
      if (nome in FORA_DA_FRONTEIRA) return false;
      const linha = corpo.split("\n").find((l) => l.trim().startsWith(`${nome}:`)) ?? "";
      return !/(campo|campoObrigatorio|identificador)\(/.test(linha);
    });

    expect(
      crus,
      "campo entrando cru no INSERT: use `campo()`, `campoObrigatorio()` ou `identificador()`, " +
        "ou acrescente à allowlist deste teste com o motivo escrito",
    ).toEqual([]);
  });

  it("a allowlist não cresceu sem alguém perceber", () => {
    /* Allowlist é a válvula da trava acima, e válvula que ninguém vigia vira
       a porta dos fundos. Sete entradas, cada uma com motivo — mudar o número
       é decisão consciente, e esta linha é onde ela aparece na revisão. */
    expect(Object.keys(FORA_DA_FRONTEIRA)).toHaveLength(7);
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
