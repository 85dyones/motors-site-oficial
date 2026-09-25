import Link from "next/link";
import { CAMINHO_DO_REPASSE, PORTAS_DO_REPASSE, abertosHoje } from "../../lib/paginaDoRepasse";
import type { FaixaNoEstoque } from "../../lib/portasDoRepasse";
import { Seta } from "../modernist/primitivos";

/**
 * A faixa escura do `/estoque`, depois da grade (spec 2026-09-24 §10;
 * prancha "Portas de entrada", seção 2). Quem decide se ela aparece é
 * `faixaNoEstoque`: sem carro aberto a todos, a página nem a monta.
 */
export default function FaixaDoRepasseNoEstoque({ faixa }: { faixa: FaixaNoEstoque }) {
  return (
    <section
      aria-labelledby="faixa-do-repasse-no-estoque"
      className="bg-mt-inverso-fundo px-[18px] py-10 text-mt-inverso lg:px-10 lg:py-12"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
        <div className="max-w-[640px]">
          <p className="m-0 text-[11px] font-extrabold tracking-[.14em] text-mt-accent-400">{PORTAS_DO_REPASSE.rotulo}</p>
          <h2 id="faixa-do-repasse-no-estoque" className="mt-titulo m-0 mt-3 text-[28px] lg:text-[36px]">
            {PORTAS_DO_REPASSE.estoque.titulo}
          </h2>
          <p className="m-0 mt-3 text-[14px] leading-relaxed text-mt-inverso-suave lg:text-[15px]">
            {`${PORTAS_DO_REPASSE.estoque.texto} ${abertosHoje(faixa.abertos)}`}
          </p>
        </div>
        <Link href={CAMINHO_DO_REPASSE} className="mt-btn mt-btn-primario mt-foco shrink-0 self-start lg:self-center">
          {PORTAS_DO_REPASSE.estoque.botao}
          <Seta />
        </Link>
      </div>
    </section>
  );
}
