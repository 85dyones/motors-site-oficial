import type { Metadata } from "next";
import SobreClientWrapper from "../../components/SobreClientWrapper";

export const metadata: Metadata = {
  title: "Quem Somos | Motors Store - Tradição e Tecnologia Premium",
  description: "Conheça a história da Motors Store. De um showroom tradicional em Curitiba a pioneira na inteligência artificial para curadoria de veículos de alto padrão.",
  alternates: {
    canonical: "/sobre",
  },
  openGraph: {
    title: "Quem Somos | Motors Store - Tradição e Tecnologia Premium",
    description: "Conheça a história da Motors Store. De um showroom tradicional em Curitiba a pioneira na inteligência artificial para curadoria de veículos de alto padrão.",
    url: "/sobre",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Quem Somos | Motors Store - Tradição e Tecnologia Premium",
    description: "Conheça a história da Motors Store. De um showroom tradicional em Curitiba a pioneira na inteligência artificial para curadoria de veículos de alto padrão.",
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://motors-site-oficial.vercel.app/"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Quem Somos",
      "item": "https://motors-site-oficial.vercel.app/sobre"
    }
  ]
};

export default function SobrePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <SobreClientWrapper />
    </>
  );
}
