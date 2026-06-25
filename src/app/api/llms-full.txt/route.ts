import { NextResponse } from "next/server";
import { getEstoque, Veiculo, getVeiculoPdpUrl } from "../../../lib/supabase";
import { unstable_cache } from "next/cache";

// Format helper for BRL currency
function formatPrice(value: number): string {
  if (!value || value <= 0) return "Sob Consulta";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  });
}

// Generate stock dump in Markdown
const getCachedInventoryDump = unstable_cache(
  async (host: string): Promise<string> => {
    const vehicles = await getEstoque();
    const availableVehicles = vehicles.filter((v) => !v.vendido);

    let md = "# Estoque Motors Store - Catálogo Completo para Agentes de IA\n\n";
    md += "Este arquivo contém o inventário de veículos da Motors Store. Agentes de IA (crawlers e assistants) podem utilizar este dump de texto para varrer o estoque atualizado sem necessidade de múltiplas chamadas de busca dinâmicas.\n\n";
    md += `Última Atualização: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Horário de Brasília)\n`;
    md += `Total de Veículos em Estoque: ${availableVehicles.length}\n\n`;
    md += "## Inventário de Veículos\n\n";

    const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";

    availableVehicles.forEach((car) => {
      const pdpUrl = `${protocol}://${host}${getVeiculoPdpUrl(car)}`;
      const priceStr = car.preco_promocional > 0 && car.preco_promocional < car.preco_original
        ? `De: ${formatPrice(car.preco_original)} por ${formatPrice(car.preco_promocional)} (OFERTA ATIVA)`
        : formatPrice(car.preco_original);

      md += `### ${car.marca.toUpperCase()} ${car.modelo} ${car.versao} (${car.ano})\n`;
      md += `- **Preço**: ${priceStr}\n`;
      md += `- **Quilometragem**: ${car.quilometragem === 0 ? "Sem Uso (0 km)" : `${car.quilometragem.toLocaleString("pt-BR")} km`}\n`;
      md += `- **Câmbio**: ${car.cambio}\n`;
      md += `- **Combustível**: ${car.combustivel}\n`;
      md += `- **Cor**: ${car.cor}\n`;
      md += `- **Laudo Pericial / Inspeção**: ${car.pericia}\n`;
      if (car.opcionais) {
        md += `- **Opcionais Principais**: ${car.opcionais}\n`;
      }
      if (car.laudo_pericia || car.descricao) {
        md += `- **Detalhes & Procedência**: ${car.descricao || car.laudo_pericia}\n`;
      }
      md += `- **Link do Veículo para Detalhes e Compra**: ${pdpUrl}\n\n`;
      md += "---\n\n";
    });

    return md;
  },
  ["inventory-dump-text"],
  {
    tags: ["inventory"],
    revalidate: 3600 // Cache for 1 hour
  }
);

export async function GET(request: Request) {
  try {
    const host = request.headers.get("host") || "motors-site-oficial.vercel.app";
    const markdownDump = await getCachedInventoryDump(host);

    return new NextResponse(markdownDump, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600"
      }
    });
  } catch (error) {
    console.error("[llms-full.txt API] Failed to generate inventory dump:", error);
    return new NextResponse("Failed to load inventory dump", { status: 500 });
  }
}
