/**
 * Vocabulário de classificação do estoque — carroceria e perfil de uso.
 *
 * As duas listas precisam falar o mesmo vocabulário do feed, porque desde
 * 2026-08-06 o site exibe `tipo` e `perfil_uso` como vêm do banco em vez de
 * adivinhá-los. Escolher aqui um rótulo de outra taxonomia sobrescreve o dado
 * real do veículo por um que o resto do estoque não usa.
 *
 * Vocabulário medido em produção em 2026-08-06, sobre os 88 veículos:
 *   tipo         Hatch, SUV, Sedan, Motocicleta, Picape
 *   perfil_uso   Família / Conforto, Econômico / Diário, Uso Diário,
 *                Performance / Premium, Agilidade / Economia,
 *                Trabalho / Robustez
 *
 * "Premium" não está em `CARROCERIAS`: não é carroceria, era o default
 * inventado que o mapper devolvia quando não sabia — deixá-lo no dropdown
 * permitiria reintroduzir à mão a string que acabou de sair do código.
 *
 * Os quatro rótulos antigos de perfil seguem na lista, ao final: dois veículos
 * carregam "LINHAGEM ESPORTIVA" gravada à mão em stock_overrides, e remover a
 * opção tiraria do dono a chance de reescolher o próprio valor.
 *
 * Estavam declaradas dentro de `ConfiguracoesClientWrapper`, na aba de cards
 * que a tabela A6 substituiu. Vivem aqui para que a tabela e o editor de
 * veículo (A15) ofereçam as mesmas opções.
 */

/**
 * Perua, Van e Utilitário entraram em 2026-08-26.
 *
 * Não é preferência de vocabulário: eram três buracos que empurravam veículo
 * real para a categoria errada, e `generoDoVeiculo.ts` já os documentava —
 * *"perua, van e furgão não têm valor próprio em `CARROCERIAS` — chegam como
 * Hatch ou SUV"*.
 *
 * Medido contra o estoque servido em 2026-08-26: das 36 unidades com hub de
 * carroceria, **20 estavam em Hatch** — o feed do RevendaMais usa "Hatch"
 * como lixeira. Entre elas, duas Kombi, uma Parati e um Bongo, que não são
 * hatch por nenhuma definição.
 *
 * ⚠️ Acrescentar valor aqui obriga a três edições, e o teste cobra as duas
 * últimas (`tests/genero-e-concordancia.test.ts`):
 *   1. esta lista — é o dropdown do painel;
 *   2. `PLURAIS` em `generoDoVeiculo.ts` — escrito, nunca `+ "s"`;
 *   3. `CARROCERIAS_FEMININAS`, se for feminina.
 * E `CARROCERIAS_COM_HUB` passa a gerar `/estoque/{slug}` sozinho, assim que
 * houver um veículo com o valor.
 */
export const CARROCERIAS = [
  "SUV",
  "Sedan",
  "Picape",
  "Hatch",
  "Perua",
  "Van",
  "Utilitário",
  // O pátio gira caminhão leve — o Bongo K-2500 é o caso de hoje. Sem esta
  // linha ele caía em `Utilitário`, que também descreve furgão e picape de
  // trabalho: três coisas diferentes no mesmo balde, e nenhuma vitrine
  // conseguindo dizer "caminhão".
  "Caminhão",
  "Motocicleta",
  "Esportivo",
  "Conversível",
  "Coupe",
  // `Wagon` saiu em 2026-09-01. Era sinônimo de `Perua`, e ter os dois na
  // lista gerava DUAS páginas para a mesma carroceria — `/estoque/perua` e
  // `/estoque/wagon`, as duas respondendo 200, as duas vazias, disputando a
  // mesma consulta. Decisão do dono: *"são de fato a mesma coisa, unifique"*.
  // O dado foi migrado antes (`20260901140000`) e a URL antiga responde 308
  // para a nova — ver `RECORTES_APOSENTADOS` em `lib/hubsDeEstoque.ts`.
] as const;

/**
 * ⚠️ `PERFIS_DE_USO` mudou de casa em 2026-08-26 — vive em `lib/perfisDeUso.ts`.
 *
 * A lista antiga tinha dez valores e era UM por veículo. Medida contra os 38
 * carros servidos, três diziam quase a mesma coisa (19 deles) e quatro
 * — `URBANO & EFICIENTE`, `FORÇA & OFF-ROAD`, `LINHAGEM ESPORTIVA`,
 * `CURADORIA EXCLUSIVA` — estavam em ZERO. Esse último mantinha
 * `/destaques/curadoria` indexado com a vitrine vazia.
 *
 * O vocabulário novo tem oito valores ortogonais, é `text[]` no banco
 * (migração 20260826230000) e cada valor vira `/estoque/{slug}`. Não recrie a
 * lista aqui: o painel e o hub precisam ler a mesma, e este arquivo importa
 * `CARROCERIAS` para o servidor.
 */
