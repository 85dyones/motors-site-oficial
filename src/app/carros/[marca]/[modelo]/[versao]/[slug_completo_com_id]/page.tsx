import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEstoque, getVeiculoById, getVeiculoPdpUrl, truncateString } from "../../../../../../lib/supabase";
import PDPClientWrapper from "../../../../../../components/PDPClientWrapper";
import FaixaProcedencia from "../../../../../../components/modernist/FaixaProcedencia";
import { getCachedSettings } from "../../../../../../lib/settings";
import { montarCompartilhamento } from "../../../../../../lib/compartilhamento";
import { normalizarProcedencia } from "../../../../../../lib/procedencia";
import { escolherSimilares } from "../../../../../../lib/similares";

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
  
  // Natively strip `.html` ending and capture ID
  const cleanSlug = slug.replace(/\.html$/, "");
  
  let veiculo = await getVeiculoById(cleanSlug);
  if (!veiculo) {
    const parts = cleanSlug.split("-");
    const id = parts[parts.length - 1];
    veiculo = await getVeiculoById(id);
  }

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

  const cleanDescription = veiculo.descricao ? veiculo.descricao.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() : "";
  const seoDescription = cleanDescription
    ? truncateString(cleanDescription, 155)
    : `Oferta Exclusiva: compre seu ${veiculo.marca} ${veiculo.modelo} ${veiculo.versao} ano ${veiculo.ano} cor ${veiculo.cor} com laudo pericial cautelar aprovado e garantia. Preço: ${priceText}. Financie com facilidade!`;

  const pdpUrl = getVeiculoPdpUrl(veiculo);
  const imageUrl = veiculo.whatsapp_images[0] || veiculo.web_full_images[0] || "";
  const { companySettings } = await getCachedSettings();

  /**
   * Nome do veículo sem repetir a versão.
   *
   * O RevendaMais já manda a versão embutida no modelo em boa parte do
   * estoque, então `marca + modelo + versao` produzia "BMW X4 M40i 3.0 M Sport
   * Edit V6 Turbo Aut m40i 3.0 m sport edit v6 turbo aut" — verificado no
   * estoque em 2026-08-10. Num card de WhatsApp, que corta por volta de 65
   * caracteres, a repetição consome o título inteiro e o preço nunca aparece.
   *
   * Só o card foi corrigido. O `<title>` da página tem a mesma duplicação e
   * continua como está: mexer nele é mudança de SEO em produção, e essa é uma
   * decisão da loja, não desta tarefa.
   */
  const modeloNormalizado = `${veiculo.marca} ${veiculo.modelo}`.trim();
  const versao = (veiculo.versao || "").trim();
  const nomeDoVeiculo =
    versao && !modeloNormalizado.toLowerCase().includes(versao.toLowerCase())
      ? `${modeloNormalizado} ${versao}`
      : modeloNormalizado;

  // A foto vence qualquer arte do painel: é o próprio produto. Quando o
  // veículo chega sem foto utilizável, `montarCompartilhamento` desce para o
  // card do painel e, na falta dele, para o card gerado — nunca para nada.
  //
  // As dimensões saíram daqui. Estavam fixas em 800×600 para qualquer foto: o
  // scraper confia no que é declarado, e foto em 4:3 anunciada como se fosse
  // outra coisa é o mesmo defeito que esticava o logo da home. Sem declaração,
  // Facebook e WhatsApp medem o arquivo sozinhos.
  return {
    title: `${veiculo.marca} ${veiculo.modelo} ${veiculo.versao} - ${priceText} | Motors Store`,
    description: seoDescription,
    alternates: {
      canonical: pdpUrl,
    },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "pdp",
      rotulo: `${veiculo.ano} · ${veiculo.quilometragem.toLocaleString("pt-BR")} km`,
      tituloPadrao: `${nomeDoVeiculo} por ${priceText}`,
      descricaoPadrao: seoDescription,
      caminho: pdpUrl,
      imagemPreferida: imageUrl,
      imagemPreferidaSemDimensao: true,
    }),
  };
}

export default async function CarDetailsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug_completo_com_id;

  // Natively strip `.html` and parse the vehicle unique ID
  const cleanSlug = slug.replace(/\.html$/, "");
  
  let veiculo = await getVeiculoById(cleanSlug);
  if (!veiculo) {
    const parts = cleanSlug.split("-");
    const id = parts[parts.length - 1];
    veiculo = await getVeiculoById(id);
  }
  
  if (!veiculo) {
    notFound();
  }

  const [estoqueCompleto, settings] = await Promise.all([getEstoque(), getCachedSettings()]);
  const itensProcedencia = normalizarProcedencia(settings.procedencia);

  // "Também no seu perfil" — regra e limites em `lib/similares.ts`.
  const similares = escolherSimilares(veiculo, estoqueCompleto);

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

  // Construct BreadcrumbList JSON-LD for rich breadcrumbs in Google search results
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
        // `/?marca=X`, não `/carros/{marca}`: essa rota intermediária NÃO
        // existe (a pasta [marca] só contém [modelo]), então o breadcrumb rico
        // do Google apontava para um 404 — markup desperdiçado e erro no Search
        // Console. A home com o filtro de marca é a página real equivalente.
        "@type": "ListItem",
        "position": 2,
        "name": veiculo.marca,
        "item": `https://motors-site-oficial.vercel.app/?marca=${encodeURIComponent(veiculo.marca)}`
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": `${veiculo.marca} ${veiculo.modelo}`,
        "item": `https://motors-site-oficial.vercel.app${pdpUrl}`
      }
    ]
  };

  return (
    <div className="flex flex-col flex-grow bg-brand-bg text-brand-text transition-colors duration-300">
      {/* Dynamic JSON-LD Structured Data Schema for search engines (Rich Results) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(carSchema) }}
      />
      {/* BreadcrumbList JSON-LD for Google Rich Breadcrumbs */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <PDPClientWrapper veiculo={veiculo} similares={similares} />
      <FaixaProcedencia itens={itensProcedencia} />
    </div>
  );
}
