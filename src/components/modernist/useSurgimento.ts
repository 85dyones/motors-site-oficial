"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";

/**
 * A foto surge em vez de piscar (revisão de qualidade percebida, 30/09/2026).
 *
 * Até aqui o card mostrava o fundo cinza e a foto entrava de uma vez quando
 * terminava de baixar. Agora ela esmaece em 240 ms (o CSS está em
 * `modernist.css`, seletor `img[data-surge]`).
 *
 * Três regras seguram o risco de uma foto sumir:
 *
 * 1. **O HTML do servidor não esconde nada.** O atributo só aparece depois da
 *    hidratação, e só se a foto ainda não tiver chegado. Sem JavaScript, com o
 *    JavaScript quebrado ou com a foto já no cache, ela aparece como antes.
 * 2. **Foto prioritária não passa por isso** (`imediata`: `priority`, ou o
 *    `preload` que o substitui no Next 16). É a capa das
 *    primeiras linhas do `/estoque` e da ficha, a que conta para o LCP: uma
 *    imagem com opacidade zero não conta como pintada.
 * 3. **Erro também revela.** Se a foto falhar, o estado volta ao normal e o
 *    navegador mostra o que mostraria sem este código. E o CSS tem uma
 *    garantia de 4 s que revela a foto mesmo se nenhum evento chegar.
 */
export type EstadoDoSurgimento = "espera" | "pronta";

type EventoDeImagem = SyntheticEvent<HTMLImageElement, Event>;

export function useSurgimento({
  imediata = false,
  onLoad,
  onError,
}: {
  imediata?: boolean;
  onLoad?: (e: EventoDeImagem) => void;
  onError?: (e: EventoDeImagem) => void;
} = {}) {
  const ref = useRef<HTMLImageElement>(null);
  const [estado, setEstado] = useState<EstadoDoSurgimento | null>(null);

  useEffect(() => {
    if (imediata) return;
    const img = ref.current;
    // `complete` também é verdadeiro para foto quebrada: nesse caso não há o
    // que esmaecer.
    if (img && !img.complete) setEstado("espera");
  }, [imediata]);

  // A atualização funcional preserva a ordem: se o `load` chegar logo depois
  // do efeito, "espera" e "pronta" são aplicados nessa sequência.
  const revelar = () => setEstado((atual) => (atual === "espera" ? "pronta" : atual));

  return {
    ref,
    "data-surge": estado ?? undefined,
    onLoad: (e: EventoDeImagem) => {
      revelar();
      onLoad?.(e);
    },
    onError: (e: EventoDeImagem) => {
      revelar();
      onError?.(e);
    },
  };
}
