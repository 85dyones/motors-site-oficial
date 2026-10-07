"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Barras verticais sobre a linha do zero, para as duas leituras da aba por
 * modelo: a variação de cada mês e o valor de cada ano-modelo.
 *
 * Uma série, uma cor. Quando há uma barra em destaque (o ano escolhido), ela
 * leva a cor da série e as outras ficam neutras: a cor aponta, e não mede.
 * A escala sempre inclui o zero, porque comprimento de barra só se compara a
 * partir dele. Rótulo direto só na barra em destaque; o resto fica com o eixo,
 * com o ponteiro e com a tabela que quem chama põe ao lado.
 */

export interface Barra {
  rotulo: string;
  valor: number;
  destaque?: boolean;
  /** As linhas da dica ao passar o ponteiro. */
  dica: string[];
}

const ALTURA = 220;
const MARGEM = { cima: 20, direita: 12, baixo: 28, esquerda: 56 };

function passoDaGrade(amplitude: number): number {
  const bruto = amplitude / 4;
  const potencia = Math.pow(10, Math.floor(Math.log10(bruto)));
  const fracao = bruto / potencia;
  return (fracao <= 1 ? 1 : fracao <= 2 ? 2 : fracao <= 5 ? 5 : 10) * potencia;
}

export default function GraficoDeBarras({
  barras,
  descricao,
  formatoDoEixo,
  formatoDoDestaque,
}: {
  barras: Barra[];
  /** O que o gráfico mostra, para leitor de tela. */
  descricao: string;
  formatoDoEixo: (v: number) => string;
  formatoDoDestaque?: (v: number) => string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(720);
  const [ativo, setAtivo] = useState<number | null>(null);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setLargura(Math.max(260, Math.round(el.clientWidth)));
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  if (barras.length === 0) return null;

  const menor = Math.min(0, ...barras.map((b) => b.valor));
  const maior = Math.max(0, ...barras.map((b) => b.valor));
  const passo = passoDaGrade(Math.max(maior - menor, 1e-9));
  const base = Math.floor(menor / passo) * passo;
  const topo = Math.ceil(maior / passo) * passo;
  const w = largura - MARGEM.esquerda - MARGEM.direita;
  const h = ALTURA - MARGEM.cima - MARGEM.baixo;
  const y = (v: number) => MARGEM.cima + h - ((v - base) / (topo - base || 1)) * h;
  const faixa = w / barras.length;
  // Barra fina, com respiro: no máximo 36 px, e nunca encostada na vizinha.
  const espessura = Math.max(4, Math.min(36, faixa - 6));
  const x = (i: number) => MARGEM.esquerda + faixa * i + (faixa - espessura) / 2;
  const grade: number[] = [];
  for (let v = base; v <= topo + passo / 2; v += passo) grade.push(Math.abs(v) < passo / 1e6 ? 0 : v);
  const temDestaque = barras.some((b) => b.destaque);
  const cadaQuantos = Math.max(1, Math.ceil(barras.length / Math.max(2, Math.floor(w / 52))));
  const barraAtiva = ativo !== null ? barras[ativo] : null;

  const aoMover = (clienteX: number) => {
    const el = caixa.current;
    if (!el) return;
    const i = Math.floor((clienteX - el.getBoundingClientRect().left - MARGEM.esquerda) / faixa);
    setAtivo(i >= 0 && i < barras.length ? i : null);
  };

  return (
    <div
      ref={caixa}
      className="relative w-full touch-pan-y select-none"
      onPointerMove={(e) => aoMover(e.clientX)}
      onPointerDown={(e) => aoMover(e.clientX)}
      onPointerLeave={() => setAtivo(null)}
    >
      <svg width={largura} height={ALTURA} role="img" aria-label={descricao} className="block">
        {grade.map((v) => (
          <g key={v}>
            <line
              x1={MARGEM.esquerda}
              x2={largura - MARGEM.direita}
              y1={y(v)}
              y2={y(v)}
              stroke={v === 0 ? "var(--mt-regua)" : "var(--mt-regua-fina)"}
              strokeWidth="1"
            />
            <text x={MARGEM.esquerda - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--mt-neutral-700)" style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatoDoEixo(v)}
            </text>
          </g>
        ))}
        {barras.map((b, i) => {
          const y0 = y(0);
          const y1 = y(b.valor);
          return (
            <g key={`${b.rotulo}-${i}`} data-barra={b.rotulo}>
              <rect
                x={x(i)}
                y={Math.min(y0, y1)}
                width={espessura}
                height={Math.max(1, Math.abs(y1 - y0))}
                fill={!temDestaque || b.destaque ? "var(--cp-serie-fipe)" : "var(--mt-neutral-400)"}
                opacity={ativo === null || ativo === i ? 1 : 0.55}
              />
              {b.destaque && formatoDoDestaque && (
                <text x={x(i) + espessura / 2} y={Math.min(y0, y1) - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--mt-ink)" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatoDoDestaque(b.valor)}
                </text>
              )}
              {(i % cadaQuantos === 0 || b.destaque) && (
                <text x={x(i) + espessura / 2} y={ALTURA - 8} textAnchor="middle" fontSize="10.5" fontWeight={b.destaque ? 800 : 400} fill={b.destaque ? "var(--mt-ink)" : "var(--mt-neutral-700)"}>
                  {b.rotulo}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {barraAtiva && ativo !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-1 z-10 min-w-[150px] border border-mt-regua bg-mt-bg px-3 py-2 text-[11px] leading-relaxed text-mt-ink shadow-[var(--mt-shadow-lg)]"
          style={x(ativo) > largura / 2 ? { right: largura - x(ativo) + 8 } : { left: x(ativo) + espessura + 8 }}
        >
          <div className="font-extrabold uppercase tracking-wider">{barraAtiva.rotulo}</div>
          {barraAtiva.dica.map((l) => (
            <div key={l} className="tabular-nums">
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
