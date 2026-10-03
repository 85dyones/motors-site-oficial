"use client";

import { createContext, createElement, useContext } from "react";

/**
 * O título de cada bloco do detalhe do lead.
 *
 * O mesmo detalhe é desenhado em dois lugares: na página, onde o nome do lead
 * é o `h1` e os blocos são `h2`; e na gaveta, que abre sobre a tela de Leads
 * (que já tem o seu `h1`), onde o nome é `h2` e os blocos, `h3`. O nível vem
 * por contexto para os blocos não receberem uma prop só para isso.
 */
export const NivelDoTituloDeBloco = createContext<"h2" | "h3">("h3");

export default function TituloDeBloco({ id, children }: { id: string; children: React.ReactNode }) {
  const nivel = useContext(NivelDoTituloDeBloco);
  return createElement(nivel, { id, className: "mt-rotulo m-0" }, children);
}
