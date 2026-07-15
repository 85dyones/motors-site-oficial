import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCachedSettings } from '../../../lib/settings';
import HeroSection from '../../../components/HeroSection';
import { DEFAULT_QUICK_TAGS } from '../../ThemeContext';

export const revalidate = 3600; // 1 hour cache
export const dynamicParams = true;

interface PageProps {
  params: Promise<{
    tag: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const { quickTags: fetchedTags } = await getCachedSettings();
  
  const quickTags = (fetchedTags && Array.isArray(fetchedTags) && fetchedTags.length > 0) 
    ? fetchedTags 
    : DEFAULT_QUICK_TAGS;
  
  const tag = quickTags.find((t: any) => t.id === resolvedParams.tag);
  
  if (!tag) {
    return { title: 'Destaques Rápidos' };
  }

  return {
    title: `Carros ${tag.name} em Curitiba | Motors`,
    description: `Confira nossa seleção exclusiva de veículos na categoria ${tag.name}. As melhores condições e procedência garantida.`,
    alternates: {
      canonical: `/destaques/${tag.id}`,
    },
  };
}

export default async function DestaquesPage({ params }: PageProps) {
  const resolvedParams = await params;
  const { quickTags: fetchedTags } = await getCachedSettings();
  
  const quickTags = (fetchedTags && Array.isArray(fetchedTags) && fetchedTags.length > 0) 
    ? fetchedTags 
    : DEFAULT_QUICK_TAGS;
  
  const tag = quickTags.find((t: any) => t.id === resolvedParams.tag);

  if (!tag) {
    notFound();
  }

  return (
    <div className="flex flex-col min-h-screen pt-24">
      {/* We reuse the HeroSection, passing the initial tag so it auto-filters */}
      <HeroSection initialQuickTag={tag.id} isLandingPage={true} landingPageTitle={tag.name} />
    </div>
  );
}
