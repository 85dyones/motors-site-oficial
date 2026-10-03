import { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getEstoque, getVeiculoById, getVeiculoPdpUrl, truncateString } from "../../../../../lib/supabase";
import { publicacaoDoVeiculo } from "../../../../../lib/publicacaoDaFicha";
import { destinoDeFichaAntiga, ehFichaDoSiteAntigo } from "../../../../../lib/enderecoAntigo";
import PDPClientWrapper from "../../../../../components/PDPClientWrapper";
import FaixaProcedencia from "../../../../../components/modernist/FaixaProcedencia";
import { getCachedSettings } from "../../../../../lib/settings";
import { parametrosDoFinanciamento } from "../../../../../lib/parametrosDoFinanciamento-servidor";
import {
  montarCompartilhamento,
  previaDaFotoDoVeiculo,
} from "../../../../../lib/compartilhamento";
import { normalizarProcedencia } from "../../../../../lib/procedencia";
import { escolherSimilares } from "../../../../../lib/similares";
import {
  ehSegmentoDePdp,
  segmentoDoVeiculo,
  slugDeMarca,
  slugDeModelo,
} from "../../../../../lib/veiculoUrl";
import { nomeDoVeiculo as montarNomeDoVeiculo } from "../../../../../lib/nomeDoVeiculo";
import { montarTextosDaFicha } from "../../../../../lib/tituloDaFicha";
import { grafoDaFicha } from "../../../../../lib/grafoDaFicha";
import { qrDaFicha } from "../../../../../lib/qrDaFicha";
import { urlDoSite } from "../../../../../lib/site";
import { blocoJsonLd } from "../../../../../lib/schemaListagem";
import {
  destinoDoVeiculoArquivado,
  marcasConhecidasOuNada,
  recortesDoEstoque,
  rotuloDoModelo,
} from "../../../../../lib/hubsDeEstoque";
import { generoDeModelo, seu } from "../../../../../lib/generoDoVeiculo";

/**
 * Um minuto, como `/estoque` e os hubs de marca e modelo.
 *
 * Era uma hora, desde o commit inicial e sem motivo registrado. Achado de
 * 24/09: o sync baixou a Saveiro `8358193` de R$ 55.900 para R$ 51.900 às
 * 15:47 UTC; o hub do modelo já dizia "a partir de R$ 51.900" e a ficha
 * seguia com R$ 55.900 no título, no card do WhatsApp e no botão — a cópia em
 * cache era de ~15:30. O preço muda pelo n8n, direto no banco, e nada avisa o
 * site: o único relógio que a ficha tem é este. Com uma hora, o anúncio
 * compartilhado podia prometer um preço que a loja já não pratica.
 */
export const revalidate = 60;

// Ensure new cars added to Supabase dynamically are resolved and cached on-demand
export const dynamicParams = true;

interface PageProps {
  params: Promise<{
    /** `carros` ou `motos` — ver `lib/veiculoUrl.ts`. */
    categoria: string;
    marca: string;
    modelo: string;
    /** O 4º e ÚLTIMO segmento: versão em slug + id no fim. */
    ficha: string;
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
      // `parts[4]` é o ÚLTIMO segmento desde 2026-08-31 — a URL perdeu o
      // quinto, que repetia os três anteriores. Ver `getVeiculoPdpUrl`.
      ficha: parts[4],
    };
  });
}

