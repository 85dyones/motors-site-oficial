import { Metadata } from 'next';
import HeroSection from '../../../components/HeroSection';
import { getCachedSettings } from '../../../lib/settings';
import { slugifyTag, unslugifyTag, findMatchingQuickTag } from '../../../lib/tagUtils';
import { QuickTag } from '../../../types';

const STATIC_QUICK_TAGS: QuickTag[] = [
  { id: "curadoria", name: "CURADORIA EXCLUSIVA", field: "perfil_uso", operator: "equals", value: "CURADORIA EXCLUSIVA" },
  { id: "economicos", name: "ECONÔMICOS", field: "preco", operator: "less", value: "180000" },
  { id: "baixa_km", name: "BAIXA QUILOMETRAGEM", field: "quilometragem", operator: "less", value: "40000" },
  { id: "parcela_1k", name: "PARCELA 1K", field: "preco", operator: "less", value: "120000" }
];

export const revalidate = 60; // 60s for revalidation so newly created tags show up fast!
export const dynamicParams = true;

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

async function resolveTagInfo(tagParam: string) {
  const settings = await getCachedSettings();
  const dynamicTags: QuickTag[] = settings.quickTags && Array.isArray(settings.quickTags) ? settings.quickTags : [];
  const allTags = [...STATIC_QUICK_TAGS, ...dynamicTags];

  const matchedTag = findMatchingQuickTag(allTags, tagParam);
  const tagId = matchedTag ? matchedTag.id : tagParam;
  const tagName = matchedTag ? matchedTag.name : unslugifyTag(tagParam);
  const cleanSlug = matchedTag ? (slugifyTag(matchedTag.name) || matchedTag.id) : slugifyTag(tagParam);

  return { matchedTag, tagId, tagName, cleanSlug };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const { tagName, cleanSlug } = await resolveTagInfo(resolvedParams.tag);

  const title = `Carros ${tagName} em Curitiba | Motors Store`;
  const description = `Confira nossa seleção exclusiva de veículos na categoria ${tagName}. As melhores condições, procedência garantida e atendimento premium na Motors Store.`;
  const url = `https://motors-site-oficial.vercel.app/destaques/${cleanSlug}?utm_source=site&utm_medium=quick_tag&utm_campaign=${encodeURIComponent(cleanSlug)}`;

  return {
    title,
    description,
    alternates: {
      canonical: `https://motors-site-oficial.vercel.app/destaques/${cleanSlug}`,
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
  const { matchedTag, tagId, tagName, cleanSlug } = await resolveTagInfo(resolvedParams.tag);

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "item": {
          "@type": "WebPage",
          "name": `Catálogo de Veículos: ${tagName}`,
          "url": `https://motors-site-oficial.vercel.app/destaques/${cleanSlug}`
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
      <HeroSection 
        initialQuickTag={tagId} 
        isLandingPage={true} 
        landingPageTitle={tagName} 
        landingPageDescription={matchedTag?.description}
        landingPageBgImage={matchedTag?.bgImageUrl}
      />
    </div>
  );
}
