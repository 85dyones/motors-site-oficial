import { useId, type CSSProperties } from "react";
import { CSS_DO_LOGO_ANIMADO } from "./logoAnimadoCss";

/**
 * O logo da Motors que se acende (07/10/2026).
 *
 * É a animação "Motors Store Logo Animation v3" do projeto de design, nas duas
 * versões que ele tem (fundo escuro e fundo claro), reescrita para o site.
 *
 * O original roda em React: um relógio recalcula o SVG inteiro a cada quadro e
 * precisa de ~150 KB de biblioteca de animação. Aqui a coreografia é a mesma
 * (ignição, traço das asas, revelação, assinatura), mas quem anima é o CSS:
 *
 * - Nenhum JavaScript. Este arquivo é componente de servidor, e o HTML que
 *   sai dele é um SVG de ~7 KB e um `<style>` de ~5 KB (o tamanho real é
 *   travado em `tests/logo-animado.test.ts`); os quadros estão em
 *   `logoAnimadoCss.ts`.
 * - O estado parado é o logo PRONTO. Sem CSS de animação, com a animação
 *   desligada ou com "reduzir movimento" no sistema, o visitante vê o logo
 *   inteiro. Nada depende de a animação terminar.
 * - Não é imagem de LCP nem fica na frente de conteúdo: quem decide quando
 *   ela toca é `data-la`, e o uso abaixo da dobra passa por
 *   `LogoAoEntrarNaTela`, que só liga quando a faixa aparece.
 *
 * A geometria é a do projeto de design (prancha de 1500 × 752), não a dos
 * SVGs de `public/marca/`: os tempos da animação foram desenhados sobre ela.
 */

const ASA_E =
  "M738,0 L738,370 L677,114 L487,250 Q467,265 467,292 Q470,345 493,380 Q440,365 420,290 Q410,245 420,200 Z";
const ASA_D =
  "M760,0 L760,370 L821,114 L1011,250 Q1031,265 1031,292 Q1028,345 1005,380 Q1058,365 1078,290 Q1088,245 1078,200 Z";
// O mesmo contorno, começando no vértice e correndo para fora: é a ordem em
// que a luz desenha a asa.
const TRACO_E =
  "M738,0 L420,200 Q410,245 420,290 Q440,365 493,380 Q470,345 467,292 Q467,265 487,250 L677,114 L738,370 Z";
const TRACO_D =
  "M760,0 L1078,200 Q1088,245 1078,290 Q1058,365 1005,380 Q1028,345 1031,292 Q1031,265 1011,250 L821,114 L760,370 Z";

const O_GRANDE =
  "M336,529 Q336,500 357,480 Q378,459 406,459 H549 V566 Q549,595 528,616 Q507,636 479,636 H336 Z M371,601 V529 Q371,512 382,503 Q393,494 409,494 H514 V566 Q514,582 503,591 Q492,601 477,601 Z";

/** `cx` é o centro da letra: quanto mais longe do meio, mais ela viaja. */
const MOTORS: Array<{ d: string; cx: number; dx?: number }> = [
  { d: "M6,459 H55 L157,575 L259,459 H309 V636 H274 V497 L157,628 L41,497 V636 H6 Z", cx: 157 },
  { d: O_GRANDE, cx: 442 },
  { d: "M576,459 H778 V494 H695 V636 H659 V494 H576 Z", cx: 677 },
  { d: O_GRANDE, dx: 462, cx: 904 },
  {
    d: "M1039,459 H1252 V490 Q1252,520 1235,535 Q1228,543 1216,548 Q1235,562 1244,580 Q1252,598 1252,620 V636 H1217 V620 Q1217,596 1199,581 Q1185,566 1163,566 H1074 V636 H1039 Z M1074,494 H1213 Q1205,515 1190,522 Q1178,530 1163,530 H1074 Z",
    cx: 1145,
  },
  {
    d: "M1349,459 H1493 V494 H1349 Q1333,494 1323,505 Q1314,514 1314,530 H1493 V566 Q1493,595 1472,616 Q1451,636 1422,636 H1279 V601 H1420 Q1436,601 1446,591 Q1456,581 1456,566 H1279 V530 Q1279,500 1300,480 Q1321,459 1349,459 Z",
    cx: 1386,
  },
];

