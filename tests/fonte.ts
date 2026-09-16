import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Leitura de fonte para os testes que travam decisão de projeto.
 *
 * Vários invariantes deste repositório não têm como ser verificados em tempo
 * de execução — "nada pode reescrever `document.title`", "o `<h1>` não pode
 * voltar para o componente cliente". Eles se verificam lendo o código.
 *
 * E aí aparece a armadilha que justifica este arquivo: a nota que explica por
 * que algo foi removido normalmente CITA o código removido. Sem descontar os
 * comentários, o teste acusa a própria explicação como se fosse a
 * reincidência — foi o que aconteceu na primeira versão destes testes.
 */

const raiz = join(__dirname, "..");

/** O arquivo como está, comentários incluídos. */
export function ler(caminho: string): string {
  return readFileSync(join(raiz, caminho), "utf8");
}

/**
 * O arquivo sem comentários de bloco nem de linha.
 *
 * ---------------------------------------------------------------------------
 * Por que um varredor, e não dois `replace`
 * ---------------------------------------------------------------------------
 * A versão anterior era `.replace(/\/\*[\s\S]*?\*\//g, "")`, e isso tem um ponto
 * cego que só apareceu em 2026-08-28: `accept="image/*"` num `<input>` de
 * upload. O `/*` DENTRO DA STRING abria um comentário falso, que só fechava no
 * próximo `*\/` de verdade — e tudo no meio sumia.
 *
 * Em `ConfiguracoesClientWrapper.tsx` isso apagava ~700 linhas do que os testes
 * liam. O sintoma é o pior possível: `toContain` falha por motivo errado, e
 * `not.toContain` PASSA sem ler nada. Uma trava que não está lendo o arquivo
 * não avisa que parou de proteger.
 *
 * O varredor abaixo ignora `/*` e `//` dentro de string (aspas simples, duplas
 * e template) e dentro de literal de regex, que é onde os dois casos reais
 * moram.
 *
 * ---------------------------------------------------------------------------
 * Por que ele também precisou conhecer literal de regex
 * ---------------------------------------------------------------------------
 * Mesmo defeito, outra porta, achada em 2026-09-05. Em `/^https?:\/\//i` a
 * barra escapada encosta na barra que FECHA o literal, e o varredor lia esse
 * encontro como `//`: o resto da linha sumia. Sete literais de `src/` caíam
 * nisso — `site.ts` (2), `ciclo/foto.ts` (2), `chatwoot.ts` (1) e
 * `analytics.ts` (2, e ali ia junto o `base64url` inteiro).
 *
 * O que passa a estar coberto: literal de regex reconhecido pelo token
 * anterior (ver `ABRE_LITERAL`) e copiado inteiro, sem interpretação — com
 * `//`, `/*`, aspas ou `[/]` dentro.
 *
 * A ressalva antiga — "literal de regex contendo aspas segue fora do alcance,
 * e é caso que este repositório não tem" — sai daqui pelos dois lados: passou
 * a estar coberta, e o repositório tinha. `src/lib/agenda.ts` escreve
 * `.replace(/[,()"\\]/g, " ")`; no varredor velho a aspa DENTRO do literal
 * abria string, o `\\` seguinte engolia o `]`, a string fechava na aspa de
 * `" "` e a próxima abria de novo — dali até o fim do arquivo a leitura
 * ficava deslocada. O sintoma é o inverso do outro caso: comentário
 * sobrevivendo à varredura, em vez de código sumindo. Nenhuma trava lia esse
 * arquivo pelo varredor, então o defeito só esperava.
 *
 * O que continua fora:
 *   • `/` depois de `)` ou `]` é sempre lido como divisão. Literal em posição
 *     de statement logo depois de um `)` — `if (x) /re/.test(y)` — volta ao
 *     dano antigo. É o caso genuinamente ambíguo, `(a + b) / 2` mora nele, e
 *     este repositório não escreve o outro.
 *   • Template não retoma código dentro de `${}`: a crase abre, a próxima
 *     crase fecha, e comentário aninhado ali sobrevive. É limite de antes.
 *   • Continua não sendo um lexer de JavaScript.
 *
 * O para-choque, para quando o palpite errar: literal de regex não atravessa
 * linha, então erro de leitura não passa da linha em que nasceu. E os dois
 * erros não custam o mesmo — errar para MAIS (ler divisão como literal) copia
 * texto verbatim, e no máximo deixa passar um comentário daquela linha; errar
 * para MENOS é que come código. Na dúvida, este varredor erra para mais.
 */
