import HeroSection from "../components/HeroSection";
import CarMatch from "../components/CarMatch";
import AutoAvaliacao from "../components/AutoAvaliacao";
import { DEFAULT_COMPANY_SETTINGS } from "./ThemeContext";

export default function Home() {
  const SITE_URL = "https://motors-site-oficial.vercel.app";
  
  const autoDealerSchema = {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    "name": DEFAULT_COMPANY_SETTINGS.name,
    "image": `${SITE_URL}/logo.png`,
    "url": SITE_URL,
    "telephone": "+551140030000",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "Av. Europa, 1000",
      "addressLocality": "São Paulo",
      "addressRegion": "SP",
      "postalCode": "01449-000",
      "addressCountry": "BR"
    },
    "sameAs": [
      DEFAULT_COMPANY_SETTINGS.instagram,
      DEFAULT_COMPANY_SETTINGS.facebook
    ].filter(Boolean),
    "openingHoursSpecification": [
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        "opens": "09:00",
        "closes": "19:00"
      },
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Saturday"],
        "opens": "09:00",
        "closes": "14:00"
      }
    ]
  };

  return (
    <div className="flex flex-col flex-grow items-center justify-start bg-brand-bg text-brand-text transition-colors duration-300">
      {/* Local Business (AutoDealer) Schema Markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(autoDealerSchema) }}
      />
      <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-8 flex flex-col gap-10 pb-16">
        {/* Active stock search & standard categories catalog */}
        <HeroSection />

        {/* Elegant fading primary divider */}
        <div className="w-full flex items-center justify-center py-2 px-6">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-brand-primary/30 to-transparent" />
        </div>

        {/* Section 1: Match de Garagem */}
        <section id="match-garagem" className="flex flex-col gap-4 px-4 sm:px-6">
          <div className="text-center flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">
              Curadoria Personalizada
            </span>
            <h2 className="text-2xl font-black text-brand-text tracking-tight">
              Match de Garagem
            </h2>
            <p className="text-xs text-brand-text/50 max-w-xs mx-auto">
              Responda a 3 perguntas e nosso algoritmo recomendará os carros mais alinhados em nosso estoque.
            </p>
          </div>
          <CarMatch />
        </section>

        {/* Elegant fading primary divider */}
        <div className="w-full flex items-center justify-center py-2 px-6">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-brand-primary/30 to-transparent" />
        </div>

        {/* Section 2: Avaliação Express */}
        <section id="avaliacao-express" className="flex flex-col gap-4 px-4 sm:px-6">
          <div className="text-center flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">
              Facilidade de Venda
            </span>
            <h2 className="text-2xl font-black text-brand-text tracking-tight">
              Avaliação Express
            </h2>
            <p className="text-xs text-brand-text/50 max-w-xs mx-auto">
              Quer vender ou dar seu carro de entrada? Receba uma cotação rápida do mercado premium.
            </p>
          </div>
          <AutoAvaliacao />
        </section>
      </div>
    </div>
  );
}
