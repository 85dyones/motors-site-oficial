/**
 * Paginação da faixa "A SEGUIR" da vitrine da TV.
 *
 * A conta é pequena, mas a invariante que ela sustenta não é: o veículo que
 * está grande na tela **precisa** estar entre os que a faixa lista embaixo.
 * Se as duas coisas saírem de sincronia, a TV do showroom passa a apontar
 * para um carro e destacar outro na régua de progresso — e ninguém na loja
 * vai olhar o console para descobrir.
 */

/** Índice onde começa a página que contém `atual`. */
export function inicioDaPagina(atual: number, porPagina: number): number {
  if (porPagina < 1) return 0;
  return Math.floor(Math.max(0, atual) / porPagina) * porPagina;
}

/**
 * A fatia visível da faixa e quantas células vazias completam a página.
 *
 * A última página quase nunca fecha certo. As vazias existem para as células
 * restantes não esticarem: numa grade modular a largura da célula é constante,
 * e a régua continua dividindo a faixa inteira.
 */
export function paginaDaFaixa<T>(
  itens: T[],
  atual: number,
  porPagina: number,
): { inicio: number; visiveis: T[]; vazias: number } {
  const inicio = inicioDaPagina(atual, porPagina);
  const visiveis = itens.slice(inicio, inicio + porPagina);
  return { inicio, visiveis, vazias: Math.max(0, porPagina - visiveis.length) };
}
