import { NextResponse } from "next/server";
import { getEstoque } from "../../../lib/supabase";
import { unstable_cache } from "next/cache";
import { SITE_HOST } from "../../../lib/site";
import { disponiveisDe } from "../../../lib/regrasEstoque";
import { montarInventario } from "../../../lib/inventarioDoLlmsFull";

// Generate stock dump in Markdown
const getCachedInventoryDump = unstable_cache(
  async (host: string): Promise<string> => {
    const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";

    // O que está à venda sai de `disponiveisDe`, e não de um filtro desta rota.
    // Medido em 2026-09-17: este arquivo e o `/api/ney` listavam os mesmos 45
    // carros, com a regra escrita duas vezes. Uma mudança feita só num lugar
    // faria o arquivo que publica preço e link de compra listar carro que a
    // vitrine já não mostra. `recortesDoEstoque` daria o mesmo recorte, mas
    // lendo também o histórico, que este arquivo não usa.
    return montarInventario(
      disponiveisDe(await getEstoque()),
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
