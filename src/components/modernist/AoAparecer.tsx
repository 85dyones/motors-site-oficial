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
 * Como as animações voltam ao zero: ao sair, o bloco passa um instante por
 * `data-aparece="zerando"`, em que o CSS tira as animações de dentro
 * (`animation-name: none`); o navegador as descarta, e no mesmo quadro o
 * bloco volta a `"armado"`, que as recria paradas no quadro zero. Sem
 * remontar nada e sem a API de animações: pela API, as animações que já
 * tinham terminado sem preencher o fim (a letra da digitação, o hodômetro
 * que chega) nem apareciam na lista, e não voltavam (medido no preview,
 * 10/10). E trocar o preenchimento delas para `both` não serve: no
 * hodômetro, a animação preenchida engole a transição da troca de valor.
 * As transições não são afetadas.
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
  // O estado também numa ref, para o observador decidir sem refazer a
  // inscrição a cada troca.
  const atual = useRef<typeof estado>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Saiu inteiro (ou nasceu fora da tela): "zerando" por um instante, no
    // próprio DOM — o CSS tira as animações de dentro, e a leitura de
    // `offsetWidth` obriga o navegador a descartá-las já —, e então
    // "armado", que o React grava e que as recria paradas no quadro zero.
    const armar = () => {
      el.setAttribute("data-aparece", "zerando");
      void el.offsetWidth;
      atual.current = "armado";
      setEstado("armado");
    };
    let primeira = true;
    const observador = new IntersectionObserver(
      ([entrada]) => {
        const razao = entrada.intersectionRatio;
        if (primeira) {
          primeira = false;
          // Na tela desde a carga: fica como está até sair.
          if (razao > 0) return;
          armar();
          return;
        }
        if (razao === 0 && atual.current !== "armado") armar();
        else if (razao >= limiar && atual.current === "armado") {
          atual.current = "rodando";
          setEstado("rodando");
        }
      },
      { threshold: [0, limiar] },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, [limiar]);

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
