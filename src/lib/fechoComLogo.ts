/**
 * As rotas que terminam com o logo grande (`marca/FechoComLogo.tsx`).
 *
 * Mora aqui, e não no componente, porque dois lados leem: a página, que
 * desenha o fecho, e o `Footer` ("use client"), que tira o logo pequeno
 * quando o fecho está logo acima. Constante exportada de módulo cliente não
 * chega ao servidor como valor, e o contrário arrastaria o desenho do logo
 * para o JavaScript do rodapé.
 *
 * Incluir uma rota aqui NÃO desenha o fecho nela: é preciso pôr
 * `<FechoComLogo />` no fim da página. `tests/logo-animado.test.ts` confere
 * que as duas listas batem.
 */
export const ROTAS_COM_FECHO: readonly string[] = ["/", "/sobre"];
