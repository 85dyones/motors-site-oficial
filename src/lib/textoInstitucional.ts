/**
 * Substituição de dados vivos no texto institucional.
 *
 * O manifesto da página "A Motors" usa o tamanho do estoque como argumento
 * central — "o estoque tem N unidades e não 300". Esse número não pode ser
 * escrito à mão: o design doc trazia 75, que era o estoque do dia em que ele
 * foi desenhado, e o estoque gira toda semana. Número errado na frase que
 * pede confiança é o pior lugar possível para um número errado.
 *
 * O texto guarda o marcador `{{total}}` e ele é trocado na renderização.
 * Vale tanto para o padrão que vai no repositório quanto para o que o dono
 * digitar no painel.
 */

/** Marcador aceito no texto institucional. */
export const MARCADOR_TOTAL = "{{total}}";

/**
 * Trecho comparativo do manifesto. Quando o total não está disponível, a
 * frase inteira é substituída por uma versão sem número, em vez de exibir o
 * marcador cru ou chutar uma quantidade.
 */
const TRECHO_COM_NUMERO = /\s*tem \{\{total\}\} unidades e não \d+/;
const TRECHO_SEM_NUMERO = " é do tamanho que é, e não três vezes maior";

export function aplicarTotalEstoque(
  texto: string | null | undefined,
  total: number | null | undefined,
): string {
  if (!texto) return "";
  if (!texto.includes(MARCADOR_TOTAL)) return texto;

  const totalValido =
    typeof total === "number" && Number.isFinite(total) && total > 0;

  if (!totalValido) {
    // Sem estoque legível, a frase perde o trecho comparativo. Se o texto
    // usar o marcador fora dessa frase, o marcador some sem deixar buraco.
    return texto
      .replace(TRECHO_COM_NUMERO, TRECHO_SEM_NUMERO)
      .split(MARCADOR_TOTAL)
      .join("");
  }

  return texto.split(MARCADOR_TOTAL).join(String(total));
}
