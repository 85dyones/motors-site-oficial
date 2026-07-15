import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import HeroSection from '../../../components/HeroSection';

const STATIC_QUICK_TAGS = [
  { id: "curadoria", name: "CURADORIA EXCLUSIVA", field: "perfil_uso", operator: "equals", value: "CURADORIA EXCLUSIVA" },
  { id: "economicos", name: "ECONÔMICOS", field: "preco", operator: "less", value: "180000" },
  { id: "baixa_km", name: "BAIXA QUILOMETRAGEM", field: "quilometragem", operator: "less", value: "40000" },
  { id: "parcela_1k", name: "PARCELA 1K", field: "preco", operator: "less", value: "120000" }
];

export const revalidate = 3600;

interface PageProps {
  params: Promise<{
    tag: string;
  }>;
}

export async function generateStaticParams() {
  return STATIC_QUICK_TAGS.map((tag) => ({
    tag: tag.id,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const tag = STATIC_QUICK_TAGS.find((t) => t.id === resolvedParams.tag);
  
  if (!tag) {
    return { title: 'Destaques Rápidos' };
  }

  const title = `Carros ${tag.name} em Curitiba | Motors Store`;
  const description = `Confira nossa seleção exclusiva de veículos na categoria ${tag.name}. As melhores condições, procedência garantida e atendimento premium na Motors Store.`;
  const url = `https://motors-site-oficial.vercel.app/destaques/${tag.id}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Motors Store',
      locale: 'pt_BR',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function DestaquesPage({ params }: PageProps) {
  const resolvedParams = await params;
  const tag = STATIC_QUICK_TAGS.find((t) => t.id === resolvedParams.tag);

  if (!tag) {
    notFound();
  }

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "item": {
          "@type": "WebPage",
          "name": `Catálogo de Veículos: ${tag.name}`,
          "url": `https://motors-site-oficial.vercel.app/destaques/${tag.id}`
        }
      }
    ]
  };

  return (
    <div className="flex flex-col min-h-screen pt-24">
      {/* Structured Data (JSON-LD) for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />
      {/* We reuse the HeroSection, passing the initial tag so it auto-filters */}
      <HeroSection initialQuickTag={tag.id} isLandingPage={true} landingPageTitle={tag.name} />
    </div>
  );
}
