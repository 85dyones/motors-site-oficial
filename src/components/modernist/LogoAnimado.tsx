"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import {
  ALTURA_VERTICAL,
  ASAS,
  CONTORNO_DAS_ASAS,
  HORIZONTAL,
  LARGURA,
  MOTORS,
  REGUAS,
  STORE,
} from "./geometriaDoLogo";

/**
 * O logo que acende: a v3 do Claude Design ("Motors Store Logo Animation v3",
 * 09/10/2026) no tamanho em que o logo já estava no cabeçalho e no rodapé.
 *
 * A sequência é a do design, com os mesmos tempos e as mesmas curvas
 * (8,2 s; o CSS está em `modernist.css`, seção "o logo que acende"):
 *
 * 1. Ignition (0–1,6 s): uma barra fina de luz pisca duas vezes, como motor
 *    pegando, e corre até a largura toda.
 * 2. Trace (1,6–3,2 s): a luz contorna as asas a partir do vértice.
 * 3. Reveal (3,2–5,0 s): as asas enchem de bronze sob um reflexo, e uma fenda
 *    de luz passa da esquerda para a direita revelando o MOTORS.
 * 4. Signature (5,0–6,2 s): a barra se abre no meio e assenta nas duas réguas
 *    de bronze; o STORE chega das pontas para o centro.
 * 5. Hold (6,2–8,2 s): um brilho cruza o MOTORS e o logo fica.
 *
 * O que mudou para caber numa barra de 40 px:
 *
 * - **Sem a câmera.** O design aproxima 1,32× e recua; aqui o logo ocupa
 *   sempre a mesma caixa (80×40 no cabeçalho, 191×32 no rodapé), porque a
 *   largura da barra foi medida no limite (`lib/menuDoCabecalho.ts`).
 * - **Luz mais grossa.** No design a barra tem 3 unidades e o traço 2,5, que a
 *   40 px de altura são 0,15 px e não aparecem. Aqui são 14 (≈0,75 px no
 *   cabeçalho, ≈1,2 px no rodapé) e o brilho espalha 12 em vez de 5.
 *
 * Depois da abertura o logo é a marca parada, com as cores do tema escuro da
 * v3: asas, STORE e réguas no bronze escovado, MOTORS em #ECE9E5. Passar o
 * mouse repete o reflexo das asas e o brilho da palavra.
 *
 * Três garantias:
 *
 * - **Sem JavaScript também anima.** A sequência é CSS puro e começa na
 *   primeira pintura, antes da hidratação; o HTML do servidor já sai com ela.
 * - **Movimento reduzido mostra o logo pronto**, sem passar pela abertura: as
 *   animações só existem dentro de `prefers-reduced-motion: no-preference`.
 * - **O rodapé espera ser visto** (`inicio="visivel"`). O servidor manda o
 *   logo parado; no cliente, se ele estiver fora da tela, volta ao quadro zero
 *   e só toca quando aparece. Se já estiver na tela, fica parado: tirar o
 *   logo de quem já o está vendo para tocar a abertura seria pior.
 */

type Estado = "acende" | "armado" | "parado";

// Tema escuro da v3 (`THEMES.Dark` em `logo-premium.jsx`). O cabeçalho e o
// rodapé são sempre escuros, em qualquer paleta do painel.
const TINTA = "#ECE9E5";
const LUZ = "#FFF3E2";
const HALO = "#E9C9A0";
const BRONZE = ["#7E5F43", "#E6CCA8", "#B39171", "#7E5F43"] as const;

const ESPESSURA_DA_LUZ = 14;
const CENTRO = LARGURA / 2;
const [REGUA_ESQ, REGUA_DIR] = REGUAS;
const CENTRO_DA_REGUA = REGUA_ESQ.y + REGUA_ESQ.altura / 2;

// O STORE começa a chegar 0,35 s depois da Signature, uma letra a cada 0,06 s.
const STORE_COMECA = 5.35;
const STORE_PASSO = 0.06;

