import HeroSection from "../components/HeroSection";
import CarMatch from "../components/CarMatch";
import AutoAvaliacao from "../components/AutoAvaliacao";
import InstagramFeed from "../components/InstagramFeed";
import GoogleReviewsFeed from "../components/GoogleReviewsFeed";
import type { Metadata } from "next";
// Importa o JSON DIRETO, não via `./ThemeContext`.
//
// `ThemeContext` é um módulo "use client": quando um Server Component importa
// uma constante dele, o Next entrega uma referência de cliente no lugar do
// objeto real. Era por isso que este schema.org saía com `"name": ""` e
// `"sameAs": []` — verificado em produção em 2026-08-06, bug silencioso e
// anterior a esta rodada: o nome da loja nunca chegou ao structured data.
import DEFAULT_COMPANY_SETTINGS from "../lib/companySettings.json";

// A home declara o próprio canonical desde que ele saiu do layout raiz, onde
// era herdado indevidamente por /login, /test e /admin. As demais páginas
// públicas (sobre, contato, privacidade, destaques, PDP) já declaravam o seu.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/**
 * Endereço da loja para o schema.org, derivado de `companySettings.json` — a
 * mesma fonte que alimenta o rodapé e a ficha impressa.
 *
 * Até 2026-08-06 este schema declarava "Av. Europa, 1000, São Paulo-SP" e o
 * telefone +55 11 4003-0000, ambos fictícios: a loja é em Curitiba. O Google
 * recebia um NAP (nome/endereço/telefone) que contradizia o rodapé e o title
 * das landings, o que anula SEO local e derruba a confiança no structured data
 * do domínio. Derivar do JSON impede que as duas fontes divirjam de novo.
 */
function enderecoDoSchema() {
  // Formato esperado, o que o painel grava hoje:
  // "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350"
  //  └─ logradouro ──────┘   └ bairro ┘  └ cidade ┘  └UF┘ └─ CEP ─┘
  const bruto = (DEFAULT_COMPANY_SETTINGS.address || "").trim();

  const logradouro = bruto.split(" - ")[0]?.trim() || "";
  const miolo = bruto.split(" - ")[1] || "";
  const bairro = miolo.split(",")[0]?.trim() || "";
  const cidade = miolo.split(",")[1]?.trim() || "";
  const uf = (bruto.match(/\b([A-Z]{2})\b(?=\s*,|\s*\d{5})/) || [])[1] || "";
  const cep = (bruto.match(/\d{5}-?\d{3}/) || [""])[0];

  // Falha segura: endereço parcial no schema.org é pior que endereço nenhum —
  // o Google trata NAP inconsistente como sinal de baixa confiança. Se o dono
  // reescrever o endereço no painel num formato que este parse não entenda,
  // preferimos omitir o campo a publicar um endereço truncado ou errado.
  if (!logradouro || !cidade || !uf) return undefined;

  return {
    "@type": "PostalAddress",
    streetAddress: [logradouro, bairro].filter(Boolean).join(" - "),
    addressLocality: cidade,
    addressRegion: uf,
    postalCode: cep || undefined,
    addressCountry: "BR",
  };
}

export default function Home() {
  const SITE_URL = "https://motors-site-oficial.vercel.app";

  const autoDealerSchema = {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    "name": DEFAULT_COMPANY_SETTINGS.name,
    "image": `${SITE_URL}/logo.png`,
    "url": SITE_URL,
    // `whatsappRaw` é o número real em formato discável ("5541998426127").
    "telephone": DEFAULT_COMPANY_SETTINGS.whatsappRaw
      ? `+${DEFAULT_COMPANY_SETTINGS.whatsappRaw}`
      : undefined,
    "address": enderecoDoSchema(),
    "sameAs": [
      DEFAULT_COMPANY_SETTINGS.instagram,
      DEFAULT_COMPANY_SETTINGS.facebook
    ].filter(Boolean),
    // Horário real da loja: Seg-Sex 08h30-18h30, Sáb 08h30-15h.
    "openingHoursSpecification": [
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        "opens": "08:30",
        "closes": "18:30"
      },
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Saturday"],
        "opens": "08:30",
        "closes": "15:00"
      }
    ]
  };

  return (
    // `<div>`, não `<main>`: o layout raiz já abre um `<main>`, e landmarks
    // aninhados desorientam navegação por leitor de tela.
    <div className="flex flex-col flex-grow bg-brand-bg text-brand-text transition-colors duration-300">
      {/* Local Business (AutoDealer) Schema Markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(autoDealerSchema) }}
      />
      <h1 className="sr-only">{DEFAULT_COMPANY_SETTINGS.name} | Veículos Premium e Seminovos Selecionados</h1>
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
    </div>
  );
}
