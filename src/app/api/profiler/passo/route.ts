import { NextRequest, NextResponse } from "next/server";
import { passoDoFunil } from "../../../../lib/funilDoProfiler";
import { SITE_URL } from "../../../../lib/site";
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
 * proxy limita por IP (`src/proxy.ts`), sem analytics no limitador: o IP só
 * existe na janela deslizante, que expira sozinha.
 *
 * Só a produção conta. Um preview da Vercel com a chave de serviço somaria
 * cada rodada de revisão na tabela de produção — e, com o tráfego de hoje,
 * poucas rodadas já distorcem o funil (revisão de 06/10). Mesmo critério da
 * `/api/indexnow`. Fora da Vercel (`VERCEL_ENV` ausente), o dev local também
 * não tem a chave de serviço e só registra o aviso.
 */
export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return new NextResponse(null, { status: 204 });
  }

  // Pedido de outra origem não conta: o quiz só chama daqui. Não barra quem
  // forja o cabeçalho, mas tira do caminho qualquer página que aponte para cá.
  // Vale o host do pedido OU o do site (`SITE_URL`): se os dois divergirem
  // atrás de um proxy, o contador não fica em zero calado.
  const origem = request.headers.get("origin");
  if (origem) {
    let host: string;
    try {
      host = new URL(origem).host;
    } catch {
      return new NextResponse(null, { status: 403 });
    }
    const nossos = new Set([request.nextUrl.host]);
    try {
      nossos.add(new URL(SITE_URL).host);
    } catch {
      // SITE_URL torto: vale só o host do pedido.
    }
    if (!nossos.has(host)) return new NextResponse(null, { status: 403 });
  }

  // O tamanho declarado é conferido antes de ler: corpo grande não é lido
  // inteiro só para ser recusado depois.
  if (Number(request.headers.get("content-length") ?? 0) > 200) {
    return new NextResponse(null, { status: 413 });
  }
  // `sendBeacon` manda o corpo como Blob ou texto; o texto cobre os dois jeitos.
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
