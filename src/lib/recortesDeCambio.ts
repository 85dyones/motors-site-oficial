/**
 * Os recortes de câmbio que viram `/estoque/{cambio}`. Hoje, um só:
 * `/estoque/automatico`.
 *
 * ---------------------------------------------------------------------------
 * Por que existe (05/10/2026)
 * ---------------------------------------------------------------------------
 * O Planejador de Palavras-chave (`conteudo-seo/palavras-chave.md`, 05/10/2026)
 * mostrou procura por carro automático usado em Curitiba, e o site não tinha
 * endereço nenhum para ela: o filtro de câmbio de `/estoque` é `?cambio=`, que
 * é `noindex` por regra. O dono pediu a página como rascunho para aprovar.
 *
 * ---------------------------------------------------------------------------
 * Por que lista fechada, e de uma entrada só
 * ---------------------------------------------------------------------------
 * `cambio` chega do feed como texto livre ("Automático", "Automático CVT",
 * "Manual"...). Abrir uma página por valor transformaria cada grafia nova numa
 * URL indexável, que é o que a rota `/estoque/[recorte]` existe para impedir.
 * A lista é fechada como a das faixas de preço, e a página existe sempre,
 * mesmo com a grade vazia.
 *
 * `/estoque/manual` NÃO existe de propósito: ninguém pediu, e a busca medida é
 * pela palavra "automático". Entrada nova aqui é página nova no sitemap; vale
 * conferir a procura antes.
 *
 * ---------------------------------------------------------------------------
 * Por que num módulo próprio, sem importar nada
 * ---------------------------------------------------------------------------
 * Mesmo motivo de `lib/faixasDePreco.ts`: `lib/dataLayer.ts` precisa da lista
 * para classificar `/estoque/automatico`, e ele é importado por client
 * component. **Não acrescente import neste arquivo.**
 *
 * Por isso a regra que diz se um veículo É automático não mora aqui. Ela já
 * existia em `ehAutomatico` (`lib/fichaDoMotor.ts`), que o Garagem Profiler usa
 * desde 25/09, e é aplicada em `hubsDeCambio` (`lib/hubsDeEstoque.ts`). Uma
 * segunda cópia aqui faria o quiz dizer "só automático" com uma conta e a
 * vitrine `/estoque/automatico` listar com outra.
 */

export interface RecorteDeCambio {
  /** Segmento de URL: `/estoque/{slug}`. Renomear é renomear página indexada. */
  slug: string;
  /** Rótulo da trilha e do card de compartilhamento: "Automático". */
  nome: string;
  /** Como aparece nos blocos de navegação: "Automáticos". */
  plural: string;
}

export const RECORTES_DE_CAMBIO: RecorteDeCambio[] = [
  { slug: "automatico", nome: "Automático", plural: "Automáticos" },
];

/** Este segmento de `/estoque/{x}` é um recorte de câmbio? */
export function ehSlugDeCambio(slug: string): boolean {
  return RECORTES_DE_CAMBIO.some((c) => c.slug === slug);
}
