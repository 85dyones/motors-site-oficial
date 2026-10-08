"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Faz o `LogoAnimado` de dentro tocar quando o mouse passa por cima (08/10/2026).
 *
 * É o uso do cabeçalho e do rodapé: o logo fica parado, pronto, no lugar e no
 * tamanho de sempre, e a animação é um detalhe para quem passa o mouse.
 *
 * Três regras:
 *
 * 1. **Começou, termina.** Tirar o mouse no meio não corta a animação, que
 *    vai até o logo pronto. Passar de novo enquanto ela roda não reinicia.
 * 2. **Só mouse.** No toque, o primeiro toque no logo já é a navegação para a
 *    home, e não há "passar por cima".
 * 3. **Movimento reduzido não toca.** O logo fica como o servidor mandou.
 *
 * O estado mora no atributo `data-la` do logo, e não em `useState`: quem
 * anima é o CSS de `logoAnimadoCss.ts`, e este componente não desenha o logo.
 * Quando todas as animações terminam, o atributo sai e o logo volta ao estado
 * parado, que é o mesmo quadro final: nada pisca.
 */
export default function LogoAoPassarOMouse({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const caixa = ref.current;
    const logo = caixa?.querySelector<HTMLElement>(".la");
    if (!caixa || !logo) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let tocando = false;
    const tocar = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || tocando) return;
      tocando = true;
      logo.dataset.la = "tocando";
      // `getAnimations` força o cálculo de estilo: as animações do CSS já
      // existem aqui, e o `finished` de cada uma diz quando o logo ficou pronto.
      const animacoes = logo.getAnimations({ subtree: true });
      Promise.allSettled(animacoes.map((a) => a.finished)).then(() => {
        delete logo.dataset.la;
        tocando = false;
      });
    };

    caixa.addEventListener("pointerenter", tocar);
    return () => caixa.removeEventListener("pointerenter", tocar);
  }, []);

  return (
    <span ref={ref} className={className}>
      {children}
    </span>
  );
}
