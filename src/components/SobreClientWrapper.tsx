"use client";

import Link from "next/link";
import { useTheme } from "../app/ThemeContext";
import { EstatisticasRegua, Rotulo, Seta } from "./modernist/primitivos";
import { aplicarTotalEstoque } from "../lib/textoInstitucional";
import { GARANTIA_MESES } from "../lib/paginasInstitucionais";

/**
 * A Motors — tela 06 do design doc.
 *
 * Manifesto tipográfico, números em régua e blocos ruled. Todo o conteúdo
 * continua vindo de `aboutSettings` (editável no painel); só a apresentação
 * mudou. Nenhum campo foi removido, e os ids dos CTAs (`about-cta-match`,
 * `about-cta-contact`) foram mantidos porque podem estar em uso por
 * analytics.
 */
export default function SobreClientWrapper({ totalEstoque }: { totalEstoque?: number }) {
  const { aboutSettings, companySettings } = useTheme();

  /** Ver `lib/textoInstitucional.ts` — a regra é testada lá. */
  const comTotal = (texto: string) => aplicarTotalEstoque(texto, totalEstoque);

  /** Divide o item em rótulo e descrição no primeiro dois-pontos. */
  const renderValorItem = (val: string) => {
    if (!val) return null;
    const i = val.indexOf(":");
    if (i === -1) return <span>{val}</span>;
    return (
      <span>
        <strong>{val.substring(0, i)}:</strong>
        {val.substring(i + 1)}
      </span>
    );
  };

  const valores = [
    aboutSettings.value1,
    aboutSettings.value2,
    aboutSettings.value3,
  ].filter(Boolean);

  const cards = [
    { title: aboutSettings.card1Title, desc: aboutSettings.card1Desc },
    { title: aboutSettings.card2Title, desc: aboutSettings.card2Desc },
    { title: aboutSettings.card3Title, desc: aboutSettings.card3Desc },
  ].filter((c) => c.title || c.desc);

  /**
   * Campo vazio no painel significa "não mostre" — nenhum texto padrão entra
   * no lugar. Sem nada para dizer, a faixa vermelha de fechamento inteira sai,
   * em vez de virar um bloco de cor com um botão solto.
   */
  const temFechamento = Boolean(
    aboutSettings.ctaTitle ||
      aboutSettings.ctaDescription ||
      aboutSettings.ctaBtn1Text ||
      aboutSettings.ctaBtn2Text
  );

  return (
    <div className="flex flex-col bg-mt-bg font-modernist text-mt-ink">
      {/* ─── Manifesto ─── */}
      <section className="px-[18px] pt-9 lg:px-10 lg:pt-16">
        <nav
          aria-label="Trilha"
          className="text-[11px] font-semibold tracking-[.16em] text-mt-neutral-600"
        >
          <Link href="/" className="mt-foco text-mt-neutral-600 no-underline hover:text-mt-ink">
            HOME
          </Link>{" "}
          / <span className="text-mt-ink">A MOTORS</span>
        </nav>

        {companySettings.address && (
          <Rotulo accent className="mt-6 text-[11px] tracking-[.18em]">
            {companySettings.address}
          </Rotulo>
        )}

        {aboutSettings.heroTitle && (
          <h1 className="mt-display m-0 mt-4 max-w-[1100px] text-[42px] lg:text-[104px] lg:leading-[.9]">
            {aboutSettings.heroTitle}
          </h1>
        )}

        {aboutSettings.heroSubtitle && (
          <p className="m-0 mt-6 max-w-[720px] text-[15px] leading-relaxed text-mt-neutral-800 lg:text-[17px]">
            {aboutSettings.heroSubtitle}
          </p>
        )}

        {(aboutSettings.historyTitle || aboutSettings.historyP1 || aboutSettings.historyP2) && (
          <div className="mt-10 border-t-2 border-mt-regua pt-7">
            {aboutSettings.historyTitle && (
              <h2 className="mt-titulo m-0 mb-6 text-[26px] lg:text-[34px]">
                {aboutSettings.historyTitle}
              </h2>
            )}
            <div className="flex flex-col gap-8 lg:flex-row lg:gap-16">
              {aboutSettings.historyP1 && (
                <p className="m-0 flex-1 text-[15px] leading-relaxed text-mt-neutral-800 lg:text-base">
                  {comTotal(aboutSettings.historyP1)}
                </p>
              )}
              {aboutSettings.historyP2 && (
                <p className="m-0 flex-1 text-[15px] leading-relaxed text-mt-neutral-800 lg:text-base">
                  {comTotal(aboutSettings.historyP2)}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ─── Valores ─── */}
      {valores.length > 0 && (
        <section className="px-[18px] pt-12 lg:px-10 lg:pt-16">
          {aboutSettings.valuesTitle && (
            <Rotulo accent className="text-[11px] tracking-[.18em]">
              {aboutSettings.valuesTitle}
            </Rotulo>
          )}
          <div className="mt-5 flex flex-col border-t-2 border-mt-regua lg:flex-row">
            {valores.map((valor, i) => (
              <div
                key={i}
                className="flex-1 border-b border-mt-regua-fina py-5 lg:border-b-0 lg:border-r lg:border-mt-regua-media lg:pl-6 lg:pr-6 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0"
              >
                <div className="mb-2.5 text-[11px] font-extrabold tracking-[.12em] text-mt-accent">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="text-[15px] leading-relaxed text-mt-neutral-800">
                  {renderValorItem(valor)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Tecnologia ─── */}
      {(aboutSettings.techTitle || aboutSettings.techSubtitle || cards.length > 0) && (
        <section className="px-[18px] pt-12 lg:px-10 lg:pt-16">
          {(aboutSettings.techTitle || aboutSettings.techSubtitle) && (
            <div className="border-b-2 border-mt-regua pb-4">
              {aboutSettings.techTitle && (
                <h2 className="mt-titulo m-0 text-[28px] lg:text-[40px]">
                  {aboutSettings.techTitle}
                </h2>
              )}
              {aboutSettings.techSubtitle && (
                <p className="m-0 mt-3 max-w-[620px] text-[14px] leading-relaxed text-mt-neutral-800">
                  {aboutSettings.techSubtitle}
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 gap-x-8 pt-6 md:grid-cols-3">
            {cards.map((card, i) => (
              <div key={i} className="border-b border-mt-regua-fina py-5 md:border-b-0">
                <div className="mb-2 text-[11px] font-extrabold tracking-[.12em] text-mt-accent">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="text-[17px] font-extrabold tracking-[-.01em]">{card.title}</div>
                <div className="mt-2 text-[13px] leading-relaxed text-mt-neutral-800">
                  {card.desc}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Compromissos e atendimento ─── */}
      <section className="px-[18px] pt-12 lg:px-10 lg:pt-16">
        <EstatisticasRegua
          itens={[
            // Processo, não resultado: todo carro vai para a perícia, mas
            // parte do estoque está sempre com o laudo em análise. Ver a
            // mesma régua em `modernist/HeroHome`.
            { valor: "100%", rotulo: "PASSAM PELA CAUTELAR", accent: true },
            // "BASE DE AVALIAÇÃO" ao lado de um número lê como proposta de
            // compra. A FIPE é referência de mercado; o valor sai da vistoria,
            // e quem o informa é o consultor — nunca o site (CLAUDE.md, §4).
            { valor: "FIPE", rotulo: "REFERÊNCIA DE MERCADO" },
            // O prazo vem de `GARANTIA_MESES`, nunca escrito aqui.
            //
            // Esta linha dizia "6 MESES" enquanto `/garantia` — a página que
            // responde pelo compromisso — dizia "três meses" desde a decisão do
            // dono em 2026-08-25. Duas afirmações contratuais diferentes no
            // mesmo site, e a errada era a que aparecia primeiro para quem
            // chega pelo "Sobre". Encontrada pelo dono em 01/09.
            //
            // A constante já existia e ninguém a usava: era número à mão numa
            // tela e fonte canônica parada em `paginasInstitucionais.ts`.
            { valor: `${GARANTIA_MESES} MESES`, rotulo: "GARANTIA MOTOR E CÂMBIO" },
          ]}
        />
        {(companySettings.address || companySettings.hours || companySettings.phone) && (
        <div className="mt-8 flex flex-col gap-6 border-t-2 border-mt-regua pt-6 lg:flex-row lg:gap-14">
          {companySettings.address && (
            <div className="flex-1">
              <Rotulo className="text-[10px]">SHOWROOM</Rotulo>
              <div className="mt-2 text-[18px] font-extrabold leading-snug">
                {companySettings.address}
              </div>
            </div>
          )}
          {companySettings.hours && (
            <div className="flex-1">
              <Rotulo className="text-[10px]">HORÁRIOS</Rotulo>
              <div className="mt-2 whitespace-pre-line text-[18px] font-extrabold leading-snug">
                {companySettings.hours}
              </div>
            </div>
          )}
          {companySettings.phone && (
            <div className="flex-1">
              <Rotulo className="text-[10px]">ATENDIMENTO</Rotulo>
              <div className="mt-2 text-[18px] font-extrabold leading-snug">
                {companySettings.phone}
              </div>
            </div>
          )}
        </div>
        )}
      </section>

      {/* ─── Faixa de fechamento ─── */}
      {temFechamento && (
        <section className="mt-14 bg-mt-accent px-[18px] py-12 text-mt-inverso lg:px-10 lg:py-[76px]">
          {aboutSettings.ctaTitle && (
            <h2 className="mt-display m-0 max-w-[1000px] text-[32px] lg:text-[76px]">
              {aboutSettings.ctaTitle}
            </h2>
          )}
          {aboutSettings.ctaDescription && (
            <p className="m-0 mt-6 max-w-[620px] text-[14px] leading-relaxed lg:text-base">
              {aboutSettings.ctaDescription}
            </p>
          )}
          {(aboutSettings.ctaBtn1Text || aboutSettings.ctaBtn2Text) && (
            <div className="mt-8 flex flex-wrap gap-0.5 lg:mt-11">
              {aboutSettings.ctaBtn1Text && (
                <Link
                  href="/carro-perfeito"
                  id="about-cta-match"
                  className="mt-btn mt-btn-tinta mt-foco"
                >
                  {aboutSettings.ctaBtn1Text}
                  <Seta />
                </Link>
              )}
              {aboutSettings.ctaBtn2Text && (
                <Link
                  href="/contato"
                  id="about-cta-contact"
                  className="mt-btn mt-foco border-2 border-mt-inverso text-mt-inverso"
                >
                  {aboutSettings.ctaBtn2Text}
                </Link>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
