"use client";

import { useState } from "react";
import type { Veiculo } from "../../lib/supabase";
import { textoDeCompartilhamento } from "../../lib/mensagensDoVeiculo";

/**
 * Imprimir e compartilhar, no pé da coluna do preço.
 *
 * Até 29/09 cada ícone tinha a cor da rede ao passar o mouse (verde, degradê
 * do Instagram, azul): três marcas alheias piscando ao lado do preço. Agora
 * os três seguem a tinta do sistema, e o nome da rede está no rótulo.
 *
 * O "Instagram" nunca compartilhou nada: o Instagram não tem link de
 * compartilhamento na web, e o botão sempre copiou o endereço da ficha. O
 * rótulo agora diz isso.
 */
const QUADRADO =
  "mt-foco flex h-9 w-9 cursor-pointer items-center justify-center border border-mt-regua-media text-mt-neutral-700 transition-colors hover:border-mt-ink hover:bg-mt-ink hover:text-mt-bg";

export default function CompartilharFicha({ veiculo, precoTexto }: { veiculo: Veiculo; precoTexto: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiarLink = () => {
    if (typeof window === "undefined") return;
    navigator.clipboard.writeText(window.location.href);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="flex select-none items-center justify-between gap-4 border-t border-mt-regua-fina pt-4">
      <button
        type="button"
        onClick={() => window.print()}
        className="mt-foco flex cursor-pointer items-center gap-2 border border-mt-regua-media px-3 py-2 text-[11px] font-bold uppercase tracking-[.1em] text-mt-neutral-800 transition-colors hover:border-mt-ink hover:text-mt-ink"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
          <path strokeLinecap="square" d="M6 9V3h12v6M6 18H3v-8h18v8h-3M6 14h12v7H6z" />
        </svg>
        Imprimir ficha
      </button>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            const texto = textoDeCompartilhamento(veiculo, {
              precoTexto,
              url: typeof window !== "undefined" ? window.location.href : "",
            });
            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, "_blank");
          }}
          className={QUADRADO}
          aria-label="Compartilhar a ficha no WhatsApp"
          title="Compartilhar no WhatsApp"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
          </svg>
        </button>

        <div className="relative flex items-center">
          <button
            type="button"
            onClick={copiarLink}
            className={QUADRADO}
            aria-label="Copiar o link da ficha"
            title="Copiar o link (para o Instagram ou onde quiser)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="square" d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
            </svg>
          </button>
          <span
            role="status"
            className={`pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap bg-mt-inverso-fundo px-2 py-1 text-[11px] font-bold uppercase tracking-[.12em] text-mt-inverso ${
              copiado ? "" : "sr-only"
            }`}
          >
            {copiado ? "Link copiado" : ""}
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            const url = typeof window !== "undefined" ? window.location.href : "";
            window.open(
              `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
              "_blank",
              "width=600,height=400",
            );
          }}
          className={QUADRADO}
          aria-label="Compartilhar a ficha no Facebook"
          title="Compartilhar no Facebook"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M80 299.3V512H196V299.3h86.5l18-97.8H196V166.9c0-51.7 20.3-71.5 72.7-71.5c16.8 0 29.4.2 47.6 2.5L324.8 2C297.1 .4 268 0 245.6 0 147.9 0 99.5 41.6 99.5 145.5v56H16v97.8H80z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
