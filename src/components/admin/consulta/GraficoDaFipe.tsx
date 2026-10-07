"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MESES_DO_RITMO, type PontoDoGrafico } from "../../../lib/consultaDePlaca";

/**
 * A FIPE do carro mês a mês e, por baixo dela, a faixa de compra que o deságio
 * de hoje daria em cada mês — com três meses de projeção.
 *
 * Uma escala só (reais), duas séries: a linha da tabela e a faixa de compra.
 * A projeção é tracejada e mais fraca, e a legenda diz de onde ela sai. A
 * escala não parte do zero de propósito: é linha de variação, e não barra; o
 * que se lê é a inclinação.
 *
 * Passar o ponteiro (ou o dedo) mostra o mês exato. Os mesmos números estão
 * na tabela logo abaixo, para leitor de tela e para quem prefere a lista.
 */

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesAno = (p: { ano: number; mes: number }) => `${MESES[p.mes - 1]}/${String(p.ano).slice(2)}`;
const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
/** Deságio sem intervalo dá um valor só: "R$ 100" em vez de "R$ 100 a R$ 100". */
const faixa = (de: number, ate: number) => (de === ate ? reais(de) : `${reais(de)} a ${reais(ate)}`);
const milhares = (n: number) => `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;

const ALTURA = 280;
const MARGEM = { cima: 16, direita: 16, baixo: 28, esquerda: 56 };

/** Passo "redondo" para umas quatro linhas de grade. */
function passoDaGrade(amplitude: number): number {
  const bruto = amplitude / 4;
  const potencia = Math.pow(10, Math.floor(Math.log10(bruto)));
  const fracao = bruto / potencia;
  return (fracao <= 1 ? 1 : fracao <= 2 ? 2 : fracao <= 5 ? 5 : 10) * potencia;
}

export default function GraficoDaFipe({ pontos }: { pontos: PontoDoGrafico[] }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(720);
  const [ativo, setAtivo] = useState<number | null>(null);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setLargura(Math.max(280, Math.round(el.clientWidth)));
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const temFaixa = pontos.some((p) => p.compraMin !== null);
  const geometria = useMemo(() => {
    const valores = pontos.flatMap((p) => [p.fipe, ...(p.compraMin !== null ? [p.compraMin] : [])]);
    const menor = Math.min(...valores);
    const maior = Math.max(...valores);
    const passo = passoDaGrade(Math.max(maior - menor, 1));
    const base = Math.floor(menor / passo) * passo;
    const topo = Math.ceil(maior / passo) * passo;
    const w = largura - MARGEM.esquerda - MARGEM.direita;
    const h = ALTURA - MARGEM.cima - MARGEM.baixo;
    const x = (i: number) => MARGEM.esquerda + (pontos.length === 1 ? w / 2 : (i / (pontos.length - 1)) * w);
    const y = (v: number) => MARGEM.cima + h - ((v - base) / (topo - base || 1)) * h;
    const grade: number[] = [];
    for (let v = base; v <= topo + passo / 2; v += passo) grade.push(v);
    return { x, y, grade, w, h };
  }, [pontos, largura]);

  if (pontos.length < 2) return null;
  const { x, y, grade, w } = geometria;

  const primeiroProjetado = pontos.findIndex((p) => p.projetado);
  const fimDoReal = primeiroProjetado === -1 ? pontos.length - 1 : primeiroProjetado - 1;
  const linha = (de: number, ate: number, valor: (p: PontoDoGrafico) => number) =>
    pontos
      .slice(de, ate + 1)
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(de + i).toFixed(1)},${y(valor(p)).toFixed(1)}`)
      .join(" ");
  const area = (de: number, ate: number) => {
    const trecho = pontos.slice(de, ate + 1);
    const cima = trecho.map((p, i) => `${i === 0 ? "M" : "L"}${x(de + i).toFixed(1)},${y(p.compraMax!).toFixed(1)}`);
    const baixo = trecho
      .map((p, i) => `L${x(de + i).toFixed(1)},${y(p.compraMin!).toFixed(1)}`)
      .reverse();
    return `${cima.join(" ")} ${baixo.join(" ")} Z`;
  };

  // Um rótulo de mês a cada tantos pontos, para não encavalar no celular.
  const cadaQuantos = Math.max(1, Math.ceil(pontos.length / Math.max(2, Math.floor(w / 64))));
  const ultimoReal = pontos[fimDoReal];
  const pontoAtivo = ativo !== null ? pontos[ativo] : null;

  const aoMover = (clienteX: number) => {
    const el = caixa.current;
    if (!el) return;
    const dentro = clienteX - el.getBoundingClientRect().left - MARGEM.esquerda;
    const i = Math.round((dentro / w) * (pontos.length - 1));
    setAtivo(Math.min(pontos.length - 1, Math.max(0, i)));
  };

  return (
    <figure className="m-0 flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] font-semibold text-mt-neutral-800">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-5" style={{ background: "var(--cp-serie-fipe)" }} />
          Tabela FIPE
        </span>
        {temFaixa && (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-5"
              style={{ background: "color-mix(in srgb, var(--cp-serie-compra) 30%, transparent)", borderBlock: "1.5px solid var(--cp-serie-compra)" }}
            />
            Faixa de compra com o deságio de hoje
          </span>
        )}
        {primeiroProjetado !== -1 && (
          <span className="inline-flex items-center gap-1.5 text-mt-neutral-700">
            <span aria-hidden className="inline-block w-5 border-t-2 border-dashed border-mt-neutral-500" />
            Projeção: repete o ritmo dos últimos {MESES_DO_RITMO} meses
          </span>
        )}
      </figcaption>

      <div
        ref={caixa}
        className="relative w-full touch-pan-y select-none"
        onPointerMove={(e) => aoMover(e.clientX)}
        onPointerDown={(e) => aoMover(e.clientX)}
        onPointerLeave={() => setAtivo(null)}
      >
        <svg width={largura} height={ALTURA} role="img" aria-label="FIPE mês a mês e faixa de compra" className="block">
          {grade.map((v) => (
            <g key={v}>
              <line x1={MARGEM.esquerda} x2={largura - MARGEM.direita} y1={y(v)} y2={y(v)} stroke="var(--mt-regua-fina)" strokeWidth="1" />
              <text x={MARGEM.esquerda - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--mt-neutral-700)" style={{ fontVariantNumeric: "tabular-nums" }}>
                {milhares(v)}
              </text>
            </g>
          ))}
          {pontos.map((p, i) =>
            i % cadaQuantos === 0 ? (
              <text key={i} x={x(i)} y={ALTURA - 8} textAnchor="middle" fontSize="10.5" fill="var(--mt-neutral-700)">
                {mesAno(p)}
              </text>
            ) : null,
          )}

          {temFaixa && (
            <>
              <path d={area(0, fimDoReal)} fill="var(--cp-serie-compra)" fillOpacity="0.22" />
              <path d={linha(0, fimDoReal, (p) => p.compraMax!)} fill="none" stroke="var(--cp-serie-compra)" strokeWidth="1.5" />
              <path d={linha(0, fimDoReal, (p) => p.compraMin!)} fill="none" stroke="var(--cp-serie-compra)" strokeWidth="1.5" />
              {primeiroProjetado !== -1 && (
                <path d={area(fimDoReal, pontos.length - 1)} fill="var(--cp-serie-compra)" fillOpacity="0.1" />
              )}
            </>
          )}

          <path d={linha(0, fimDoReal, (p) => p.fipe)} fill="none" stroke="var(--cp-serie-fipe)" strokeWidth="2" strokeLinejoin="round" />
          {primeiroProjetado !== -1 && (
            <path
              d={linha(fimDoReal, pontos.length - 1, (p) => p.fipe)}
              fill="none"
              stroke="var(--cp-serie-fipe)"
              strokeWidth="2"
              strokeDasharray="5 4"
              strokeOpacity="0.7"
            />
          )}

          {/* O mês atual: o único ponto com marca fixa, e os dois únicos rótulos
              diretos. O resto dos valores fica com o eixo e com o ponteiro. */}
          <circle cx={x(fimDoReal)} cy={y(ultimoReal.fipe)} r="4.5" fill="var(--cp-serie-fipe)" stroke="var(--mt-bg)" strokeWidth="2" />
          <text x={x(fimDoReal) - 8} y={y(ultimoReal.fipe) - 14} textAnchor="end" fontSize="11" fontWeight="700" fill="var(--mt-ink)" style={{ fontVariantNumeric: "tabular-nums" }}>
            FIPE {reais(ultimoReal.fipe)}
          </text>
          {ultimoReal.compraMin !== null && ultimoReal.compraMax !== null && (
            <text x={x(fimDoReal) - 8} y={y(ultimoReal.compraMin) + 20} textAnchor="end" fontSize="11" fontWeight="700" fill="var(--mt-ink)" style={{ fontVariantNumeric: "tabular-nums" }}>
              Compra {faixa(ultimoReal.compraMin, ultimoReal.compraMax)}
            </text>
          )}

          {pontoAtivo && ativo !== null && (
            <g>
              <line x1={x(ativo)} x2={x(ativo)} y1={MARGEM.cima} y2={ALTURA - MARGEM.baixo} stroke="var(--mt-regua)" strokeWidth="1" />
              <circle cx={x(ativo)} cy={y(pontoAtivo.fipe)} r="4.5" fill="var(--cp-serie-fipe)" stroke="var(--mt-bg)" strokeWidth="2" />
            </g>
          )}
        </svg>

        {pontoAtivo && ativo !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-1 z-10 min-w-[168px] border border-mt-regua bg-mt-bg px-3 py-2 text-[11px] leading-relaxed text-mt-ink shadow-[var(--mt-shadow-lg)]"
            style={x(ativo) > largura / 2 ? { right: largura - x(ativo) + 10 } : { left: x(ativo) + 10 }}
          >
            <div className="font-extrabold uppercase tracking-wider">
              {mesAno(pontoAtivo)}
              {pontoAtivo.projetado ? " · projeção" : ""}
            </div>
            <div className="tabular-nums">FIPE {reais(pontoAtivo.fipe)}</div>
            {pontoAtivo.compraMin !== null && pontoAtivo.compraMax !== null && (
              <div className="tabular-nums">
                Compra {faixa(pontoAtivo.compraMin, pontoAtivo.compraMax)}
              </div>
            )}
          </div>
        )}
      </div>

      <details className="text-xs text-mt-neutral-800">
        <summary className="mt-foco cursor-pointer font-semibold">Ver os números do gráfico em tabela</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="mt-tabela">
            <thead>
              <tr>
                <th scope="col">Mês</th>
                <th scope="col" className="mt-num">FIPE</th>
                {temFaixa && <th scope="col" className="mt-num">Compra de</th>}
                {temFaixa && <th scope="col" className="mt-num">Compra até</th>}
              </tr>
            </thead>
            <tbody>
              {[...pontos].reverse().map((p) => (
                <tr key={`${p.ano}-${p.mes}`}>
                  <td>
                    {mesAno(p)}
                    {p.projetado ? " (projeção)" : ""}
                  </td>
                  <td className="mt-num">{reais(p.fipe)}</td>
                  {temFaixa && <td className="mt-num">{p.compraMin !== null ? reais(p.compraMin) : "—"}</td>}
                  {temFaixa && <td className="mt-num">{p.compraMax !== null ? reais(p.compraMax) : "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
