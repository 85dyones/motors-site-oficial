import { NextResponse } from 'next/server';
import { getEstoque, getVeiculoPdpUrl } from '../../../../lib/supabase';
import { nomeDoVeiculo } from '../../../../lib/nomeDoVeiculo';
import { rotuloDoModelo } from '../../../../lib/hubsDeEstoque';
import { segmentoDoVeiculo } from '../../../../lib/veiculoUrl';
import { concordar, generoDeModelo } from '../../../../lib/generoDoVeiculo';
import { temPromocao } from '../../../../lib/precoPromocional';

// Rota dinâmica, e não `revalidate`: o handler lê `request.url` para montar o
// endereço absoluto de cada item, e isso não pode ser pré-renderizado. Com
// `revalidate = 10800` o build tentava gerar a rota estaticamente, falhava com
// DynamicServerError e imprimia "[XML Feed] Error generating catalog feed" em
// toda compilação — ruído que escondia erro de verdade.
//
// O cache das 3 horas não se perde: ele vive no `Cache-Control` da resposta
// (`s-maxage=10800`), que é quem o CDN obedece.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const host = url.protocol + '//' + url.host;
    
    // Default site URL, using host if running locally or env var in prod
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || host;

    const vehicles = await getEstoque();

    // Create XML payload adhering to Google Merchant Center / Meta Catalog standard
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Catálogo de Veículos Antigravity</title>
    <link>${siteUrl}</link>
    <description>Estoque dinâmico de veículos para campanhas e anúncios.</description>
`;

    for (const car of vehicles) {
      if (car.vendido) continue; // Skip sold vehicles

      const pdpUrl = `${siteUrl}${getVeiculoPdpUrl(car)}`;
      
      // Determine best image
      const imageUrl = (car.whatsapp_images && car.whatsapp_images.length > 0) 
        ? car.whatsapp_images[0] 
        : (car.web_full_images && car.web_full_images.length > 0) 
          ? car.web_full_images[0] 
          : '';

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
      const title = nomeDoVeiculo(car).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
        { segmento: segmentoDoVeiculo(car), tipo: car.tipo },
      );
      const descricaoDoAnuncio =
        car.descricao_seo ||
        car.descricao ||
        `${car.marca} ${car.modelo} ${car.ano} com perícia cautelar independente e laudo na ficha assim que aprovado. ` +
          `Leve ${concordar(generoDoCarro, "o seu", "a sua")} com garantia e financiamento, em Curitiba.`;

      // O texto editorial da PDP pode vir com HTML do painel; o feed é XML e
      // não renderiza marcação. Tirar as tags aqui evita mandar `<p>` como se
      // fosse parte da frase do anúncio.
      const description = descricaoDoAnuncio
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const brand = car.marca.replace(/&/g, '&amp;');

      xml += `
    <item>
      <g:id>${car.id}</g:id>
      <g:title>${title}</g:title>
      <g:description>${description}</g:description>
      <g:link>${pdpUrl}</g:link>
      <g:image_link>${imageUrl}</g:image_link>
      <g:brand>${brand}</g:brand>
      <g:condition>${car.quilometragem === 0 ? 'new' : 'used'}</g:condition>
      <g:availability>in_stock</g:availability>
      <g:price>${price.toFixed(2)} BRL</g:price>${
        emPromocao ? `
      <g:sale_price>${Number(car.preco_promocional).toFixed(2)} BRL</g:sale_price>` : ''
      }
      <g:vehicle_type>car</g:vehicle_type>
      <g:year>${String(car.ano).split('/')[0] || car.ano}</g:year>
      <g:mileage>
        <g:value>${car.quilometragem}</g:value>
        <g:unit>km</g:unit>
      </g:mileage>
      <g:state_of_vehicle>used</g:state_of_vehicle>
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
