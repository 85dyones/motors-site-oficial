/**
 * O logo que se acende: as cores e os quadros. Quem desenha é
 * `LogoAnimado.tsx`.
 *
 * Como ler os quadros: toda animação dura `--la-dur` e é escrita em % da linha
 * do tempo do original, que tem 8,2 s. Os tempos de lá, e a % de cada um:
 *
 *   Ignição     0,0 s   0%      a barra pisca duas vezes e corre para os lados
 *   Traço       1,6 s   19,51%  a luz contorna as asas
 *   Revelação   3,2 s   39,02%  as asas ganham o cobre; a fresta escreve MOTORS
 *   Assinatura  5,0 s   60,98%  a barra se parte nas duas réguas; entra STORE
 *   Pausa       6,2 s   75,61%  um reflexo cruza a palavra
 *
 * Mudar a duração é mudar UMA variável: os tempos relativos não se mexem.
 *
 * Regra que este arquivo não pode quebrar: fora de `[data-la]` nada aqui
 * esconde nada. O estado sem animação é o logo pronto.
 *
 * Por que uma string em TypeScript e não um arquivo `.css`: importado como
 * folha de estilo, isto vira um arquivo a mais, bloqueando a pintura, em toda
 * página que o importe. Como string, o `LogoAnimado` o escreve num `<style>`
 * dentro do próprio HTML, só nas páginas que têm o logo: nenhuma requisição a
 * mais, e o catálogo e a ficha não carregam um byte disto.
 *
 * As três curvas usadas, com o nome que têm no projeto de design:
 *   easeOutCubic      cubic-bezier(.215,.61,.355,1)
 *   easeInOutCubic    cubic-bezier(.645,.045,.355,1)
 *   easeOutExpo       cubic-bezier(.19,1,.22,1)
 */
