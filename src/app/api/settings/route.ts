import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache, revalidateTag } from "next/cache";
import { createServerSupabaseClient } from "../../../lib/supabase-server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const companyPath = path.join(process.cwd(), "src/lib/companySettings.json");
const aboutPath = path.join(process.cwd(), "src/lib/aboutSettings.json");

// Anti-prompt injection pattern list
const PROMPT_INJECTION_REGEX = /(ignore\s+all\s+(?:previous\s+)?instructions|system\s+prompt|you\s+are\s+a\s+bot|act\s+as\s+a|new\s+instruction|jailbreak\b)/i;

function hasPromptInjection(obj: any): boolean {
  if (typeof obj === "string") {
    return PROMPT_INJECTION_REGEX.test(obj);
  }
  if (typeof obj === "object" && obj !== null) {
    for (const key in obj) {
      if (hasPromptInjection(obj[key])) {
        return true;
      }
    }
  }
  return false;
}

import { getCachedSettings, recortePublicoDeSettings } from "../../../lib/settings";

/**
 * Settings do site. O corpo da resposta depende de haver sessão.
 *
 * Até 2026-08-06 este GET era aberto e devolvia TUDO a qualquer visitante
 * anônimo — verificado contra produção: `preco_compra` de veículo (o custo de
 * aquisição da loja) e as URLs internas do n8n saíam na resposta. `bankBalances`
 * e `apiSecretToken` vinham no envelope e estavam vazios só por acaso: no dia em
 * que fossem preenchidos pelo painel, nasceriam públicos.
 *
 * Visitante anônimo recebe o recorte público; sessão válida recebe o payload
 * completo, que é o que o painel admin consome. O POST já era autenticado.
 */
export async function GET() {
  const completo = await getCachedSettings();

  let autenticado = false;
  try {
    const client = await createServerSupabaseClient();
    const { data } = await client.auth.getUser();
    autenticado = !!data?.user;
  } catch (err: any) {
    // Sem sessão utilizável — segue como anônimo, que é o caminho seguro.
    console.warn("[Settings API] Checagem de sessão no GET falhou:", err?.message);
  }

  const corpo = autenticado ? completo : recortePublicoDeSettings(completo);

  return NextResponse.json(corpo, {
    headers: {
      // `private` importa: sem isso um proxy compartilhado poderia servir a
      // resposta autenticada de um admin para o próximo visitante anônimo.
      "Cache-Control": "private, no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    }
  });
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

    const body = await request.json();
    const {
      companySettings,
      aboutSettings,
      webhooks,
      popups,
      quickTags,
      stockOverrides,
      carouselVehicleIds,
      bankBalances
    } = body;

    const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

    if (isSupabaseConfigured) {
      let requestSupabase: any = null;
      let user = null;
      let authError = null;

      // 1. Try cookie-based session first
      try {
        const client = await createServerSupabaseClient();
        const { data } = await client.auth.getUser();
        if (data?.user) {
          user = data.user;
          requestSupabase = client;
        }
      } catch (err: any) {
        console.warn("[Settings API] Cookie-based auth check failed:", err.message);
      }

      // 2. Fallback to header-based Bearer token
      if (!user && token) {
        try {
          const client = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          });
          const { data, error } = await client.auth.getUser();
          if (data?.user) {
            user = data.user;
            requestSupabase = client;
          } else {
            authError = error;
          }
        } catch (err: any) {
          console.warn("[Settings API] Token-based auth check failed:", err.message);
        }
      }

      if (!user) {
        console.warn("[Settings API] Write blocked: unauthorized request", authError?.message);
        return NextResponse.json({ error: "Sessão inválida ou ausente. Faça login novamente." }, { status: 401 });
      }

      // 3. Write to Supabase using the authenticated client
      if (companySettings) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "company", data: companySettings, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for company:", error.message);
          return NextResponse.json({ error: `Falha ao salvar configurações corporativas: ${error.message}` }, { status: 500 });
        }
      }

      if (aboutSettings) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "about", data: aboutSettings, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for about:", error.message);
          return NextResponse.json({ error: `Falha ao salvar informações da empresa: ${error.message}` }, { status: 500 });
        }
      }

      if (webhooks) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "webhooks", data: webhooks, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for webhooks:", error.message);
          return NextResponse.json({ error: `Falha ao salvar webhooks: ${error.message}` }, { status: 500 });
        }
      }

      if (popups) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "popups", data: popups, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for popups:", error.message);
          return NextResponse.json({ error: `Falha ao salvar popups: ${error.message}` }, { status: 500 });
        }
      }

      if (quickTags) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "quick_tags", data: quickTags, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for quickTags:", error.message);
          return NextResponse.json({ error: `Falha ao salvar tags rápidas: ${error.message}` }, { status: 500 });
        }
      }

      if (stockOverrides) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "stock_overrides", data: stockOverrides, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for stockOverrides:", error.message);
          return NextResponse.json({ error: `Falha ao salvar customizações de estoque: ${error.message}` }, { status: 500 });
        }
      }

      if (carouselVehicleIds) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "carousel_vehicles", data: carouselVehicleIds, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for carouselVehicleIds:", error.message);
          return NextResponse.json({ error: `Falha ao salvar carrossel de veículos: ${error.message}` }, { status: 500 });
        }
      }

      if (bankBalances) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "bank_balances", data: bankBalances, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for bankBalances:", error.message);
          return NextResponse.json({ error: `Falha ao salvar saldos bancários: ${error.message}` }, { status: 500 });
        }
      }
    } else {
      console.info("[Settings API] Supabase credentials not set, writing to local config only (Dev Bypass).");
    }

    console.log("[Settings API] Settings saved to Supabase successfully. Invalidating cache...");
    
    // Invalidate the settings cache tag on Edge
    try {
      revalidateTag("site_settings", "max");
      revalidateTag("settings", "max");
    } catch (rErr) {
      console.warn("[Settings API] revalidateTag failed:", rErr);
    }

    // 4. Optional local JSON file backup write (errors here are non-critical)
    try {
      if (companySettings) {
        await fs.writeFile(companyPath, JSON.stringify(companySettings, null, 2), "utf-8");
      }
      if (aboutSettings) {
        await fs.writeFile(aboutPath, JSON.stringify(aboutSettings, null, 2), "utf-8");
      }
    } catch (fsErr) {
      console.warn("[Settings API] Local file backup write failed (non-critical):", fsErr);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Settings API] Failed to save settings:", error);
    return NextResponse.json({ error: "Falha interna ao processar salvamento." }, { status: 500 });
  }
}
