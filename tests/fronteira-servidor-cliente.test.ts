import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { semComentarios } from "./fonte";

/**
 * `src/lib/` é território NEUTRO: nenhum módulo de lá pode arrastar um arquivo
 * `"use client"` para dentro de quem o importa.
 *
 * ---------------------------------------------------------------------------
 * O defeito que pagou por esta trava (2026-09-22)
 * ---------------------------------------------------------------------------
 * `destaquesDoPainel.ts` passou a importar `INTERVALO_MS` de `VitrineTV.tsx`
 * para DERIVAR o número em vez de redigitá-lo — a intenção estava certa, e o
 * teste que a exige continua no repositório (`lista-da-tv-uma-casa-so`). O que
 * estava errado era a origem: `VitrineTV.tsx` tem `"use client"` na primeira
 * linha, e `destaquesDoPainel.ts` é importado por COMPONENTES DE SERVIDOR —
 * entre eles `src/app/page.tsx`, a home pública e indexada, que não desenha
 * `<VitrineTV/>` em lugar nenhum.
 *
 * O sintoma não é erro: é silêncio. O App Router entrega a um módulo de
 * servidor a REFERÊNCIA do módulo cliente, não o corpo dele — e aritmética
 * sobre referência dá `NaN`. Medido em 22/09 numa rota de servidor
 * descartável, com as duas montagens lado a lado e nada mais mudando:
 * `voltaCompletaEmSegundos(6)` renderizou `48` lendo do módulo neutro e `NaN`
 * lendo de `VitrineTV.tsx`. O operador leria "volta completa: NaN segundos"
 * numa tela que compilou limpa.
 *
 * Naquele dia o valor certo ainda chegava, mas por sorte: o único chamador
 * (`CuradoriaDeDestaques.tsx`) também é cliente. O que segurava o número no
 * lugar era uma coincidência de quem chama, e não uma regra.
 *
 * ---------------------------------------------------------------------------
 * Por que a trava lê a FONTE, e não o comportamento
 * ---------------------------------------------------------------------------
 * Porque o Vitest não enxerga esta fronteira. Ele resolve módulo ES puro e
 * ignora a diretiva `"use client"`, então importar a constante do componente
 * devolve 8000 aqui dentro e a suíte fica verde com o defeito no ar. Quem
 * exercita a fronteira de verdade é o `next build` — e nem ele reprova este
 * caso, porque importar cliente de servidor é LEGAL no App Router; o que não é
 * legal é esperar o valor do lado de cá. Não há vermelho para herdar de
 * ferramenta nenhuma: ou a regra se escreve aqui, ou não existe.
 *
 * `import type` fica de fora de propósito — o TypeScript apaga a linha antes de
 * qualquer bundler vê-la, então ela não cria aresta em tempo de execução. São
 * seis, hoje, todas para `PaginaDeEstoque.tsx`, que nem cliente é.
 */

const RAIZ = join(__dirname, "..");

/** Onde um `import` sem extensão pode aterrissar, na ordem em que se tenta. */
const EXTENSOES = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"];

/**
 * `import ... from "x"` e `export ... from "x"`, com a cláusula separada.
 *
 * A cláusula recusa `;`, `(`, `)` e `=` porque nenhum desses cabe entre a
 * palavra e o `from` de um import de verdade — e é o que impede o casamento de
 * escorregar de um `export function` para o `from` de uma linha muito abaixo,
 * arrastando o corpo inteiro no meio.
 */
const DECLARACAO = /(?:^|\n)[ \t]*(?:import|export)[ \t]+([^;()=]*?)from[ \t]*["']([^"']+)["']/g;

/** `import "x";` puro — sem cláusula, e ainda assim aresta de execução. */
const POR_EFEITO = /(?:^|\n)[ \t]*import[ \t]*["']([^"']+)["']/g;

