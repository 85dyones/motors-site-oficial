import { NextResponse } from "next/server";
import { getEstoque, Veiculo, getVeiculoPdpUrl } from "../../../lib/supabase";
import { unstable_cache } from "next/cache";
import { SITE_HOST } from "../../../lib/site";
import { nomeComAno } from "../../../lib/nomeDoVeiculo";

// Format helper for BRL currency
function formatPrice(value: number): string {
  if (!value || value <= 0) return "Sob Consulta";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  });
}

/**
 * O inventário em Markdown. **Pura de propósito**, como o `montarFichas` do
 * `/api/ney`: a rota depende do Supabase e não roda no teste, a montagem sim.
 *
 * `veiculos` chega como `getEstoque()` devolve — já passado por
 * `mapVeiculoDbToVeiculo`, que é onde `modelo_override` e `versao_override`
 * vencem o feed. Esta função não precisa saber que o override existe.
 *
 * ---------------------------------------------------------------------------
 * O título de cada carro é `nomeComAno`
 * ---------------------------------------------------------------------------
 * Ele era montado cru, `marca modelo versão (ano)`, e o RevendaMais embute a
 * versão dentro do modelo. Medido em produção em 2026-09-17:
 *
 *   ### BMW X4 M40i 3.0 M Sport Edit V6 Turbo Aut m40i 3.0 m sport edit v6 turbo aut (2020)
 *   ### NISSAN March 1.6 Rio 2016 1.6 rio 2016 (2016)
 *
 * O ano saiu dos parênteses e a marca saiu da caixa alta porque o título
 * passou a ser o MESMO texto do `Car.name` no JSON-LD da ficha: quem cruza este
 * arquivo com a página acha o carro pelo nome exato. E a regra do nome segue
 * num lugar só — o que `lib/nomeDoVeiculo.ts` decidir sobre versão e ano vale
 * aqui sem ninguém voltar a este arquivo.
 */
export function montarInventario(veiculos: Veiculo[], origem: string, atualizadoEm: string): string {
  const availableVehicles = veiculos.filter((v) => !v.vendido);

  let md = "# Estoque Motors Store - Catálogo Completo para Agentes de IA\n\n";
  md += "Este arquivo contém o inventário de veículos da Motors Store. Agentes de IA (crawlers e assistants) podem utilizar este dump de texto para varrer o estoque atualizado sem necessidade de múltiplas chamadas de busca dinâmicas.\n\n";
  md += `Última Atualização: ${atualizadoEm} (Horário de Brasília)\n`;
  md += `Total de Veículos em Estoque: ${availableVehicles.length}\n\n`;
  md += "## Inventário de Veículos\n\n";

  availableVehicles.forEach((car) => {
    const pdpUrl = `${origem}${getVeiculoPdpUrl(car)}`;
    const priceStr = car.preco_promocional > 0 && car.preco_promocional < car.preco_original
      ? `De: ${formatPrice(car.preco_original)} por ${formatPrice(car.preco_promocional)} (OFERTA ATIVA)`
      : formatPrice(car.preco_original);

    md += `### ${nomeComAno(car)}\n`;
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
}

// Generate stock dump in Markdown
const getCachedInventoryDump = unstable_cache(
  async (host: string): Promise<string> => {
    const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";

    return montarInventario(
      await getEstoque(),
      `${protocol}://${host}`,
      new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    );
  },
  ["inventory-dump-text"],
  {
    tags: ["inventory"],
    revalidate: 3600 // Cache for 1 hour
  }
);

export async function GET(request: Request) {
  try {
    const host = request.headers.get("host") || SITE_HOST;
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
