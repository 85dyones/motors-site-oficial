import type { ReactNode } from "react";

/**
 * A casca de toda seção da ficha abaixo da galeria: régua de 2px em cima,
 * título em versalete, conteúdo embaixo. Sem caixa, sem sombra, sem raio — o
 * mesmo desenho das faixas da home.
 *
 * Nasceu na Fase 2 da revisão de UI (29/09). Descrição, opcionais, laudo e
 * troca eram quatro caixas `bg-brand-card` com borda, cada uma com o seu
 * título: um vermelho com ícone, dois pretos em botão de acordeão, um num
 * quadro com ícone. Quatro desenhos para a mesma coisa.
 *
 * O título é sempre `h2`: as seções ficam abaixo do nome do carro, que é o
 * `h1` no celular (e `h2` no desktop, por causa do `h1` único).
 *
 * `recolhivel` liga o abre-e-fecha. O estado fica com quem monta a seção, e
 * não aqui, porque é lá que mora o evento de abertura (`pushFichaTecnica`).
 * O botão fica DENTRO do `h2`, que é o desenho de disclosure do WAI: quem
 * navega por títulos acha a seção e o controle no mesmo lugar. `idDoCorpo` é
 * obrigatório nesse caso, para o `aria-controls` apontar para algo.
 */
export default function SecaoDaFicha({
  titulo,
  children,
  recolhivel,
  className = "",
}: {
  titulo: string;
  children?: ReactNode;
  recolhivel?: { aberto: boolean; aoAlternar: () => void; idDoCorpo: string };
  className?: string;
}) {
  return (
    <section className={`border-t-2 border-mt-regua pt-4 ${className}`}>
      <h2 className="mt-rotulo m-0 py-1 text-mt-ink">
        {recolhivel ? (
          <button
            type="button"
            onClick={recolhivel.aoAlternar}
            aria-expanded={recolhivel.aberto}
            aria-controls={recolhivel.idDoCorpo}
            className="mt-foco mt-alvo flex w-full cursor-pointer items-center justify-between gap-4 text-left uppercase tracking-[inherit]"
          >
            <span>{titulo}</span>
            <span aria-hidden="true" className="text-lg font-normal leading-none text-mt-accent">
              {recolhivel.aberto ? "−" : "+"}
            </span>
          </button>
        ) : (
          titulo
        )}
      </h2>
      <div id={recolhivel?.idDoCorpo} hidden={recolhivel ? !recolhivel.aberto : undefined} className="pt-4">
        {children}
      </div>
    </section>
  );
}
