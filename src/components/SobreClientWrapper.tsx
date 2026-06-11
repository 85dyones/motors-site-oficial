"use client";

import Link from "next/link";
import { useTheme } from "../app/ThemeContext";

export default function SobreClientWrapper() {
  const { aboutSettings } = useTheme();

  // Helper to visually split and highlight the last word of a title in gold
  const renderTitleWithGoldLastWord = (title: string) => {
    if (!title) return "";
    const words = title.trim().split(" ");
    if (words.length <= 1) return title;
    const lastWord = words[words.length - 1];
    const otherWords = words.slice(0, -1).join(" ");
    return (
      <>
        {otherWords} <span className="text-brand-gold">{lastWord}</span>
      </>
    );
  };

  // Helper to split bullet points at the first colon and bold the label
  const renderValueItem = (val: string) => {
    if (!val) return null;
    const index = val.indexOf(":");
    if (index === -1) return <span>{val}</span>;
    const label = val.substring(0, index);
    const desc = val.substring(index + 1);
    return (
      <span>
        <strong>{label}:</strong>{desc}
      </span>
    );
  };

  return (
    <div className="flex flex-col flex-grow items-center justify-start bg-brand-bg text-brand-text transition-colors duration-300 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto w-full flex flex-col gap-10">
        
        {/* Breadcrumbs / System Label */}
        <div className="flex items-center gap-2 self-start">
          <Link
            href="/"
            className="text-[9px] font-thin uppercase tracking-wider text-brand-text/40 hover:text-brand-primary transition-colors"
          >
            HOME
          </Link>
          <span className="text-brand-text/20 text-[8px]">/</span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-brand-gold">
            SOBRE A MOTORS
          </span>
        </div>

        {/* Hero Section */}
        <section className="flex flex-col gap-3 text-center md:text-left">
          <span className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.2em]">
            MANIFESTO DE MARCA
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-brand-text tracking-tight uppercase">
            {renderTitleWithGoldLastWord(aboutSettings.heroTitle)}
          </h1>
          <p className="text-sm text-brand-text/60 leading-relaxed max-w-2xl font-light">
            {aboutSettings.heroSubtitle}
          </p>
        </section>

        {/* Decorative thin line */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-brand-border/80 to-transparent" />

        {/* History & Core Narrative */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <div className="flex flex-col gap-4">
            <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest">
              NOSSA TRAJETÓRIA
            </span>
            <h2 className="text-xl font-bold tracking-tight text-brand-text">
              {aboutSettings.historyTitle}
            </h2>
            <p className="text-xs text-brand-text/60 leading-relaxed font-light">
              {aboutSettings.historyP1}
            </p>
            <p className="text-xs text-brand-text/60 leading-relaxed font-light">
              {aboutSettings.historyP2}
            </p>
          </div>

          <div className="flex flex-col gap-4 bg-brand-card br-3xl border border-brand-card-border p-6 rounded-3xl shadow-[0_8px_30px_var(--brand-shadow)] relative overflow-hidden transition-all duration-300">
            {/* Soft decorative glow */}
            <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-brand-primary/5 blur-2xl pointer-events-none" />
            
            <span className="text-[9px] font-bold text-brand-primary uppercase tracking-widest">
              QUALIDADE ABSOLUTA
            </span>
            <h2 className="text-xl font-bold tracking-tight text-brand-text">
              {aboutSettings.valuesTitle}
            </h2>
            <ul className="flex flex-col gap-3 text-xs text-brand-text/70">
              {aboutSettings.value1 && (
                <li className="flex gap-2">
                  <span className="text-brand-gold shrink-0">✔</span>
                  {renderValueItem(aboutSettings.value1)}
                </li>
              )}
              {aboutSettings.value2 && (
                <li className="flex gap-2">
                  <span className="text-brand-gold shrink-0">✔</span>
                  {renderValueItem(aboutSettings.value2)}
                </li>
              )}
              {aboutSettings.value3 && (
                <li className="flex gap-2">
                  <span className="text-brand-gold shrink-0">✔</span>
                  {renderValueItem(aboutSettings.value3)}
                </li>
              )}
            </ul>
          </div>
        </section>

        {/* Decorative thin line */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-brand-border/80 to-transparent" />

        {/* AI & Tech Stack Engine Description */}
        <section className="flex flex-col gap-6">
          <div className="text-center md:text-left flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-brand-primary uppercase tracking-widest">
              ENGENHARIA DIGITAL
            </span>
            <h2 className="text-2xl font-black text-brand-text tracking-tight uppercase">
              {aboutSettings.techTitle}
            </h2>
            <p className="text-xs text-brand-text/50 max-w-xl">
              {aboutSettings.techSubtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              {
                id: "tech-fipe",
                title: aboutSettings.card1Title,
                desc: aboutSettings.card1Desc,
              },
              {
                id: "tech-match",
                title: aboutSettings.card2Title,
                desc: aboutSettings.card2Desc,
              },
              {
                id: "tech-ai",
                title: aboutSettings.card3Title,
                desc: aboutSettings.card3Desc,
              },
            ].map((tech) => (
              <div
                key={tech.id}
                className="bg-brand-card border border-brand-card-border p-5 rounded-2xl flex flex-col gap-2.5 transition-all duration-300 hover:border-brand-primary/40 group shadow-sm"
              >
                <div className="h-7 w-7 rounded-lg bg-brand-primary/10 flex items-center justify-center text-brand-gold text-xs font-bold transition-all group-hover:bg-brand-primary/20">
                  ⚡
                </div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-text group-hover:text-brand-gold transition-colors">
                  {tech.title}
                </h3>
                <p className="text-[10px] text-brand-text/50 leading-relaxed font-light">
                  {tech.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA section */}
        <section className="bg-brand-footer/50 border border-brand-border rounded-3xl p-6 md:p-8 text-center flex flex-col items-center gap-4 relative overflow-hidden">
          <div className="absolute -left-12 -bottom-12 h-24 w-24 rounded-full bg-brand-primary/5 blur-xl pointer-events-none" />
          
          <h2 className="text-lg font-bold text-brand-text uppercase tracking-tight">
            {aboutSettings.ctaTitle || "PRONTO PARA ENCONTRAR SEU PRÓXIMO DESTINO?"}
          </h2>
          <p className="text-xs text-brand-text/50 max-w-md leading-relaxed">
            {aboutSettings.ctaDescription || "Experimente a segurança da nossa curadoria digital ou agende uma visita ao nosso showroom no Bacacheri, pertinho da Rua Canadá. Atendimento presencial de excelência e logística de entrega para todo o Brasil."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/#match-garagem"
              className="bg-brand-primary hover:bg-brand-primary-hover text-white text-[10px] font-thin uppercase tracking-widest px-5 py-3 rounded-xl transition-all duration-300 shadow-md active:scale-95 shrink-0"
              id="about-cta-match"
            >
              {aboutSettings.ctaBtn1Text || "INICIAR CURADORIA IA"}
            </Link>
            <Link
              href="/contato"
              className="bg-brand-card hover:bg-brand-bg text-brand-text/80 text-[10px] font-thin uppercase tracking-widest px-5 py-3 rounded-xl border border-brand-card-border transition-all duration-300 active:scale-95 shrink-0"
              id="about-cta-contact"
            >
              {aboutSettings.ctaBtn2Text || "FALE CONOSCO"}
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
