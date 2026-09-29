"use client";

import { useEffect, useState } from "react";

/**
 * Um número que conta de zero até o valor — tarefa 3.7 da revisão de UI de
 * 29/09, o único movimento do site junto com a régua da capa que se desenha.
 *
 * O servidor desenha o valor FINAL: quem não roda JavaScript, o buscador e o
 * primeiro quadro veem o número certo. A contagem só começa no cliente, e só
 * para quem não pediu menos movimento — para esses o número fica parado.
 *
 * O leitor de tela ouve o valor uma vez, no `sr-only`; a parte que conta é
 * `aria-hidden`, senão ele leria cada passo (ou nenhum, com o valor errado).
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
  const [mostrado, setMostrado] = useState(valor);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let quadro = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const p = Math.min(1, (agora - inicio) / duracao);
      // Desacelera no fim: o número assenta, não freia de uma vez.
      const suavizado = 1 - Math.pow(1 - p, 3);
      setMostrado(Math.round(valor * suavizado));
      if (p < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => {
      cancelAnimationFrame(quadro);
      setMostrado(valor);
    };
  }, [valor, duracao]);

  return (
    <>
      <span aria-hidden="true" className="mt-numeros-surgem tabular-nums">
        {mostrado}
        {sufixo}
      </span>
      <span className="sr-only">
        {valor}
        {sufixo}
      </span>
    </>
  );
}
