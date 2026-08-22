import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createServerClient } from "@supabase/ssr";
import { papelPadraoPorEmail } from "./lib/papelPadrao";
import { perfisDe } from "./lib/permissoes";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

let ratelimit: Ratelimit | null = null;
let capiRatelimit: Ratelimit | null = null;
let motorRatelimit: Ratelimit | null = null;

if (redisUrl && redisToken) {
  try {
    const redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });

    ratelimit = new Ratelimit({
      redis: redis,
      limiter: Ratelimit.slidingWindow(5, "1 h"), // 5 requests per 1 hour
      analytics: true,
      prefix: "@upstash/ratelimit",
    });

    // /api/capi é chamado a cada PDP visitada (ViewContent), não a cada
    // envio de formulário — precisa de uma janela bem mais generosa que
    // o limite de leads, só para conter flood/abuso do endpoint público.
    capiRatelimit = new Ratelimit({
      redis: redis,
      limiter: Ratelimit.slidingWindow(60, "1 h"), // 60 requests per 1 hour
      analytics: true,
      prefix: "@upstash/ratelimit/capi",
    });

    // /api/ciclo/motor/* é autenticado por token, mas sem isto era possível
    // martelar o Bearer sem limite (achado #9). A janela precisa caber o
    // legítimo: o orquestrador roda 1x ao dia e registra um desfecho por
    // mensagem, então um lote grande é uma rajada de dezenas de POSTs em
    // minutos — 240/h dá folga para isso e ainda inviabiliza força bruta.
    motorRatelimit = new Ratelimit({
      redis: redis,
      limiter: Ratelimit.slidingWindow(240, "1 h"),
      analytics: true,
      prefix: "@upstash/ratelimit/motor",
    });
    console.log("[Middleware] Rate limiting active with Upstash Redis");
  } catch (e) {
    console.error("[Middleware] Failed to initialize Upstash Redis:", e);
  }
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 1. Apply rate limit to lead capture endpoints
  if (request.method === "POST" && (path === "/api/leads" || path === "/api/avaliacao")) {
    if (ratelimit) {
      try {
        const ip = (request as any).ip || request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
        const { success, limit, reset, remaining } = await ratelimit.limit(`ratelimit_${path}_${ip}`);

        if (!success) {
          return NextResponse.json(
            { error: "Muitas requisições enviadas a partir deste IP. Limite de 5 envios por hora excedido." },
            {
              status: 429,
              headers: {
                "X-RateLimit-Limit": limit.toString(),
                "X-RateLimit-Remaining": remaining.toString(),
                "X-RateLimit-Reset": reset.toString(),
              }
            }
          );
        }
      } catch (err) {
        console.error("[RateLimit] Upstash Redis query failed. Bypassing check:", err);
      }
    }
  }

  // 1.5. Apply a looser rate limit to the public CAPI mirror endpoint
  if (request.method === "POST" && path === "/api/capi") {
    if (capiRatelimit) {
      try {
        const ip = (request as any).ip || request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
        const { success } = await capiRatelimit.limit(`ratelimit_${path}_${ip}`);

        if (!success) {
          // 204 silencioso: não vazar que o rate limit foi atingido para um endpoint público.
          return new NextResponse(null, { status: 204 });
        }
      } catch (err) {
        console.error("[RateLimit] Upstash Redis query failed for /api/capi. Bypassing check:", err);
      }
    }
  }

  // 1.6. Motor do Ciclo: autenticação é por token na própria rota (o n8n não
  // tem cookie de sessão) — aqui só o rate limit, e o retorno é explícito
  // para nunca cair nos gates de sessão abaixo. 429 barulhento de propósito:
  // o modo de falha conhecido do orquestrador é terminar verde sem enviar
  // nada, então erro silencioso aqui viraria exatamente isso.
  if (path.startsWith("/api/ciclo/motor")) {
    if (motorRatelimit) {
      try {
        const ip = (request as any).ip || request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
        const { success, limit, reset, remaining } = await motorRatelimit.limit(`ratelimit_motor_${ip}`);

        if (!success) {
          return NextResponse.json(
            { error: "Muitas requisições ao motor a partir deste IP. Limite de 240 por hora excedido." },
            {
              status: 429,
              headers: {
                "X-RateLimit-Limit": limit.toString(),
                "X-RateLimit-Remaining": remaining.toString(),
                "X-RateLimit-Reset": reset.toString(),
              },
            },
          );
        }
      } catch (err) {
        console.error("[RateLimit] Upstash Redis query failed for /api/ciclo/motor. Bypassing check:", err);
      }
    }
    return NextResponse.next();
  }

  // 1.7. Garagem do cliente: só renovação de sessão, sem gate de papel.
  //
  // A página decide o que mostrar (deslogado vê a entrada, staff é mandado ao
  // painel) — o middleware NÃO redireciona. Mas ele precisa passar por aqui:
  // Server Component não consegue gravar cookie, então sem esta parada o
  // refresh do token renovaria a cada request sem persistir e, com a rotação
  // de refresh token do Supabase, a sessão do cliente morreria em ~1 hora.
  if (path.startsWith("/garagem") || path.startsWith("/api/garagem")) {
    let response = NextResponse.next({ request: { headers: request.headers } });
    const supabaseClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );
    await supabaseClient.auth.getUser();
    return response;
  }

  // 2. Auth protection for admin panel and protected API routes
  const isAdminPath = path.startsWith("/admin");
  const isProtectedApi = path.startsWith("/api/financeiro") || path.startsWith("/api/users");

  if (isAdminPath || isProtectedApi) {
    let response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabaseClient = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    const { data: { user } } = await supabaseClient.auth.getUser();

    // Check authentication
    if (!user) {
      if (isAdminPath) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return NextResponse.redirect(url);
      } else {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
      }
    }

    // Check authorization roles
    try {
      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("role, papeis")
        .eq("id", user.id)
        .single();

      // Todos os papéis, não só o primário (multi-papel, 2026-08-19): quem
      // vende E cuida do financeiro precisa das duas áreas, e o primário
      // sozinho negava a segunda. Sem linha em `profiles`, vale o papel
      // padrão por e-mail (rede de segurança dos fundadores).
      const perfis = perfisDe(profile ?? papelPadraoPorEmail(user.email));

      // Papel `cliente` (Garagem Motors, 2026-08-13) nunca entra no painel:
      // `perfisDe` o descarta, então lista vazia é "não é da equipe" — sem
      // este bloqueio, cliente herdaria os acessos de `comercial`.
      if (perfis.length === 0) {
        if (isAdminPath) {
          const url = request.nextUrl.clone();
          url.pathname = "/";
          return NextResponse.redirect(url);
        }
        return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
      }

      // Admins access everything. Check specific constraints:
      if (!perfis.includes("admin")) {
        // Users page and APIs restricted to Admin only
        if (path.startsWith("/admin/usuarios") || path.startsWith("/api/users")) {
          if (isAdminPath) {
            const url = request.nextUrl.clone();
            // Visão geral, e não Configurações: é a única tela que todo
            // perfil enxerga. Mandar para Configurações fazia o Financeiro
            // quicar duas vezes, porque a regra abaixo o expulsa de lá.
            url.pathname = "/admin";
            return NextResponse.redirect(url);
          } else {
            return NextResponse.json({ error: "Acesso proibido" }, { status: 403 });
          }
        }

        // Financeiro area restricted to Admin + Financeiro
        if (path.startsWith("/admin/financeiro") || path.startsWith("/api/financeiro")) {
          if (!perfis.includes("financeiro")) {
            if (isAdminPath) {
              const url = request.nextUrl.clone();
              url.pathname = "/admin";
              return NextResponse.redirect(url);
            } else {
              return NextResponse.json({ error: "Acesso proibido" }, { status: 403 });
            }
          }
        }

        // Config page restricted to Admin + Comercial/Marketing — quem é SÓ
        // financeiro é mandado para a área dele.
        if (path.startsWith("/admin/configuracoes") && perfis.every((p) => p === "financeiro")) {
          const url = request.nextUrl.clone();
          url.pathname = "/admin/financeiro";
          return NextResponse.redirect(url);
        }
      }
    } catch (err) {
      console.error("[Middleware] Role verification failed:", err);
      if (isAdminPath) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return NextResponse.redirect(url);
      } else {
        return NextResponse.json({ error: "Erro na verificação de autorização" }, { status: 403 });
      }
    }

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/leads",
    "/api/avaliacao",
    "/api/capi",
    "/api/ciclo/motor/:path*",
    "/admin/:path*",
    "/api/financeiro/:path*",
    "/api/users/:path*",
    "/garagem/:path*",
    "/garagem",
    "/api/garagem/:path*",
  ],
};