const FONTE = `
.la {
  --la-dur: 5.4s;
  --la-traco: 2.5;
  /* Fundo escuro (o padrão). */
  --la-tinta: #ece9e5;
  --la-luz: #fff3e2;
  --la-halo: #e9c9a0;
  --la-m0: #7e5f43;
  --la-m1: #b39171;
  --la-m2: #e6cca8;
  display: block;
  /* A câmera começa fechada: o que sobra para fora da caixa é cortado. */
  overflow: hidden;
}
/* Fundo claro: MOTORS no grafite da marca, e a luz vira cobre. */
.la[data-tema="claro"],
html:not(.dark) .la[data-tema="auto"] {
  --la-tinta: #434343;
  --la-luz: #b39171;
  --la-halo: #c9a57c;
  --la-m0: #9a7a5c;
  --la-m1: #b39171;
  --la-m2: #cdb08e;
}
/* Sem câmera nada sai da caixa de propósito, e a fresta de luz passa um
   pouco das bordas da palavra: cortar ali comeria a ponta dela. */
.la[data-camera="nao"] { overflow: visible; }
.la svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.la-m0 { stop-color: var(--la-m0); }
.la-m1 { stop-color: var(--la-m1); }
.la-m2 { stop-color: var(--la-m2); }
.la-halo-cor { stop-color: var(--la-halo); }

.la-letra { fill: var(--la-tinta); }
.la-traco {
  fill: none;
  stroke: var(--la-luz);
  stroke-width: var(--la-traco);
  stroke-linejoin: round;
  stroke-dasharray: 1 1;
}
.la-fresta,
.la-regua-luz { fill: var(--la-luz); }

/* O que só existe DURANTE a animação: parado, o logo não tem luz nenhuma. */
.la-traco,
.la-fresta,
.la-brilho,
.la-luz,
.la-halo { opacity: 0; }

/* Escalas partem da própria peça, e não do canto da prancha. */
.la-corrida,
.la-halo,
.la-regua {
  transform-box: fill-box;
  transform-origin: center;
}
.la-regua-e { transform-origin: 0% 50%; }
.la-regua-d { transform-origin: 100% 50%; }

/* Ligação: com "tocando" o logo roda uma vez e para no logo pronto. Quem
   põe o atributo é o servidor (tocar ao abrir) ou LogoAoPassarOMouse. */
.la[data-la] svg,
.la[data-la] svg * {
  animation-duration: var(--la-dur);
  animation-timing-function: linear;
  animation-fill-mode: both;
}

/* A câmera é a única animação no elemento svg: transform e scale de uma
   caixa CSS sobem para o compositor e não repintam o desenho. */
.la[data-la]:not([data-camera="nao"]) svg { animation-name: la-camera, la-deriva; }

.la[data-la] .la-asas { animation-name: la-asas; }
.la[data-la] .la-traco { animation-name: la-traco; }
.la[data-la] .la-brilho-asas { animation-name: la-brilho-asas; }
.la[data-la] .la-motors { animation-name: la-motors; }
.la[data-la] .la-letra { animation-name: la-assentar; }
.la[data-la] .la-fresta { animation-name: la-fresta; }
.la[data-la] .la-brilho-palavra { animation-name: la-brilho-palavra; }
.la[data-la] .la-corrida { animation-name: la-corrida; }
.la[data-la] .la-luz { animation-name: la-luz; }
.la[data-la] .la-halo { animation-name: la-luz, la-halo; }
.la[data-la] .la-metal { animation-name: la-metal; }
.la[data-la] .la-regua { animation-name: la-regua; }
.la[data-la] .la-store {
  animation-name: la-store;
  /* 0,06 s entre uma letra e a próxima, na escala de 8,2 s. */
  animation-delay: calc(var(--la-dur) * var(--la-i) * 0.00732);
}

/* O -27,6% é a conta do original: o foco começa em y=560 e termina em 376,
   com zoom de 1,32. (376 - 560) x 1,32 / 880 de altura do viewBox. */
@keyframes la-camera {
  0% { transform: translateY(-27.6%) scale(1.32); animation-timing-function: cubic-bezier(.645,.045,.355,1); }
  70.73%, 100% { transform: translateY(0) scale(1); }
}
@keyframes la-deriva {
  0%, 70.73% { scale: 1; animation-timing-function: cubic-bezier(.215,.61,.355,1); }
  100% { scale: 1.025; }
}

@keyframes la-asas {
  0%, 39.02% { opacity: 0; animation-timing-function: cubic-bezier(.215,.61,.355,1); }
  50%, 100% { opacity: 1; }
}
@keyframes la-traco {
  0%, 19.51% { stroke-dashoffset: 1; opacity: 1; animation-timing-function: cubic-bezier(.645,.045,.355,1); }
  37.8% { stroke-dashoffset: 0; opacity: 1; }
  42.68% { stroke-dashoffset: 0; opacity: 1; animation-timing-function: cubic-bezier(.215,.61,.355,1); }
  52.44%, 100% { stroke-dashoffset: 0; opacity: 0; }
}
@keyframes la-brilho-asas {
  0%, 40.84% { opacity: 0; transform: skewX(-24deg) translateX(0); }
  40.85% { opacity: 1; transform: skewX(-24deg) translateX(0); animation-timing-function: cubic-bezier(.645,.045,.355,1); }
  54.27% { opacity: 1; transform: skewX(-24deg) translateX(1900px); }
  54.28%, 100% { opacity: 0; transform: skewX(-24deg) translateX(1900px); }
}

@keyframes la-motors {
  0%, 43.29% { clip-path: inset(0 100% 0 0); animation-timing-function: cubic-bezier(.645,.045,.355,1); }
  57.93%, 100% { clip-path: inset(0 0 0 0); }
}
@keyframes la-assentar {
  0%, 43.29% { transform: translateX(var(--la-dx)); animation-timing-function: cubic-bezier(.215,.61,.355,1); }
  62.2%, 100% { transform: translateX(0); }
}
@keyframes la-fresta {
  0%, 43.28% { opacity: 0; transform: translateX(0); }
  43.29% { opacity: 1; transform: translateX(0); animation-timing-function: cubic-bezier(.645,.045,.355,1); }
  57.93% { opacity: 1; transform: translateX(1580px); }
  57.94%, 100% { opacity: 0; transform: translateX(1580px); }
}
@keyframes la-brilho-palavra {
  0%, 79.26% { opacity: 0; transform: skewX(-24deg) translateX(0); }
  79.27% { opacity: 0.7; transform: skewX(-24deg) translateX(0); animation-timing-function: cubic-bezier(.645,.045,.355,1); }
  93.9% { opacity: 0.7; transform: skewX(-24deg) translateX(2000px); }
  93.91%, 100% { opacity: 0; transform: skewX(-24deg) translateX(2000px); }
}

/* A barra nasce com 3% da largura e corre até a largura do logo. */
@keyframes la-corrida {
  0%, 7.56% { transform: scaleX(0.03); animation-timing-function: cubic-bezier(.645,.045,.355,1); }
  18.29%, 100% { transform: scaleX(1); }
}
/* As duas piscadas (0,25 s e 0,55 s), a meia-luz enquanto as asas são
   traçadas e o apagar quando o metal assume. */
@keyframes la-luz {
  0%, 3.05% { opacity: 0; animation-timing-function: cubic-bezier(.19,1,.22,1); }
  3.9% { opacity: 0.6; animation-timing-function: cubic-bezier(.215,.61,.355,1); }
  6.1%, 6.71% { opacity: 0; animation-timing-function: cubic-bezier(.19,1,.22,1); }
  7.56%, 19.51% { opacity: 1; animation-timing-function: cubic-bezier(.645,.045,.355,1); }
  29.27%, 60.98% { opacity: 0.45; animation-timing-function: cubic-bezier(.645,.045,.355,1); }
  73.17%, 100% { opacity: 0; }
}
@keyframes la-halo {
  0%, 7.56% { transform: scaleX(0.3); animation-timing-function: cubic-bezier(.645,.045,.355,1); }
  18.29%, 100% { transform: scaleX(1); }
}
@keyframes la-metal {
  0%, 60.98% { opacity: 0; animation-timing-function: cubic-bezier(.645,.045,.355,1); }
  73.17%, 100% { opacity: 1; }
}
/* Cada metade vai de 750 x 3 (meia barra de luz) a 286 x 32 (a régua). */
@keyframes la-regua {
  0%, 60.98% { transform: scale(2.6224, 0.09375); animation-timing-function: cubic-bezier(.645,.045,.355,1); }
  73.17%, 100% { transform: scale(1, 1); }
}
@keyframes la-store {
  0%, 65.24% { opacity: 0; transform: translateX(var(--la-dx)); animation-timing-function: cubic-bezier(.215,.61,.355,1); }
  76.22%, 100% { opacity: 1; transform: translateX(0); }
}

/* Quem pediu menos movimento vê o logo pronto, parado. */
@media (prefers-reduced-motion: reduce) {
  .la[data-la] svg,
  .la[data-la] svg * { animation: none !important; }
}
`;

/**
 * Sem comentários e sem quebras: é o que vai para o HTML.
 *
 * Sai o espaço em volta de `{ } ; ,` e o que vem DEPOIS de `:` (o de
 * `prop: valor`). O que vem antes de `:` não existe aqui, e o espaço entre
 * seletores (`html:not(.dark) .la`) e dentro de `calc()` fica, porque
 * significa alguma coisa.
 */
export const CSS_DO_LOGO_ANIMADO = FONTE.replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s+/g, " ")
  .replace(/ ?([{};,]) ?/g, "$1")
  .replace(/: /g, ":")
  .replace(/;}/g, "}")
  .trim();
