"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Um bloco que toca o seu movimento quando aparece na tela, uma vez (Onda 2
 * do plano de movimento, 10/10/2026). Serve ao carimbo do laudo, ao "3 em 10"
 * da home e às estrelas da reputação, que ficam abaixo da dobra.
 *
 * É o mesmo raciocínio da logo do rodapé (`LogoAnimado`, `inicio="visivel"`):
 *
 * - O HTML do servidor sai sem `data-aparece`: o bloco aparece pronto, no
 *   estado final. Sem JavaScript, ou com movimento reduzido, fica assim.
 * - No cliente, se o bloco estiver fora da tela, ele volta ao quadro zero
 *   (`data-aparece="armado"`, animações pausadas) — ninguém vê a volta.
 * - Quando metade dele entra na tela, toca (`"rodando"`) e o observador sai.
 * - Se já estiver na tela quando a página carrega, fica parado: tirar o
 *   bloco de quem já o está vendo para tocar a entrada seria pior.
 *
 * Também vale para o que nasce escondido, como o corpo de um acordeão
 * fechado: escondido não cruza a tela, então espera armado até abrir.
 *
 * O movimento em si mora no CSS (`modernist.css`, seção "movimento com
 * função"), em seletores com `[data-aparece]`.
 */
export default function AoAparecer({
  children,
  className,
  limiar = 0.5,
}: {
  children: ReactNode;
  className?: string;
  /** Quanto do bloco precisa estar na tela para tocar. */
  limiar?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<"armado" | "rodando" | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let primeira = true;
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (primeira) {
          primeira = false;
          if (entrada.intersectionRatio > 0) {
            observador.disconnect();
            return;
          }
          setEstado("armado");
          return;
        }
        if (entrada.intersectionRatio >= limiar) {
          setEstado("rodando");
          observador.disconnect();
        }
      },
      { threshold: [0, limiar] },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, [limiar]);

  return (
    <div ref={ref} className={className} data-aparece={estado}>
      {children}
    </div>
  );
}
