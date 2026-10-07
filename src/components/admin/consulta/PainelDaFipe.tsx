"use client";

import { useMemo } from "react";
import { serieDoGrafico, tendenciaDaFipe, type PontoDaFipe } from "../../../lib/consultaDePlaca";
import GraficoDaFipe from "./GraficoDaFipe";
import SinalDeEstado from "./SinalDeEstado";

/**
 * A FIPE e a tendência — os números do topo, o ritmo da queda e o gráfico com
 * a faixa de compra. Usado pelas duas abas da consulta.
 */

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default function PainelDaFipe({
  historico,
  fipeAtual,
  desagio,
  origem,
  zeroKm = null,
  mostrarRitmo = true,
}: {
  historico: PontoDaFipe[];
  /** O valor que a tela usa; pode ser o da tabela pública, conferido por cima da série. */
  fipeAtual: number | null;
  desagio: { min: number; max: number } | null;
  /** De onde veio o valor do mês, em poucas palavras. */
  origem: string;
  zeroKm?: number | null;
  /** A aba por modelo já diz o ritmo no alerta do topo. */
  mostrarRitmo?: boolean;
}) {
  const tendencia = useMemo(() => tendenciaDaFipe(historico), [historico]);
  const pontos = useMemo(() => serieDoGrafico(historico, desagio), [historico, desagio]);
  if (!tendencia) return null;
  const rotulo = "mt-rotulo";

  return (
    <section aria-label="FIPE e tendência" className="flex flex-col gap-4 border-t-2 border-mt-regua pt-5">
      <h2 className={`${rotulo} m-0`}>FIPE E TENDÊNCIA DO VALOR DE COMPRA</h2>
      <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="flex flex-col gap-0.5 border border-mt-regua-fina bg-mt-surface p-3">
          <dt className={rotulo}>
            FIPE DE {MESES[Number(tendencia.referencia.slice(5)) - 1].toUpperCase()}/{tendencia.referencia.slice(2, 4)}
          </dt>
          <dd className="mt-titulo m-0 text-xl tabular-nums">{reais(fipeAtual ?? tendencia.valorAtual)}</dd>
          <span className="text-[11px] text-mt-neutral-700">{origem}</span>
        </div>
        {tendencia.variacoes.map((v) => (
          <div key={v.meses} className="flex flex-col gap-0.5 border border-mt-regua-fina bg-mt-surface p-3">
            <dt className={rotulo}>EM {v.meses} MESES</dt>
            <dd className="mt-titulo m-0 inline-flex items-center gap-1.5 text-xl tabular-nums">
              <span aria-hidden>{v.pct < 0 ? "▼" : v.pct > 0 ? "▲" : "■"}</span>
              {pct(v.pct)}
            </dd>
            <span className="text-[11px] tabular-nums text-mt-neutral-700">Era {reais(v.de)}</span>
          </div>
        ))}
        <div className="flex flex-col gap-0.5 border border-mt-regua-fina bg-mt-surface p-3">
          <dt className={rotulo}>DESDE O PICO</dt>
          <dd className="mt-titulo m-0 text-xl tabular-nums">{pct(tendencia.pico.pct)}</dd>
          <span className="text-[11px] tabular-nums text-mt-neutral-700">
            {reais(tendencia.pico.valor)} em {MESES[tendencia.pico.mes - 1]}/{String(tendencia.pico.ano).slice(2)}
          </span>
        </div>
      </dl>
      {mostrarRitmo && tendencia.ritmo && (
        <div className="flex items-center gap-3 text-sm">
          <SinalDeEstado estado={tendencia.ritmo === "acelerando" ? "atencao" : "ok"} />
          <span>
            {tendencia.ritmo === "acelerando"
              ? "A queda está acelerando: os últimos 6 meses caíram mais que os 6 anteriores. Cada mês de pátio custa mais."
              : tendencia.ritmo === "desacelerando"
                ? "A queda está perdendo força: os últimos 6 meses caíram menos que os 6 anteriores."
                : "A queda segue no mesmo ritmo dos 6 meses anteriores."}
          </span>
        </div>
      )}
      <GraficoDaFipe pontos={pontos} />
      <p className="m-0 text-[11px] leading-relaxed text-mt-neutral-700">
        A FIPE anda atrás do mercado: o gráfico mostra o que já aconteceu com a tabela. A projeção é conta, e não
        previsão.
        {zeroKm !== null ? ` Zero km hoje: ${reais(zeroKm)}.` : ""}
      </p>
    </section>
  );
}