const STORE: Array<{ d: string; cx: number }> = [
  {
    cx: 383,
    d: "M358,686 H422 V700 H362 Q357,700 357,706 Q357,712 362,712 H408 Q424,712 424,732 Q424,752 408,752 H344 V738 H404 Q409,738 409,732 Q409,726 404,726 H358 Q342,726 342,706 Q342,686 358,686 Z",
  },
  { cx: 564, d: "M523,686 H605 V700 H571 V752 H557 V700 H523 Z" },
  {
    cx: 747,
    d: "M722,686 H773 Q795,686 795,719 Q795,752 773,752 H722 Q700,752 700,719 Q700,686 722,686 Z M724,700 H770 Q780,700 780,719 Q780,738 770,738 H724 Q714,738 714,719 Q714,700 724,700 Z",
  },
  {
    cx: 935,
    d: "M892,686 H958 Q975,686 975,705 Q975,716 966,721 L978,752 H961 L950,735 H906 V752 H892 V720 H952 Q960,720 960,710 Q960,700 952,700 H892 Z",
  },
  { cx: 1115, d: "M1076,686 H1155 V700 H1076 Z M1076,711 H1155 V726 H1090 V738 H1155 V752 H1076 Z" },
];

/** As duas réguas que ladeiam o STORE: é onde a barra de luz vai parar. */
const REGUAS = [
  { lado: "e", x: 0 },
  { lado: "d", x: 1214 },
] as const;

export type TemaDoLogo = "escuro" | "claro" | "auto";