// Generate dynamic meta tags for Google Index SEO (High Performance indexation)
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const slug = resolvedParams.ficha;
  
  // Natively strip `.html` ending and capture ID
  const cleanSlug = slug.replace(/\.html$/i, "");
  
  let veiculo = await getVeiculoById(cleanSlug);
  if (!veiculo) {
    const parts = cleanSlug.split("-");
    const id = parts[parts.length - 1];
    veiculo = await getVeiculoById(id);
  }

  if (!veiculo) {
    /* A descrição não atribui a ausência a uma venda, e isso é correção de
       2026-09-11: carro vendido responde 200 com o selo durante a carência, e
       301 para o hub do modelo depois dela (`publicacao.arquivar`, abaixo). O
       `notFound()` desta rota é id que nunca existiu, ficha apagada, URL velha
       de portal ou link torto. O `<head>` estava dizendo o contrário do `<h1>`
       no mesmo documento — o corpo mora em `not-found.tsx`. */
    return {
      title: "Veículo não encontrado | Motors Store",
      description:
        "Este endereço não abre nenhuma ficha do nosso estoque. Veja o que está no pátio hoje."
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
      `${seu(generoDoModelo)} por ${priceText}. Perícia cautelar independente, garantia e ` +
      "financiamento. Motors Store, Bacacheri, Curitiba.";

  const pdpUrl = getVeiculoPdpUrl(veiculo);
  const [{ companySettings }, publicacao] = await Promise.all([
    getCachedSettings(),
    publicacaoDoVeiculo(veiculo),
  ]);
  const imageUrl = veiculo.whatsapp_images[0] || veiculo.web_full_images[0] || "";
  const previa = previaDaFotoDoVeiculo(imageUrl);

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

  // Carro indisponível não anuncia preço no título nem no card. A regra, e a
  // história dela, vivem em `lib/tituloDaFicha.ts` — onde dá para testá-la.
  const textos = montarTextosDaFicha({
    nome: nomeDoVeiculo,
    ano: veiculo.ano,
    cor: veiculo.cor,
    km: veiculo.quilometragem,
    precoTexto: priceText,
    descricaoDisponivel: seoDescription,
    periciaAprovada: veiculo.pericia === "PERÍCIA APROVADA",
    publicacao,
  });

  // A foto vence qualquer arte do painel: é o próprio produto. Quando o
  // veículo chega sem foto utilizável, `montarCompartilhamento` desce para o
  // card do painel e, na falta dele, para o card gerado — nunca para nada.
  //
  // As dimensões saíram daqui. Estavam fixas em 800×600 para qualquer foto: o
  // scraper confia no que é declarado, e foto em 4:3 anunciada como se fosse
  // outra coisa é o mesmo defeito que esticava o logo da home. Desde 23/09 a
  // foto passa por `/og/foto`, que a entrega em 1200×630 exatos — e aí a
  // dimensão volta a ser declarada. Ver `previaDaFotoDoVeiculo`.
  return {
    title: textos.titulo,
    description: textos.descricao,
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
      tituloPadrao: textos.tituloDoCard,
      descricaoPadrao: textos.descricaoDoCard,
      caminho: pdpUrl,
      imagemPreferida: previa.url,
      imagemPreferidaSemDimensao: previa.semDimensao,
    }),
  };
}

