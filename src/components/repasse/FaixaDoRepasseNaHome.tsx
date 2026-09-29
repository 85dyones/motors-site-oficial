import { CAMINHO_DO_REPASSE, PORTAS_DO_REPASSE, verOsCarros } from "../../lib/paginaDoRepasse";
import type { FaixaNaHome } from "../../lib/portasDoRepasse";
import { LinkRegua } from "../modernist/primitivos";
import CardDaFaixa from "./CardDaFaixa";

/**
 * A faixa clara da home (spec 2026-09-24 §10; prancha "Portas de entrada",
 * seção 3): texto à esquerda, até três carros à direita. Aparece sempre
 * (ordem do dono de 28/09). Quem escolhe os carros é `faixaNaHome`; aqui
 * vale o que ela entregou:
 * - com carros, o CTA conta o lote inteiro, o mesmo número do herói do
 *   `/repasse` (decisão 13 do plano do PR 4);
 * - sem carro nenhum, nenhuma grade (nem vazia, nem com marcador) e o CTA é
 *   o botão da faixa do `/estoque`: contar o lote levaria a carros que a
 *   faixa não mostra.
 *
 * A grade acompanha a quantidade de carros (revisão de UI de 29/09, aprovada
 * pelo dono no mesmo dia). Até ali, com um ou dois carros a grade continuava de
 * três colunas para o card não esticar, e sobrava um ou dois terços em branco
 * à direita: com o único carro do lote no ar, a faixa parecia inacabada.
 *   - 1 carro: texto e carro dividem a largura ao meio; o carro vira destaque.
 *   - 2 carros: texto num terço, os dois carros dividindo os outros dois.
 *   - 3 carros: como sempre, texto num terço e três colunas.
 */
const COLUNAS_POR_QUANTIDADE: Record<number, { faixa: string; lista: string }> = {
  1: { faixa: "lg:grid-cols-2", lista: "" },
  2: { faixa: "lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]", lista: "sm:grid-cols-2" },
  3: { faixa: "lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]", lista: "sm:grid-cols-3" },
};
export default function FaixaDoRepasseNaHome({ faixa }: { faixa: FaixaNaHome }) {
  const temCarros = faixa.carros.length > 0;
  const colunas = COLUNAS_POR_QUANTIDADE[Math.min(faixa.carros.length, 3)];
  return (
    <section aria-labelledby="faixa-do-repasse-na-home" className="mt-faixa-cheia mt-12 bg-mt-surface px-[18px] py-12 lg:mt-16 lg:px-10 lg:py-16">
      {/* Sem carros não há segunda coluna: o texto ocupa a largura toda em vez de ficar num terço. */}
      <div className={colunas ? `grid gap-8 lg:gap-12 ${colunas.faixa}` : "grid gap-8"}>
        <div>
          <p className="m-0 text-[11px] font-extrabold tracking-[.14em] text-mt-neutral-600">{PORTAS_DO_REPASSE.rotulo}</p>
          <h2 id="faixa-do-repasse-na-home" className="mt-titulo m-0 mt-3 text-[28px] lg:text-[34px]">
            {PORTAS_DO_REPASSE.home.titulo}
          </h2>
          <p className="m-0 mt-3 max-w-[420px] text-[14px] leading-relaxed text-mt-neutral-800">{PORTAS_DO_REPASSE.home.texto}</p>
          <div className="mt-6">
            <LinkRegua href={CAMINHO_DO_REPASSE}>
              {temCarros ? verOsCarros(faixa.totalNoLote) : PORTAS_DO_REPASSE.estoque.botao}
            </LinkRegua>
          </div>
        </div>
        {temCarros && (
          <ul className={`m-0 grid list-none gap-4 p-0 ${colunas?.lista ?? ""}`.trim()}>
            {faixa.carros.map((r) => (
              <li key={r.id}>
                <CardDaFaixa repasse={r} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
