"use client";

import { useState } from "react";
import {
  ORDENS_DO_LOTE,
  contagemPorFiltro,
  ordenarLote,
  type OrdemDoLote,
  type WhatsappDaLoja,
} from "../../lib/loteDoRepasse";
import { LOTE_DO_REPASSE, verOsOutros } from "../../lib/paginaDoRepasse";
import { FILTROS_DO_REPASSE, passaNoFiltro, type FiltroDoRepasse, type Repasse } from "../../lib/repasse";
import CardDoRepasse from "./CardDoRepasse";

/** No celular, a prancha mostra dois cards e o botão dos outros. */
const NO_CELULAR = 2;

/**
 * A ilha do lote (spec §7.1). Recebe os carros já lidos no servidor e só
 * filtra e ordena: o HTML inicial traz todos os cards com seus links, então o
 * rastreador acha cada ficha sem JavaScript — o problema medido do
 * `useSearchParams`, que servia zero link, não se aplica.
 *
 * Os filtros não são exclusivos (um carro com laudo e reparo está nos dois), e
 * filtro sem carro fica desligado em vez de mostrar grade vazia.
 */
export default function LoteDoRepasse({ lote, whatsappDaLoja }: { lote: Repasse[]; whatsappDaLoja: WhatsappDaLoja }) {
  const [filtro, setFiltro] = useState<FiltroDoRepasse>("todos");
  const [ordem, setOrdem] = useState<OrdemDoLote>("recentes");
  const [todosNoCelular, setTodosNoCelular] = useState(false);

  const contagem = contagemPorFiltro(lote);
  const visiveis = ordenarLote(
    lote.filter((r) => passaNoFiltro(r, filtro)),
    ordem,
  );
  const escondidos = Math.max(0, visiveis.length - NO_CELULAR);

  return (
    <div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div role="group" aria-label={LOTE_DO_REPASSE.rotulo} className="flex flex-wrap gap-2">
          {FILTROS_DO_REPASSE.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              disabled={f !== "todos" && contagem[f] === 0}
              onClick={() => {
                setFiltro(f);
                setTodosNoCelular(false);
              }}
              className={`mt-foco border-2 px-3 py-2 text-[11px] font-extrabold tracking-[.1em] disabled:opacity-40 ${
                filtro === f ? "border-mt-ink bg-mt-ink text-mt-bg" : "border-mt-regua text-mt-ink"
              }`}
            >
              {LOTE_DO_REPASSE.filtros[f]} {contagem[f]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12px] text-mt-neutral-700">
          {LOTE_DO_REPASSE.ordenarPor}
          <select
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as OrdemDoLote)}
            className="mt-foco border border-mt-regua bg-mt-bg px-2 py-1.5 text-[13px] text-mt-ink"
          >
            {ORDENS_DO_LOTE.map((o) => (
              <option key={o} value={o}>
                {LOTE_DO_REPASSE.ordens[o]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="m-0 mt-6 grid list-none gap-x-6 gap-y-10 p-0 sm:grid-cols-2 desktop:grid-cols-3">
        {visiveis.map((r, i) => (
          <li key={r.id} className={i >= NO_CELULAR && !todosNoCelular ? "hidden sm:block" : ""}>
            <CardDoRepasse repasse={r} whatsappDaLoja={whatsappDaLoja} prioridade={i === 0} />
          </li>
        ))}
      </ul>

      {escondidos > 0 && !todosNoCelular && (
        <button
          type="button"
          onClick={() => setTodosNoCelular(true)}
          className="mt-btn mt-btn-contorno mt-foco mt-6 sm:hidden"
        >
          {verOsOutros(escondidos)}
        </button>
      )}
    </div>
  );
}
