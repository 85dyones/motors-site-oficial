import { NextResponse } from 'next/server';
import { getEstoque, getVeiculoPdpUrl } from '../../../../lib/supabase';
import { nomeDoVeiculo } from '../../../../lib/nomeDoVeiculo';
import { rotuloDoModelo } from '../../../../lib/hubsDeEstoque';
import { segmentoDoVeiculo } from '../../../../lib/veiculoUrl';
import { concordar, generoDeModelo } from '../../../../lib/generoDoVeiculo';
import { precoEfetivo, temPromocao } from '../../../../lib/precoPromocional';
import { decidirNoFeed, getDatasDeVenda } from '../../../../lib/publicacao';
import { alertarFalha } from '../../../../lib/alertaDeFalha';
import { faixaDoPreco } from '../../../../lib/faixasDePreco';
import {
  CATEGORIA_GOOGLE_POR_SEGMENTO,
  LIMITE_DO_TITULO,
  TIPO_DE_VEICULO_POR_SEGMENTO,
  escaparXml,
  imagensDoAnuncio,
  truncarEmPalavra,
} from '../../../../lib/feedDeCatalogo';

// Rota dinâmica, e não `revalidate`: o handler lê `request.url` para montar o
// endereço absoluto de cada item, e isso não pode ser pré-renderizado. Com
// `revalidate = 10800` o build tentava gerar a rota estaticamente, falhava com
// DynamicServerError e imprimia "[XML Feed] Error generating catalog feed" em
// toda compilação — ruído que escondia erro de verdade.
//
// O cache das 3 horas não se perde: ele vive no `Cache-Control` da resposta
// (`s-maxage=10800`), que é quem o CDN obedece.
export const dynamic = 'force-dynamic';

/**
 * As datas de venda — e o catálogo inteiro não cai junto se elas faltarem.
 *
 * A distinção importa e não é simetria boba com o `getEstoque`. O estoque É o
 * conteúdo: sem ele, servir um feed vazio seria dizer ao Meta que o pátio
 * esvaziou, e por isso a leitura que falha PARA a rota. As datas de venda são
 * enriquecimento: sem elas, `decidirNoFeed` não encontra carimbo nenhum e todo
 * vendido sai na hora — que é exatamente o comportamento que este feed teve até
 * 2026-09-06. Degradar para o passado é aceitável; derrubar o catálogo dos 36
 * carros vivos por causa disso, não.
 *
 * `getDatasDeVenda` já trata os próprios erros de rede e de RLS por dentro. O
 * que sobra para cá é a falha do `unstable_cache` em si — a que aparece fora do
 * contexto de requisição do Next.
 */
