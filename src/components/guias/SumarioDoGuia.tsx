"use client";

import { useEffect, useState } from "react";

/**
 * "Neste guia", na coluna ao lado do texto (computador). Marca a seção que
 * está na tela, para o leitor saber onde está num texto longo (redesenho de
 * 02/10/2026).
 *
 * A lista sai inteira no HTML do servidor, com as âncoras: sem JavaScript ela
 * funciona como antes, só não marca a seção atual.
 */
export default function SumarioDoGuia({ secoes }: { secoes: { ancora: string; titulo: string }[] }) {
  const [atual, setAtual] = useState<string | null>(null);

  useEffect(() => {
    const titulos = secoes
      .map((s) => document.getElementById(s.ancora))
      .filter((el): el is HTMLElement => el !== null);
    if (!titulos.length || typeof IntersectionObserver === "undefined") return;

    // A seção atual é a última cujo título já passou do terço de cima da tela.
    const conferir = () => {
      const limite = window.innerHeight * 0.35;
      let escolhida: string | null = null;
      for (const el of titulos) if (el.getBoundingClientRect().top <= limite) escolhida = el.id;
      setAtual(escolhida);
    };
    const observador = new IntersectionObserver(conferir, { rootMargin: "0px 0px -65% 0px", threshold: [0, 1] });
    titulos.forEach((el) => observador.observe(el));
    conferir();
    return () => observador.disconnect();
  }, [secoes]);

  return (
    <nav aria-label="Neste guia" className="border border-mt-regua p-5">
      <p className="m-0 text-[11px] font-extrabold uppercase tracking-[.16em] text-mt-ink">Neste guia</p>
      <ol role="list" className="m-0 mt-3 list-none p-0">
        {secoes.map((secao, i) => {
          const ativa = atual === secao.ancora;
          return (
            <li key={secao.ancora}>
              <a
                href={`#${secao.ancora}`}
                aria-current={ativa ? "location" : undefined}
                className={`mt-foco -ml-5 flex gap-3 border-l-[3px] py-2 pl-[17px] text-[14px] leading-snug no-underline hover:text-mt-ink ${
                  ativa ? "border-mt-accent font-extrabold text-mt-ink" : "border-transparent text-mt-neutral-700"
                }`}
              >
                <span aria-hidden="true" className={`text-[12px] font-extrabold ${ativa ? "text-mt-accent-hover" : ""}`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                {secao.titulo}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
