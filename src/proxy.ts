import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createServerClient } from "@supabase/ssr";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

let ratelimit: Ratelimit | null = null;

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
        .select("role")
        .eq("id", user.id)
        .single();

      const role = profile?.role ?? (
        (user.email === "motors@motorsstoreoficial.com.br" || user.email?.toLowerCase() === "dyones@gmail.com") 
          ? "admin" 
          : "comercial"
      );

      // Admins access everything. Check specific constraints:
      if (role !== "admin") {
        // Users page and APIs restricted to Admin only
        if (path.startsWith("/admin/usuarios") || path.startsWith("/api/users")) {
          if (isAdminPath) {
            const url = request.nextUrl.clone();
            url.pathname = "/admin/configuracoes";
            return NextResponse.redirect(url);
          } else {
            return NextResponse.json({ error: "Acesso proibido" }, { status: 403 });
          }
        }

        // Financeiro area restricted to Admin + Financeiro
        if (path.startsWith("/admin/financeiro") || path.startsWith("/api/financeiro")) {
          if (role !== "financeiro") {
            if (isAdminPath) {
              const url = request.nextUrl.clone();
              url.pathname = "/admin/configuracoes";
              return NextResponse.redirect(url);
            } else {
              return NextResponse.json({ error: "Acesso proibido" }, { status: 403 });
            }
          }
        }

        // Config page restricted to Admin + Comercial (Financeiro cannot access it)
        if (path.startsWith("/admin/configuracoes") && role === "financeiro") {
          const url = request.nextUrl.clone();
          url.pathname = "/admin/financeiro";
          return NextResponse.redirect(url);
        }
      }
    } catch (err) {
      console.error("[Middleware] Role verification failed:", err);
    }

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/leads",
    "/api/avaliacao",
    "/admin/:path*",
    "/api/financeiro/:path*",
    "/api/users/:path*",
  ],
};
