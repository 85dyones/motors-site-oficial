/**
 * Preço promocional — o "por" do "de/por".
 *
 * O dado já existia e o site já o mostrava: `preco_promocional` é coluna do
 * baseline (`20260803120000`), a PDP monta o de/por a partir dela, o CarMatch
 * e as faixas de preço a consultam, e 16 dos 38 veículos ativos estavam em
 * promoção quando isto foi escrito (2026-08-31). O que faltava era a loja
 * conseguir **definir** a promoção: ela só chegava pelo sync do RevendaMais.
 *
 * Por que só agora: `preco_promocional` é coluna do feed. Até a trava total
 * (migrações `20260829130000` e `20260830120000`), qualquer valor escrito pelo
 * painel seria desfeito no ciclo seguinte do n8n — em silêncio, que é o pior
 * jeito. Com a trava, o RevendaMais não sobrescreve mais nenhuma coluna de
 * nenhum veículo, e o motivo do bloqueio deixou de existir. É por isso que
 * este campo vale para o veículo importado também, e não só para o nativo:
 * **todos os 104 veículos de hoje vieram do sync**, e uma promoção que só
 * funcionasse no carro nativo não funcionaria em carro nenhum.
 *
 * ## As três colunas andam juntas
 *
 * Este é o detalhe que faz o carro sair errado se alguém gravar só uma:
 *
 * - `preco_original` — o "de". O preço de tabela.
 * - `preco_promocional` — o "por". **Zero significa "sem promoção"**, e é
 *   assim que o banco e o site já falam (`hasDiscount` exige `> 0`).
 * - `preco` — o preço EFETIVO, o que o cliente paga hoje. É o que a ordenação
 *   da vitrine (`order("preco")`) e o seletor de `/api/estoque` leem.
 *
 * Conferido no dado real: a Saveiro `8335204` está com
 * `preco_original = 68.900`, `preco_promocional = 65.900` e `preco = 65.900`.
 * O sync sempre manteve `preco` igual ao efetivo — quem escrever promoção sem
 * mexer em `preco` deixa a vitrine ordenando pelo preço velho e os "similares"
 * comparando contra um valor que não está mais em lugar nenhum.
 */

/** O valor que significa "sem promoção". Não é `null`: o site testa `> 0`. */
export const SEM_PROMOCAO = 0;

/**
 * Há promoção ativa? Espelha exatamente o `hasDiscount` da PDP
 * (`PDPClientWrapper.tsx`) e do feed — se as duas leituras divergirem, o painel
 * promete uma tarja que a ficha não mostra.
 */
export function temPromocao(
  promocional: number | null | undefined,
  original: number | null | undefined,
): boolean {
  const p = Number(promocional ?? 0);
  const o = Number(original ?? 0);
  return p > 0 && o > 0 && p < o;
}

/** Desconto em porcentagem, para a tela dizer o tamanho do que se está fazendo. */
export function descontoPct(
  promocional: number | null | undefined,
  original: number | null | undefined,
): number | null {
  if (!temPromocao(promocional, original)) return null;
  return (1 - Number(promocional) / Number(original)) * 100;
}

/**
 * O preço que o cliente paga — o que vai para a coluna `preco`.
 *
 * Promoção inválida (maior ou igual ao de tabela) NÃO vira preço efetivo: cai
 * no original. Isto é rede de segurança, não a regra — `recusaDaPromocao`
 * barra antes, para o operador ver o erro em vez de o sistema o engolir.
 */
export function precoEfetivo(
  promocional: number | null | undefined,
  original: number | null | undefined,
): number | null {
  const o = original === null || original === undefined ? null : Number(original);
  if (o === null || Number.isNaN(o)) return null;
  return temPromocao(promocional, o) ? Number(promocional) : o;
}

/**
 * Por que esta promoção não pode ser gravada — `null` quando pode.
 *
 * Devolve texto pronto para a tela porque as três bocas de escrita (cadastro,
 * editor A15 e lote da A6) precisam dizer a mesma coisa ao operador.
 */
export function recusaDaPromocao(
  promocional: number | null | undefined,
  original: number | null | undefined,
): string | null {
  // Ausente ou zero é o estado normal de quase todo carro: sem promoção.
  if (promocional === null || promocional === undefined || Number(promocional) === SEM_PROMOCAO) {
    return null;
  }
  const p = Number(promocional);
  if (Number.isNaN(p)) return "Preço promocional precisa ser um número.";
  if (p < 0) return "Preço promocional não pode ser negativo.";

  const o = original === null || original === undefined ? null : Number(original);
  if (o === null || Number.isNaN(o) || o <= 0) {
    return "Defina o preço anunciado antes da promoção — o desconto é medido contra ele.";
  }
  // Igual ou maior não é promoção: o site não mostraria tarja nenhuma e o
  // valor ficaria no banco parecendo ativo. Recusar é o que evita a promoção
  // fantasma — aquela que existe no painel e não existe na vitrine.
  if (p >= o) {
    return `A promoção precisa ser MENOR que o preço anunciado (${o.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    })}). Para tirar a promoção, deixe o campo em branco.`;
  }
  return null;
}

/**
 * As colunas a gravar para uma promoção — as três, sempre juntas.
 *
 * `preco_original` não é devolvido: ele é a base, não o efeito. Quem muda o
 * preço de tabela usa o campo de preço anunciado, que já grava `preco` e
 * `preco_original` em par (`PRECO_EM_DUAS_COLUNAS`).
 */
export function colunasDaPromocao(
  promocional: number | null | undefined,
  original: number | null | undefined,
): { preco_promocional: number; preco: number | null } {
  const limpo =
    promocional === null || promocional === undefined || Number(promocional) === SEM_PROMOCAO
      ? SEM_PROMOCAO
      : Number(promocional);
  return {
    preco_promocional: limpo,
    preco: precoEfetivo(limpo, original),
  };
}
