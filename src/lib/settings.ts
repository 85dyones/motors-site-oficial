import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

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
    let procedencia = null;
    let instagramCuradoria = null;
    let areasHome = null;
    let ga4 = null;
    let fetchedFromSupabase = false;

    // A chave de SERVIÇO é a primeira opção, não um extra.
    //
    // Desde `20260812120000_rls_leitura_de_site_settings.sql` a anon key só
    // enxerga o recorte público de `site_settings`: `webhooks`,
    // `stock_overrides` e `bank_balances` ficam de fora, porque a anon key vai
    // no bundle do navegador e essas linhas guardam `apiSecretToken`,
    // `preco_compra` e saldos. Esta função roda SEMPRE no servidor (dentro de
    // `unstable_cache`, sem sessão), então é ela que tem de subir de papel —
    // quem recorta para o visitante é `recortePublicoDeSettings`, abaixo.
    const chaveDeLeitura = supabaseServiceKey || supabaseAnonKey;

    if (supabaseUrl && chaveDeLeitura) {
      if (!supabaseServiceKey) {
        // Alto de propósito. Sem a chave de serviço o site continua de pé — a
        // vitrine inteira está no recorte público —, mas `webhooks` volta
        // vazio e o lead sai para o n8n sem `Authorization`. Esse disparo é
        // não-bloqueante: sem este aviso, a única pista seria o consultor
        // parando de receber lead, dias depois.
        console.warn(
          "[Settings API] SUPABASE_SERVICE_ROLE_KEY ausente — lendo site_settings com a anon key. " +
            "webhooks/stockOverrides/bankBalances virão vazios (RLS)."
        );
      }

      try {
        const client = createClient(supabaseUrl, chaveDeLeitura, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
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
          const procedenciaRow = data.find((row) => row.id === "procedencia");
          const instagramRow = data.find((row) => row.id === "instagram_curadoria");
          const areasRow = data.find((row) => row.id === "areas_home");
          // Credenciais de LEITURA do GA4 (id numérico da propriedade, e-mail
          // da conta de serviço e chave privada). Mesma casa do
          // `webhooks.apiSecretToken`: segredo que o painel edita e o servidor
          // consome, fora da whitelist da RLS anônima e fora do recorte
          // público. Ver `credenciaisDoGa4` em `lib/analytics.ts`.
          const ga4Row = data.find((row) => row.id === "ga4");

          if (companyRow) companySettings = companyRow.data;
          if (aboutRow) aboutSettings = aboutRow.data;
          if (webhooksRow) webhooks = webhooksRow.data;
          if (popupsRow) popups = popupsRow.data;
          if (quickTagsRow) quickTags = quickTagsRow.data;
          if (stockOverridesRow) stockOverrides = stockOverridesRow.data;
          if (carouselRow) carouselVehicleIds = carouselRow.data;
          if (bankBalancesRow) bankBalances = bankBalancesRow.data;
          if (procedenciaRow) procedencia = procedenciaRow.data;
          if (instagramRow) instagramCuradoria = instagramRow.data;
          if (areasRow) areasHome = areasRow.data;
          if (ga4Row) ga4 = ga4Row.data;
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
      bankBalances,
      procedencia,
      instagramCuradoria,
      areasHome,
      ga4,
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
  if (!bruto || typeof bruto !== "object") return bruto;

  // O row já circulou nas duas formas — `{ overrides: {...} }` e o Record
  // direto (`normalizarStockOverrides` aceita ambas). O filtro cobre as duas:
  // se só tratasse o invólucro, a forma nua atravessaria crua, com
  // `preco_compra` e tudo.
  const blob = bruto as { overrides?: Overrides };
  const cru = blob.overrides ?? (bruto as Overrides);

  const limpos: Overrides = {};
  for (const [id, campos] of Object.entries(cru)) {
    if (!campos || typeof campos !== "object") continue;
    const permitidos: Record<string, unknown> = {};
    for (const campo of CAMPOS_PUBLICOS_DE_OVERRIDE) {
      if (campo in campos) permitidos[campo] = campos[campo];
    }
    if (Object.keys(permitidos).length > 0) limpos[id] = permitidos;
  }
  return blob.overrides ? { ...blob, overrides: limpos } : limpos;
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
 *  - `ga4` — credencial de leitura do Analytics, chave privada inclusa. Só o
 *    servidor a consome (`lib/analytics.ts`); nenhum componente de tela a lê.
 *
 * A lista acima é descritiva: o que garante a exclusão é a função ser
 * WHITELIST. Linha nova de `site_settings` nasce fora do recorte — foi assim
 * que `ga4` entrou sem precisar de nenhuma linha aqui.
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
    // Público de propósito: é o texto que a PDP já mostra a quem não tem sessão.
    procedencia: completo.procedencia,
    // Idem: são as fotos e os links que a home publica para qualquer visitante.
    instagramCuradoria: completo.instagramCuradoria,
    // Ordem e visibilidade das seções da home (tela A3). É público porque
    // descreve o que a própria página já mostra — não há nada a esconder em
    // "a faixa do Instagram vem depois da reputação".
    areasHome: completo.areasHome,
  };
}
