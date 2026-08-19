import { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getEstoque, getSinaisDeEstoque, getVeiculoById, getVeiculoPdpUrl, truncateString } from "../../../../../../lib/supabase";
import { decidirPublicacao, getDatasDeVenda } from "../../../../../../lib/publicacao";
import PDPClientWrapper from "../../../../../../components/PDPClientWrapper";
import FaixaProcedencia from "../../../../../../components/modernist/FaixaProcedencia";
import { getCachedSettings } from "../../../../../../lib/settings";
import { montarCompartilhamento } from "../../../../../../lib/compartilhamento";
import { normalizarProcedencia } from "../../../../../../lib/procedencia";
import { escolherSimilares } from "../../../../../../lib/similares";
import { SITE_URL } from "../../../../../../lib/site";
import { ehSegmentoDePdp, segmentoDoVeiculo } from "../../../../../../lib/veiculoUrl";

// Incremental Static Regeneration (ISR) configuration
export const revalidate = 3600; // Revalidate every 1 hour

// Ensure new cars added to Supabase dynamically are resolved and cached on-demand
export const dynamicParams = true;

interface PageProps {
  params: Promise<{
    /** `carros` ou `motos` — ver `lib/veiculoUrl.ts`. */
    categoria: string;
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
      // `parts[1]` é o segmento (carros/motos): sai da mesma função que
      // monta a URL, então os dois nunca divergem.
      categoria: parts[1],
      marca: parts[2],
      modelo: parts[3],
      versao: parts[4],
      slug_completo_com_id: parts[5]
    };
  });
}

/**
 * Como este veículo se apresenta: disponível, vendido ou indisponível, e se
 * continua no índice de busca. A regra vive em `lib/publicacao.ts`; aqui só se
 * junta o que o banco sabe.
 *
 * Chamada duas vezes por render — uma no `generateMetadata`, outra na página.
 * As duas consultas são leves (`getDatasDeVenda` é cacheada, e a de estoque lê
 * só id e carimbo), e a PDP renderiza no máximo uma vez por hora sob o ISR.
 */
