import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LandingDestaque from '../../../components/modernist/LandingDestaque';
import { getEstoque } from '../../../lib/supabase';
import { getCachedSettings } from '../../../lib/settings';
import { montarCompartilhamento } from '../../../lib/compartilhamento';
import {
  DESTAQUES_PADRAO,
  normalizarQuickTags,
  normalizarStockOverrides,
  resolverDestaques,
} from '../../../lib/destaquesRapidos';
import {
  slugifyTag,
  unslugifyTag,
  findMatchingQuickTag,
  nomeEmFrase,
  nomeEmMinuscula,
} from '../../../lib/tagUtils';
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
  // O row `quick_tags` chega como `{ quickTags: [...] }`, não como array —
  // o `Array.isArray` que existia aqui era sempre falso, então nenhuma
  // categoria criada no painel era resolvida pela própria regra.
  const dynamicTags: QuickTag[] = normalizarQuickTags(settings.quickTags);
  const allTags = [...dynamicTags, ...STATIC_QUICK_TAGS];

  const matchedTag = findMatchingQuickTag(allTags, tagParam);
  const tagId = matchedTag ? matchedTag.id : tagParam;
  const tagName = matchedTag ? matchedTag.name : unslugifyTag(tagParam);
  const cleanSlug = matchedTag ? (slugifyTag(matchedTag.name) || matchedTag.id) : slugifyTag(tagParam);

  return { matchedTag, tagId, tagName, cleanSlug };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const [{ tagName, cleanSlug }, { companySettings }] = await Promise.all([
    resolveTagInfo(resolvedParams.tag),
    getCachedSettings(),
  ]);

  // Caixa de frase, não a caixa alta que a tela usa: o nome cai no meio da
  // frase, e `<title>` todo em maiúscula é candidato a ser reescrito pelo
  // Google. O nome vem do painel, então a normalização é obrigatória — sem
  // ela o título depende de como a loja digitou.
  const nome = nomeEmMinuscula(tagName);
  const title = `Carros ${nome} em Curitiba | Motors Store`;
  const description = `Confira nossa seleção exclusiva de veículos na categoria ${nome}. As melhores condições, procedência garantida e atendimento premium na Motors Store.`;
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
    // O `url` com UTM continua sendo o do og:url — é por ele que a loja mede
    // o tráfego de link colado. O restante do card vem da cascata do painel;
    // o rótulo é o nome do destaque, que é o que distingue uma landing da
    // outra na prévia.
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: 'destaques',
      rotulo: nome,
      tituloPadrao: `Carros ${nome} em Curitiba`,
      descricaoPadrao: description,
      caminho: url,
    }),
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
          // Depois de dois-pontos o nome abre a própria frase.
          "name": `Catálogo de Veículos: ${nomeEmFrase(tagName)}`,
          "url": `https://motors-site-oficial.vercel.app/destaques/${cleanSlug}`
        }
      }
    ]
  };

  // A grade é resolvida no servidor pela mesma regra que alimenta os chips
  // da home e a coluna de filtros do catálogo.
  const [estoque, settings] = await Promise.all([getEstoque(), getCachedSettings()]);
  const disponiveis = estoque.filter((v) => !v.vendido);
  const stockOverrides = normalizarStockOverrides(settings.stockOverrides);
  const dinamicas = normalizarQuickTags(settings.quickTags);
  const todasTags = dinamicas.length > 0 ? dinamicas : DESTAQUES_PADRAO;

  const resolvidos = resolverDestaques(todasTags, disponiveis, stockOverrides);
  const destaque =
    resolvidos.find((d) => d.tag.id === tagId || d.slug === cleanSlug) ??
    // Categoria conhecida mas sem veículo agora: mantém a página no ar com
    // grade vazia em vez de 404 — a URL é indexada e a regra volta a casar
    // quando o estoque girar.
    (matchedTag
      ? { tag: matchedTag, slug: cleanSlug, href: `/destaques/${cleanSlug}`, total: 0, veiculos: [] }
      : null);

  if (!destaque) notFound();

  const relacionados = resolvidos.filter((d) => d.slug !== destaque.slug);

  return (
    // `<div>`, não `<main>`: o layout raiz já abre um `<main>`.
    <div className="flex min-h-screen flex-col bg-mt-bg text-mt-ink">
      {/* Structured Data (JSON-LD) for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />
      <LandingDestaque
        destaque={destaque}
        relacionados={relacionados}
        introducao={matchedTag?.description}
      />
    </div>
  );
}
