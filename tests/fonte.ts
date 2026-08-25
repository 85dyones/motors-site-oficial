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

/** O arquivo sem comentários de bloco nem de linha. */
export function lerCodigo(caminho: string): string {
  return ler(caminho)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}