const comVariaveis = (variaveis: Record<string, string>) => variaveis as CSSProperties;

export default function LogoAnimado({
  variante,
  rotulo,
  className,
  inicio = "carga",
}: {
  variante: "vertical" | "horizontal";
  rotulo: string;
  className?: string;
  inicio?: "carga" | "visivel";
}) {
  // `useId` traz caracteres que não servem dentro de `url(#…)`.
  const id = `logo${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const ref = useRef<SVGSVGElement>(null);
  const [estado, setEstado] = useState<Estado>(inicio === "carga" ? "acende" : "parado");
  const [reflexo, setReflexo] = useState(false);

  useEffect(() => {
    if (inicio !== "visivel") return;
    const svg = ref.current;
    if (!svg || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let primeira = true;
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (primeira) {
          primeira = false;
          if (entrada.intersectionRatio > 0) {
            observador.disconnect();
            return;
          }
          setEstado("armado");
          return;
        }
        if (entrada.intersectionRatio >= 0.6) {
          setEstado("acende");
          observador.disconnect();
        }
      },
      { threshold: [0, 0.6] },
    );
    observador.observe(svg);
    return () => observador.disconnect();
  }, [inicio]);

  const horizontal = variante === "horizontal";
  const url = (nome: string) => `url(#${id}-${nome})`;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${horizontal ? HORIZONTAL.largura : LARGURA} ${horizontal ? HORIZONTAL.altura : ALTURA_VERTICAL}`}
      role="img"
      aria-label={rotulo}
      className={className ? `mt-logo ${className}` : "mt-logo"}
      data-logo={estado}
      data-reflexo={reflexo ? "" : undefined}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setReflexo(true);
      }}
      onAnimationEnd={(e) => {
        if (e.animationName === "mt-logo-reflexo-palavra") setReflexo(false);
      }}
    >
      <defs>
        <linearGradient id={`${id}-bronze`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1500" y2="760">
          <stop offset="0" stopColor={BRONZE[0]} />
          <stop offset="0.38" stopColor={BRONZE[1]} />
          <stop offset="0.62" stopColor={BRONZE[2]} />
          <stop offset="1" stopColor={BRONZE[3]} />
        </linearGradient>
        <linearGradient id={`${id}-reflexo`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        {/* Região em unidades do usuário: a barra tem 14 de altura, e os 50%
            padrão cortariam o brilho rente a ela. */}
        <filter id={`${id}-brilho`} filterUnits="userSpaceOnUse" x="-200" y="-200" width="1900" height="1200">
          <feGaussianBlur stdDeviation="12" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={`${id}-halo`} filterUnits="userSpaceOnUse" x="-200" y="500" width="1900" height="440">
          <feGaussianBlur stdDeviation="36" />
        </filter>
        <clipPath id={`${id}-asas`}>
          {ASAS.map((d) => (
            <path key={d} d={d} />
          ))}
        </clipPath>
        <clipPath id={`${id}-palavra`}>
          {MOTORS.map((letra) => (
            <path key={letra.cx} d={letra.d} />
          ))}
        </clipPath>
        <clipPath id={`${id}-fenda`}>
          <rect className="mt-logo-fenda" x="-100" y="440" width="1640" height="220" />
        </clipPath>
      </defs>

      {/* Símbolo */}
      <g transform={horizontal ? HORIZONTAL.simbolo : undefined}>
        <g className="mt-logo-asas" fill={url("bronze")}>
          {ASAS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        {/* A opacidade fica no grupo do filtro, e não no traço: o Chromium
            pinta um resto do brilho no canto do logo quando o filtro está
            num grupo cujo conteúdo é todo transparente. */}
        <g className="mt-logo-tracos" filter={url("brilho")}>
          {CONTORNO_DAS_ASAS.map((d) => (
            <path
              key={d}
              className="mt-logo-traco"
              d={d}
              pathLength={1}
              fill="none"
              stroke={LUZ}
              strokeWidth={ESPESSURA_DA_LUZ}
              strokeLinejoin="round"
              strokeDasharray="1 1"
            />
          ))}
        </g>
        <g clipPath={url("asas")}>
          <g className="mt-logo-varre">
            <rect x="-400" y="-120" width="260" height="640" fill={url("reflexo")} transform="skewX(-24)" />
          </g>
          <g className="mt-logo-liberado">
            <g className="mt-logo-reflexo-asas">
              <rect x="-400" y="-120" width="260" height="640" fill={url("reflexo")} transform="skewX(-24)" />
            </g>
          </g>
        </g>
      </g>

      {/* MOTORS, barra de luz, réguas e STORE */}
      <g transform={horizontal ? HORIZONTAL.texto : undefined}>
        <g clipPath={url("fenda")} fill={TINTA}>
          {MOTORS.map((letra) => (
            <path
              key={letra.cx}
              className="mt-logo-letra"
              d={letra.d}
              style={comVariaveis({ "--mt-logo-dx": `${((letra.cx - CENTRO) * 0.045).toFixed(1)}px` })}
            />
          ))}
        </g>
        <g className="mt-logo-varredor" filter={url("brilho")}>
          <rect
            className="mt-logo-varredor-corre"
            x={-40 - ESPESSURA_DA_LUZ / 2}
            y="444"
            width={ESPESSURA_DA_LUZ}
            height="208"
            fill={LUZ}
          />
        </g>
        <g clipPath={url("palavra")}>
          <g className="mt-logo-reluz">
            <rect x="-400" y="420" width="220" height="260" fill={url("reflexo")} opacity="0.7" transform="skewX(-24)" />
          </g>
          <g className="mt-logo-liberado">
            <g className="mt-logo-reflexo-palavra">
              <rect x="-400" y="420" width="220" height="260" fill={url("reflexo")} opacity="0.7" transform="skewX(-24)" />
            </g>
          </g>
        </g>

        <g className="mt-logo-luz-esmaece">
          <g className="mt-logo-luz-apaga">
            <g className="mt-logo-luz-pisca">
              <g filter={url("brilho")}>
                <g className="mt-logo-luz-abre" fill={LUZ}>
                  <rect className="mt-logo-regua-esq" x={REGUA_ESQ.x} y={REGUA_ESQ.y} width={REGUA_ESQ.largura} height={REGUA_ESQ.altura} />
                  <rect className="mt-logo-regua-dir" x={REGUA_DIR.x} y={REGUA_DIR.y} width={REGUA_DIR.largura} height={REGUA_DIR.altura} />
                </g>
              </g>
              <g filter={url("halo")} opacity="0.35">
                <ellipse className="mt-logo-halo" cx={CENTRO} cy={CENTRO_DA_REGUA} rx="220" ry="26" fill={HALO} />
              </g>
            </g>
          </g>
        </g>
        <g fill={url("bronze")}>
          <rect className="mt-logo-regua-esq mt-logo-regua-bronze" x={REGUA_ESQ.x} y={REGUA_ESQ.y} width={REGUA_ESQ.largura} height={REGUA_ESQ.altura} />
          <rect className="mt-logo-regua-dir mt-logo-regua-bronze" x={REGUA_DIR.x} y={REGUA_DIR.y} width={REGUA_DIR.largura} height={REGUA_DIR.altura} />
          {STORE.map((letra, i) => (
            <path
              key={letra.cx}
              className="mt-logo-store"
              d={letra.d}
              style={comVariaveis({
                "--mt-logo-dx": `${((letra.cx - CENTRO) * 0.22).toFixed(1)}px`,
                "--mt-logo-atraso": `${(STORE_COMECA + i * STORE_PASSO).toFixed(2)}s`,
              })}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}
