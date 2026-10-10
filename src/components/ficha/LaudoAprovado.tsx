import type { ReactNode } from "react";
import AoAparecer from "../modernist/AoAparecer";

/**
 * O corpo da seção do laudo quando ele está publicado e aprovado.
 *
 * Quem decide se isto aparece é a guarda na PDP
 * (`laudo_pericia && pericia === "PERÍCIA APROVADA"`), travada em
 * `tests/coerencia-da-pericia.test.ts` — este arquivo não olha o veículo.
 *
 * O selo é o do sistema (fundo escuro, ponto na cor de destaque), o mesmo da
 * perícia ao lado do nome do carro. Até 29/09 era um escudo verde-esmeralda:
 * a única peça verde da ficha, fora da paleta da marca. O texto do laudo vem
 * com régua de destaque à esquerda, como citação — é a palavra do perito, não
 * a da loja.
 *
 * `children` é a ponte para o guia do laudo, montada pela PDP (é lá que
 * `tests/links-entre-guias.test.ts` a procura).
 *
 * Desde 10/10 o selo assenta como um carimbo quando a seção chega à tela,
 * uma vez por visita (`AoAparecer` + `.mt-carimbo`, modernist.css): a perícia
 * é o argumento mais forte da loja, e o carimbo dá peso a ela sem texto a
 * mais. O HTML do servidor manda o selo pronto, no lugar.
 */
export default function LaudoAprovado({ laudo, children }: { laudo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <AoAparecer>
          <h3 className="mt-etiqueta mt-carimbo m-0 gap-2 text-[11px]">
            <span className="h-1.5 w-1.5 bg-mt-cobre-marca" aria-hidden="true" />
            LAUDO TÉCNICO APROVADO
          </h3>
        </AoAparecer>
        <p className="m-0 mt-2 text-sm text-mt-neutral-700">Histórico livre de sinistros e leilão</p>
      </div>
      <blockquote className="m-0 border-l-2 border-mt-cobre pl-4 text-[15px] leading-relaxed text-mt-neutral-800">
        &ldquo;{laudo}&rdquo;
      </blockquote>
      {children}
    </div>
  );
}