async function datasDeVendaOuVazio(): Promise<Record<string, string>> {
  try {
    return await getDatasDeVenda();
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    console.warn('[XML Feed] sem as datas de venda (%s) — todo vendido sai na hora.', detalhe);
    // Degradar em silêncio é como a carência do vendido ficaria desligada por
    // semanas sem ninguém saber. O alerta tem `throttle` por assunto.
    void alertarFalha('Feed do catálogo sem as datas de venda', detalhe);
    return {};
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const host = url.protocol + '//' + url.host;
    
    // Default site URL, using host if running locally or env var in prod
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || host;

    // As duas leituras vão juntas: `getDatasDeVenda` é `unstable_cache` de uma
    // hora, compartilhado com o sitemap e com a ficha, então quando o feed
    // pergunta o cache quase sempre está quente. Fica FORA do laço porque é uma
    // pergunta só para o pátio inteiro.
    const [vehicles, datasDeVenda] = await Promise.all([getEstoque(), datasDeVendaOuVazio()]);

    // Create XML payload adhering to Google Merchant Center / Meta Catalog standard
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Catálogo de Veículos Motors Store</title>
    <link>${escaparXml(siteUrl)}</link>
    <description>Estoque dinâmico de veículos para campanhas e anúncios.</description>
`;

    for (const car of vehicles) {
      // O vendido não some da noite para o dia. Ver `decidirNoFeed`: para o
      // Meta, item que desaparece de uma carga para a outra foi DELETADO, e
      // isso quebra anúncio dinâmico ativo e público montado por `content_ids`.
      // Ele fica alguns dias como `out_of_stock`, o portal encerra a entrega, e
      // só então ele sai.
      const noFeed = decidirNoFeed({
        vendido: car.vendido,
        // `getEstoque` já filtrou por `estado_cadastro = 'publicado'`: o que
        // chega aqui está no feed por definição.
        foraDoFeed: false,
        dataVenda: datasDeVenda[String(car.id)],
      });
      if (!noFeed.publica) continue;

      const segmento = segmentoDoVeiculo(car);
      const pdpUrl = `${siteUrl}${getVeiculoPdpUrl(car)}`;

      // A galeria inteira, não só a capa: até 2026-09-06 o feed mandava UMA
      // foto de uma média de 15, e o diagnóstico do Meta acusava
      // `not_enough_images` nos 36 itens. Carrossel dinâmico com foto única
      // converte muito pior.
      const imagens = imagensDoAnuncio(car.whatsapp_images, car.web_full_images);
      if (imagens.length === 0) {
        // Não deveria acontecer: `publicavel` exige 4 fotos antes da vitrine.
        // Mas emitir `<g:image_link></g:image_link>` reprova o item em silêncio,
        // e um caminho relativo (`/logo.png`, o último degrau do mapper) é foto
        // que o portal não consegue buscar. Melhor faltar o item e dizer o id.
        console.warn('[XML Feed] veículo %s sem foto absoluta — fora do catálogo', car.id);
        // Um carro sumindo do catálogo PAGO é exatamente o tipo de coisa que
        // não pode ficar só no log de uma função serverless.
        void alertarFalha(
          'Veículo fora do catálogo de anúncios',
          `O veículo ${car.id} não tem nenhuma foto com endereço absoluto e ficou fora do feed.`,
        );
        continue;
      }

      // Preço e promoção são DUAS tags, não uma escolha entre duas.
      //
      // Até 2026-08-31 esta linha era `preco_promocional > 0 ? promocional :
      // original` e o resultado ia sozinho para `g:price` — o feed anunciava a
      // Saveiro a R$ 65.900 sem dizer que era oferta, e `g:sale_price` não
      // aparecia em nenhum dos 34 itens. Duas consequências, ambas medidas:
      // o anúncio perdia a tarja de oferta e o preço riscado, e o preço
      // declarado divergia da ficha, que mostra "de 68.900 por 65.900" — o tipo
      // de divergência que o Meta e o Merchant Center reprovam por conta
      // própria, sem avisar que reprovaram.
      //
      // A semântica dos dois catálogos é a mesma: `price` é o de tabela,
      // `sale_price` é o que se paga hoje. A régua de "há promoção" é a MESMA
      // da PDP (`temPromocao`), para o feed nunca prometer oferta que a ficha
      // não mostra.
      const emPromocao = temPromocao(car.preco_promocional, car.preco_original);
      const price = car.preco_original;

      // O mesmo nome deduplicado do `<title>` da ficha e do `Car.name`
      // (`lib/nomeDoVeiculo.ts`). Medido no feed em produção em 2026-08-25:
      //
      //   BMW X4 M40i 3.0 M Sport Edit V6 Turbo Aut m40i 3.0 m sport edit v6 turbo aut
      //
      // O RevendaMais embute a versão no modelo, e concatenar os três a
      // repetia. Título de anúncio é cortado por volta de 65 caracteres em
      // qualquer portal: o que sobrava era só a repetição. `g:id` continua o
      // mesmo, então o catálogo do Meta não perde correspondência.
      const title = nomeDoVeiculo(car);
      // Truncar CRU e escapar DEPOIS. Na ordem inversa, o corte pode cair no
      // meio de uma entidade (`&amp;` virando `&am`) e produzir XML inválido —
      // um `&` solto derruba o documento inteiro, não só o item.
      const tituloDoAnuncio = escaparXml(truncarEmPalavra(title, LIMITE_DO_TITULO));
      // Cadeia de três, e o degrau do meio é o que faltava.
      //
      // `descricao_seo` só passou a existir na migração 20260817130000 — antes
      // dela a propriedade era `undefined` dentro de um `select("*")`, sem erro
      // nenhum, e TODO anúncio caía no texto genérico. Medido em 2026-08-17: os
      // 41 veículos do feed saíam com a mesma frase, mudando só marca e modelo.
      //
      // `descricao` entra como segundo degrau porque o texto real já existia e
      // já estava preenchido: enquanto ninguém escrever a versão curta no
      // painel, o portal recebe conteúdo de verdade em vez de catálogo. O
      // genérico fica onde deveria estar desde sempre — no último recurso, para
      // o carro que chegou sem texto algum.
      //
      // O último degrau também concorda: dizia "comprar **seu** {marca}
      // {modelo}" e escrevia "comprar seu Volkswagen Saveiro". E "melhores
      // condições" está na coluna *Evitar* de `conteudo-seo/POSICIONAMENTO.md`.
      const generoDoCarro = generoDeModelo(
        rotuloDoModelo(car.marca, car.modelo, car.versao),
        { segmento, tipo: car.tipo },
      );
      const descricaoDoAnuncio =
        car.descricao_seo ||
        car.descricao ||
        `${car.marca} ${car.modelo} ${car.ano} com perícia cautelar independente e laudo na ficha assim que aprovado. ` +
          `Leve ${concordar(generoDoCarro, "o seu", "a sua")} com garantia e financiamento, em Curitiba.`;

      // O texto editorial da PDP pode vir com HTML do painel; o feed é XML e
      // não renderiza marcação. Tirar as tags aqui evita mandar `<p>` como se
      // fosse parte da frase do anúncio.
      const description = escaparXml(
        descricaoDoAnuncio
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      );
      const brand = escaparXml(car.marca);

      // A faixa e a carroceria são os dois eixos pelos quais os conjuntos de
      // produtos vão querer segmentar, e hoje precisam ser recriados na mão no
      // Commerce Manager.
      //
      // A faixa sai do preço EFETIVO, não do de tabela: é o que
      // `lib/dataLayer.ts` publica como `price_range`. Usando o de tabela, o
      // público de remarketing e o rótulo do catálogo cairiam em faixas
      // diferentes para todo carro em promoção — metade do pátio.
      const faixa = faixaDoPreco(precoEfetivo(car.preco_promocional, car.preco_original) ?? 0);
      const carroceria = escaparXml(car.tipo);

      // `condition` e `state_of_vehicle` são a MESMA afirmação e agora têm uma
      // leitura só. Até 2026-09-06 divergiam: `condition` virava `new` quando
      // `quilometragem === 0` e `state_of_vehicle` era `used` fixo. Só que o
      // mapper faz `Number(dbItem.quilometragem) || 0`, então quilometragem
      // AUSENTE também vira zero — o feed declarava "zero km" para carro sem KM
      // cadastrado, numa revenda de seminovos. Zero km de verdade é coluna de
      // cadastro, não leitura de hodômetro.
      const condicao = 'used';

      xml += `
    <item>
      <g:id>${car.id}</g:id>
      <g:title>${tituloDoAnuncio}</g:title>
      <g:description>${description}</g:description>
      <g:link>${escaparXml(pdpUrl)}</g:link>
      <g:image_link>${escaparXml(imagens[0])}</g:image_link>${imagens
        .slice(1)
        .map((url) => `
      <g:additional_image_link>${escaparXml(url)}</g:additional_image_link>`)
        .join('')}
      <g:brand>${brand}</g:brand>
      <g:condition>${condicao}</g:condition>
      <g:availability>${noFeed.disponibilidade}</g:availability>
      <g:price>${price.toFixed(2)} BRL</g:price>${
        emPromocao ? `
      <g:sale_price>${Number(car.preco_promocional).toFixed(2)} BRL</g:sale_price>` : ''
      }
      <g:google_product_category>${escaparXml(CATEGORIA_GOOGLE_POR_SEGMENTO[segmento])}</g:google_product_category>
      <g:vehicle_type>${TIPO_DE_VEICULO_POR_SEGMENTO[segmento]}</g:vehicle_type>
      <g:year>${String(car.ano).split('/')[0] || car.ano}</g:year>
      <g:mileage>
        <g:value>${car.quilometragem}</g:value>
        <g:unit>km</g:unit>
      </g:mileage>
      <g:state_of_vehicle>${condicao}</g:state_of_vehicle>${
        faixa ? `
      <g:custom_label_0>${faixa}</g:custom_label_0>` : ''
      }${
        carroceria ? `
      <g:custom_label_1>${carroceria}</g:custom_label_1>` : ''
      }
    </item>`;
    }

    xml += `
  </channel>
</rss>`;

    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=10800, s-maxage=10800, stale-while-revalidate=86400',
      },
    });

  } catch (error) {
    console.error('[XML Feed] Error generating catalog feed:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
