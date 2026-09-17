/**
 * O que a ficha diz quando o laudo NÃO está publicado nela.
 *
 * Mora num módulo puro, e não dentro do JSX, para a trava que guarda esta
 * frase (`tests/coerencia-da-pericia.test.ts`) poder IMPORTAR o valor em vez
 * de garimpá-lo na fonte. As duas tentativas anteriores caíram por isso:
 *
 *   · janela recortada por `indexOf("</div>")` — bastava embrulhar um pedaço
 *     num `<div>` para o resto sair do alcance das guardas;
 *   · constante lida por regex até o `;` da linha — bastava trocar a
 *     concatenação por template literal para a cauda escapar.
 *
 * Layout e sintaxe não podem cegar uma trava de conteúdo. Importando, o teste
 * lê o texto que o componente realmente usa, e não uma aproximação dele.
 *
 * O preço da extração é a fiação ficar nua — constante que ninguém renderiza,
 * ou um `<p>` de texto cru ao lado dela, passariam por fora. Por isso a trava
 * também recorta o bloco no componente e exige que a ÚNICA interpolação lá
 * dentro seja esta: qualquer `{OUTRA_COISA}` reprova.
 */
export const TEXTO_LAUDO_PENDENTE =
  "Este veículo passa por perícia cautelar independente antes de entrar na vitrine — " +
  "estrutura, chassi e histórico de sinistro. O laudo está disponível para consulta, " +
  "solicite ao vendedor a qualquer tempo.";

/**
 * A ponte da ficha para a peça pilar da Onda 1.
 *
 * O bloco do laudo diz que o exame existe e a quem pedir o resultado. O que ele
 * NÃO diz — e é a primeira dúvida de quem lê — é o que o exame cobre. A peça
 * "Laudo cautelar: o que verifica e o que não verifica" responde isso, e desde
 * 17/09/2026 ela é destino em `linksNoTexto.ts`: o título citado aqui vira link.
 *
 * Por que a mesma frase nos dois blocos da ficha e na resposta do FAQ: são as
 * três superfícies onde o assunto aparece, e a régua do site é ter uma verdade
 * só sobre a perícia. Duas redações diferentes viram duas promessas diferentes
 * — o defeito que `coerencia-da-pericia` existe para impedir.
 *
 * A frase não afirma resultado, não fala de prazo e não promete publicação:
 * aponta para o texto que explica o exame.
 */
export const TEXTO_PONTE_DO_GUIA =
  "O que o exame cobre, e o que fica de fora dele, está em " +
  "Laudo cautelar: o que verifica e o que não verifica.";