async function publicacaoDoVeiculo(veiculo: { id: string; vendido?: boolean }) {
  const [sinais, datasDeVenda] = await Promise.all([
    getSinaisDeEstoque(veiculo.id),
    getDatasDeVenda(),
  ]);

  return decidirPublicacao({
    vendido: veiculo.vendido,
    foraDoFeed: sinais.foraDoFeed,
    ultimaPresenca: sinais.ultimaPresenca,
    dataVenda: datasDeVenda[String(veiculo.id)],
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

  // `descricao_seo` primeiro: é o campo escrito para este uso — curto, sem
  // depender do contexto da página. Cai em `descricao`, o texto editorial, e só
  // então na frase montada. Mesma cadeia do feed XML, pela mesma razão.
  const textoParaMeta = veiculo.descricao_seo || veiculo.descricao || "";
  const cleanDescription = textoParaMeta ? textoParaMeta.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() : "";
  const seoDescription = cleanDescription
    ? truncateString(cleanDescription, 155)
    : `Oferta Exclusiva: compre seu ${veiculo.marca} ${veiculo.modelo} ${veiculo.versao} ano ${veiculo.ano} cor ${veiculo.cor} com laudo pericial cautelar aprovado e garantia. Preço: ${priceText}. Financie com facilidade!`;

  const pdpUrl = getVeiculoPdpUrl(veiculo);
  const imageUrl = veiculo.whatsapp_images[0] || veiculo.web_full_images[0] || "";
  const [{ companySettings }, publicacao] = await Promise.all([
    getCachedSettings(),
    publicacaoDoVeiculo(veiculo),
  ]);

  /**
   * Nome do veículo sem repetir a versão.
   *
   * O RevendaMais já manda a versão embutida no modelo em boa parte do
   * estoque, então `marca + modelo + versao` produzia "BMW X4 M40i 3.0 M Sport
   * Edit V6 Turbo Aut m40i 3.0 m sport edit v6 turbo aut" — verificado no
   * estoque em 2026-08-10. Num card de WhatsApp, que corta por volta de 65
   * caracteres, a repetição consome o título inteiro e o preço nunca aparece.
   *
   * O `<title>` passou a usar o mesmo nome em 2026-08-19 (P3 da
   * `RECOMENDACAO_SEO.md`, aprovada pelo dono). Medido em produção antes da
   * correção, no carro mais caro da vitrine:
   *
   *   BMW X4 M40i 3.0 M Sport Edit V6 Turbo Aut m40i 3.0 m sport edit v6
   *   turbo aut - R$ 318.900 | Motors Store
   *
   * O Google corta por volta de 60 caracteres: o que sobrava na busca era só
   * a repetição — preço e nome da loja nunca apareciam. Canonical e URL não
   * mudam, então não há risco de reindexação.
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
    title: `${nomeDoVeiculo} - ${priceText} | Motors Store`,
    description: seoDescription,
    alternates: {
      canonical: pdpUrl,
    },
    // Carro que não está à venda sai do índice, mas a página continua de pé.
    //
    // Sair do sitemap não desindexa nada por si: as 53 URLs órfãs medidas em
    // 2026-08-17 seguiriam ranqueando e mandando gente para um anúncio que a
    // loja não honra. `index: false` tira da busca; `follow: true` mantém os
    // links internos — inclusive os similares — sendo rastreados, para a
    // página virar porta de entrada em vez de beco sem saída.
    //
    // Quando isso vale para o vendido é a carência de `lib/publicacao.ts`.
    ...(publicacao.noindex ? { robots: { index: false, follow: true } } : {}),
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

  // Segmento desconhecido não é ficha de veículo. Sem esta linha, a rota
  // — que é dinâmica no primeiro nível — serviria qualquer caminho de
  // cinco segmentos como se fosse um carro.
  if (!ehSegmentoDePdp(resolvedParams.categoria)) {
    notFound();
  }

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

  // Moto pedida em /carros/ (ou o contrário) vai para o endereço certo,
  // com 308. As fichas das 4 motos já estavam indexadas sob /carros/ —
  // sem este desvio elas responderiam 200 nos dois lugares, que é o
  // conteúdo duplicado que a mudança de segmento existe para evitar.
  const pdpUrl = getVeiculoPdpUrl(veiculo);
  if (resolvedParams.categoria !== segmentoDoVeiculo(veiculo)) {
    permanentRedirect(pdpUrl);
  }

  const [estoqueCompleto, settings, publicacao] = await Promise.all([
    getEstoque(),
    getCachedSettings(),
    publicacaoDoVeiculo(veiculo),
  ]);
  const itensProcedencia = normalizarProcedencia(settings.procedencia);

  // "Também no seu perfil" — regra e limites em `lib/similares.ts`.
  const similares = escolherSimilares(veiculo, estoqueCompleto);

  // Construct JSON-LD Structured Data for the vehicle (Car schema)
  const hasDiscount = veiculo.preco_promocional > 0 && veiculo.preco_promocional < veiculo.preco_original;
  const finalPrice = hasDiscount ? veiculo.preco_promocional : veiculo.preco_original;
  const imageUrl = veiculo.web_full_images[0] || veiculo.whatsapp_images[0] || "";

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
      // Fora do feed conta como fora de estoque. Antes daqui, o carro que saiu
      // do feed continuava com `vendido = false` no banco e a PDP declarava
      // `InStock` com preço — o Google mostrava a oferta como válida.
      "availability": publicacao.indisponivel ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      "itemCondition": "https://schema.org/UsedCondition",
      "url": `${SITE_URL}${pdpUrl}`
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
        "item": `${SITE_URL}/`
      },
      {
        // `/estoque?marca=X`, não `/carros/{marca}`: essa rota intermediária NÃO
        // existe (a pasta [marca] só contém [modelo]), então o breadcrumb rico
        // do Google apontava para um 404 — markup desperdiçado e erro no Search
        // Console. Quem lê `?marca=` é o Catálogo, em /estoque — a home ignora
        // o parâmetro.
        "@type": "ListItem",
        "position": 2,
        "name": veiculo.marca,
        "item": `${SITE_URL}/estoque?marca=${encodeURIComponent(veiculo.marca)}`
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": `${veiculo.marca} ${veiculo.modelo}`,
        "item": `${SITE_URL}${pdpUrl}`
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
      <PDPClientWrapper
        veiculo={veiculo}
        similares={similares}
        indisponivel={publicacao.indisponivel}
        rotuloIndisponivel={publicacao.rotulo}
      />
      <FaixaProcedencia itens={itensProcedencia} />
    </div>
  );
}
