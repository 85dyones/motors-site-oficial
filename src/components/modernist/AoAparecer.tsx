"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

/**
 * Um bloco que toca o seu movimento quando aparece na tela — e de novo cada
 * vez que sai e volta (Onda 2 do plano de movimento, 10/10/2026; a volta,
 * pedido do dono no mesmo dia: "a animação precisa ativar caso saia de foco e
 * volte novamente a ser mostrada").
 *
 * É o mesmo raciocínio da logo do rodapé (`LogoAnimado`, `inicio="visivel"`):
 *
 * - O HTML do servidor sai sem `data-aparece`: o bloco aparece pronto, no
 *   estado final. Sem JavaScript, ou com movimento reduzido, fica assim.
 * - No cliente, se o bloco estiver fora da tela, ele volta ao quadro zero
 *   (`data-aparece="armado"`, animações pausadas) — ninguém vê a volta.
 * - Quando metade dele entra na tela, toca (`"rodando"`).
 * - Se já estiver na tela quando a página carrega, fica como está: tirar o
 *   bloco de quem já o está vendo para tocar a entrada seria pior. O que ele
 *   tiver de animação de carga (o título que acende) toca normalmente.
 * - Quando sai INTEIRO da tela, rearma: as animações de dentro voltam ao
 *   quadro zero, paradas, e tocam de novo quando metade dele voltar. A folga
 *   entre "saiu inteiro" e "voltou metade" evita que um bloco na beirada da
 *   tela fique tocando sem parar.
 *
 * Quem volta ao zero e toca de novo são as animações CSS de dentro do bloco,
 * pela API de animações do navegador (`getAnimations`): sem remontar nada,
 * sem refazer a página. As ligadas à rolagem (`animation-timeline`) ficam de
 * fora — essas já andam com a rolagem — e as transições também.
 *
 * Também vale para o que nasce escondido, como o corpo de um acordeão
 * fechado: escondido não cruza a tela, então espera armado até abrir.
 *
 * `como="span"` é para morar dentro de um título (`TextoCinetico`): `div`
 * dentro de `h1` não é HTML válido.
 *
 * O movimento em si mora no CSS (`modernist.css`, seções "movimento com
 * função"), em seletores com `[data-aparece]`.
 */
export default function AoAparecer({
  children,
  className,
  limiar = 0.5,
  como = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Quanto do bloco precisa estar na tela para tocar. */
  limiar?: number;
  como?: "div" | "span";
}) {
  const ref = useRef<HTMLElement>(null);
  const [estado, setEstado] = useState<"armado" | "rodando" | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let primeira = true;
    const observador = new IntersectionObserver(
      ([entrada]) => {
        const razao = entrada.intersectionRatio;
        if (primeira) {
          primeira = false;
          // Na tela desde a carga: fica como está até sair.
          if (razao > 0) return;
          setEstado("armado");
          return;
        }
        if (razao === 0) setEstado((atual) => (atual === "armado" ? atual : "armado"));
        else if (razao >= limiar) setEstado((atual) => (atual === "armado" ? "rodando" : atual));
      },
      { threshold: [0, limiar] },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, [limiar]);

  // Armado: as animações de dentro voltam ao quadro zero e param. Rodando:
  // tocam do começo. Na primeira vez que arma, as animações presas a
  // `[data-aparece]` nascem agora, e o `pause` as segura no zero também.
  useEffect(() => {
    const el = ref.current;
    if (!el || !estado || typeof el.getAnimations !== "function") return;
    const daEntrada = el
      .getAnimations({ subtree: true })
      .filter((a) => "animationName" in a && a.timeline === document.timeline);
    for (const animacao of daEntrada) {
      if (estado === "armado") {
        animacao.pause();
        animacao.currentTime = 0;
      } else {
        animacao.play();
      }
    }
  }, [estado]);

  if (como === "span") {
    return (
      <span ref={ref} className={className} data-aparece={estado}>
        {children}
      </span>
    );
  }
  return (
    <div ref={ref as RefObject<HTMLDivElement>} className={className} data-aparece={estado}>
      {children}
    </div>
  );
}
