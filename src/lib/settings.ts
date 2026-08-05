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
  // 3600s, não 10s. O POST de /api/settings já chama `revalidateTag` ao salvar,
  // então a revalidação por tempo é só rede de segurança — com 10s ela era
  // herdada por TODA rota que lê settings (layout incluso), rebaixando o ISR do
  // site inteiro para 10s e regenerando PDPs que declaram `revalidate = 3600`.
  { revalidate: 3600, tags: ["site_settings", "settings"] }
);

/**
 * Campos de `stock_overrides` que o site público pode receber.
 *
 * O painel admin grava dentro do MESMO blob de overrides tanto ajustes visuais
 * (tag, carroceria, perfil) quanto `preco_compra` — o custo de aquisição do
 * veículo, com que o dono calcula a margem real. Como `applyLocalOverrides`
 * (src/lib/supabase.ts) faz spread do override inteiro sobre o objeto público
 * do veículo, devolver o blob cru pelo GET publicava a margem da loja no
 * browser de qualquer visitante — anulando na prática o "SECURITY FIX" que
 * `mapVeiculoDbToVeiculo` declara ao não expor `preco_compra`.
 *
 * Whitelist em vez de blacklist de propósito: campo novo criado no painel
 * amanhã nasce privado, não público.
 */
const CAMPOS_PUBLICOS_DE_OVERRIDE = [
  "tipo",
  "perfil_uso",
  "status_tag",
  "status_tag_color",
  "vendido",
  "quick_tags",
  "descricao",
  "laudo_pericia",
  "opcionais",
] as const;

type Overrides = Record<string, Record<string, unknown>>;

function filtrarOverridesPublicos(bruto: unknown): unknown {
  const blob = bruto as { overrides?: Overrides } | null;
  if (!blob?.overrides) return bruto;

  const limpos: Overrides = {};
  for (const [id, campos] of Object.entries(blob.overrides)) {
    if (!campos || typeof campos !== "object") continue;
    const permitidos: Record<string, unknown> = {};
    for (const campo of CAMPOS_PUBLICOS_DE_OVERRIDE) {
      if (campo in campos) permitidos[campo] = campos[campo];
    }
    if (Object.keys(permitidos).length > 0) limpos[id] = permitidos;
  }
  return { ...blob, overrides: limpos };
}

/**
 * Recorte das settings seguro para servir a visitante anônimo.
 *
 * Removidos por inteiro:
 *  - `webhooks` — URLs internas do n8n e `apiSecretToken`. Nenhum componente
 *    público usa: os cinco que o desestruturavam do contexto (LeadPopup,
 *    ContatoClientWrapper, AutoAvaliacao, HeroSection, PDPClientWrapper) nunca
 *    leem o valor; o envio de lead passa por `/api/leads`, proxy server-side.
 *  - `bankBalances` — saldos bancários da loja, dado exclusivo do financeiro.
 */
export function recortePublicoDeSettings(
  completo: Awaited<ReturnType<typeof getCachedSettings>>
) {
  return {
    companySettings: completo.companySettings,
    aboutSettings: completo.aboutSettings,
    popups: completo.popups,
    quickTags: completo.quickTags,
    carouselVehicleIds: completo.carouselVehicleIds,
    stockOverrides: filtrarOverridesPublicos(completo.stockOverrides),
  };
}
