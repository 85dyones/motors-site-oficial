"use client";

import { useEffect, useRef, useState } from "react";

/** Quando os números aparecem (ms desde a navegação) — o mesmo atraso do CSS. */
const APARECE_EM_MS = 700;

/**
 * Um número que conta de zero até o valor — tarefa 3.7 da revisão de UI de
 * 29/09, junto com a régua da capa que se desenha. Foi o único movimento de
 * entrada do site até 09/10; o resto segue a regra do "movimento com função"
 * (fim de `modernist.css`). Contar do zero continua sendo só da capa: o número
 * que muda depois de um gesto gira no `Hodometro`.
 *
 * A coreografia: a régua se desenha, e os números aparecem (`.mt-numeros-
 * surgem`, invisíveis até 0,7 s) já contando. O servidor desenha o valor
 * FINAL — quem não roda JavaScript e o buscador leem o número certo, e é
 * também o que aparece se a contagem não rodar.
 *
 * A contagem NÃO roda quando:
 * - a pessoa pediu menos movimento;
 * - o número não está na tela (a régua da capa só existe do `lg` para cima —
 *   no celular seriam dezenas de renders à toa na janela do LCP);
 * - a hidratação chegou depois de o número aparecer (medido no relógio da
 *   animação de entrada dele): contar a partir dali seria mostrar o valor
 *   final, cair para zero e recontar.
 *
 * Um span só, sem `sr-only` duplicado: o texto do DOM é o que o rastreador
 * lê, e "4141" não é um número. A contagem dura menos de um segundo e não
 * tem `aria-live`, então o leitor de tela não a anuncia.
 */
export default function NumeroQueConta({
  valor,
  sufixo = "",
  duracao = 900,
}: {
  valor: number;
  sufixo?: string;
  /** Milissegundos até chegar ao valor. */
  duracao?: number;
}) {
  // `null` = mostra o valor de verdade. Só vira número durante a contagem, e
  // por isso uma troca de `valor` nunca deixa o número velho na tela.
  const [contagem, setContagem] = useState<number | null>(null);
  const alvo = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = alvo.current;
    if (!el || el.getClientRects().length === 0) return;
    // Quanto tempo a animação de entrada do número já correu. O relógio dela
    // começa quando o número é pintado — também numa navegação interna até a
    // home, em que `performance.now()` já passou do limite há muito. Sem
    // `getAnimations` (navegador antigo), cai no relógio da navegação.
    const animacao = typeof el.getAnimations === "function" ? el.getAnimations()[0] : undefined;
    const agora =
      animacao && typeof animacao.currentTime === "number" ? animacao.currentTime : performance.now();
    if (agora > APARECE_EM_MS) return;

    let quadro = 0;
    let inicio: number | null = null;
    const passo = (t: number) => {
      // O primeiro quadro marca o início: o carimbo do rAF pode ser anterior
      // ao `performance.now()` do efeito, e a conta daria número negativo.
      if (inicio === null) inicio = t;
      const p = Math.min(1, Math.max(0, (t - inicio) / duracao));
      const suavizado = 1 - Math.pow(1 - p, 3);
      if (p < 1) {
        setContagem(Math.round(valor * suavizado));
        quadro = requestAnimationFrame(passo);
      } else {
        setContagem(null);
      }
    };
    // Vai a zero no próximo quadro (o número ainda está invisível) e passa a
    // avançar quando ele aparece.
    const zera = requestAnimationFrame(() => setContagem(0));
    const espera = window.setTimeout(() => {
      quadro = requestAnimationFrame(passo);
    }, APARECE_EM_MS - agora);
    return () => {
      cancelAnimationFrame(zera);
      window.clearTimeout(espera);
      cancelAnimationFrame(quadro);
      setContagem(null);
    };
  }, [valor, duracao]);

  return (
    <span ref={alvo} className="mt-numeros-surgem tabular-nums">
      {contagem ?? valor}
      {sufixo}
    </span>
  );
}
