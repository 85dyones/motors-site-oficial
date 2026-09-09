import type { Veiculo } from "../types";

/**
 * A grade da seção 01 da home — "Destaques da semana".
 *
 * Até 2026-09-09 ela era `disponiveis.slice(0, 6)` dentro do JSX de
 * `src/app/page.tsx`, sobre um estoque que já vem ordenado por preço efetivo.
 * Na prática: os 6 carros mais caros que estavam no ar, sem curadoria e sem
 * rodízio, pelo tempo que o topo da tabela de preço não mudasse.
 *
 * A regra aqui é a decisão do dono (spec de 2026-09-09): o que ele marca vem
 * primeiro, na ordem em que marcou; o sorteio só completa o que faltar.
 */

/** Quantos carros a grade mostra. Duas linhas de três no desktop. */
export const VAGAS_NA_GRADE = 6;

export interface EntradaDosDestaques {
  /** O estoque publicado e não vendido, na ordem em que a home o recebeu. */
  disponiveis: Veiculo[];
  /** Ids marcados no painel, na ordem da marcação. */
  selecionados: string[];
  /** Ids que o sorteio deve evitar — hoje, os que estão no banner. */
  excluir?: string[];
  /**
   * Injetado para o teste ser determinístico.
   *
   * Sem esta porta, testar o sorteio exigiria travar `Math.random` global ou
   * aceitar teste intermitente — e um teste de aleatório que às vezes passa é
   * pior que nenhum.
   */
  sortear?: () => number;
}

/**
 * Fisher-Yates sobre uma CÓPIA.
 *
 * A lista de entrada é a mesma que a home usa no hero, na busca e no contador
 * de estoque: embaralhar no lugar mudaria a página inteira.
 */
function embaralhar<T>(lista: T[], sortear: () => number): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    // `Math.min(..., i)` porque um dublê pode devolver 1 — `Math.random()`
    // nunca devolve, mas a trava custa nada e evita `undefined` na grade.
    const j = Math.min(Math.floor(sortear() * (i + 1)), i);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

export function montarDestaquesDaSemana({
  disponiveis,
  selecionados,
  excluir = [],
  sortear = Math.random,
}: EntradaDosDestaques): Veiculo[] {
  const porId = new Map(disponiveis.map((v) => [v.id, v]));

  const grade: Veiculo[] = [];
  const jaNaGrade = new Set<string>();

  for (const id of selecionados) {
    if (grade.length >= VAGAS_NA_GRADE) break;
    // Id que não está em `disponiveis` simplesmente não entra: o carro foi
    // vendido, arquivado ou barrado por falta de foto. A lista guarda ids, e
    // quem manda é o estoque — não existe passo de desmarcar.
    const veiculo = porId.get(id);
    if (!veiculo || jaNaGrade.has(id)) continue;
    grade.push(veiculo);
    jaNaGrade.add(id);
  }

  if (grade.length >= VAGAS_NA_GRADE) return grade;

  const fora = new Set(excluir);
  const sorteaveis = disponiveis.filter((v) => !jaNaGrade.has(v.id) && !fora.has(v.id));

  return [...grade, ...embaralhar(sorteaveis, sortear).slice(0, VAGAS_NA_GRADE - grade.length)];
}
