import type { ReactNode } from "react";
import Link from "next/link";
import type { Veiculo } from "../../types";
import { hubsDeFaixa } from "../../lib/hubsDeEstoque";

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
 */
export default function FaixasDePreco({
  disponiveis,
  cabecalho,
  className = "",
}: {
  disponiveis: Veiculo[];
  /** O título do bloco, que difere entre a home e o índice da vitrine. */
  cabecalho: ReactNode;
  className?: string;
}) {
  if (disponiveis.length === 0) return null;

  return (
    <section className={className}>
      {cabecalho}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {hubsDeFaixa(disponiveis).map((faixa) => (
          <Link
            key={faixa.slug}
            href={`/estoque/${faixa.slug}`}
            className="mt-foco flex items-baseline gap-1.5 border border-mt-regua px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[.06em] text-mt-ink no-underline hover:border-mt-accent"
          >
            {faixa.nome}
            <span className="text-[10px] font-semibold text-mt-accent">
              {faixa.veiculos.length}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
