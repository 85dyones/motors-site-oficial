"use client";

import Link from "next/link";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { Transicao, transicaoPermitida } from "./Transicao";

/**
 * A foto do card viaja até a galeria da ficha (Piloto do plano de movimento,
 * item 12, 10/10/2026).
 *
 * Quem toca um card vê a MESMA foto crescer até o topo da ficha, em vez de uma
 * página trocar pela outra. É a resposta a "abri o carro certo?" antes de ler
 * qualquer coisa.
 *
 * Como funciona, nas três peças deste arquivo:
 *
 * - `LinkDoCard` é o link do `CardVeiculo`. No `onNavigate` (só navegação
 *   dentro do site; nova aba e Ctrl+clique não passam por ele) ele marca o
 *   card como "viajando" e guarda o endereço exato da foto que o navegador já
 *   baixou.
 * - `FotoQueViaja` é a foto do card. Só o card que viaja ganha nome; os
 *   outros ficam com o nome automático do React, que não casa com nada. Sem
 *   isso, a home levaria os seus cards para os mesmos carros no /estoque, e a
 *   ficha puxaria os "parecidos" que também estavam na vitrine.
 * - `FotoQueChega` é a primeira foto da galeria, sempre com o nome do carro.
 *
 * A navegação do Next já é uma transição do React: com os dois nomes iguais
 * dos dois lados, o React chama `document.startViewTransition` e o navegador
 * leva uma caixa até a outra (`.mt-foto-viaja`, modernist.css).
 *
 * O que fica como hoje, de propósito:
 *
 * - Navegador sem view transitions, ou quem pediu menos movimento: o card não
 *   ganha nome, nada casa, a ficha aparece de uma vez.
 * - O botão voltar: o card da vitrine nasce de novo, sem nome. A volta é
 *   instantânea, como sempre foi.
 * - O resto da página não anima: o React tira o nome da raiz, então só a foto
 *   se move e o resto troca na hora.
 */

export const CLASSE_DA_VIAGEM = "mt-foto-viaja";

/** O nome que liga a foto do card à foto da ficha. Precisa ser um ident de CSS. */
export function nomeDaViagem(id: string | number): string {
  return `mt-foto-${String(id).replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/**
 * A foto que o card acabou de soltar, para a ficha pôr por baixo da dela.
 *
 * A galeria pede outra largura ao otimizador (900 px contra o terço de tela do
 * card), e essa foto ainda não chegou quando a viagem começa: a caixa
 * cresceria até um retângulo escuro e a foto pularia depois. A do card já
 * está no cache do navegador, então a ficha a desenha na hora, embaixo, e a
 * foto grande cobre quando chegar — o mesmo enquadramento, só mais nítido.
 *
 * Variável de módulo e não estado: os dois lados são componentes diferentes,
 * em páginas diferentes, e só se encontram aqui. Só o clique escreve; no
 * servidor ela nunca sai de `null`.
 */
const viagem: { atual: { id: string; src: string } | null } = { atual: null };

export function fotoEmViagem(id: string | number): string | undefined {
  return viagem.atual && viagem.atual.id === String(id) ? viagem.atual.src : undefined;
}

const Viajando = createContext(false);

export function LinkDoCard({
  href,
  className,
  idDoVeiculo,
  children,
}: {
  href: string;
  className?: string;
  idDoVeiculo?: string;
  children: ReactNode;
}) {
  const ancora = useRef<HTMLAnchorElement>(null);
  const [viajando, setViajando] = useState(false);
  return (
    <Link
      ref={ancora}
      href={href}
      className={className}
      onNavigate={() => {
        if (!idDoVeiculo || !transicaoPermitida()) return;
        const foto = ancora.current?.querySelector<HTMLImageElement>("img.mt-card-foto");
        viagem.atual =
          foto?.complete && foto.currentSrc ? { id: String(idDoVeiculo), src: foto.currentSrc } : null;
        setViajando(true);
      }}
    >
      <Viajando.Provider value={viajando}>{children}</Viajando.Provider>
    </Link>
  );
}

/**
 * A foto do card. A moldura nova (`absolute inset-0`) é o que viaja: ela corta
 * o zoom do mouse (`.mt-card-foto`), e os selos e a contagem de fotos, que são
 * irmãos dela, ficam no card.
 */
export function FotoQueViaja({ idDoVeiculo, children }: { idDoVeiculo?: string; children: ReactNode }) {
  const viajando = useContext(Viajando);
  return (
    <Transicao
      name={viajando && idDoVeiculo ? nomeDaViagem(idDoVeiculo) : undefined}
      share={CLASSE_DA_VIAGEM}
      default="none"
    >
      <div className="absolute inset-0 overflow-hidden">{children}</div>
    </Transicao>
  );
}

/** A primeira foto da galeria da ficha: o destino da viagem. */
export function FotoQueChega({ idDoVeiculo, children }: { idDoVeiculo: string; children: ReactNode }) {
  return (
    <Transicao name={nomeDaViagem(idDoVeiculo)} share={CLASSE_DA_VIAGEM} default="none">
      {children}
    </Transicao>
  );
}
