import type { Metadata } from "next";
import CarMatch from "../../components/CarMatch";
import { Rotulo } from "../../components/modernist/primitivos";

export const metadata: Metadata = {
  title: "Garagem Profiler — encontre o carro certo | Motors Store",
  description:
    "Cinco perguntas, trinta segundos. Traçamos seu perfil de uso e um consultor envia três sugestões reais do estoque no WhatsApp.",
  alternates: { canonical: "/carro-perfeito" },
};

/**
 * Tela 04 — Garagem Profiler.
 *
 * O quiz em si (perguntas, pontuação, envio do lead e tracking) continua
 * sendo o `CarMatch` de produção. Esta rota dá a ele a moldura Modernist e
 * uma URL própria — o header e o rodapé agora apontam para cá em vez do
 * antigo âncora `/#match-garagem`.
 */
export default function CarroPerfeitoPage() {
  return (
    <main role="main" className="flex flex-col bg-mt-inverso-fundo font-modernist text-mt-inverso">
      <div className="px-[18px] pb-10 pt-10 lg:px-14 lg:pb-14 lg:pt-11">
        <div className="flex items-center gap-3.5">
          <span className="h-6 w-2 shrink-0 bg-mt-accent" aria-hidden="true" />
          <span className="text-[15px] font-extrabold tracking-[.02em]">
            GARAGEM PROFILER
          </span>
        </div>

        <div className="mt-10 max-w-[640px] lg:mt-12">
          <Rotulo accent className="text-[11px] tracking-[.18em]">
            CONSULTORIA
          </Rotulo>
          <h1 className="mt-display m-0 mt-5 text-[38px] text-mt-inverso lg:text-[66px] lg:leading-[.95]">
            Cinco perguntas até o carro certo.
          </h1>
          <p className="m-0 mt-5 max-w-[520px] text-[14px] leading-relaxed text-mt-neutral-400 lg:text-base">
            Cruzamos suas respostas com o estoque e um consultor envia três
            sugestões reais no WhatsApp — com fotos, laudo e parcela.
          </p>
        </div>
      </div>

      {/* O quiz mantém o próprio template dentro desta grade */}
      <div className="bg-mt-bg px-[18px] py-10 text-mt-ink lg:px-14 lg:py-14">
        <CarMatch />
      </div>
    </main>
  );
}