export default function LogoAnimado({
  tema = "auto",
  tocar = false,
  camera = true,
  duracao,
  traco,
  rotulo = "Motors Store",
  className,
}: {
  /**
   * `escuro`: MOTORS claro, para fundo grafite. `claro`: MOTORS grafite, para
   * o papel. `auto` segue a paleta do site (a classe `dark` na raiz).
   */
  tema?: TemaDoLogo;
  /**
   * Toca assim que a página pinta, sem JavaScript. Para logo que já nasce
   * visível (login). Abaixo da dobra, deixe `false` e use `LogoAoEntrarNaTela`.
   */
  tocar?: boolean;
  /**
   * O recuo de câmera do original: começa fechado na barra de luz e abre até
   * o logo inteiro. Em tamanho pequeno ele só corta o desenho; desligue.
   */
  camera?: boolean;
  /** Segundos. O original tem 8,2 s; o padrão do site (CSS) é 5,4 s. */
  duracao?: number;
  /**
   * Espessura do traço de luz, na unidade da prancha (1500 de largura). O
   * padrão, 2,5, some abaixo de ~300 px de largura: ali use 6 a 8.
   */
  traco?: number;
  rotulo?: string;
  className?: string;
}) {
  // Um logo escuro e um claro podem estar na mesma página: sem id próprio, o
  // `url(#…)` do segundo pegaria o degradê do primeiro, com as cores erradas.
  const id = `la${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const metal = `url(#${id}m)`;

  const estilo: Record<string, string> = {};
  if (duracao) estilo["--la-dur"] = `${duracao}s`;
  if (traco) estilo["--la-traco"] = String(traco);

  return (
    <>
      {/* `href` + `precedence`: o React sobe o estilo para o <head> e escreve
          UMA cópia, mesmo com vários logos na página. */}
      <style href="logo-animado" precedence="medium">
        {CSS_DO_LOGO_ANIMADO}
      </style>
      <div
        role="img"
        aria-label={rotulo}
        data-tema={tema}
        data-la={tocar ? "tocando" : undefined}
        data-camera={camera ? undefined : "nao"}
        className={className ? `la ${className}` : "la"}
        style={estilo as CSSProperties}
      >
        {/* O centro do viewBox é o centro do logo (750, 376): é em torno dele
            que a câmera abre, e o CSS conta com isso. */}
        <svg viewBox="-90 -64 1680 880" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={`${id}m`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1500" y2="760">
              <stop offset="0" className="la-m0" />
              <stop offset="0.38" className="la-m2" />
              <stop offset="0.62" className="la-m1" />
              <stop offset="1" className="la-m0" />
            </linearGradient>
            <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <radialGradient id={`${id}h`}>
              <stop offset="0" className="la-halo-cor" stopOpacity="0.5" />
              <stop offset="1" className="la-halo-cor" stopOpacity="0" />
            </radialGradient>
            <filter id={`${id}g`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* O da barra tem caixa em unidade da prancha: uma barra de 3 de
                altura não tem "200% da própria altura" que caiba um brilho. */}
            <filter id={`${id}gb`} filterUnits="userSpaceOnUse" x="-60" y="660" width="1620" height="120">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <clipPath id={`${id}a`}>
              <path d={ASA_E} />
              <path d={ASA_D} />
            </clipPath>
            <clipPath id={`${id}p`}>
              {MOTORS.map((m, i) => (
                <path key={i} d={m.d} clipRule="evenodd" transform={m.dx ? `translate(${m.dx},0)` : undefined} />
              ))}
            </clipPath>
          </defs>

          {/* ─── Asas ─── */}
          <g className="la-asas">
            <path d={ASA_E} fill={metal} />
            <path d={ASA_D} fill={metal} />
          </g>
          <g filter={`url(#${id}g)`}>
            <path className="la-traco" d={TRACO_E} pathLength={1} />
            <path className="la-traco" d={TRACO_D} pathLength={1} />
          </g>
          <g clipPath={`url(#${id}a)`}>
            <rect className="la-brilho la-brilho-asas" x={-400} y={-120} width={260} height={640} fill={`url(#${id}b)`} />
          </g>

          {/* ─── MOTORS ───
              A palavra aparece atrás de uma fresta de luz que corre da esquerda
              para a direita. O retângulo sem tinta fixa a caixa do grupo em
              -40…1540, que é o percurso da fresta: assim o recorte (em % da
              caixa) e a fresta (em unidade da prancha) andam juntos. */}
          <g className="la-motors">
            <rect x={-40} y={440} width={1580} height={220} fill="none" />
            {MOTORS.map((m, i) => (
              <g key={i} transform={m.dx ? `translate(${m.dx},0)` : undefined}>
                <path
                  className="la-letra"
                  d={m.d}
                  fillRule="evenodd"
                  style={{ "--la-dx": `${((m.cx - 750) * 0.045).toFixed(1)}px` } as CSSProperties}
                />
              </g>
            ))}
          </g>
          <g filter={`url(#${id}g)`}>
            <rect className="la-fresta" x={-42} y={444} width={4} height={208} />
          </g>
          <g clipPath={`url(#${id}p)`}>
            <rect className="la-brilho la-brilho-palavra" x={-400} y={420} width={220} height={260} fill={`url(#${id}b)`} />
          </g>

          {/* ─── Barra de luz, que vira as duas réguas do STORE ─── */}
          {/* O halo fica FORA do grupo que corre: ele abre menos que a barra. */}
          <ellipse className="la-halo" cx={750} cy={720} rx={240} ry={26} fill={`url(#${id}h)`} />
          <g className="la-corrida">
            <g className="la-luz">
              <g filter={`url(#${id}gb)`}>
                {REGUAS.map((r) => (
                  <rect key={r.lado} className={`la-regua la-regua-${r.lado} la-regua-luz`} x={r.x} y={704} width={286} height={32} />
                ))}
              </g>
            </g>
            <g className="la-metal">
              {REGUAS.map((r) => (
                <rect key={r.lado} className={`la-regua la-regua-${r.lado}`} x={r.x} y={704} width={286} height={32} fill={metal} />
              ))}
            </g>
          </g>

          {/* ─── STORE ─── */}
          {STORE.map((l, i) => (
            <path
              key={i}
              className="la-store"
              d={l.d}
              fill={metal}
              fillRule="evenodd"
              style={{ "--la-dx": `${((l.cx - 750) * 0.22).toFixed(1)}px`, "--la-i": i } as CSSProperties}
            />
          ))}
        </svg>
      </div>
    </>
  );
}
