import type { Metadata } from "next";
import SobreClientWrapper from "../../components/SobreClientWrapper";
import { getEstoque } from "../../lib/supabase";
import { getCachedSettings } from "../../lib/settings";
import { montarCompartilhamento } from "../../lib/compartilhamento";

export const revalidate = 60;

const DESCRICAO =
  "Conheça a história da Motors Store. De um showroom tradicional em Curitiba a pioneira na inteligência artificial para curadoria de veículos de alto padrão.";

export async function generateMetadata(): Promise<Metadata> {
  const { companySettings } = await getCachedSettings();

  return {
    title: "Quem Somos | Motors Store - Tradição e Tecnologia Premium",
    description: DESCRICAO,
    alternates: {
      canonical: "/sobre",
    },
    // Texto de fábrica do card vem do catálogo em `lib/compartilhamento.ts`,
    // que é a mesma fonte que o preview do painel lê.
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "sobre",
      caminho: "/sobre",
    }),
  };
}

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

export default async function SobrePage() {
  // O manifesto cita o tamanho do estoque como argumento ("N unidades e não
  // 300"). O número vem do banco, não do texto — ver `comTotal` no wrapper.
  const estoque = await getEstoque();
  const totalEstoque = estoque.filter((v) => !v.vendido).length;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <SobreClientWrapper totalEstoque={totalEstoque} />
    </>
  );
}
