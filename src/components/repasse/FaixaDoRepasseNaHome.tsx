import { CAMINHO_DO_REPASSE, PORTAS_DO_REPASSE, verOsCarros } from "../../lib/paginaDoRepasse";
import type { FaixaNaHome } from "../../lib/portasDoRepasse";
import { LinkRegua } from "../modernist/primitivos";
import CardDaFaixa from "./CardDaFaixa";

/**
 * A faixa clara da home (spec 2026-09-24 §10; prancha "Portas de entrada",
 * seção 3): texto à esquerda, os três carros à direita. Quem escolhe os
 * carros, e decide se a faixa existe, é `faixaNaHome`. O CTA conta o lote
 * inteiro, o mesmo número do herói do `/repasse` (decisão 13 do plano do PR 4).
 */
export default function FaixaDoRepasseNaHome({ faixa }: { faixa: FaixaNaHome }) {
  return (
    <section aria-labelledby="faixa-do-repasse-na-home" className="mt-12 bg-mt-surface px-[18px] py-12 lg:mt-16 lg:px-10 lg:py-16">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12">
        <div>
          <p className="m-0 text-[11px] font-extrabold tracking-[.14em] text-mt-neutral-600">{PORTAS_DO_REPASSE.rotulo}</p>
          <h2 id="faixa-do-repasse-na-home" className="mt-titulo m-0 mt-3 text-[28px] lg:text-[34px]">
            {PORTAS_DO_REPASSE.home.titulo}
          </h2>
          <p className="m-0 mt-3 max-w-[420px] text-[14px] leading-relaxed text-mt-neutral-800">{PORTAS_DO_REPASSE.home.texto}</p>
          <div className="mt-6">
            <LinkRegua href={CAMINHO_DO_REPASSE}>{verOsCarros(faixa.totalNoLote)}</LinkRegua>
          </div>
        </div>
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-3">
          {faixa.carros.map((r) => (
            <li key={r.id}>
              <CardDaFaixa repasse={r} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
