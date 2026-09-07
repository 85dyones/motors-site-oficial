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
 * A primeira versão deste parágrafo dizia que `Header` é client component e usa
 * `useTheme()`, então "a única guarda possível dentro dele seria ler a FONTE".
 * É falso, e quem prova é o arquivo irmão entregue no MESMO branch dois commits
 * depois: `tests/cabecalho-renderizado.test.ts` mocka `useTheme` em três linhas,
 * renderiza o componente e afirma o HTML servido — e a mutação aplicada DENTRO
 * do `Header.tsx` morre com cinco vermelhos. `useTheme()` não é obstáculo.
 *
 * A razão verdadeira é mais modesta, e é suficiente: a ordem dos itens é uma
 * decisão de produto que outros testes precisam afirmar sem montar o
 * cabeçalho inteiro — `tests/guias-publicam-o-grafo.test.ts` compara a posição
 * de `/guias` entre as telas de ação e as institucionais lendo esta lista
 * direto. Dado exportado torna isso uma linha; dentro do componente, seria um
 * render.
 *
 * O que a extração NÃO faz é substituir a trava de renderização. Foi
 * exatamente essa confusão que abriu o buraco da primeira entrega: as travas
 * liam o dado e nunca o uso, e uma linha no `Header` apagava o item do menu com
 * a suíte verde.
 *
 * E ela também não trava os VALORES. `tests/cabecalho-renderizado.test.ts`
 * compara os rótulos servidos com esta lista, o que prende o acoplamento (a
 * barra serve o campo `rotulo`, na ordem) e é tautológico para o texto: trocar
 * um rótulo aqui muda os dois lados da asserção. Travar os textos exigiria
 * repeti-los no teste, e aí renomear um item legítimo ficaria vermelho sem
 * invariante nenhuma ter mudado.
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
 * Cabe na barra? Estes números são do código que está no ar
 * ---------------------------------------------------------------------------
 * A barra tem 68px e uma linha só, então o sexto item pedia prova. Medido em
 * janela REAL do Chrome (a barra de rolagem clássica come 15px, e é ela que
 * cria a diferença entre a largura que a media query vê e a que o layout tem),
 * varrendo 1266–1300 e 1528–1553 de 1 em 1 px:
 *
 *     viewport   CONTATO    nav       folga na barra
 *     1024px     oculto     538,5px     59px      ← o ponto mais apertado
 *     1280px     oculto     538,5px    209px
 *     1281px     oculto     586,5px     82px      ← degrau `desktop:`, gap 36px
 *     1366px     oculto     586,5px    167px
 *     1535px     oculto     586,5px    336px
 *     1536px     visível    676,0px    247px      ← `2xl:`, o CONTATO volta
 *     1920px     visível    676,0px    326px
 *
 * O telefone fica em UMA linha em toda largura, e a barra em 68px em todas.
 *
 * O ponto mais apertado HOJE é 1024px — e essa é uma condição nova, criada por
 * esta entrega. Dá para provar só com os números acima, sem medir nada: sendo
 * `g` a largura do rótulo `GUIAS MOTORS`, a folga ANTES deste item era
 * `59 + g + 16` a 1024px e `82 − 61,5 + g` a 1281px, porque lá o `CONTATO`
 * ainda aparecia. A diferença é −54,5px para qualquer `g`: antes, o aperto
 * morava em 1281px. Este item comeu `g + 16` justamente ali, o que é a razão
 * de o `CONTATO` ter subido para `2xl:`.
 *
 * Não escreva aqui que o aperto "é anterior a este item". Era o que a primeira
 * versão dizia, e a revisão derrubou com a aritmética da própria tabela.
 *
 * ---------------------------------------------------------------------------
 * O histórico desta tabela, porque ele é a lição
 * ---------------------------------------------------------------------------
 * Ela esteve errada DUAS vezes, de jeitos diferentes, e as duas foram pegas na
 * revisão e não por mim:
 *
 * 1. **Conta errada.** A primeira versão dizia "sobram 218px no pior caso": eu
 *    somava a largura dos FILHOS da barra e subtraía do total, ignorando os
 *    `px-10` (80px) e os `gap` (20px abaixo do degrau `desktop:`, 36px acima).
 *    A folga real a 1024px era 57,8px, não 218.
 *
 * 2. **Conta certa, código velho.** A correção media o código de então, em que
 *    `CONTATO` aparecia a partir de 1281px: com os dois itens a folga caía para
 *    0,4px em 1290 e ficava NEGATIVA entre 1281 e 1289 — o Chrome liga o
 *    `desktop:` pelo `innerWidth` e faz layout com 15px a menos, a barra entra
 *    em déficit e o flex comprime o único filho encolhível com texto: o
 *    `<a href="tel:">`, que partia em duas linhas.
 *
 *    Aquilo foi resolvido no commit seguinte — `CONTATO` subiu para `2xl:`,
 *    decisão do dono em 07/09 — e a tabela ficou descrevendo o código que
 *    deixou de existir. Um docblock que o `Header.tsx` cita como prova.
 *
 * A moral vale mais que os números: medição envelhece em um commit, e prova
 * citada por outro arquivo envelhece junto. Quem mexer no menu ou no degrau do
 * `CONTATO` remede e reescreve isto aqui.
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