/**
 * A cláusula some na compilação?
 *
 * Cobre as duas grafias: `import type { X } from` e a inline
 * `import { type A, type B } from`. A segunda só é apagada quando TODO
 * especificador é de tipo — um valor no meio traz o módulo junto.
 */
function ehSomenteTipo(clausula: string): boolean {
  const c = clausula.trim();
  if (c === "type" || c.startsWith("type ") || c.startsWith("type{")) return true;

  const chaves = /^\{([^}]*)\}$/.exec(c);
  if (!chaves) return false;
  const nomes = chaves[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return nomes.length > 0 && nomes.every((n) => n.startsWith("type "));
}

/**
 * O arquivo declara `"use client"`?
 *
 * A diretiva só vale como PRIMEIRA instrução do módulo, e é assim que se
 * verifica: comentários descartados, o que sobra tem de começar nela. Um
 * `"use client"` no meio do arquivo é texto morto para o Next, e contá-lo aqui
 * acusaria inocente.
 */
export function ehArquivoCliente(caminhoAbsoluto: string): boolean {
  if (![".ts", ".tsx", ".js", ".jsx"].includes(extname(caminhoAbsoluto))) return false;
  return /^\s*["']use client["']/.test(semComentarios(readFileSync(caminhoAbsoluto, "utf8")));
}

/**
 * Aonde o especificador aterrissa DENTRO do repositório — ou `null`.
 *
 * `null` é resposta legítima e comum: `react`, `next/cache` e
 * `@supabase/supabase-js` moram em `node_modules` e não são assunto desta
 * trava.
 */
function resolverNoRepo(arquivoAbsoluto: string, especificador: string): string | null {
  let base: string;
  if (especificador.startsWith("./") || especificador.startsWith("../")) {
    base = resolve(dirname(arquivoAbsoluto), especificador);
  } else if (especificador.startsWith("@/")) {
    base = join(RAIZ, "src", especificador.slice(2));
  } else {
    return null;
  }

  for (const ext of EXTENSOES) {
    const tentativa = base + ext;
    // `existsSync` sozinho aceita diretório, e diretório não é módulo: sem o
    // `isFile` a extensão vazia casaria com a pasta e as tentativas seguintes
    // nunca rodariam.
    if (existsSync(tentativa) && statSync(tentativa).isFile()) return tentativa;
  }
  return null;
}

/** Os alvos de `arquivo` que sobrevivem à compilação e moram no repositório. */
export function arestasDeValor(fonte: string, arquivoAbsoluto: string): string[] {
  const limpa = semComentarios(fonte);
  const alvos: string[] = [];

  for (const m of limpa.matchAll(DECLARACAO)) {
    if (ehSomenteTipo(m[1])) continue;
    const destino = resolverNoRepo(arquivoAbsoluto, m[2]);
    if (destino) alvos.push(destino);
  }
  for (const m of limpa.matchAll(POR_EFEITO)) {
    const destino = resolverNoRepo(arquivoAbsoluto, m[1]);
    if (destino) alvos.push(destino);
  }

  return alvos;
}

/** Todo `.ts`/`.tsx` sob `src/lib`, em caminho relativo com barra normal. */
function arquivosDeLib(): string[] {
  const achados: string[] = [];
  function anda(dir: string) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, e.name);
      if (e.isDirectory()) {
        anda(caminho);
        continue;
      }
      if ([".ts", ".tsx"].includes(extname(e.name))) achados.push(caminho);
    }
  }
  anda(join(RAIZ, "src", "lib"));
  // O CI é Linux e quem escreve está no Windows — mesma normalização de
  // `fronteira-observabilidade`, pelo mesmo motivo: sem ela todo `endsWith`
  // falha em silêncio e a trava fica verde por engano.
  return achados.map((c) => relative(RAIZ, c).split(sep).join("/"));
}

const ARQUIVOS = arquivosDeLib();

