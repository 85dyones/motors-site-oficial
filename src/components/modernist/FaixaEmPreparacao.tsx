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
    // `suppressHydrationWarning` porque o texto DEPENDE DO RELÓGIO, e o HTML
    // não é do mesmo instante que a hidratação. A faixa vive em componente
    // cliente que o servidor renderiza com ISR (`revalidate = 60`: o
    // catálogo, os similares da ficha, o Profiler, a TV e o balcão). HTML
    // gerado às 23h59 de São Paulo diz "5 DIAS"; o navegador que hidrata às
    // 00h01 calcula "4 DIAS", e o React 19 acusa o erro recuperável #418 — o
    // mesmo que o `layout.tsx` mede em produção. Achado da revisão final de
    // 28/09 e reproduzido em `tests/em-preparacao-faixa-hidratacao.test.ts`.
    //
    // O atributo vale só para o texto deste `<span>`, e a divergência é de
    // um dia na virada — o texto do servidor fica até o próximo render, e o
    // ISR regenera a página em um minuto.
    <span
      suppressHydrationWarning
      className={`pointer-events-none bg-mt-ink font-semibold tracking-[.12em] text-mt-inverso ${className}`}
    >
      {faixaDaChegada(chegada)}
    </span>
  );
}
