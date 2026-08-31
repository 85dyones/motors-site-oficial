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
 * Segundo incidente, em 2026-08-21 (revisão da Task 9 do Plano de revisões
 * vitalício): o extrator truncava o caminho no primeiro `${` de uma
 * interpolação, então `/api/x/${id}/y` era conferido só como `/api/x` — o
 * prefixo antes da interpolação. Isso nunca deu falso positivo por pura
 * coincidência: toda chamada nesse formato no repositório até então tinha,
 * por acaso, uma rota de coleção de verdade bem naquele prefixo truncado
 * (`/api/estoque`, `/api/ciclo/revisoes`, `/api/financeiro/contas`...). A
 * chamada de saída da Garagem (`/api/ciclo/veiculos/${id}/saida`, cuja única
 * rota é a aninhada `[id]/saida` — não existe coleção em
 * `/api/ciclo/veiculos`) foi a primeira sem essa coincidência a favor, e
 * revelou que o scanner conferia o prefixo estático, não o caminho inteiro.
 *
 * Alcance: pega `fetch("/api/...")` com caminho literal (aspas simples ou
 * duplas — não há interpolação possível nesse formato), e
 * `fetch(` + crase + `/api/.../${expr}/...` + crase + `)` com a interpolação
 * resolvida: cada `${...}` vira o segmento coringa `:param`, que casa contra
 * o segmento dinâmico da rota (`[id]`) do mesmo jeito que `rotaCobre` já
 * fazia para o resto do caminho — então `/api/x/${id}/y` agora é conferido
 * contra `/api/x/[id]/y` de verdade. Ainda escapam, e está tudo bem — o
 * objetivo continua sendo o caso comum, não cobertura total: URL montada
 * numa variável separada antes do `fetch()` (`fetch(url)`) e concatenação
 * com `+` (`fetch("/api/x/" + id)`); nenhuma chamada atual para rota interna
 * usa esse segundo formato.
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

/**
 * Resolve o conteúdo de um template literal que começa em `codigo[inicio]`
 * (logo depois da crase de abertura — o chamador já confirmou que dali para
 * frente é `/api/...`).
 *
 * Cada interpolação `${...}` vira o segmento coringa `:param`. A
 * profundidade de chaves é contada caractere a caractere, não por regex
 * gulosa, para não fechar cedo em algo como `${obj.prop}`. A partir do
 * primeiro `?` fora de uma interpolação, o resto é query string e é
 * descartado — mesma regra que já valia antes desta correção.
 *
 * Devolve também o índice logo depois da crase de fechamento, para
 * `chamadasDeApi` continuar a varredura dali. Uma crase que nunca fecha é
 * tratada como indo até o fim do arquivo, em vez de travar.
 */
function resolverCrase(codigo: string, inicio: number): { caminho: string; fim: number } {
  let caminho = "";
  let cortada = false; // já passamos do "?" — só avança até achar o fechamento
  let i = inicio;
  while (i < codigo.length) {
    const ch = codigo[i];
    if (ch === "`") return { caminho, fim: i + 1 };
    if (ch === "$" && codigo[i + 1] === "{") {
      let profundidade = 1;
      i += 2;
      while (i < codigo.length && profundidade > 0) {
        if (codigo[i] === "{") profundidade++;
        else if (codigo[i] === "}") profundidade--;
        i++;
      }
      if (!cortada) caminho += ":param";
      continue;
    }
    if (ch === "?") cortada = true;
    if (!cortada) caminho += ch;
    i++;
  }
  return { caminho, fim: i };
}

/**
 * Chamadas `fetch("/api/…")` com caminho literal (aspas simples ou duplas —
 * sem interpolação possível nesse formato), e `fetch(\`/api/…\`)` com
 * interpolação resolvida por `resolverCrase`.
 */
function chamadasDeApi(arquivos: string[]): Chamada[] {
  const achadas: Chamada[] = [];
  // aspas: caminho literal, sem interpolação possível — comportamento inalterado
  const reLiteral = /fetch\(\s*['"]\s*(\/api\/[^'"`?\s${]*)/g;
  // crase: só confirma o início; o conteúdo é resolvido por resolverCrase
  const reCrase = /fetch\(\s*`\s*(?=\/api\/)/g;

  for (const arquivo of arquivos) {
    const codigo = readFileSync(arquivo, "utf8");
    const nome = arquivo.replace(RAIZ_SRC, "src");

    reLiteral.lastIndex = 0;
    let mLiteral: RegExpExecArray | null;
    while ((mLiteral = reLiteral.exec(codigo)) !== null) {
      achadas.push({ arquivo: nome, caminho: mLiteral[1].replace(/\/$/, "") });
    }

    reCrase.lastIndex = 0;
    let mCrase: RegExpExecArray | null;
    while ((mCrase = reCrase.exec(codigo)) !== null) {
      const { caminho, fim } = resolverCrase(codigo, reCrase.lastIndex);
      achadas.push({ arquivo: nome, caminho: caminho.replace(/\/$/, "") });
      reCrase.lastIndex = fim;
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
    // Guarda o galho da crase especificamente. As chamadas com aspas simples/
    // duplas já bastam sozinhas para o `chamadas.length > 10` acima — então
    // sabotar `reCrase` (ou `resolverCrase`) para nunca casar/nunca resolver
    // passaria os três testes verdes, descartando em silêncio toda chamada
    // com interpolação. Só existe caminho com `:param` se o galho da crase
    // rodou de verdade; sem esta linha essa regressão é exatamente a
    // cegueira de 2026-08-07 de novo, agora para o formato com crase.
    expect(chamadas.map((c) => c.caminho)).toContain("/api/ciclo/veiculos/:param/saida");
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
