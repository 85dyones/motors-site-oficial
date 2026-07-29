import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const companyPath = path.join(process.cwd(), "src/lib/companySettings.json");
const aboutPath = path.join(process.cwd(), "src/lib/aboutSettings.json");

// Get cached settings using Next.js unstable_cache
export const getCachedSettings = unstable_cache(
  async () => {
    let companySettings = null;
    let aboutSettings = null;
    let webhooks = null;
    let popups = null;
    let quickTags = null;
    let stockOverrides = null;
    let carouselVehicleIds = null;
    let bankBalances = null;
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
          const bankBalancesRow = data.find((row) => row.id === "bank_balances");

          if (companyRow) companySettings = companyRow.data;
          if (aboutRow) aboutSettings = aboutRow.data;
          if (webhooksRow) webhooks = webhooksRow.data;
          if (popupsRow) popups = popupsRow.data;
          if (quickTagsRow) quickTags = quickTagsRow.data;
          if (stockOverridesRow) stockOverrides = stockOverridesRow.data;
          if (carouselRow) carouselVehicleIds = carouselRow.data;
          if (bankBalancesRow) bankBalances = bankBalancesRow.data;
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
      carouselVehicleIds,
      bankBalances
    };
  },
  ["site-settings"],
  { revalidate: 10, tags: ["site_settings", "settings"] }
);
