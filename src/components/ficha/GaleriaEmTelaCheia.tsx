"use client";

import { useEffect, useRef } from "react";
import FotoDaFicha from "./FotoDaFicha";

/**
 * As fotos em tela cheia.
 *
 * Só existe montado enquanto está aberto, e por isso as duas travas moram
 * aqui e não na PDP: a rolagem da página presa enquanto ele está na tela, e o
 * teclado (Esc fecha, setas trocam a foto). Montar e desmontar liga e desliga
 * as duas sem estado a mais.
 *
 * `imagens` é sempre o `displayImages` da PDP (WhatsApp com fallback para a
 * web), o mesmo array que a galeria e as miniaturas indexam. Ler o outro abria
 * a foto errada quando os dois divergiam.
 *
 * Até 29/09: fundo com desfoque, botões redondos de vidro fosco e seta que
 * acendia na cor do tema antigo. Agora é a mesma linguagem das setas da
 * galeria: quadrado escuro, destaque no hover, sem raio.
 */
const SETA =
  "mt-foco absolute top-1/2 z-50 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center bg-[rgba(20,18,18,.72)] text-mt-inverso transition-colors hover:bg-mt-accent sm:h-14 sm:w-14";

export default function GaleriaEmTelaCheia({
  imagens,
  indice,
  aoMudar,
  aoFechar,
  nome,
}: {
  imagens: string[];
  indice: number;
  aoMudar: (proximo: number) => void;
  aoFechar: () => void;
  nome: string;
}) {
  const total = imagens.length;
  const fechar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    fechar.current?.focus();
    return () => {
      document.body.style.overflow = antes;
    };
  }, []);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
      else if (e.key === "ArrowRight") aoMudar((indice + 1) % total);
      else if (e.key === "ArrowLeft") aoMudar((indice - 1 + total) % total);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [indice, total, aoMudar, aoFechar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Fotos do ${nome}`}
      className="fixed inset-0 z-[9999] flex select-none flex-col overflow-hidden bg-[#0d0c0c] font-modernist print:hidden"
    >
      <div className="absolute left-0 right-0 top-0 z-50 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center">
          <span className="truncate bg-[rgba(20,18,18,.85)] px-3.5 py-2.5 text-xs font-extrabold uppercase tracking-[.12em] text-mt-inverso sm:text-sm">
            {nome}
          </span>
          <span className="bg-mt-accent px-3 py-2.5 text-xs font-semibold tabular-nums tracking-[.08em] text-mt-inverso sm:text-sm">
            {String(indice + 1).padStart(2, "0")} / {total}
          </span>
        </div>
        <button
          ref={fechar}
          type="button"
          onClick={aoFechar}
          className="mt-foco flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center bg-[rgba(20,18,18,.85)] text-mt-inverso transition-colors hover:bg-mt-accent sm:h-12 sm:w-12"
          title="Fechar tela cheia"
          aria-label="Fechar visualização em tela cheia"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="h-5 w-5" aria-hidden="true">
            <path strokeLinecap="square" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
        {total > 1 && (
          <button
            type="button"
            onClick={() => aoMudar((indice - 1 + total) % total)}
            className={`${SETA} left-0`}
            aria-label="Imagem anterior"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="h-5 w-5" aria-hidden="true">
              <path strokeLinecap="square" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}

        <div className="relative h-full w-full">
          <FotoDaFicha
            src={imagens[indice]}
            alt={`${nome} — imagem ampliada ${indice + 1}`}
            fill
            className="object-contain p-2 sm:p-4"
            sizes="100vw"
            priority
          />
        </div>

        {total > 1 && (
          <button
            type="button"
            onClick={() => aoMudar((indice + 1) % total)}
            className={`${SETA} right-0`}
            aria-label="Próxima imagem"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="h-5 w-5" aria-hidden="true">
              <path strokeLinecap="square" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
