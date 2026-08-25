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
import {
  ehSegmentoDePdp,
  segmentoDoVeiculo,
  slugDeMarca,
  slugDeModelo,
} from "../../../../../../lib/veiculoUrl";
import { nomeDoVeiculo as montarNomeDoVeiculo } from "../../../../../../lib/nomeDoVeiculo";
import { schemaDoVeiculo } from "../../../../../../lib/schemaVeiculo";
import { blocoJsonLd, schemaDeTrilha } from "../../../../../../lib/schemaListagem";
import {
  destinoDoVeiculoArquivado,
  recortesDoEstoque,
  rotuloDoModelo,
} from "../../../../../../lib/hubsDeEstoque";
import { generoDeModelo, seu } from "../../../../../../lib/generoDoVeiculo";

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
  // A frase de último recurso, quando o veículo chega sem nenhum texto.
  //
  // Dizia "Oferta Exclusiva: compre **seu** {marca} {modelo}" — duas coisas
  // erradas na mesma linha. "Exclusiva" está na coluna *Evitar* de
  // `conteudo-seo/POSICIONAMENTO.md`, e o possessivo cravado no masculino
  // escrevia "compre seu Volkswagen Saveiro". O gênero agora vem do modelo,
  // com a carroceria do próprio veículo decidindo.
  const generoDoModelo = generoDeModelo(rotuloDoModelo(veiculo.marca, veiculo.modelo, veiculo.versao), {
    segmento: segmentoDoVeiculo(veiculo),
    tipo: veiculo.tipo,
  });
  const seoDescription = cleanDescription
    ? truncateString(cleanDescription, 155)
    : `${veiculo.marca} ${veiculo.modelo} ${veiculo.versao} ${veiculo.ano}, cor ${veiculo.cor}, ` +
      `${seu(generoDoModelo)} por ${priceText}. Perícia cautelar independente com laudo na ficha, ` +
      "garantia e financiamento. Motors Store, Bacacheri, Curitiba.";

  const pdpUrl = getVeiculoPdpUrl(veiculo);
  const imageUrl = veiculo.whatsapp_images[0] || veiculo.web_full_images[0] || "";
  const [{ companySettings }, publicacao] = await Promise.all([
    getCachedSettings(),
    publicacaoDoVeiculo(veiculo),
  ]);

  /**
   * Nome do veículo sem repetir a versão.
   *
   * A regra e a história dela vivem em `lib/nomeDoVeiculo.ts` desde 2026-08-25.
   * Estavam aqui, dentro do `generateMetadata`, e por isso o `<title>` e o card
   * de WhatsApp deduplicavam enquanto o `Car` do JSON-LD, logo abaixo nesta
   * mesma página, publicava a versão em dobro — que é o defeito nº 2 da lista
   * de achados do plano de aquisição.
   */
  const nomeDoVeiculo = montarNomeDoVeiculo(veiculo);

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

  const [{ historico, disponiveis }, settings, publicacao] = await Promise.all([
    recortesDoEstoque(),
    getCachedSettings(),
    publicacaoDoVeiculo(veiculo),
  ]);

  /**
   * Fim do ciclo: a URL vira 301 para o hub do modelo.
   *
   * Até 2026-08-25 a ficha vendida ficava para sempre no ar com `noindex`, e
   * todo o sinal que ela acumulou — link de portal, compartilhamento de
   * WhatsApp, link interno — era descartado. Com giro de ~45 dias sobre 39
   * vagas, são da ordem de 300 URLs por ano indo para o lixo. Não havia o que
   * fazer diferente: o hub do modelo não existia. Agora existe.
   *
   * A carência de 90 dias (`CARENCIA_VENDIDO_DIAS`) não muda — é decisão do
   * dono de 17/08, e o redirecionamento entra no MESMO momento em que a página
   * já saía do índice. Nos primeiros 90 dias ela continua de pé com o selo e os
   * similares, que é onde ela ainda converte.
   *
   * `arquivar` é falso para "fora do feed": ali o motivo da saída é
   * desconhecido e o carro pode voltar (ver `lib/publicacao.ts`).
   */
  if (publicacao.arquivar) {
    permanentRedirect(destinoDoVeiculoArquivado(veiculo, historico, disponiveis));
  }

  const itensProcedencia = normalizarProcedencia(settings.procedencia);

  // "Também no seu perfil" — regra e limites em `lib/similares.ts`.
  const similares = escolherSimilares(veiculo, disponiveis);

  // O `Car` completo mora em `lib/schemaVeiculo.ts`. Ficava aqui, montado à
  // mão, e era onde faltavam `sku`, `bodyType`, `itemCondition` na raiz,
  // `numberOfPreviousOwners` e — o mais caro — `offers.seller`: a oferta não
  // dizia quem vende nem de onde se retira, então nada ligava as 39 fichas à
  // loja física que o `AutoDealer` descreve.
  const carSchema = schemaDoVeiculo(veiculo, {
    caminho: pdpUrl,
    indisponivel: publicacao.indisponivel,
  });

  /**
   * Trilha com os hubs de marca e de modelo.
   *
   * Até 2026-08-25 a posição 2 apontava para `/estoque?marca=X` — e havia um
   * comentário aqui explicando por quê: `/carros/{marca}` respondia 404, e
   * breadcrumb que aponta para 404 é markup desperdiçado que ainda vira erro no
   * Search Console. Agora os dois hubs existem (`[marca]/page.tsx` e
   * `[marca]/[modelo]/page.tsx`), então a trilha passa a apontar para páginas
   * perenes: é o que faz o Google exibir `Estoque › Jeep › Renegade` no
   * resultado e o que dá destino ao sinal que hoje morre com a ficha vendida.
   */
  const segmento = segmentoDoVeiculo(veiculo);
  const caminhoDaMarca = `/${segmento}/${slugDeMarca(veiculo.marca)}`;
  const caminhoDoModelo = `${caminhoDaMarca}/${slugDeModelo(veiculo.marca, veiculo.modelo, veiculo.versao)}`;

  const breadcrumbSchema = schemaDeTrilha([
    { nome: "Home", caminho: "/" },
    { nome: "Estoque", caminho: "/estoque" },
    { nome: veiculo.marca, caminho: caminhoDaMarca },
    { nome: `${veiculo.marca} ${veiculo.modelo}`, caminho: caminhoDoModelo },
  ]);

  return (
    <div className="flex flex-col flex-grow bg-brand-bg text-brand-text transition-colors duration-300">
      {/* `Car` e `BreadcrumbList` no mesmo bloco: array de nós é JSON-LD válido
          e poupa um <script> em toda ficha. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: blocoJsonLd([carSchema, breadcrumbSchema]) }}
      />
      <PDPClientWrapper
        veiculo={veiculo}
        similares={similares}
        indisponivel={publicacao.indisponivel}
        rotuloIndisponivel={publicacao.rotulo}
        caminhoDaMarca={caminhoDaMarca}
        caminhoDoModelo={caminhoDoModelo}
      />
      <FaixaProcedencia itens={itensProcedencia} />
    </div>
  );
}
