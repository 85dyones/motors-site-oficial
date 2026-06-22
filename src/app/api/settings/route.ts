import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { supabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

const companyPath = path.join(process.cwd(), "src/lib/companySettings.json");
const aboutPath = path.join(process.cwd(), "src/lib/aboutSettings.json");

export async function GET() {
  let companySettings = null;
  let aboutSettings = null;
  let webhooks = null;
  let popups = null;
  let quickTags = null;
  let stockOverrides = null;
  let carouselVehicleIds = null;
  let fetchedFromSupabase = false;

  // 1. Try to read from Supabase 'site_settings'
  if (supabase) {
    try {
      const { data, error } = await supabase
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
        console.log("[Settings API] Loaded settings from Supabase successfully");
      } else if (error) {
        console.warn("[Settings API] Supabase read error (table might not exist yet):", error.message);
      }
    } catch (err) {
      console.warn("[Settings API] Failed to connect to Supabase:", err);
    }
  }

  // 2. Fallback to local files if Supabase is offline or table doesn't exist
  if (!fetchedFromSupabase) {
    try {
      const companyRaw = await fs.readFile(companyPath, "utf-8");
      const aboutRaw = await fs.readFile(aboutPath, "utf-8");
      companySettings = JSON.parse(companyRaw);
      aboutSettings = JSON.parse(aboutRaw);
      console.log("[Settings API] Loaded settings from local JSON fallback files");
    } catch (error) {
      console.error("[Settings API] Failed to read fallback local settings files:", error);
      return NextResponse.json({ error: "Failed to read settings" }, { status: 500 });
    }
  }

  return NextResponse.json(
    {
      companySettings,
      aboutSettings,
      webhooks,
      popups,
      quickTags,
      stockOverrides,
      carouselVehicleIds
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    }
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { companySettings, aboutSettings, webhooks, popups, quickTags, stockOverrides, carouselVehicleIds } = body;

    // 1. Write to Supabase (single source of truth — errors are NOT swallowed)
    if (!supabase) {
      console.error("[Settings API] Supabase client is not configured");
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    if (companySettings) {
      const { error } = await supabase
        .from("site_settings")
        .upsert({ id: "company", data: companySettings, updated_at: new Date().toISOString() });
      if (error) {
        console.error("[Settings API] Supabase write error for company:", error.message);
        return NextResponse.json({ error: `Failed to save company settings: ${error.message}` }, { status: 500 });
      }
    }

    if (aboutSettings) {
      const { error } = await supabase
        .from("site_settings")
        .upsert({ id: "about", data: aboutSettings, updated_at: new Date().toISOString() });
      if (error) {
        console.error("[Settings API] Supabase write error for about:", error.message);
        return NextResponse.json({ error: `Failed to save about settings: ${error.message}` }, { status: 500 });
      }
    }

    if (webhooks) {
      const { error } = await supabase
        .from("site_settings")
        .upsert({ id: "webhooks", data: webhooks, updated_at: new Date().toISOString() });
      if (error) {
        console.error("[Settings API] Supabase write error for webhooks:", error.message);
        return NextResponse.json({ error: `Failed to save webhooks: ${error.message}` }, { status: 500 });
      }
    }

    if (popups) {
      const { error } = await supabase
        .from("site_settings")
        .upsert({ id: "popups", data: popups, updated_at: new Date().toISOString() });
      if (error) {
        console.error("[Settings API] Supabase write error for popups:", error.message);
        return NextResponse.json({ error: `Failed to save popups: ${error.message}` }, { status: 500 });
      }
    }

    if (quickTags) {
      const { error } = await supabase
        .from("site_settings")
        .upsert({ id: "quick_tags", data: quickTags, updated_at: new Date().toISOString() });
      if (error) {
        console.error("[Settings API] Supabase write error for quickTags:", error.message);
        return NextResponse.json({ error: `Failed to save quickTags: ${error.message}` }, { status: 500 });
      }
    }

    if (stockOverrides) {
      const { error } = await supabase
        .from("site_settings")
        .upsert({ id: "stock_overrides", data: stockOverrides, updated_at: new Date().toISOString() });
      if (error) {
        console.error("[Settings API] Supabase write error for stockOverrides:", error.message);
        return NextResponse.json({ error: `Failed to save stockOverrides: ${error.message}` }, { status: 500 });
      }
    }

    if (carouselVehicleIds) {
      const { error } = await supabase
        .from("site_settings")
        .upsert({ id: "carousel_vehicles", data: carouselVehicleIds, updated_at: new Date().toISOString() });
      if (error) {
        console.error("[Settings API] Supabase write error for carouselVehicleIds:", error.message);
        return NextResponse.json({ error: `Failed to save carousel vehicles: ${error.message}` }, { status: 500 });
      }
    }

    console.log("[Settings API] Settings saved to Supabase successfully");

    // 2. Optional: also write to local JSON files as dev backup (errors here are non-critical)
    try {
      if (companySettings) {
        await fs.writeFile(companyPath, JSON.stringify(companySettings, null, 2), "utf-8");
      }
      if (aboutSettings) {
        await fs.writeFile(aboutPath, JSON.stringify(aboutSettings, null, 2), "utf-8");
      }
    } catch (fsErr) {
      // Non-critical — Supabase is the source of truth
      console.warn("[Settings API] Local file backup write failed (non-critical):", fsErr);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Settings API] Failed to save settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
