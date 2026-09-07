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
 * Cabe na barra? A primeira medição estava errada
 * ---------------------------------------------------------------------------
 * A barra tem 68px e uma linha só, e o `CONTATO` já sai abaixo de 1280px por
 * falta de espaço — então o sexto item pedia prova. A prova que eu escrevi aqui
 * na primeira versão dizia "sobram 218px no pior caso", e a revisão a derrubou:
 * eu somava a largura dos FILHOS da barra e subtraía do total, ignorando os
 * `px-10` (80px) e os `gap` entre eles (20px abaixo do degrau `desktop:`, 36px
 * acima). A folga verdadeira, com o item novo no lugar:
 *
 *     viewport   nav antes   nav depois   folga que eu disse   folga REAL
 *     1024px     420,8px     538,5px      218px                 57,8px
 *     1280px     420,8px     538,5px      388px                208,0px
 *     1281px     546,4px     676,0px      —                    NEGATIVA (ver abaixo)
 *     1290px     546,4px     676,0px      260px                  0,4px
 *     1366px     546,4px     676,0px      336px                 76,4px
 *
 * As larguras do nav estão certas — foram conferidas contra o render real de
 * seis itens, sem clone. O que estava errado era a coluna que sustentava a
 * decisão.
 *
 * ---------------------------------------------------------------------------
 * A faixa de 1281–1289px, que ficou por decidir
 * ---------------------------------------------------------------------------
 * O Chrome avalia `min-width` contra `innerWidth` e faz o layout com
 * `clientWidth` — 15px a menos, por causa da barra de rolagem clássica. Nesses
 * ~9px o degrau `desktop:` já ligou (gap 36px, `CONTATO` visível) e o `xl:` do
 * telefone também, mas a largura prometida não chegou: a barra fica ~8,6px em
 * déficit, e o flex comprime o único filho encolhível com texto — o
 * `<a href="tel:">`, que parte em duas linhas dentro de uma barra de 68px.
 *
 * Sem o item novo isso não acontece. Medido em janela real do Chrome, em
 * `/sobre`: innerWidth 1281–1289 quebra o telefone, 1290 não.
 *
 * É cosmético e mora numa faixa estreita, mas o que ele denuncia não é: a folga
 * acima de 1281px caiu para quase zero, então qualquer crescimento futuro —
 * telefone com DDI, logo mais largo, um CTA maior — cai direto na quebra.
 *
 * As saídas custam coisas diferentes e a escolha é de produto, não de código:
 * trocar `CONTATO` por `GUIAS MOTORS` na faixa 1281–1535px (o `CONTATO` é o
 * item que o design já elegeu como descartável, porque o destino dele está no
 * rodapé e no botão de WhatsApp ao lado), ou segurar o item novo até `2xl`, ou
 * aceitar a quebra. Enquanto não houver decisão, fica ESCRITO aqui — que é o
 * contrário de estar escondido num número errado.
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
