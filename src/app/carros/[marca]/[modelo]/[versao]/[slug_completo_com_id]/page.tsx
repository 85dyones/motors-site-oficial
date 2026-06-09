import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEstoque, getVeiculoById, getVeiculoPdpUrl, truncateString } from "../../../../../../lib/supabase";
import PDPClientWrapper from "../../../../../../components/PDPClientWrapper";

// Incremental Static Regeneration (ISR) configuration
export const revalidate = 3600; // Revalidate every 1 hour

// Ensure new cars added to Supabase dynamically are resolved and cached on-demand
export const dynamicParams = true;

interface PageProps {
  params: Promise<{
    marca: string;
    modelo: string;
    versao: string;
    slug_completo_com_id: string;
  }>;
}

// Generate static routes for the pre-rendering engine at compile-time (ISR optimization)
export async function generateStaticParams() {
  const estoque = await getEstoque();
  return estoque.map((veiculo) => {
    const pdpUrl = getVeiculoPdpUrl(veiculo);
    const parts = pdpUrl.split("/");
    return {
      marca: parts[2],
      modelo: parts[3],
      versao: parts[4],
      slug_completo_com_id: parts[5]
    };
  });
}

// Generate dynamic meta tags for Google Index SEO (High Performance indexation)
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const slug = resolvedParams.slug_completo_com_id;
  
  // Natively strip `.html` ending and capture ID at the end of the slug
  const cleanSlug = slug.replace(/\.html$/, "");
  const parts = cleanSlug.split("-");
  const id = parts[parts.length - 1];

  const veiculo = await getVeiculoById(id);
  if (!veiculo) {
    return {
      title: "Veículo não encontrado | Motors Store",
      description: "O veículo procurado não foi localizado em nosso estoque ou já foi vendido."
    };
  }

  const priceText =
    veiculo.preco_promocional > 0 && veiculo.preco_promocional < veiculo.preco_original
      ? veiculo.preco_promocional.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
          maximumFractionDigits: 0
        })
      : veiculo.preco_original.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
          maximumFractionDigits: 0
        });

  const seoDescription = veiculo.descricao
    ? truncateString(veiculo.descricao, 155)
    : `Oferta Exclusiva: compre seu ${veiculo.marca} ${veiculo.modelo} ${veiculo.versao} ano ${veiculo.ano} cor ${veiculo.cor} com laudo pericial cautelar aprovado e garantia. Preço: ${priceText}. Financie com facilidade!`;

  const pdpUrl = getVeiculoPdpUrl(veiculo);

  return {
    title: `${veiculo.marca} ${veiculo.modelo} ${veiculo.versao} - ${priceText} | Motors Store`,
    description: seoDescription,
    alternates: {
      canonical: pdpUrl,
    },
    openGraph: {
      title: `${veiculo.marca} ${veiculo.modelo} ${veiculo.versao} por ${priceText}`,
      description: seoDescription,
      images: [
        {
          url: veiculo.whatsapp_images[0] || "",
          width: 800,
          height: 600,
          alt: `${veiculo.marca} ${veiculo.modelo}`
        }
      ]
    }
  };
}

export default async function CarDetailsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug_completo_com_id;

  // Natively strip `.html` and parse the vehicle unique ID
  const cleanSlug = slug.replace(/\.html$/, "");
  const parts = cleanSlug.split("-");
  const id = parts[parts.length - 1];

  const veiculo = await getVeiculoById(id);
  
  if (!veiculo) {
    notFound();
  }

  // Construct JSON-LD Structured Data for the vehicle (Car schema)
  const hasDiscount = veiculo.preco_promocional > 0 && veiculo.preco_promocional < veiculo.preco_original;
  const finalPrice = hasDiscount ? veiculo.preco_promocional : veiculo.preco_original;
  const imageUrl = veiculo.web_full_images[0] || veiculo.whatsapp_images[0] || "";
  const pdpUrl = getVeiculoPdpUrl(veiculo);

  const carSchema = {
    "@context": "https://schema.org",
    "@type": "Car",
    "name": `${veiculo.marca} ${veiculo.modelo} ${veiculo.versao}`,
    "image": imageUrl,
    "description": veiculo.descricao || `${veiculo.marca} ${veiculo.modelo} ${veiculo.versao} ano ${veiculo.ano} em excelente estado.`,
    "brand": {
      "@type": "Brand",
      "name": veiculo.marca
    },
    "model": veiculo.modelo,
    "vehicleModelDate": veiculo.ano,
    "mileageFromOdometer": {
      "@type": "QuantitativeValue",
      "value": veiculo.quilometragem,
      "unitCode": "KMT"
    },
    "vehicleTransmission": veiculo.cambio,
    "fuelType": veiculo.combustivel,
    "color": veiculo.cor,
    "offers": {
      "@type": "Offer",
      "price": finalPrice,
      "priceCurrency": "BRL",
      "availability": veiculo.vendido ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      "itemCondition": "https://schema.org/UsedCondition",
      "url": `https://motors-site-oficial.vercel.app${pdpUrl}`
    }
  };

  return (
    <div className="flex flex-col flex-grow bg-brand-bg text-brand-text transition-colors duration-300">
      {/* Dynamic JSON-LD Structured Data Schema for search engines (Rich Results) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(carSchema) }}
      />
      <PDPClientWrapper veiculo={veiculo} />
    </div>
  );
}
