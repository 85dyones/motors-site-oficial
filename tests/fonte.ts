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
 * e template), que é onde o caso real mora. Não pretende ser um lexer de
 * JavaScript: literal de regex contendo aspas segue fora do alcance, e é caso
 * que este repositório não tem.
 */
export function lerCodigo(caminho: string): string {
  const fonte = ler(caminho);
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

    saida += c;
    i++;
  }

  return saida;
}
