import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { consultarFipeNoServidor } from "../../../../lib/fipeNoServidor";
import { ipDoVisitante } from "../../../../lib/turnstile";

/**
 * A porta da loja para a tabela FIPE — `GET /api/fipe/carros/marcas/21/modelos`.
 *
 * Mesma árvore de caminhos da API pública v1, para `consultaFipe.ts` trocar só
 * a porta. O miolo (validação do caminho, v2 com token, tradução para o
 * formato v1) está em `lib/fipeNoServidor.ts`; aqui ficam a rede, o limite de
 * taxa e o cache.
 *
 * ---------------------------------------------------------------------------
 * Cache na borda, só da resposta boa
 * ---------------------------------------------------------------------------
 * `s-maxage` de 12 horas: a FIPE publica a tabela uma vez por mês, e cada
 * caminho sai da FIPE uma vez por janela em vez de uma vez por visitante —
 * é isso que mantém a loja longe do teto diário. Erro sai com `no-store`: um
 * 502 guardado na borda deixaria a cascata sem a porta da loja por 12 horas.
 *
 * ---------------------------------------------------------------------------
 * Limite de taxa, e o que acontece quando ele corta
 * ---------------------------------------------------------------------------
 * A rota é pública e gasta o teto diário do token. Sem limite, qualquer um
 * esgotaria esse teto em minutos pedindo caminhos diferentes (o cache só
 * segura o mesmo caminho). Dois tetos, no padrão de `/api/erros`: por IP, que
 * cobre a cascata de uma pessoa com folga, e global, abaixo do teto diário da
 * FIPE. Cortado, responde 429 — e `consultaFipe` cai na API pública direto do
 * navegador. O cliente não fica sem FIPE por causa do limite da loja.
 *
 * O limite mora aqui, e não em `src/proxy.ts`, pelo mesmo motivo da
 * `/api/erros`: o matcher do proxy cobre o caminho de conversão.
 */

export const dynamic = "force-dynamic";

let porIp: Ratelimit | null = null;
let porTodos: Ratelimit | null = null;

function limitadores(comToken: boolean) {
  if (porIp && porTodos) return { porIp, porTodos };

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return { porIp: null, porTodos: null };

  try {
    const redis = new Redis({ url, token });
    // Uma cascata completa são quatro consultas; quem troca de marca e de
    // modelo algumas vezes chega a vinte. 60 em 10 minutos é folga, não teto.
    porIp = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "10 m"),
      prefix: "@upstash/ratelimit/fipe",
    });
    // Abaixo do teto diário da FIPE (1.000 com token, 500 sem), deixando
    // margem para o que a borda já serviu sem passar por aqui.
    porTodos = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(comToken ? 900 : 450, "24 h"),
      prefix: "@upstash/ratelimit/fipe-global",
    });
    return { porIp, porTodos };
  } catch {
    // Redis fora é bypass, como em `src/proxy.ts` e em `/api/erros`.
    return { porIp: null, porTodos: null };
  }
}

const SEM_CACHE = { "Cache-Control": "no-store" };

export async function GET(
  request: Request,
  { params }: { params: Promise<{ caminho: string[] }> },
) {
  const { caminho } = await params;
  const token = process.env.FIPE_API_TOKEN?.trim() || undefined;

  const { porIp: limiteIp, porTodos: limiteGlobal } = limitadores(Boolean(token));
  if (limiteIp && limiteGlobal) {
    try {
      const ip = ipDoVisitante(request as { headers: Headers }) ?? "sem-ip";
      const [umIp, todos] = await Promise.all([
        limiteIp.limit(ip),
        limiteGlobal.limit("fipe:global"),
      ]);
      if (!umIp.success || !todos.success) {
        return NextResponse.json({ error: "Limite de consultas da loja." }, { status: 429, headers: SEM_CACHE });
      }
    } catch (erro) {
      console.error("[FIPE] Upstash falhou; seguindo sem limite:", (erro as Error)?.message);
    }
  }

  const resposta = await consultarFipeNoServidor(caminho ?? [], {
    token,
    buscar: (url, init) => fetch(url, { ...init, cache: "no-store" }),
  });

  return NextResponse.json(resposta.corpo, {
    status: resposta.status,
    headers: resposta.guardar
      ? { "Cache-Control": "public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400" }
      : SEM_CACHE,
  });
}
