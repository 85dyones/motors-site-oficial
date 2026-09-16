import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createServerClient } from "@supabase/ssr";
import { papelPadraoPorEmail } from "./lib/papelPadrao";
import { ehInvestidor, ehStaff, perfisDe } from "./lib/permissoes";

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
  // Área do investidor (2026-08-22): terceiro público, como a Garagem do
  // cliente. Fica aqui, e não numa checagem só na página, para que nem o
  // primeiro byte da tela saia para quem não é investidor.
  const isInvestidorPath = path === "/investidor" || path.startsWith("/investidor/");
  const isProtectedApi =
    // Gestão de investidores — o que restou do módulo financeiro aposentado
    // em 2026-08-28, já no endereço novo.
    path.startsWith("/api/investidores") ||
    path.startsWith("/api/users") ||
    // A agenda de pessoas (2026-08-24) devolve CPF, telefone e e-mail de
    // cliente. Ela entra aqui pelo mesmo motivo que os investidores: a RLS
    // já barra no banco, e esta é a segunda tranca, na porta.
    path.startsWith("/api/pessoas");

  if (isAdminPath || isInvestidorPath || isProtectedApi) {
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
      if (isAdminPath || isInvestidorPath) {
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

      // TODOS os papéis, não o primário (multi-papel, 2026-08-19). Até
      // 2026-08-21 as regras abaixo comparavam `role` — espelho de `papeis[1]`
      // — com um nome só: quem tinha `financeiro` como SEGUNDO papel levava
      // 403 em /api/financeiro e redirect em /admin/financeiro, o gêmeo (do
      // lado da aplicação) do bug que `20260821120000` corrigiu no banco.
      // Sem linha em `profiles`, vale o papel padrão por e-mail — a rede de
      // segurança dos fundadores.
      const perfis = perfisDe(profile ?? papelPadraoPorEmail(user.email));
      const investidor = ehInvestidor(profile);

      // A área do investidor tem porteiro próprio: quem não tem o papel não
      // entra, nem sendo admin. Ela mostra a posição de QUEM PERGUNTA (a RLS
      // filtra por `auth.uid()`), então para a equipe ela viria vazia — e
      // tela vazia se lê como "não há nada", que é pior que a porta fechada.
      // Quem cuida disso usa a gestão em /admin/investidores.
      if (isInvestidorPath) {
        if (!investidor) {
          const url = request.nextUrl.clone();
          url.pathname = perfis.length > 0 ? "/admin" : "/";
          return NextResponse.redirect(url);
        }
        return response;
      }

      // Papéis fora do painel — `cliente` (Garagem, 2026-08-13) e `investidor`
      // (2026-08-22) — nunca entram no painel: as regras abaixo pressupõem
      // staff, e sem este bloqueio eles herdariam os acessos de `comercial`.
      // `ehStaff` em vez de `perfis.length === 0`: dá o mesmo resultado, mas
      // diz o que a linha quer saber em vez de deixar a resposta implícita
      // num efeito colateral de `perfisDe`.
      if (!ehStaff(profile ?? papelPadraoPorEmail(user.email))) {
        if (isAdminPath) {
          const url = request.nextUrl.clone();
          // Investidor tem para onde ir; cliente e desconhecido, não.
          url.pathname = investidor ? "/investidor" : "/";
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

        // Gestão de investidores: Admin, Gestor e Financeiro — a linha
        // "Controlar aportes e retiradas de investidores" da A17. O módulo de
        // caixa que morava em /admin/financeiro foi aposentado em 2026-08-28
        // (decisão do dono; o financeiro renasce sobre o razão do handoff), e
        // esta é a única área dele que ficou, já no endereço novo.
        if (path.startsWith("/admin/investidores") || path.startsWith("/api/investidores")) {
          if (!perfis.includes("financeiro") && !perfis.includes("gestor")) {
            if (isAdminPath) {
              const url = request.nextUrl.clone();
              url.pathname = "/admin";
              return NextResponse.redirect(url);
            } else {
              return NextResponse.json({ error: "Acesso proibido" }, { status: 403 });
            }
          }
        }

        // Agenda de pessoas (2026-08-24): Admin, Gestor, Comercial e
        // Financeiro. Marketing fica de fora com apoio na matriz A17 — a
        // linha "Ver e mover leads no kanban" já lhe nega o contato
        // individual ("Marketing vê só o volume agregado"), e a agenda é uma
        // lista de CPF, telefone e e-mail. Dar aqui o que o kanban nega seria
        // furar a própria régua por uma porta lateral.
        if (path.startsWith("/admin/clientes") || path.startsWith("/api/pessoas")) {
          if (
            !perfis.includes("gestor") &&
            !perfis.includes("comercial") &&
            !perfis.includes("financeiro")
          ) {
            if (isAdminPath) {
              const url = request.nextUrl.clone();
              url.pathname = "/admin";
              return NextResponse.redirect(url);
            } else {
              return NextResponse.json({ error: "Acesso proibido" }, { status: 403 });
            }
          }
        }

        // Configurações: Admin, Comercial e Marketing. Financeiro e Gestor
        // não entram — nenhuma linha da A17 lhes dá conteúdo de site nem
        // credencial. A régua é a matriz, e não "quem é SÓ financeiro":
        // alguém financeiro+gestor não é financeiro puro e também não tem o
        // que fazer aqui.
        if (
          path.startsWith("/admin/configuracoes") &&
          !perfis.includes("comercial") &&
          !perfis.includes("marketing")
        ) {
          const url = request.nextUrl.clone();
          // Visão geral: era /admin/financeiro até a aposentadoria do módulo
          // de caixa (2026-08-28) — a única tela que todo perfil enxerga.
          url.pathname = "/admin";
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
    "/api/investidores/:path*",
    "/api/users/:path*",
    // As duas formas: `:path*` casa zero segmentos, mas depender disso
    // para a raiz da coleção é apostar num detalhe do matcher. A rota
    // que devolve a lista inteira é justamente a que não pode escapar.
    "/api/pessoas",
    "/api/pessoas/:path*",
    "/garagem/:path*",
    "/garagem",
    "/api/garagem/:path*",
    "/investidor",
    "/investidor/:path*",
  ],
};
