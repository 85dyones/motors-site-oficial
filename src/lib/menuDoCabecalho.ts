import { NOME_DA_SECAO } from "./guias";

export interface ItemDoMenu {
  href: string;
  rotulo: string;
}

/**
 * Os itens do menu do cabeçalho, como dado.
 *
 * ---------------------------------------------------------------------------
 * Por que fora do `Header.tsx`
 * ---------------------------------------------------------------------------
 * Mesma razão de `colunasDoRodape.ts`, e o docblock de lá conta o incidente que
 * a justifica: `Header` é client component e usa `useTheme()`, então a única
 * guarda possível dentro dele seria ler a FONTE — e a revisão de 2026-09-04
 * mostrou o preço disso no rodapé, onde o teste afirmava que um IDENTIFICADOR
 * aparecia no arquivo em vez de comparar o valor. Aqui é dado puro: o teste
 * compara `href` e `rotulo` com as strings de verdade.
 *
 * ---------------------------------------------------------------------------
 * A ordem é decisão, não acaso
 * ---------------------------------------------------------------------------
 * As três primeiras são as de ação — ver o pátio, dizer o que se procura,
 * vender o seu. `GUIAS MOTORS` entra logo depois delas e antes das
 * institucionais, que é onde o dono pediu em 07/09: quem já leu as três de cima
 * e não converteu é exatamente quem o conteúdo atende.
 *
 * ---------------------------------------------------------------------------
 * Cabe na barra? Medido, não estimado
 * ---------------------------------------------------------------------------
 * A barra tem 68px e uma linha só, e o `CONTATO` já sai abaixo de 1280px por
 * falta de espaço — então o sexto item precisava de prova antes de entrar. Medi
 * no site no ar, clonando um link do próprio nav com o rótulo novo:
 *
 *     viewport   nav antes   nav depois   altura   folga no cabeçalho
 *     1024px     420,8px     538,5px      21,5px   218px
 *     1280px     420,8px     538,5px      21,5px   388px
 *     1290px     546,4px     676,0px      21,5px   260px   (CONTATO visível)
 *     1366px     546,4px     676,0px      21,5px   336px
 *
 * A altura não muda em largura nenhuma — não há quebra de linha —, e sobram
 * 218px no pior caso. Por isso `GUIAS MOTORS` NÃO leva o `hidden desktop:block`
 * do `CONTATO`: ele existe porque faltava espaço, e aqui não falta.
 */
export const MENU_DO_CABECALHO: ItemDoMenu[] = [
  { href: "/estoque", rotulo: "ESTOQUE" },
  { href: "/carro-perfeito", rotulo: "CARRO PERFEITO" },
  { href: "/avaliacao", rotulo: "AVALIE SEU CARRO" },
  // `toUpperCase()` sobre a constante, e não a string escrita à mão: o menu é a
  // SEXTA superfície a nomear a seção, e a revisão do PR #55 provou o custo de
  // deixar uma delas solta — desfazendo a renomeação em seis pontos, a suíte
  // cheia ficava verde e o site servia quatro nomes diferentes.
  //
  // A caixa alta é literal aqui porque é a convenção dos outros cinco rótulos,
  // que não passam por `uppercase` do CSS. Diferente do breadcrumb, este texto
  // não é comparado com nenhum `name` de JSON-LD, então a grafia do DOM é
  // escolha de estilo e não de correção.
  { href: "/guias", rotulo: NOME_DA_SECAO.toUpperCase() },
  { href: "/sobre", rotulo: "A MOTORS" },
  { href: "/contato", rotulo: "CONTATO" },
];
