"use client";

import Image from "next/image";
import { useState } from "react";
import { ehFotoPropria } from "../../lib/fotosDoVeiculo";
import { contadorDaGaleria, rotuloDoDefeito } from "../../lib/paginaDoRepasse";
import type { EtiquetaDoRepasse } from "../../lib/repasse";
import { Etiqueta } from "../modernist/primitivos";

export interface FotoDaGaleria {
  src: string;
  alt: string;
  /** Número do defeito na ficha de estado; null para foto do carro. */
  defeito: number | null;
}

/**
 * A galeria da ficha do repasse (prancha "Ficha do carro de repasse"): as
 * fotos do carro e, depois delas, as fotos de defeito da ficha de estado,
 * marcadas. Foto nossa (bucket `veiculos`) vai sem otimizador, como no card
 * do estoque — o checklist do painel só publica foto nossa.
 */
export default function GaleriaDoRepasse({ fotos, etiqueta }: { fotos: FotoDaGaleria[]; etiqueta: EtiquetaDoRepasse }) {
  const [atual, setAtual] = useState(0);
  const defeitos = fotos.filter((f) => f.defeito !== null).length;
  const foto = fotos.length > 0 ? fotos[Math.min(atual, fotos.length - 1)] : null;

  return (
    <div>
      <div className="relative aspect-[4/3] bg-mt-neutral-300">
        {foto && (
          <Image
            key={foto.src}
            src={foto.src}
            alt={foto.alt}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 58vw"
            unoptimized={ehFotoPropria(foto.src)}
            className="object-cover"
          />
        )}
        <Etiqueta accent={etiqueta === "COM LAUDO"} className="pointer-events-none absolute left-0 top-0 text-[11px]">
          {etiqueta}
        </Etiqueta>
        {fotos.length > 0 && (
          <span className="pointer-events-none absolute bottom-0 right-0 bg-[rgba(20,18,18,.82)] px-2 py-1 text-[11px] font-semibold text-mt-inverso">
            {contadorDaGaleria(atual + 1, fotos.length, defeitos)}
          </span>
        )}
      </div>
      {fotos.length > 1 && (
        <ul className="m-0 mt-2 flex list-none gap-2 overflow-x-auto p-0">
          {fotos.map((f, i) => (
            <li key={`${i}-${f.src}`} className="shrink-0">
              <button
                type="button"
                aria-label={f.alt}
                aria-pressed={i === atual}
                onClick={() => setAtual(i)}
                className={`mt-foco relative block h-16 w-20 border-2 ${
                  f.defeito !== null ? "border-mt-accent" : i === atual ? "border-mt-ink" : "border-transparent"
                }`}
              >
                <Image src={f.src} alt="" fill sizes="80px" unoptimized={ehFotoPropria(f.src)} className="object-cover" />
                {f.defeito !== null && (
                  <span className="absolute inset-x-0 bottom-0 bg-mt-accent px-1 text-[8px] font-extrabold tracking-[.08em] text-mt-inverso">
                    {rotuloDoDefeito(f.defeito)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
