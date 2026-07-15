import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCachedSettings } from '../../api/settings/route';
import HeroSection from '../../../components/HeroSection';

export const revalidate = 3600; // 1 hour cache
export const dynamicParams = true;

interface PageProps {
  params: Promise<{
    tag: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const { quickTags } = await getCachedSettings();
  
  if (!quickTags || !Array.isArray(quickTags)) {
    return { title: 'Destaques Rápidos' };
  }
  
  const tag = quickTags.find((t: any) => t.id === resolvedParams.tag);
  
  if (!tag) {
    return { title: 'Destaques Rápidos' };
  }

  return {
    title: `Carros ${tag.name} em Curitiba | Motors`,
    description: `Encontre sua próxima conquista com nossa seleção especial de ${tag.name}. Estoque 100% periciado com as melhores condições e garantia de procedência.`,
    openGraph: {
      title: `Carros ${tag.name} em Curitiba | Motors`,
      description: `Encontre sua próxima conquista com nossa seleção especial de ${tag.name}. Estoque 100% periciado com as melhores condições.`,
    }
  };
}

export default async function DestaquesPage({ params }: PageProps) {
  const resolvedParams = await params;
  const { quickTags } = await getCachedSettings();
  
  if (!quickTags || !Array.isArray(quickTags)) {
    notFound();
  }
  
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
