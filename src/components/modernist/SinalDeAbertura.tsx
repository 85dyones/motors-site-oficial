"use client";

import { useLinkStatus } from "next/link";

/**
 * O card tocado avisa que está abrindo (revisão de qualidade percebida,
 * 30/09/2026).
 *
 * Quando a ficha ainda não está pronta no cache (carro recém-cadastrado, ou a
 * primeira visita depois da revalidação), a troca de página demora e a tela
 * ficava parada, sem sinal de que o toque tinha pegado. Agora uma linha cobre
 * corre na base da foto do card enquanto a ficha carrega.
 *
 * Por que aqui e não um `loading.tsx` na rota da ficha: o `loading.tsx` faz a
 * página responder em partes, e a primeira parte sai antes de a ficha decidir
 * se o carro existe. Com isso o `permanentRedirect` da URL antiga deixaria de
 * ser um 308 e o `notFound` do carro vendido deixaria de ser um 404, e é com
 * esses dois códigos que o Google troca e tira URLs do índice.
 *
 * `useLinkStatus` só funciona dentro de um `<Link>`, e é lá que o
 * `CardVeiculo` o desenha. Navegação que já estava pré-carregada nem liga o
 * estado; a que liga só mostra a linha depois de 120 ms (CSS), então
 * navegação rápida não pisca.
 */
export default function SinalDeAbertura() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      data-abrindo={pending ? "sim" : undefined}
      className="mt-sinal-de-abertura pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[3px]"
    />
  );
}
