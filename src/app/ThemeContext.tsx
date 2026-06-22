"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { logThemeChanged } from "../lib/telemetry";

export type ThemeType = "luxury-light" | "stealth-dark" | "sport-nardo";

export interface ThemeProperties {
  "--brand-background": string;
  "--brand-foreground": string;
  "--brand-primary": string;
  "--brand-primary-hover": string;
  "--brand-gold": string;
  "--brand-card": string;
  "--brand-card-border": string;
  "--brand-border": string;
  "--brand-shadow": string;
  "--brand-glass-bg": string;
  "--brand-footer-bg": string;
}

export const THEME_PRESETS: Record<ThemeType, ThemeProperties> = {
  "luxury-light": {
    "--brand-background": "#fafafc",
    "--brand-foreground": "#1a1a23",
    "--brand-primary": "#C83F00",
    "--brand-primary-hover": "#9E3100",
    "--brand-gold": "#9E3100",
    "--brand-card": "#ffffff",
    "--brand-card-border": "#f3f4f6",
    "--brand-border": "#f1f3f5",
    "--brand-shadow": "rgba(0, 0, 0, 0.03)",
    "--brand-glass-bg": "rgba(255, 255, 255, 0.8)",
    "--brand-footer-bg": "#f1f3f5",
  },
  "stealth-dark": {
    "--brand-background": "#09090B",
    "--brand-foreground": "#F4F4F7",
    "--brand-primary": "#D4AF37",
    "--brand-primary-hover": "#bfa030",
    "--brand-gold": "#D4AF37",
    "--brand-card": "#14141B",
    "--brand-card-border": "#24242b",
    "--brand-border": "#1e1e24",
    "--brand-shadow": "rgba(0, 0, 0, 0.5)",
    "--brand-glass-bg": "rgba(20, 20, 27, 0.85)",
    "--brand-footer-bg": "#09090B",
  },
  "sport-nardo": {
    "--brand-background": "#1A1D20",
    "--brand-foreground": "#FFFFFF",
    "--brand-primary": "#E30613",
    "--brand-primary-hover": "#c50510",
    "--brand-gold": "#E30613",
    "--brand-card": "#272B30",
    "--brand-card-border": "#363b42",
    "--brand-border": "#363b42",
    "--brand-shadow": "rgba(227, 6, 19, 0.08)",
    "--brand-glass-bg": "rgba(39, 43, 48, 0.85)",
    "--brand-footer-bg": "#1A1D20",
  },
};

export interface CompanySettings {
  name: string;
  phone: string;
  whatsapp: string;
  whatsappRaw: string;
  address: string;
  hours: string;
  instagram: string;
  facebook: string;
  cnpj: string;
  isCustom?: boolean;
}

export interface AboutSettings {
  heroTitle: string;
  heroSubtitle: string;
  historyTitle: string;
  historyP1: string;
  historyP2: string;
  valuesTitle: string;
  value1: string;
  value2: string;
  value3: string;
  techTitle: string;
  techSubtitle: string;
  card1Title: string;
  card1Desc: string;
  card2Title: string;
  card2Desc: string;
  card3Title: string;
  card3Desc: string;
  ctaTitle?: string;
  ctaDescription?: string;
  ctaBtn1Text?: string;
  ctaBtn2Text?: string;
  isCustom?: boolean;
}

export interface Webhooks {
  webhookUrl: string;
  webhookAvaliacaoUrl: string;
}

export interface Campaign {
  id: string;
  name: string;
  enabled: boolean;
  targetPage: "home" | "pdp" | "any" | "specific";
  triggerType: "time" | "exit";
  delaySeconds: number;
  actionType: "whatsapp" | "link" | "compare";
  actionTarget: string;
  icon: string;
  title: string;
  subtitle: string;
  ctaText: string;
  targetVehicleId?: string;
}

export interface QuickTag {
  id: string;
  name: string;
  field: "perfil_uso" | "preco" | "quilometragem" | "tipo" | "marca" | "combustivel";
  operator: "equals" | "less" | "greater" | "contains";
  value: string;
}

const DEFAULT_QUICK_TAGS: QuickTag[] = [
  { id: "curadoria", name: "CURADORIA EXCLUSIVA", field: "perfil_uso", operator: "equals", value: "CURADORIA EXCLUSIVA" },
  { id: "economicos", name: "ECONÔMICOS", field: "preco", operator: "less", value: "180000" },
  { id: "baixa_km", name: "BAIXA QUILOMETRAGEM", field: "quilometragem", operator: "less", value: "40000" },
  { id: "parcela_1k", name: "PARCELA 1K", field: "preco", operator: "less", value: "120000" }
];

