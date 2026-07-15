import { NextResponse } from 'next/server';
import { getEstoque, getVeiculoPdpUrl } from '../../../../lib/supabase';

// 3 hours caching for the XML feed (10800 seconds)
export const revalidate = 10800;

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

      const price = car.preco_promocional > 0 ? car.preco_promocional : car.preco_original;
      
      // Safe XML string escaping
      const title = `${car.marca} ${car.modelo} ${car.versao}`.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const description = (car.descricao_seo || `Aproveite as melhores condições para comprar seu ${car.marca} ${car.modelo}. Veículo periciado e com garantia.`).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
      <g:price>${price.toFixed(2)} BRL</g:price>
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
