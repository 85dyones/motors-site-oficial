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
  return semComentarios(ler(caminho));
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

/**
 * A condição do `if` que envolve `marcadorNoCorpo`, com espaços normalizados.
 *
 * ---------------------------------------------------------------------------
 * Por que a condição INTEIRA, e não uma busca dentro dela
 * ---------------------------------------------------------------------------
 * Escrita em 2026-09-05, depois de a revisão furar a primeira versão do teste
 * que trava o desfecho do funil. Aquela versão proibia a GRAFIA do defeito
 * (`não pode conter === "ganho"`) e afirmava a presença do predicado
 * (`tem que conter ehTipoDeDesfecho(`). As duas juntas ainda deixavam passar
 *
 *     if (ehTipoDeDesfecho(etapa.tipo) && etapa.tipo !== "descartado")
 *
 * — que restaura o defeito exatamente, satisfaz as duas asserções, e ficava
 * verde. Proibir grafia é sempre isso: uma lista do que já se viu.
 *
 * E cobrava caro do lado legítimo. Proibir um literal no corpo INTEIRO de uma
 * função reprova mudanças corretas que passem perto — um `tipo === "ganho" ?
 * valor : null` dez linhas abaixo não tem nada a ver com a decisão travada.
 *
 * Afirmar a condição inteira resolve os dois: `&&` a mais reprova, literal
 * longe da guarda não reprova, e a mensagem de falha mostra o que a guarda
 * virou em vez de dizer que uma regex não casou.
 */
export function condicaoDoIf(fonte: string, marcadorNoCorpo: string): string {
  const alvo = fonte.indexOf(marcadorNoCorpo);
  if (alvo < 0) throw new Error(`marcador ausente na fonte: ${marcadorNoCorpo}`);

  // O `if` mais próximo ANTES do marcador. Por isso o marcador precisa ser a
  // primeira coisa dentro do bloco: qualquer `if` no meio do caminho seria
  // encontrado no lugar do que interessa.
  const abre = fonte.lastIndexOf("if (", alvo);
  if (abre < 0) throw new Error(`nenhum \`if\` antes de: ${marcadorNoCorpo}`);

  const inicio = abre + "if (".length;
  let nivel = 1;
  let i = inicio;
  for (; i < alvo; i++) {
    if (fonte[i] === "(") nivel++;
    else if (fonte[i] === ")") {
      nivel--;
      if (nivel === 0) break;
    }
  }
  if (nivel !== 0) {
    throw new Error(`os parênteses do \`if\` não fecharam antes de: ${marcadorNoCorpo}`);
  }

  return fonte.slice(inicio, i).replace(/\s+/g, " ").trim();
}
