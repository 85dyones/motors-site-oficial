"use client";

import { useState } from "react";
import { ANCORA_DA_LISTA, ANCORA_DA_LISTA_LOJISTA, ANCORA_DO_LOTE, HEROI_DO_REPASSE, verOsCarros } from "../../lib/paginaDoRepasse";

type Trilha = "usar" | "revender";

/**
 * O seletor "Para que você compra" do herói (prancha "Página /repasse"). Troca
 * o parágrafo e as duas chamadas; "CADASTRAR MEU CNPJ" leva a
 * `#lista-lojista`, que a lista abre já na trilha do lojista (decisão 5). Os
 * rótulos curtos do celular são spans responsivos (decisão 7).
 */
export default function TrilhaDoHeroi({ totalNoLote }: { totalNoLote: number }) {
  const [trilha, setTrilha] = useState<Trilha>("usar");
  const H = HEROI_DO_REPASSE;
  const botao = (t: Trilha) =>
    `mt-foco border-2 px-4 py-2.5 text-[12px] font-extrabold tracking-[.1em] ${
      trilha === t ? "border-mt-inverso bg-mt-inverso text-mt-inverso-fundo" : "border-mt-inverso-regua text-mt-inverso"
    }`;
  const contorno = "mt-btn mt-foco text-mt-inverso shadow-[inset_0_0_0_2px_currentColor]";

  return (
    <div className="mt-6">
      <div role="group" aria-label={H.legenda} className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={trilha === "usar"} onClick={() => setTrilha("usar")} className={botao("usar")}>
          <span className="hidden sm:inline">{H.usar.botao}</span>
          <span className="sm:hidden">{H.usar.botaoCurto}</span>
        </button>
        <button type="button" aria-pressed={trilha === "revender"} onClick={() => setTrilha("revender")} className={botao("revender")}>
          <span className="hidden sm:inline">{H.revender.botao}</span>
          <span className="sm:hidden">{H.revender.botaoCurto}</span>
        </button>
      </div>
      <p className="m-0 mt-4 max-w-[560px] text-[15px] leading-relaxed">
        {trilha === "usar" ? H.usar.texto : H.revender.texto}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        {trilha === "usar" ? (
          <>
            <a href={`#${ANCORA_DO_LOTE}`} className="mt-btn mt-btn-primario mt-foco">
              {verOsCarros(totalNoLote)}
            </a>
            <a href={`#${ANCORA_DA_LISTA}`} className={contorno}>
              {H.usar.receber}
            </a>
          </>
        ) : (
          <>
            <a href={`#${ANCORA_DA_LISTA_LOJISTA}`} className="mt-btn mt-btn-primario mt-foco">
              {H.revender.cadastrar}
            </a>
            <a href={`#${ANCORA_DO_LOTE}`} className={contorno}>
              {H.revender.verAberto}
            </a>
          </>
        )}
      </div>
    </div>
  );
}
