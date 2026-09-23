/**
 * Os dois números do ritmo da TV do showroom — num módulo NEUTRO.
 *
 * ---------------------------------------------------------------------------
 * Por que não moram mais dentro do componente
 * ---------------------------------------------------------------------------
 * Os dois nasceram em `VitrineTV.tsx`, que tem `"use client"` na primeira
 * linha, e de lá foram sendo lidos por quem é servidor: `POR_PAGINA` por
 * `/vitrine/page.tsx` desde sempre, e `INTERVALO_MS` por `destaquesDoPainel.ts`
 * a partir de 2026-09-22. Ler constante de módulo cliente do lado do servidor
 * não quebra o build e não avisa nada: o bundler do App Router põe uma
 * REFERÊNCIA no lugar do módulo cliente, e o corpo — onde o número está — fica
 * do outro lado da fronteira.
 *
 * MEDIDO em 22/09, e não deduzido. Uma rota de servidor descartável renderizou
 * `voltaCompletaEmSegundos(6)` nas duas montagens, sem mais nenhuma diferença
 * entre elas:
 *
 *   `INTERVALO_MS` daqui ............................ volta=48
 *   `INTERVALO_MS` de `VitrineTV.tsx` ............... volta=NaN
 *
 * Sem erro de compilação, sem aviso em runtime, `npm test` e `next build`
 * verdes nas duas. O `NaN` atravessa e chega à tela do operador.
 *
 * O caso já estava armado e só não tinha disparado: `voltaCompletaEmSegundos`
 * só era chamada por `CuradoriaDeDestaques.tsx`, que também é cliente. O número
 * certo chegava por coincidência de quem chama. Nenhuma das três ferramentas
 * pegaria o primeiro chamador de servidor: o Vitest resolve módulo ES puro e
 * ignora a diretiva, o `tsc` só vê tipos, e para o `next build` importar
 * cliente de servidor é legal. O que não é legal é esperar o VALOR do lado de
 * cá — e isso nada além desta separação impede.
 *
 * Daqui os dois lados importam: o componente cliente e qualquer módulo de
 * servidor. Módulo neutro não tem fronteira para atravessar — é essa a
 * diferença, e é só ela. Trancado por `tests/fronteira-servidor-cliente.test.ts`,
 * que varre `src/lib/` inteiro atrás do próximo import assim.
 */

/**
 * Quanto cada carro fica na tela antes de dar lugar ao próximo.
 *
 * `destaquesDoPainel.ts` DERIVA dele o "volta completa: N segundos" que a tela
 * de curadoria mostra ao operador, em vez de redigitar o oito. Antes o número
 * estava nos dois arquivos, com um comentário admitindo que um "espelhava" o
 * outro — e espelho não segura nada: mudar o ritmo aqui deixaria a curadoria
 * anunciando uma volta que a TV não faz, sem um único teste vermelho.
 * `tests/lista-da-tv-uma-casa-so.test.ts` tranca a derivação.
 */
export const INTERVALO_MS = 8000;

/**
 * Quantos carros a faixa "A SEGUIR" mostra de uma vez.
 *
 * Subiu de 4 para 6 em 2026-09-22, a pedido do dono. 6 é o teto desta faixa
 * sem redesenhá-la: da largura útil (~90vw, descontada a célula do rótulo),
 * 90/6 menos o respiro lateral de 2,4vw (`px-[1.2vw]` dos dois lados) deixa
 * ~12,6vw por célula, e o nome mais longo do estoque ("Volkswagen Saveiro")
 * ainda cabe. Com 8 sobrariam ~8,9vw e a maioria dos nomes viraria
 * reticências — pior que mostrar menos carro, numa tela vista de longe.
 *
 * Correção de 22/09: até aqui estava escrito ~11,4vw e ~7,7vw. Os dois números
 * foram calculados com o respiro ANTIGO (1,77vw por lado, 3,54vw no total), e
 * a MESMA mudança que subiu a faixa para 6 apertou o respiro para 1,2vw sem
 * ninguém refazer a conta. A conclusão não muda — 6 cabe, 8 não —, mas número
 * errado em comentário é o que faz o próximo leitor decidir com a régua errada.
 *
 * Ele é do ritmo, e não só do desenho: a faixa vira de página conforme o
 * rodízio avança (`paginaDaFaixa(veiculos, atual, POR_PAGINA)`), então quantos
 * cabem e de quanto em quanto tempo se trocam são a mesma pergunta.
 */
export const POR_PAGINA = 6;
