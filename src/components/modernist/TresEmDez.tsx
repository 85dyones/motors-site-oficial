import type { CSSProperties } from "react";
import AoAparecer from "./AoAparecer";

/**
 * "3 em 10", mostrado em vez de dito (Onda 2 do plano de movimento,
 * 10/10/2026): dez casas, sete riscadas e três em cobre.
 *
 * Quando o bloco aparece na tela, as sete se riscam uma a uma e as três
 * acendem depois (`AoAparecer` + `.mt-tres-em-dez`, modernist.css). O estado
 * final é o desenho parado; é o que o servidor manda e o que vê quem pede
 * menos movimento. As casas são desenho (`aria-hidden`): quem diz a frase é o
 * texto ao lado ("3 EM 10 · VIRAM ESTOQUE").
 *
 * As três que ficam não são as três primeiras: a seleção é de dez carros
 * diferentes, e três em fila pareceria uma fila de espera.
 */
const FICAM = new Set([1, 4, 8]);

export default function TresEmDez({ className }: { className?: string }) {
  // `ordem` conta dentro de cada grupo: a 1ª que sai, a 2ª que sai… e a 1ª
  // que fica, a 2ª que fica.
  const casas = Array.from({ length: 10 }, (_, i) => {
    const ficamAntes = [...FICAM].filter((f) => f < i).length;
    return FICAM.has(i) ? { fica: true, ordem: ficamAntes } : { fica: false, ordem: i - ficamAntes };
  });

  return (
    <AoAparecer className={className}>
      <div className="mt-tres-em-dez" aria-hidden="true">
        {casas.map((casa, i) => (
          <span
            key={i}
            className={casa.fica ? "mt-tres-em-dez-fica" : "mt-tres-em-dez-sai"}
            style={{ "--mt-casa": casa.ordem } as CSSProperties}
          />
        ))}
      </div>
    </AoAparecer>
  );
}