export function lerCodigo(caminho: string): string {
  return semComentarios(ler(caminho));
}

/**
 * Depois destes, um `/` não pode ser divisão — só pode abrir literal.
 *
 * `)` e `]` ficam de fora de propósito, e `<` também: sem essa exclusão todo
 * `</div>` de um `.tsx` viraria começo de literal.
 */
const ABRE_LITERAL = new Set([
  "(",
  ",",
  "=",
  ">",
  ":",
  "[",
  "{",
  ";",
  "!",
  "&",
  "|",
  "?",
]);

/** ... e depois destas palavras, pelo mesmo motivo. */
const PALAVRA_ABRE_LITERAL =
  /(?:^|[^\w$])(return|typeof|case|in|of|do|else|new|delete|void|throw|yield|await)$/;

/** O que já foi copiado admite um literal de regex a seguir? */
function abreLiteral(saida: string): boolean {
  const cauda = saida.slice(-32).trimEnd();
  if (cauda === "") return true;
  return (
    ABRE_LITERAL.has(cauda[cauda.length - 1]) || PALAVRA_ABRE_LITERAL.test(cauda)
  );
}

/**
 * Onde termina o literal aberto em `inicio`, flags incluídas.
 *
 * `-1` quando não termina na mesma linha — o para-choque. Respeita escape e
 * classe de caracteres, porque `\/` e `[/]` são justamente as duas formas de
 * uma barra aparecer sem fechar o literal.
 */
function fimDoLiteral(fonte: string, inicio: number): number {
  let i = inicio + 1;
  let emClasse = false;

  while (i < fonte.length) {
    const c = fonte[i];
    if (c === "\n" || c === "\r") return -1;

    if (c === "\\") {
      const seguinte = fonte[i + 1];
      if (seguinte === undefined || seguinte === "\n" || seguinte === "\r") {
        return -1;
      }
      i += 2;
      continue;
    }

    if (emClasse) {
      if (c === "]") emClasse = false;
    } else if (c === "[") {
      emClasse = true;
    } else if (c === "/") {
      i++;
      while (i < fonte.length && /[a-z]/i.test(fonte[i])) i++;
      return i;
    }

    i++;
  }

  return -1;
}

/**
 * O varredor, para quem já tem a fonte em mãos.
 *
 * `lerCodigo` cobre o caso comum — um caminho, um arquivo. Testes que varrem
 * `src/` inteiro montam a própria lista e precisam do descarte aplicado ao
 * texto que já leram; foi o caso de `whatsapp-numero-unico` em 2026-09-01, que
 * acusava de infratora uma tela cujo único `wa.me/` estava na nota explicando
 * por que ela NÃO monta o link à mão.
 */
export function semComentarios(fonte: string): string {
  let saida = "";
  let i = 0;

  while (i < fonte.length) {
    const c = fonte[i];
    const prox = fonte[i + 1];

    // Dentro de string: copia até o fechamento, respeitando escape.
    if (c === '"' || c === "'" || c === "`") {
      const aspas = c;
      saida += c;
      i++;
      while (i < fonte.length) {
        saida += fonte[i];
        if (fonte[i] === "\\") {
          if (i + 1 < fonte.length) saida += fonte[i + 1];
          i += 2;
          continue;
        }
        if (fonte[i] === aspas) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Comentário é testado antes de literal, e não por gosto: nenhum literal
    // de regex começa com `/*` nem com `//`, então a ordem não tira caso
    // nenhum do alcance — e é ela que mantém o `{/* nota */}` do JSX sendo
    // comentário, mesmo com `{` abrindo posição de literal.
    if (c === "/" && prox === "*") {
      const fim = fonte.indexOf("*/", i + 2);
      i = fim === -1 ? fonte.length : fim + 2;
      continue;
    }

    if (c === "/" && prox === "/") {
      const fim = fonte.indexOf("\n", i);
      i = fim === -1 ? fonte.length : fim;
      continue;
    }

    // Dentro de literal de regex: copia inteiro, sem ler nada do que há lá.
    if (c === "/" && abreLiteral(saida)) {
      const fim = fimDoLiteral(fonte, i);
      if (fim !== -1) {
        saida += fonte.slice(i, fim);
        i = fim;
        continue;
      }
    }

    saida += c;
    i++;
  }

  return saida;
}