/**
 * A trava só vale se reprovar — e uma varredura que não acha nada fica verde
 * para sempre. Este bloco prova que cada peça enxerga o que diz enxergar,
 * ANTES de o bloco seguinte afirmar que não há infrator.
 */
describe("a varredura enxerga o que diz enxergar", () => {
  it("achou os módulos de lib", () => {
    expect(ARQUIVOS.length).toBeGreaterThan(80);
    expect(ARQUIVOS).toContain("src/lib/destaquesDoPainel.ts");
    expect(ARQUIVOS).toContain("src/lib/ritmoDaVitrine.ts");
  });

  it("reconhece a diretiva onde ela está", () => {
    expect(ehArquivoCliente(join(RAIZ, "src/components/modernist/VitrineTV.tsx"))).toBe(true);
  });

  it("não acusa quem não tem a diretiva", () => {
    // `primitivos.tsx` é o caso que separa "é componente" de "é cliente": mora
    // em `components/`, é importado por valor de dentro de `src/lib`
    // (`textoDosHubs.ts` lê `formatarPreco`) e é NEUTRO. Acusá-lo seria a trava
    // proibindo o que não tem problema.
    expect(ehArquivoCliente(join(RAIZ, "src/components/modernist/primitivos.tsx"))).toBe(false);
    expect(ehArquivoCliente(join(RAIZ, "src/lib/destaquesDoPainel.ts"))).toBe(false);
  });

  it("resolve o import sem extensão até o arquivo", () => {
    // Se o resolvedor devolvesse `null` por não saber somar o `.tsx`, TODA
    // aresta viraria "fora do repositório" e a trava passaria sem olhar nada.
    const alvos = arestasDeValor(
      readFileSync(join(RAIZ, "src/lib/textoDosHubs.ts"), "utf8"),
      join(RAIZ, "src/lib/textoDosHubs.ts"),
    );
    expect(alvos.map((a) => relative(RAIZ, a).split(sep).join("/"))).toContain(
      "src/components/modernist/primitivos.tsx",
    );
  });

  it("reprova o import que pagou por esta trava", () => {
    // A linha EXATA que `destaquesDoPainel.ts` tinha em 22/09. Ela fica aqui
    // para sempre: consertado o arquivo, é este caso sintético que continua
    // provando que a varredura acusa o defeito em vez de só não achá-lo.
    const alvos = arestasDeValor(
      'import { INTERVALO_MS } from "../components/modernist/VitrineTV";\n',
      join(RAIZ, "src/lib/destaquesDoPainel.ts"),
    );
    expect(alvos.filter(ehArquivoCliente)).toHaveLength(1);
  });

  it("deixa passar o mesmo import quando é só de tipo", () => {
    // O contraste do caso acima: mesma origem, mesma pasta, mas a linha some na
    // compilação. Sem esta asserção a trava proibiria as seis `import type` de
    // `PaginaDeEstoque` que o repositório já tem, sem ganho nenhum.
    const alvos = arestasDeValor(
      'import type { Veiculo } from "../components/modernist/VitrineTV";\n',
      join(RAIZ, "src/lib/destaquesDoPainel.ts"),
    );
    expect(alvos).toEqual([]);
  });
});

describe("nenhum módulo de src/lib importa arquivo `use client`", () => {
  it("a fronteira está limpa", () => {
    const infratores: string[] = [];

    for (const arquivo of ARQUIVOS) {
      const absoluto = join(RAIZ, arquivo);
      for (const alvo of arestasDeValor(readFileSync(absoluto, "utf8"), absoluto)) {
        if (ehArquivoCliente(alvo)) {
          infratores.push(`${arquivo} -> ${relative(RAIZ, alvo).split(sep).join("/")}`);
        }
      }
    }

    expect(
      infratores,
      "módulo neutro puxando cliente: o valor vira `NaN` em componente de " +
        "servidor, sem erro de compilação. Mova a constante para um módulo de " +
        "`src/lib/` e importe os dois lados de lá",
    ).toEqual([]);
  });
});
