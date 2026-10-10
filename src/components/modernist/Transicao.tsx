import * as React from "react";
import type { ComponentType, ReactNode } from "react";

/**
 * A porta para o `<ViewTransition>` do React (Piloto do plano de movimento,
 * 10/10/2026): a foto do card que viaja até a ficha e os cards do /estoque
 * que se reorganizam quando o filtro muda.
 *
 * Por que uma porta e não o `import { ViewTransition } from "react"` direto:
 * existem dois Reacts neste repositório, e só um tem o componente.
 *
 * - No site, o App Router roda o React que vem DENTRO do Next
 *   (`next/dist/compiled/react`, hoje 19.3 canário). Ele tem `ViewTransition`
 *   e `addTransitionType`, e o Next 16 documenta os dois no guia de view
 *   transitions. Não precisa do React experimental: a flag do Next não liga
 *   nada aqui (`needsExperimentalReact` só olha `taint`,
 *   `transitionIndicator` e `gestureTransition`).
 * - Nos testes, o `react` é o do `node_modules` (19.2 estável), que não tem
 *   nenhum dos dois. Um `import` nomeado viraria `undefined` e o primeiro card
 *   renderizado quebraria a suíte.
 *
 * Sem o componente, os filhos passam direto e a troca acontece como sempre
 * aconteceu, de uma vez. É o mesmo caminho de quem usa um navegador sem
 * `document.startViewTransition`: o React nem tenta animar.
 *
 * `tests/movimento-piloto.test.ts` confere que o React do Next continua
 * exportando os dois: se uma atualização os tirar, o teste avisa antes do
 * movimento sumir em silêncio.
 *
 * O desenho em si mora no CSS (`modernist.css`, seção "Piloto").
 */

/** Uma classe só, ou uma por tipo de transição (`{ "mt-vitrine": "…", default: "none" }`). */
type Classe = string | Record<string, string>;

export type PropsDaTransicao = {
  /** Sem nome, o React gera um; com nome, ele casa com o mesmo nome do outro lado. */
  name?: string;
  default?: Classe;
  enter?: Classe;
  exit?: Classe;
  update?: Classe;
  share?: Classe;
  children: ReactNode;
};

const doReact = React as unknown as {
  ViewTransition?: ComponentType<PropsDaTransicao>;
  addTransitionType?: (tipo: string) => void;
};
const ViewTransitionDoReact = doReact.ViewTransition;

export function Transicao(props: PropsDaTransicao) {
  if (!ViewTransitionDoReact) return <>{props.children}</>;
  return <ViewTransitionDoReact {...props} />;
}

/**
 * Marca a transição em curso com um tipo. Só vale dentro de um
 * `startTransition`; é o tipo que decide se as classes de `Transicao` acendem.
 */
export function marcarTransicao(tipo: string) {
  doReact.addTransitionType?.(tipo);
}

/**
 * O navegador anima e a pessoa não pediu menos movimento. Só no cliente, e só
 * na hora do gesto: quem chama é um clique ou um efeito, nunca a renderização.
 */
export function transicaoPermitida(): boolean {
  return (
    typeof document !== "undefined" &&
    "startViewTransition" in document &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