export type StockOverrides = Record<string, {
  status_tag?: string;
  status_tag_color?: string;
  vendido?: boolean;
}>;

import DEFAULT_COMPANY_SETTINGS_JSON from "../lib/companySettings.json";
import DEFAULT_ABOUT_SETTINGS_JSON from "../lib/aboutSettings.json";

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = DEFAULT_COMPANY_SETTINGS_JSON;
export const DEFAULT_ABOUT_SETTINGS: AboutSettings = DEFAULT_ABOUT_SETTINGS_JSON;

export const DEFAULT_WEBHOOKS: Webhooks = {
  webhookUrl: "https://n8n.v2o5.com.br/webhook/lead-entrada",
  webhookAvaliacaoUrl: "https://n8n.v2o5.com.br/webhook/sdr-captura-lead"
};

export const DEFAULT_CAMPAIGNS: Campaign[] = [
  {
    id: "camp-home-wa",
    name: "🔥 Ofertão Relâmpago (WhatsApp)",
    enabled: true,
    targetPage: "home",
    triggerType: "time",
    delaySeconds: 45,
    actionType: "whatsapp",
    actionTarget: "Olá! Vi a condição especial no site e gostaria de falar com um especialista agora! (Ref: {ref})",
    icon: "🔥",
    title: "CONDIÇÃO EXCLUSIVA PRA VOCÊ",
    subtitle: "Fale agora com nosso especialista e garanta sua condição diferenciada. Oferta válida por tempo limitado.",
    ctaText: "FALAR COM ESPECIALISTA AGORA"
  },
  {
    id: "camp-pdp-wa",
    name: "⚡ Oferta Ficha Técnico (WhatsApp)",
    enabled: true,
    targetPage: "pdp",
    triggerType: "time",
    delaySeconds: 20,
    actionType: "whatsapp",
    actionTarget: "Olá! Vi a oferta especial do {carro} no site e gostaria de aproveitar a condição exclusiva! (Ref: {ref})",
    icon: "⚡",
    title: "OPORTUNIDADE ÚNICA — {carro}",
    subtitle: "Condição especial exclusiva para o {carro}{preco}. Fale com nosso especialista antes que expire.",
    ctaText: "GARANTIR MINHA CONDIÇÃO"
  },
  {
    id: "camp-carmatch",
    name: "🤖 Assistente de Garagem IA (Link)",
    enabled: true,
    targetPage: "home",
    triggerType: "time",
    delaySeconds: 30,
    actionType: "link",
    actionTarget: "/#match-garagem",
    icon: "🤖",
    title: "BUSCANDO O CARRO PERFEITO?",
    subtitle: "Experimente nosso Assistente de Garagem IA. Responda 3 perguntas e o algoritmo faz a curadoria ideal para você.",
    ctaText: "FAZER MATCH DE GARAGEM"
  },
  {
    id: "camp-avaliacao",
    name: "🚗 Avaliação Express (Link)",
    enabled: true,
    targetPage: "home",
    triggerType: "time",
    delaySeconds: 60,
    actionType: "link",
    actionTarget: "/#avaliacao-express",
    icon: "🚗",
    title: "QUER VENDER SEU VEÍCULO?",
    subtitle: "Simule a avaliação do seu carro usado agora mesmo na nossa ferramenta online. Simples, rápido e com preço de pátio.",
    ctaText: "AVALIAR MEU USADO AGORA"
  },
  {
    id: "camp-comparador",
    name: "📊 Educacional Comparador (Ação Interna)",
    enabled: true,
    targetPage: "pdp",
    triggerType: "time",
    delaySeconds: 35,
    actionType: "compare",
    actionTarget: "",
    icon: "📊",
    title: "DÚVIDA ENTRE MODELOS?",
    subtitle: "Sabia que você pode adicionar veículos do catálogo para comparar as especificações técnicas completas lado a lado?",
    ctaText: "ABRIR MEU COMPARADOR"
  },
  {
    id: "camp-exit-intent",
    name: "👋 Intenção de Saída (WhatsApp)",
    enabled: true,
    targetPage: "any",
    triggerType: "exit",
    delaySeconds: 0,
    actionType: "whatsapp",
    actionTarget: "Olá! Gostaria de receber uma avaliação exclusiva sem compromisso antes de decidir. (Ref: {ref})",
    icon: "👋",
    title: "ANTES DE IR...",
    subtitle: "Que tal uma avaliação sem compromisso? Nosso especialista está disponível agora para te atender com exclusividade.",
    ctaText: "FALAR COM ESPECIALISTA"
  }
];

export interface PopupSettings {
  enabled: boolean;
  cooldownHours: number;
  whatsappNumber: string;
}

