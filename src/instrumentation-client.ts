import { configurar } from "./lib/observabilidade-cliente";

/**
 * A captura do navegador, armada ANTES da hidratação.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ ESTE ARQUIVO PODE DERRUBAR O SITE INTEIRO. Leia antes de mexer.
 * ---------------------------------------------------------------------------
 * O Next exige este módulo em `client/app-next.js:10`, **antes** do
 * `appBootstrap` e do `hydrate` — e por um `require` cru, sem `try` em volta
 * (`lib/require-instrumentation-client.js`). Se o que roda aqui lançar, a
 * hidratação não acontece: a página fica servida mas morta, e numa página
 * morta o formulário de lead não envia.
 *
 * Daí as três regras, e nenhuma é opcional:
 *
 *   1. **Tudo dentro de `try`**, sem nada que possa escapar.
 *   2. **Nenhuma rede no carregamento.** Só quando um erro acontece.
 *   3. **Nenhum import pesado.** `observabilidade-cliente` não tem dependência
 *      e não fala com o servidor.
 *
 * E continua valendo a regra que manda no desenho todo: **nenhum global é
 * envolvido**. Dois `addEventListener` passivos. O Turnstile observa o
 * ambiente da página e desiste do desafio quando alguém troca `fetch`,
 * `console` ou `XMLHttpRequest` por baixo dele — desafio que desiste é botão
 * de formulário eternamente desabilitado, que é lead perdido em silêncio.
 *
 * ---------------------------------------------------------------------------
 * Por que aqui, e não num componente
 * ---------------------------------------------------------------------------
 * Até 11/09 a montagem vivia num `useEffect` de `<CapturaDeErros>`, dentro do
 * layout raiz. Isso tinha dois buracos, e o segundo é grave:
 *
 *   • **A janela pré-hidratação.** O erro que IMPEDE a página de ficar
 *     interativa acontece antes de qualquer efeito rodar — e era exatamente
 *     esse que a captura não via.
 *
 *   • **`global-error.tsx` não reportava nada.** Ele SUBSTITUI o layout raiz,
 *     então o React destrói a subárvore onde `<CapturaDeErros>` morava e roda
 *     a limpeza dela — que zerava o capturador — antes de montar o fallback. A
 *     ponte caía num no-op justamente no cenário para o qual ela existe.
 *     Medido com quatro sondas, incluindo controle.
 *
 *   E havia um terceiro efeito, pior que "não ganhou": ao existir um
 *   `global-error.tsx` próprio, o Next deixa de tratar o boundary como
 *   implícito (`react-client-callbacks/error-boundary-callbacks.js:42` compara
 *   com o `global-error` EMBUTIDO), e o crash de raiz para de passar por
 *   `reportGlobalError` — que é `window.reportError`, um evento `error` de
 *   verdade. Em produção sobrava só `console.error`. Ou seja: o pacote de
 *   observabilidade tinha deixado a camada mais crítica MENOS observável do
 *   que antes dele.
 *
 * Carregando aqui, o capturador existe antes de React existir, ninguém o
 * desmonta, e os dois buracos fecham.
 *
 * ---------------------------------------------------------------------------
 * O interruptor continua no SERVIDOR
 * ---------------------------------------------------------------------------
 * Nada aqui lê env: `NEXT_PUBLIC_` viraria texto do bundle e criaria uma
 * segunda verdade. O capturador arma sempre, e quem decide se a linha
 * PERSISTE é `/api/erros`, que responde 204 e descarta quando
 * `OBSERVABILIDADE` está vazia.
 *
 * O custo dessa escolha, declarado: com o interruptor desligado, um erro de
 * navegador gasta um `sendBeacon` que o servidor joga fora. É fire-and-forget,
 * fora da thread principal, e não bloqueia navegação — com o tráfego real do
 * site, da ordem de dez a vinte por dia. É o preço de ter uma verdade só, e de
 * o crash de raiz deixar de ser invisível.
 */
try {
  // `release` NÃO vem daqui. Quem carimba é `/api/erros`, no servidor, a
  // partir de `VERCEL_GIT_COMMIT_SHA` — o cliente não tem como saber o SHA
  // sem uma env pública, e valor vindo do visitante não é verificável de
  // qualquer jeito. Um beacon que atravesse um deploy leva o SHA novo; é a
  // imprecisão aceita em troca de um campo a menos sob controle de fora.
  configurar({ ativo: true, release: null });
} catch {
  /* Silêncio absoluto, e é deliberado.
     Não há `console.error` aqui: este código roda antes de tudo, e um erro
     dentro do capturador de erros não pode virar a primeira coisa que o
     visitante encontra. O site funcionar vale mais que o erro ser contado. */
}
