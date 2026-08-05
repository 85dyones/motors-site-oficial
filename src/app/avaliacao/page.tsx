import type { Metadata } from "next";
import AutoAvaliacao from "../../components/AutoAvaliacao";
import { Rotulo } from "../../components/modernist/primitivos";

export const metadata: Metadata = {
  title: "Avaliação Express — quanto vale o seu carro | Motors Store",
  description:
    "Dados oficiais da Tabela FIPE cruzados com o giro real do nosso estoque. Proposta no WhatsApp em menos de 10 minutos.",
  alternates: { canonical: "/avaliacao" },
};

const COMO = [
  "Tabela FIPE oficial para a versão exata do seu veículo.",
  "Giro real do modelo no nosso estoque nos últimos 90 dias.",
  "Ajuste por opcionais, estado de pneus e histórico de revisões.",
];

/**
 * Tela 05 — Avaliação Express.
 *
 * O formulário e a consulta FIPE continuam sendo o `AutoAvaliacao` de
 * produção (webhook, tracking e cascata de marca/modelo/ano inclusos). Esta
 * rota dá a ele a moldura Modernist e uma URL própria.
 */
export default function AvaliacaoPage() {
  return (
    <main role="main" className="flex flex-col bg-mt-bg font-modernist text-mt-ink">
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        <div className="min-w-0 flex-1 px-[18px] py-10 lg:border-r-2 lg:border-mt-regua lg:px-11 lg:py-14">
          <Rotulo accent className="text-[11px] tracking-[.18em]">
            VENDA OU TROCA
          </Rotulo>
          <h1 className="mt-titulo m-0 mt-3 text-[38px] lg:text-[64px] lg:leading-[.95]">
            Avaliação
            <br />
            Express
          </h1>
          <p className="m-0 mt-5 max-w-[520px] text-[14px] leading-relaxed text-mt-neutral-800 lg:text-base">
            Dados oficiais da Tabela FIPE cruzados com o giro real do nosso
            estoque. Proposta no WhatsApp em menos de 10 minutos.
          </p>

          <div className="mt-9">
            <AutoAvaliacao />
          </div>
        </div>

        <aside className="shrink-0 bg-mt-inverso-fundo px-[18px] py-10 text-mt-inverso lg:w-[470px] lg:px-10 lg:py-14">
          <Rotulo className="text-[11px] tracking-[.18em] text-mt-accent-400">
            COMO CHEGAMOS NESSE NÚMERO
          </Rotulo>
          <div className="mt-6 border-t-2 border-mt-inverso-regua pt-2">
            {COMO.map((item) => (
              <div
                key={item}
                className="flex gap-3 border-b border-mt-inverso-regua-fina py-3 text-[13px] leading-snug"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="mt-1 h-3.5 w-3.5 shrink-0 text-mt-accent"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span className="text-mt-neutral-300">{item}</span>
              </div>
            ))}
          </div>

          <p className="m-0 mt-7 text-[11px] leading-relaxed text-mt-neutral-500">
            A faixa exibida é de referência. A proposta final depende de vistoria
            presencial em Curitiba.
          </p>
        </aside>
      </div>
    </main>
  );
}
