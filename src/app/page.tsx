import HeroSection from "../components/HeroSection";
import CarMatch from "../components/CarMatch";
import AutoAvaliacao from "../components/AutoAvaliacao";
import InstagramFeed from "../components/InstagramFeed";
import GoogleReviewsFeed from "../components/GoogleReviewsFeed";
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
    <main role="main" className="flex flex-col flex-grow bg-brand-bg text-brand-text transition-colors duration-300">
      {/* Local Business (AutoDealer) Schema Markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(autoDealerSchema) }}
      />
      <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-8 flex flex-col gap-10 pt-6 md:pt-8 pb-16">
        {/* Active stock search & standard categories catalog */}
        <HeroSection />

        {/* Elegant fading primary divider */}
        <div className="w-full flex items-center justify-center py-2 px-6">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-brand-primary/30 to-transparent" />
        </div>

        {/* Section 1: Instagram Feed Preview */}
        <InstagramFeed />

        {/* Elegant fading primary divider */}
        <div className="w-full flex items-center justify-center py-2 px-6">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-brand-primary/30 to-transparent" />
        </div>

        {/* Section 2: Match de Garagem */}
        <CarMatch />

        {/* Elegant fading primary divider */}
        <div className="w-full flex items-center justify-center py-2 px-6">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-brand-primary/30 to-transparent" />
        </div>

        {/* Section 3: Avaliação Express */}
        <AutoAvaliacao />

        {/* Elegant fading primary divider */}
        <div className="w-full flex items-center justify-center py-2 px-6">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-brand-primary/30 to-transparent" />
        </div>

        {/* Section 4: Google Reviews */}
        <GoogleReviewsFeed />
      </div>
    </main>
  );
}