export const DEFAULT_POPUP_SETTINGS: PopupSettings = {
  enabled: true,
  cooldownHours: 4,
  whatsappNumber: "554198089550",
};

interface ThemeContextProps {
  theme: ThemeType;
  setTheme: (type: ThemeType) => void;
  presets: Record<ThemeType, ThemeProperties>;
  compareIds: string[];
  addToCompare: (id: string) => void;
  removeFromCompare: (id: string) => void;
  clearCompare: () => void;
  isInCompare: (id: string) => boolean;
  setCompareList: (ids: string[]) => void;
  companySettings: CompanySettings;
  updateCompanySettings: (settings: CompanySettings) => void;
  aboutSettings: AboutSettings;
  updateAboutSettings: (settings: AboutSettings) => void;
  webhooks: Webhooks;
  updateWebhooks: (settings: Webhooks) => Promise<void>;
  popups: Campaign[];
  popupSettings: PopupSettings;
  updatePopups: (campaigns: Campaign[]) => Promise<void>;
  updatePopupSettings: (settings: PopupSettings) => Promise<void>;
  quickTags: QuickTag[];
  updateQuickTags: (tags: QuickTag[]) => Promise<void>;
  stockOverrides: StockOverrides;
  updateStockOverrides: (overrides: StockOverrides) => Promise<void>;
  carouselVehicleIds: string[];
  updateCarouselVehicleIds: (ids: string[]) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeType>("luxury-light");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS);
  const [aboutSettings, setAboutSettings] = useState<AboutSettings>(DEFAULT_ABOUT_SETTINGS);
  const [webhooks, setWebhooks] = useState<Webhooks>(DEFAULT_WEBHOOKS);
  const [popups, setPopups] = useState<Campaign[]>(DEFAULT_CAMPAIGNS);
  const [popupSettings, setPopupSettings] = useState<PopupSettings>(DEFAULT_POPUP_SETTINGS);
  const [quickTags, setQuickTags] = useState<QuickTag[]>(DEFAULT_QUICK_TAGS);
  const [stockOverrides, setStockOverrides] = useState<StockOverrides>({});
  const [carouselVehicleIds, setCarouselVehicleIds] = useState<string[]>([]);

  useEffect(() => {
    // Theme and compare IDs are UI-only preferences — localStorage is fine for these
    const savedTheme = localStorage.getItem("ag_theme") as ThemeType;
    if (savedTheme && THEME_PRESETS[savedTheme]) {
      setThemeState(savedTheme);
      applyThemeProperties(savedTheme);
    }

    const savedCompare = localStorage.getItem("ag_compare_ids");
    if (savedCompare) {
      try {
        setCompareIds(JSON.parse(savedCompare));
      } catch (e) {
        console.error("Failed to parse compare IDs from localStorage", e);
      }
    }

    // Settings loaded EXCLUSIVELY from Supabase via /api/settings
    // No localStorage reads — the database is the single source of truth
    const loadSettingsFromServer = async () => {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          if (data.companySettings) {
            setCompanySettings(data.companySettings);
            console.log("[ThemeContext] Company settings loaded from Supabase:", data.companySettings.phone);
          }
          if (data.aboutSettings) {
            setAboutSettings(data.aboutSettings);
            console.log("[ThemeContext] About settings loaded from Supabase");
          }
          if (data.webhooks) {
            setWebhooks(data.webhooks);
            console.log("[ThemeContext] Webhooks loaded from Supabase");
          }
          if (data.popups) {
            if (Array.isArray(data.popups.campaigns)) {
              setPopups(data.popups.campaigns);
            }
            if (data.popups.settings) {
              setPopupSettings(data.popups.settings);
            }
            console.log("[ThemeContext] Popups loaded from Supabase");
          }
          if (data.quickTags && Array.isArray(data.quickTags.quickTags)) {
            setQuickTags(data.quickTags.quickTags);
            console.log("[ThemeContext] Quick tags loaded from Supabase");
          }
          if (data.stockOverrides && data.stockOverrides.overrides) {
            setStockOverrides(data.stockOverrides.overrides);
            if (typeof window !== "undefined") {
              (window as any).ag_stock_overrides = data.stockOverrides.overrides;
            }
            console.log("[ThemeContext] Stock overrides loaded from Supabase");
          }
          if (data.carouselVehicleIds && Array.isArray(data.carouselVehicleIds)) {
            setCarouselVehicleIds(data.carouselVehicleIds);
            console.log("[ThemeContext] Carousel vehicle IDs loaded from Supabase");
          }
        }
      } catch (err) {
        console.warn("[ThemeContext] Failed to load settings from server, using defaults:", err);
      }
    };
    
    loadSettingsFromServer();
  }, []);

  const updateCompanySettings = (settings: CompanySettings) => {
    setCompanySettings(settings);
  };

  const updateAboutSettings = (settings: AboutSettings) => {
    setAboutSettings(settings);
  };

  const updateWebhooks = async (newWebhooks: Webhooks) => {
    setWebhooks(newWebhooks);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhooks: newWebhooks })
      });
    } catch (err) {
      console.error("Failed to save webhooks to server:", err);
    }
  };

  const updatePopups = async (newPopups: Campaign[]) => {
    setPopups(newPopups);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          popups: {
            campaigns: newPopups,
            settings: popupSettings
          }
        })
      });
    } catch (err) {
      console.error("Failed to save popups to server:", err);
    }
  };

  const updatePopupSettings = async (newSettings: PopupSettings) => {
    setPopupSettings(newSettings);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          popups: {
            campaigns: popups,
            settings: newSettings
          }
        })
      });
    } catch (err) {
      console.error("Failed to save popup settings to server:", err);
    }
  };

  const updateCarouselVehicleIds = async (newIds: string[]) => {
    setCarouselVehicleIds(newIds);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carouselVehicleIds: newIds })
      });
    } catch (err) {
      console.error("Failed to save carousel vehicles to server:", err);
    }
  };

  const updateQuickTags = async (newQuickTags: QuickTag[]) => {
    setQuickTags(newQuickTags);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quickTags: { quickTags: newQuickTags } })
      });
    } catch (err) {
      console.error("Failed to save quickTags to server:", err);
    }
  };

  const updateStockOverrides = async (newStockOverrides: StockOverrides) => {
    setStockOverrides(newStockOverrides);
    if (typeof window !== "undefined") {
      (window as any).ag_stock_overrides = newStockOverrides;
    }
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockOverrides: { overrides: newStockOverrides } })
      });
    } catch (err) {
      console.error("Failed to save stockOverrides to server:", err);
    }
  };

  const applyThemeProperties = (type: ThemeType) => {
    if (typeof window === "undefined") return;
    const properties = THEME_PRESETS[type];
    const root = document.documentElement;

    Object.entries(properties).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    root.setAttribute("data-theme", type);
    if (type === "stealth-dark" || type === "sport-nardo") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  };

  const setTheme = (type: ThemeType) => {
    if (!THEME_PRESETS[type]) return;

    setThemeState(type);
    applyThemeProperties(type);

    localStorage.setItem("ag_theme", type);
    document.cookie = `ag_theme=${type}; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax; Secure`;

    logThemeChanged(type);

    const event = new CustomEvent("agThemeChanged", { detail: { theme: type } });
    window.dispatchEvent(event);
  };

  const addToCompare = (id: string) => {
    if (compareIds.includes(id)) return;
    if (compareIds.length >= 3) {
      alert("Limite de 3 veículos simultâneos atingido para comparação!");
      return;
    }
    const updated = [...compareIds, id];
    setCompareIds(updated);
    localStorage.setItem("ag_compare_ids", JSON.stringify(updated));
    console.log(`[Antigravity Click] Veículo ID: ${id} adicionado para comparação. Lista atual: ${JSON.stringify(updated)}`);
  };

  const removeFromCompare = (id: string) => {
    const updated = compareIds.filter((item) => item !== id);
    setCompareIds(updated);
    localStorage.setItem("ag_compare_ids", JSON.stringify(updated));
    console.log(`[Antigravity Click] Veículo ID: ${id} removido da comparação. Lista atual: ${JSON.stringify(updated)}`);
  };

  const clearCompare = () => {
    setCompareIds([]);
    localStorage.removeItem("ag_compare_ids");
    console.log(`[Antigravity Click] Lista de comparação limpa.`);
  };

  const isInCompare = (id: string) => {
    return compareIds.includes(id);
  };

  const setCompareList = (ids: string[]) => {
    const sliced = ids.slice(0, 3);
    setCompareIds(sliced);
    localStorage.setItem("ag_compare_ids", JSON.stringify(sliced));
    console.log(`[Antigravity Click] Lista de comparação alterada para: ${JSON.stringify(sliced)}`);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        presets: THEME_PRESETS,
        compareIds,
        addToCompare,
        removeFromCompare,
        clearCompare,
        isInCompare,
        setCompareList,
        companySettings,
        updateCompanySettings,
        aboutSettings,
        updateAboutSettings,
        webhooks,
        updateWebhooks,
        popups,
        popupSettings,
        updatePopups,
        updatePopupSettings,
        quickTags,
        updateQuickTags,
        stockOverrides,
        updateStockOverrides,
        carouselVehicleIds,
        updateCarouselVehicleIds,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
