import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * Guarda contra `fetch()` para rota de API que não existe.
 *
 * O incidente, encontrado em 2026-08-07 na revisão do painel logado:
 * `CompraForm`, `ContaForm` e `FinanceMargens` chamavam `/api/estoque` — uma
 * rota que nunca existiu. Os três tratavam a falha com `console.error` e
 * seguiam com lista vazia, então nada aparecia quebrado na tela: o seletor
 * "veículo" dos formulários apenas vinha sem opções.
 *
 * O estrago era maior que o formulário. O design doc (A11) diz que a margem
 * real se forma sozinha porque cada despesa de veículo carrega o código do
 * carro. Sem seletor, nenhuma despesa era vinculada — e a tela de margem por
 * veículo exibia "nenhuma movimentação vinculada" indefinidamente. Um 404
 * silencioso desabilitou um módulo inteiro.
 *
 * É a mesma família do bug de coluna fantasma (`colunas-estoque.test.ts`):
 * compila, passa no lint, e só o runtime sabe. Este teste traz a checagem
 * para a suíte.
 *
 * Alcance: pega `fetch("/api/...")` com caminho literal — o formato em que o
 * bug nasceu. URL montada em variável escapa, e está tudo bem: o objetivo é
 * o caso comum, não cobertura total.
 */

const RAIZ = join(__dirname, "..");
const RAIZ_SRC = join(RAIZ, "src");
const DIR_API = join(RAIZ_SRC, "app", "api");
const EXTENSOES = new Set([".ts", ".tsx"]);

/** Rotas existentes: todo diretório sob src/app/api com um route.ts. */
function rotasExistentes(): Set<string> {
  const rotas = new Set<string>();
  const varrer = (dir: string, prefixo: string) => {
    for (const entrada of readdirSync(dir)) {
      const caminho = join(dir, entrada);
      if (!statSync(caminho).isDirectory()) continue;
      const rota = `${prefixo}/${entrada}`;
      if (existsSync(join(caminho, "route.ts")) || existsSync(join(caminho, "route.tsx"))) {
        rotas.add(rota);
      }
      varrer(caminho, rota);
    }
  };
  varrer(DIR_API, "/api");
  return rotas;
}

function arquivosFonte(dir: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) achados.push(...arquivosFonte(caminho));
    else if (EXTENSOES.has(extname(entrada))) achados.push(caminho);
  }
  return achados;
}

/**
 * Casa uma chamada contra as rotas conhecidas, respeitando segmentos
 * dinâmicos: `/api/users/123` casa com a rota `/api/users/[id]`.
 */
function rotaCobre(rota: string, chamada: string): boolean {
  const r = rota.split("/").filter(Boolean);
  const c = chamada.split("/").filter(Boolean);
  if (r.length !== c.length) return false;
  return r.every((seg, i) => /^\[.+\]$/.test(seg) || seg === c[i]);
}

type Chamada = { arquivo: string; caminho: string };

/** Chamadas `fetch("/api/…")` com caminho literal. */
function chamadasDeApi(arquivos: string[]): Chamada[] {
  const achadas: Chamada[] = [];
  // aceita aspas simples, duplas e crase sem interpolação antes do fim do path
  const re = /fetch\(\s*[`"']\s*(\/api\/[^`"'?\s${]*)/g;
  for (const arquivo of arquivos) {
    const codigo = readFileSync(arquivo, "utf8");
    let m: RegExpExecArray | null;
    while ((m = re.exec(codigo)) !== null) {
      achadas.push({
        arquivo: arquivo.replace(RAIZ_SRC, "src"),
        caminho: m[1].replace(/\/$/, ""),
      });
    }
  }
  return achadas;
}

describe("rotas de API chamadas pelo front", () => {
  const rotas = rotasExistentes();
  const chamadas = chamadasDeApi(arquivosFonte(RAIZ_SRC));

  it("o scanner enxergou rotas e chamadas — sem vacuidade", () => {
    // Sem isto, uma regex quebrada faria o teste passar vazio.
    expect(rotas.size).toBeGreaterThan(8);
    expect(chamadas.length).toBeGreaterThan(10);
    expect([...rotas]).toContain("/api/settings");
  });

  it("toda chamada aponta para uma rota que existe", () => {
    const orfas = chamadas
      .filter((c) => ![...rotas].some((r) => rotaCobre(r, c.caminho)))
      .map((c) => `${c.arquivo} → ${c.caminho}`);

    expect(
      [...new Set(orfas)],
      "fetch() para rota de API inexistente. O 404 costuma ser engolido por\n" +
        "um catch com console.error, então a tela não quebra — ela só deixa de\n" +
        "funcionar em silêncio. Foi assim que `/api/estoque` desabilitou o\n" +
        "vínculo de despesa a veículo, e com ele a margem por veículo.\n" +
        "Órfãs:\n  " + [...new Set(orfas)].join("\n  "),
    ).toEqual([]);
  });

  it("`/api/estoque` existe — é o que popula o seletor de veículo", () => {
    // Pino nomeado no incidente: três telas do financeiro dependem dela.
    expect(rotas.has("/api/estoque")).toBe(true);
  });
});
