"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Liga o `LogoAnimado` quando ele aparece na tela (07/10/2026).
 *
 * O logo em si é HTML de servidor e não precisa disto para existir: sem
 * JavaScript ele fica parado, pronto. Este invólucro só troca o atributo
 * `data-la` do logo que está dentro dele, em dois passos:
 *
 * 1. Depois da hidratação, `armado`: o logo volta ao primeiro quadro e espera.
 *    Como o uso é abaixo da dobra, ninguém vê essa troca.
 * 2. Quando 35% da caixa entra na tela, `tocando`. Toca uma vez; o
 *    observador é desligado em seguida.
 *
 * Quem pediu menos movimento não passa por nenhum dos dois: o logo fica como
 * o servidor mandou. O estado mora no DOM e não em `useState` porque é um
 * atributo num nó que este componente não desenha; não há o que re-renderizar.
 */
export default function LogoAoEntrarNaTela({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const logo = ref.current?.querySelector<HTMLElement>(".la");
    if (!logo || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    logo.dataset.la = "armado";
    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return;
        logo.dataset.la = "tocando";
        observador.disconnect();
      },
      { threshold: 0.35 },
    );
    observador.observe(logo);
    return () => observador.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
