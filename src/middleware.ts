import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

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
} else {
  console.info("[Middleware] Upstash Redis credentials not configured. Rate limiting is disabled (Bypass mode).");
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Apply rate limit only to lead capture POST endpoints
  if (request.method === "POST" && (path === "/api/leads" || path === "/api/avaliacao")) {
    if (ratelimit) {
      try {
        const ip = request.ip || request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
        const { success, limit, reset, remaining } = await ratelimit.limit(`ratelimit_${path}_${ip}`);
        
        if (!success) {
          console.warn(`[RateLimit] Request blocked for IP: ${ip} on path: ${path}`);
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
        // Fallback safely if Upstash query fails
        console.error("[RateLimit] Upstash Redis query failed. Bypassing check:", err);
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/leads", "/api/avaliacao"],
};
