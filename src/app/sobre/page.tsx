import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Quem Somos | Motors Store - Tradição e Tecnologia Premium",
  description: "Conheça a história da Motors Store. De um showroom tradicional na Avenida Europa a pioneira na inteligência artificial para curadoria de veículos de alto padrão.",
  alternates: {
    canonical: "/sobre",
  },
};

export default function SobrePage() {
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
            MOLDANDO A CURADORIA <span className="text-brand-gold">PREMIUM</span>
          </h1>
          <p className="text-sm text-brand-text/60 leading-relaxed max-w-2xl font-light">
            De um tradicional showroom físico na icônica Avenida Europa à vanguarda da inteligência artificial automotiva. A Motors Store é a fusão exata de legado, engenharia de procedência e tecnologia de ponta.
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
              A Herança da Avenida Europa
            </h2>
            <p className="text-xs text-brand-text/60 leading-relaxed font-light">
              Fundada há mais de uma década no coração financeiro e automotivo de alto padrão de São Paulo, a Motors Store nasceu com a missão de transformar o mercado de veículos seminovos selecionados. Desde os primeiros supercarros clássicos até os modernos hyper-EVs, cada veículo em nosso acervo passa por uma avaliação cirúrgica.
            </p>
            <p className="text-xs text-brand-text/60 leading-relaxed font-light">
              Nosso compromisso inegociável é com a transparência total. Fomos a primeira revenda a disponibilizar laudos de perícia cautelar 100% integrados em tempo real na listagem web, garantindo ao comprador a segurança de fábrica em cada compra.
            </p>
          </div>

          <div className="flex flex-col gap-4 bg-brand-card border border-brand-card-border p-6 rounded-3xl shadow-[0_8px_30px_var(--brand-shadow)] relative overflow-hidden transition-all duration-300">
            {/* Soft decorative glow */}
            <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-brand-primary/5 blur-2xl pointer-events-none" />
            
            <span className="text-[9px] font-bold text-brand-primary uppercase tracking-widest">
              QUALIDADE ABSOLUTA
            </span>
            <h2 className="text-xl font-bold tracking-tight text-brand-text">
              Perícia e Rigor Técnico
            </h2>
            <ul className="flex flex-col gap-3 text-xs text-brand-text/70">
              <li className="flex gap-2">
                <span className="text-brand-gold shrink-0">✔</span>
                <span><strong>Laudo Cautelar 100% Livre:</strong> Histórico estrutural intocado e verificado.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-gold shrink-0">✔</span>
                <span><strong>Garantia de Showroom:</strong> Revisão profunda de 120 itens em mecânica e elétrica.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-gold shrink-0">✔</span>
                <span><strong>Valoração Fipe de Precisão:</strong> Atualização contínua com indicadores oficiais de mercado.</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Decorative thin line */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-brand-border/80 to-transparent" />

        {/* AI & Tech Stack Engine Description */}
        <section className="flex flex-col gap-6">
          <div className="text-center md:text-left flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-brand-primary uppercase tracking-widest">
              ENGENHARIA DIGITIAL
            </span>
            <h2 className="text-2xl font-black text-brand-text tracking-tight uppercase">
              O MOTOR TECNOLÓGICO DA MOTORS STORE
            </h2>
            <p className="text-xs text-brand-text/50 max-w-xl">
              Nossa plataforma web 2.0 não é apenas um catálogo digital. Criamos sistemas inteligentes locais para guiar seu investimento com máxima precisão.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              {
                id: "tech-fipe",
                title: "PRESCISÃO FIPE EXPRESS",
                desc: "Algoritmo de cálculo instantâneo que traduz dados técnicos e quilometragem em uma cotação justa de mercado para seu veículo de entrada em segundos.",
              },
              {
                id: "tech-match",
                title: "ALGORITMO DE DISTÂNCIA",
                desc: "Sistema dinâmico que cruza faixa de investimento, buffers de tolerância de 15% para upgrades recomendados e preferências de carroceria do usuário.",
              },
              {
                id: "tech-ai",
                title: "ASSISTENTE SEMÂNTICO LOCAL",
                desc: "Analisador natural de texto livre de alta velocidade. Extrai limites numéricos de orçamento de expressões livres e mapeia estilos de uso.",
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
            Pronto para encontrar seu próximo destino?
          </h2>
          <p className="text-xs text-brand-text/50 max-w-xs leading-relaxed">
            Experimente agora a nossa IA Curadora no Match de Garagem ou agende um test-drive em nossa concessionária.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/#match-garagem"
              className="bg-brand-primary hover:bg-brand-primary-hover text-white text-[10px] font-thin uppercase tracking-widest px-5 py-3 rounded-xl transition-all duration-300 shadow-md active:scale-95 shrink-0"
              id="about-cta-match"
            >
              INICIAR CURADORIA IA
            </Link>
            <Link
              href="/contato"
              className="bg-brand-card hover:bg-brand-bg text-brand-text/80 text-[10px] font-thin uppercase tracking-widest px-5 py-3 rounded-xl border border-brand-card-border transition-all duration-300 active:scale-95 shrink-0"
              id="about-cta-contact"
            >
              FALE CONOSCO
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
