import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache, revalidateTag } from "next/cache";

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

// 1. Get cached settings using Next.js unstable_cache
const getCachedSettings = unstable_cache(
  async () => {
    let companySettings = null;
    let aboutSettings = null;
    let webhooks = null;
    let popups = null;
    let quickTags = null;
    let stockOverrides = null;
    let carouselVehicleIds = null;
    let fetchedFromSupabase = false;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        const client = createClient(supabaseUrl, supabaseAnonKey);
        const { data, error } = await client
          .from("site_settings")
          .select("*");

        if (!error && data && data.length > 0) {
          const companyRow = data.find((row) => row.id === "company");
          const aboutRow = data.find((row) => row.id === "about");
          const webhooksRow = data.find((row) => row.id === "webhooks");
          const popupsRow = data.find((row) => row.id === "popups");
          const quickTagsRow = data.find((row) => row.id === "quick_tags");
          const stockOverridesRow = data.find((row) => row.id === "stock_overrides");
          const carouselRow = data.find((row) => row.id === "carousel_vehicles");

          if (companyRow) companySettings = companyRow.data;
          if (aboutRow) aboutSettings = aboutRow.data;
          if (webhooksRow) webhooks = webhooksRow.data;
          if (popupsRow) popups = popupsRow.data;
          if (quickTagsRow) quickTags = quickTagsRow.data;
          if (stockOverridesRow) stockOverrides = stockOverridesRow.data;
          if (carouselRow) carouselVehicleIds = carouselRow.data;
          fetchedFromSupabase = true;
          console.log("[Settings API] Loaded settings from Supabase (Cached)");
        }
      } catch (err) {
        console.warn("[Settings API] Failed to connect to Supabase inside cache:", err);
      }
    }

    if (!fetchedFromSupabase) {
      try {
        const companyRaw = await fs.readFile(companyPath, "utf-8");
        const aboutRaw = await fs.readFile(aboutPath, "utf-8");
        companySettings = JSON.parse(companyRaw);
        aboutSettings = JSON.parse(aboutRaw);
        console.log("[Settings API] Loaded settings from local JSON fallback files (Cached)");
      } catch (error) {
        console.error("[Settings API] Failed to read fallback local settings files:", error);
      }
    }

    return {
      companySettings,
      aboutSettings,
      webhooks,
      popups,
      quickTags,
      stockOverrides,
      carouselVehicleIds
    };
  },
  ["site-settings"],
  { tags: ["settings"] }
);

export async function GET() {
  const data = await getCachedSettings();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  try {
    const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

    if (isSupabaseConfigured) {
      if (!token) {
        console.warn("[Settings API] Write blocked: missing authorization token");
        return NextResponse.json({ error: "Sessão inválida ou ausente. Faça login novamente." }, { status: 401 });
      }

      const requestSupabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      });

      // Check user authentication status on backend
      const { data: { user }, error: authError } = await requestSupabase.auth.getUser();
      if (authError || !user) {
        console.warn("[Settings API] Write blocked: invalid user token", authError?.message);
        return NextResponse.json({ error: "Sessão expirada ou não autorizada. Faça login novamente." }, { status: 401 });
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
    } else {
      console.info("[Settings API] Supabase credentials not set, writing to local config only (Dev Bypass).");
    }

    console.log("[Settings API] Settings saved to Supabase successfully. Invalidating cache...");
    
    // Invalidate the settings cache tag on Edge
    revalidateTag("settings");

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
