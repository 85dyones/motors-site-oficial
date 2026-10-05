import type { ReactNode } from "react";
import Link from "next/link";
import type { Veiculo } from "../../types";
import { hubsDeCambio, hubsDeFaixa } from "../../lib/hubsDeEstoque";

/**
 * Os três hubs de faixa como bloco de navegação — home e vitrine.
 *
 * Nasceu extraído, e por um motivo medido. Enquanto era JSX solto dentro de
 * `src/app/page.tsx`, a revisão de 05/09 trocou o gate `disponiveis.length > 0`
 * por `false &&`: a home parou de desenhar o bloco, a área continuou no painel
 * A3 para o dono ligar e desligar, e os 2087 testes ficaram **verdes**. Um
 * teste de fonte pega a chave sumindo; não pega a condição mentindo.
 *
 * Aqui o mesmo defeito quebra `faixas-de-preco-na-navegacao`, porque dá para
 * renderizar o componente sem subir Supabase.
 *
 * ---------------------------------------------------------------------------
 * Por que os três aparecem mesmo zerados, e o bloco inteiro some
 * ---------------------------------------------------------------------------
 * As faixas são hubs PERENES: a lista é fechada, não depende do banco, e a
 * página responde 200 com estoque ou sem ele — por isso a contagem zero de uma
 * faixa continua na tela, como já acontece em `/estoque/[recorte]`.
 *
 * O que some é o bloco todo, quando não há veículo nenhum. Três zeros
 * enfileirados não comunicam recorte, comunicam loja fechada — e o pátio vazio
 * acontece de verdade (sync fora do ar). É o mesmo critério que o `<h1>` das
 * faixas já aplica ao zero.
 *
 * ---------------------------------------------------------------------------
 * O chip "Automáticos", desde 05/10/2026
 * ---------------------------------------------------------------------------
 * `/estoque/automatico` nasceu nesse dia e precisava de entrada pela home e por
 * `/estoque`: página perene sem link interno é órfã, e o sitemap sozinho não
 * sustenta. Entra neste bloco, em linha própria abaixo das faixas e com o
 * rótulo "Por câmbio", porque é o mesmo tipo de atalho (recorte perene de
 * lista fechada, com contagem) e os dois lugares que montam este bloco já são
 * os de maior alcance do site. Segue a
 * regra das faixas: aparece mesmo zerado, some com o pátio vazio.
 */
export default function FaixasDePreco({
  disponiveis,
  cabecalho,
  className = "",
  espacoDoTopo = "mt-4",
}: {
  disponiveis: Veiculo[];
  /** O título do bloco, que difere entre a home e o índice da vitrine. */
  cabecalho: ReactNode;
  className?: string;
  /**
   * Respiro entre o cabeçalho e os chips.
   *
   * A home usava `pt-6` (24px) enquanto o bloco era JSX solto, e a extração
   * trocou por `mt-4` (16px) sem querer — `CabecalhoSecao` não tem margem
   * inferior, então o título ficou 8px mais colado. A revisão pegou; a home
   * volta a 24, a vitrine fica em 16, que é o que ela sempre teve porque o
   * `<h2>` dela é menor.
   */
  espacoDoTopo?: string;
}) {
  if (disponiveis.length === 0) return null;

  return (
    <section className={className}>
      {cabecalho}
      <div className={`${espacoDoTopo} flex flex-wrap gap-1.5`}>
        {hubsDeFaixa(disponiveis).map((faixa) => (
          <Link
            key={faixa.slug}
            href={`/estoque/${faixa.slug}`}
            className="mt-foco flex items-baseline gap-1.5 border border-mt-regua px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[.06em] text-mt-ink no-underline hover:border-mt-accent"
          >
            {faixa.nome}
            <span className="text-[11px] font-semibold text-mt-cobre">
              {faixa.veiculos.length}
            </span>
          </Link>
        ))}
      </div>
      {/* Câmbio em linha própria, com rótulo próprio (revisão de 05/10/2026):
          "Automáticos" não é faixa de preço, e o chip dentro da fileira das
          faixas ficava sob um título que fala de orçamento. O rótulo é o mesmo
          do bloco de links das páginas de recorte ("Por câmbio"). */}
      <p className="m-0 mt-4 text-[11px] font-extrabold uppercase tracking-[.06em] text-mt-cobre">
        Por câmbio
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {hubsDeCambio(disponiveis).map((cambio) => (
          <Link
            key={cambio.slug}
            href={`/estoque/${cambio.slug}`}
            className="mt-foco flex items-baseline gap-1.5 border border-mt-regua px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[.06em] text-mt-ink no-underline hover:border-mt-accent"
          >
            {cambio.plural}
            <span className="text-[11px] font-semibold text-mt-cobre">
              {cambio.veiculos.length}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
