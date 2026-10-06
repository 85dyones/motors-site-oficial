import { NextRequest, NextResponse } from "next/server";
import { passoDoFunil } from "../../../../lib/funilDoProfiler";
import { createAdminSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * `POST /api/profiler/passo` — soma 1 ao passo do funil do Garagem Profiler no
 * dia de hoje (`profiler_funil_diario`, migração 20261006120000).
 *
 * O corpo é `{ passo }` e mais nada: a rota não lê nem grava identificador,
 * IP ou horário — o banco guarda só (dia, passo) → contagem. Quem soma é a
 * função `profiler_contar_passo`, que só a chave de serviço executa: o
 * navegador nunca escreve na tabela.
 *
 * Responde 204 em tudo o que não é erro do pedido: contagem que falha no
 * banco é um aviso no log, não um erro para quem está escolhendo carro. O
 * proxy limita por IP (`src/proxy.ts`, como a /api/capi) — o IP fica só na
 * chave efêmera do limitador.
 */
export async function POST(request: NextRequest) {
  // Pedido de outra origem não conta: o quiz só chama daqui. Não barra quem
  // forja o cabeçalho, mas tira do caminho qualquer página que aponte para cá.
  const origem = request.headers.get("origin");
  if (origem) {
    try {
      if (new URL(origem).host !== request.nextUrl.host) return new NextResponse(null, { status: 403 });
    } catch {
      return new NextResponse(null, { status: 403 });
    }
  }

  // `sendBeacon` manda o corpo como Blob; o texto cobre os dois jeitos.
  const texto = await request.text().catch(() => "");
  if (texto.length > 200) return new NextResponse(null, { status: 413 });
  let passo = null;
  try {
    passo = passoDoFunil((JSON.parse(texto) as { passo?: unknown } | null)?.passo);
  } catch {
    passo = null;
  }
  if (!passo) return new NextResponse(null, { status: 400 });

  try {
    const { error } = await createAdminSupabaseClient().rpc("profiler_contar_passo", { p_passo: passo });
    if (error) console.warn("[Funil do Profiler] profiler_contar_passo falhou:", error.message);
  } catch (erro) {
    console.warn("[Funil do Profiler] Sem como contar o passo:", (erro as Error)?.message);
  }
  return new NextResponse(null, { status: 204 });
}