export default async function CarDetailsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const slug = resolvedParams.ficha;

  // Segmento desconhecido não é ficha de veículo. Sem esta linha, a rota
  // — que é dinâmica no primeiro nível — serviria qualquer caminho de
  // cinco segmentos como se fosse um carro.
  if (!ehSegmentoDePdp(resolvedParams.categoria)) {
    notFound();
  }

  // Natively strip `.html` and parse the vehicle unique ID
  const cleanSlug = slug.replace(/\.html$/i, "");
  
  let veiculo = await getVeiculoById(cleanSlug);
  if (!veiculo) {
    const parts = cleanSlug.split("-");
    const id = parts[parts.length - 1];
    veiculo = await getVeiculoById(id);
  }
  
  if (!veiculo) {
    // Ficha do site antigo de um anúncio que o banco nunca conheceu: vai para
    // o hub do modelo ou da marca, como a ficha vendida. Só com `.html` no
    // fim; endereço qualquer continua 404. Ver `lib/enderecoAntigo.ts`.
    // O índice vem do recorte guardado por uma hora, e não do estoque: este
    // é o ramo de não encontrado (decisão de 13/09). Na pane, segue 404.
    const marcas = ehFichaDoSiteAntigo(slug) ? await marcasConhecidasOuNada() : null;
    if (marcas) {
      permanentRedirect(
        destinoDeFichaAntiga(resolvedParams.categoria, resolvedParams.marca, resolvedParams.modelo, marcas),
      );
    }
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

  const [{ historico, disponiveis }, settings, publicacao, parametrosDaSimulacao] = await Promise.all([
    recortesDoEstoque(),
    getCachedSettings(),
    publicacaoDoVeiculo(veiculo),
    // As condições do simulador "Monte sua parcela" — a vigência do painel.
    parametrosDoFinanciamento(),
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

  // Marca ou modelo fora do endereço canônico vai para ele, com 308.
  //
  // Até 29/09/2026 a ficha só redirecionava pelo segmento, e o id no fim do
  // último trecho resolvia o carro em qualquer marca/modelo: o endereço velho
  // respondia 200 junto com o novo. Isso passou a importar quando o modelo
  // repetido na versão foi corrigido (`modeloDeNomeRepetido`): o T-Cross saiu
  // de `/carros/volkswagen/t-cross-highline-250-tsi-aut/…` para
  // `/carros/volkswagen/t-cross/…`. Só marca e modelo entram na comparação —
  // o trecho da versão já tem a sua própria história de 308 (rota `[legado]`).
  // Depois do arquivamento, e não antes: o carro vendido pedido no endereço
  // velho vai direto para o hub, num salto só.
  const [, , marcaCanonica, modeloCanonico] = pdpUrl.split("/");
  const semEscape = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  if (
    semEscape(resolvedParams.marca) !== marcaCanonica ||
    semEscape(resolvedParams.modelo) !== modeloCanonico
  ) {
    permanentRedirect(pdpUrl);
  }

  /**
   * O QR que devolve o papel ao anúncio.
   *
   * Sai daqui, e não do componente, por dois motivos: a página é de
   * servidor, então o encoder não entra no pacote do navegador; e o
   * endereço é o mesmo `pdpUrl` que assina o canônico e o grafo — um lugar
   * só decide para onde a ficha aponta.
   */
  const qr = qrDaFicha(urlDoSite(pdpUrl));

  const itensProcedencia = normalizarProcedencia(settings.procedencia);

  // "Também no seu perfil" — regra e limites em `lib/similares.ts`.
  const similares = escolherSimilares(veiculo, disponiveis);

  // O `Car` completo mora em `lib/schemaVeiculo.ts`. Ficava aqui, montado à
  // mão, e era onde faltavam `sku`, `bodyType`, `itemCondition` na raiz,
  // `numberOfPreviousOwners` e — o mais caro — `offers.seller`: a oferta não
  // dizia quem vende nem de onde se retira, então nada ligava as fichas à loja
  // física que o `AutoDealer` descreve.
  //
  // Desde 05/09/2026 ele sai de `grafoDaFicha`, junto dos outros três nós — e
  // por um motivo parente: o `seller` acima passou a apontar para um `#dealer`
  // que a ficha não emitia, e array de nós montado no JSX não tem teste que
  // perceba a falta.

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

  /**
   * A montagem do grafo mora em `lib/grafoDaFicha.ts`, e não aqui.
   *
   * Array de nós escrito direto no JSX é montagem sem teste: remover um nó não
   * quebra tipo, render nem teste, e a página segue publicando JSON-LD válido —
   * só que mudo. Foi exatamente assim que a `Offer` desta ficha passou 11 dias
   * (25/08 a 05/09/2026) referenciando um `#dealer` que a própria ficha não
   * emitia.
   *
   * Extrair não basta: quem guarda o resultado é
   * `tests/ficha-publica-o-grafo.test.ts`, que renderiza esta rota e conta os
   * nós servidos. Ver `grafoDaFicha`.
   */
  const grafo = grafoDaFicha({
    veiculo,
    caminho: pdpUrl,
    indisponivel: publicacao.indisponivel,
    trilha: [
      { nome: "Home", caminho: "/" },
      { nome: "Estoque", caminho: "/estoque" },
      { nome: veiculo.marca, caminho: caminhoDaMarca },
      { nome: `${veiculo.marca} ${veiculo.modelo}`, caminho: caminhoDoModelo },
    ],
    empresa: settings.companySettings,
    disponiveis,
  });

  return (
    <div className="flex flex-col flex-grow bg-brand-bg text-brand-text transition-colors duration-300">
      {/* Os quatro nós num `<script>` só: array é JSON-LD válido, e o que
          decide quais nós são é `grafoDaFicha`, acima. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: blocoJsonLd(grafo) }}
      />
      <PDPClientWrapper
        veiculo={veiculo}
        similares={similares}
        indisponivel={publicacao.indisponivel}
        rotuloIndisponivel={publicacao.rotulo}
        caminhoDaMarca={caminhoDaMarca}
        caminhoDoModelo={caminhoDoModelo}
        qrDaFicha={qr}
        parametrosDoFinanciamento={parametrosDaSimulacao}
      />
      <FaixaProcedencia itens={itensProcedencia} />
    </div>
  );
}
