import type { Veiculo } from "../../types";
import { chegadaAoPatio, faixaDaChegada } from "../../lib/emPreparacao";

/**
 * "EM PREPARAÇÃO · CHEGA EM 5 DIAS", sobre a foto do card, da TV e do balcão.
 *
 * Em DIAS, e não em relógio: a decisão do dono em 28/09 foi o relógio só na
 * ficha, onde a pessoa já está interessada — trinta relógios piscando na grade
 * disputariam a atenção com o preço. Sem estado e sem efeito: serve ao
 * componente de servidor (o card da home) e ao de cliente (o catálogo, a TV).
 *
 * Nada aqui chama `new Date()`: o "agora" é o valor padrão de
 * `chegadaAoPatio`, e a regra `react-hooks/purity` fica satisfeita.
 */
export default function FaixaEmPreparacao({
  veiculo,
  className = "",
}: {
  veiculo: Pick<Veiculo, "em_preparacao" | "previsao_chegada_em">;
  className?: string;
}) {
  const chegada = chegadaAoPatio(veiculo);
  if (!chegada) return null;
  return (
    <span
      className={`pointer-events-none bg-mt-ink font-semibold tracking-[.12em] text-mt-inverso ${className}`}
    >
      {faixaDaChegada(chegada)}
    </span>
  );
}
