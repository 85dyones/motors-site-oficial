import type { Metadata } from "next";
import SobreClientWrapper from "../../components/SobreClientWrapper";

export const metadata: Metadata = {
  title: "Quem Somos | Motors Store - Tradição e Tecnologia Premium",
  description: "Conheça a história da Motors Store. De um showroom tradicional na Avenida Europa a pioneira na inteligência artificial para curadoria de veículos de alto padrão.",
  alternates: {
    canonical: "/sobre",
  },
};

export default function SobrePage() {
  return <SobreClientWrapper />;
}
