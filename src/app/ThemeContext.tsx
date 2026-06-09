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
}

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  name: "Motors Store",
  phone: "(11) 4003-0000",
  whatsapp: "(11) 99999-9999",
  whatsappRaw: "5511999999999",
  address: "Av. Europa, 1000 - Jardim Europa, São Paulo - SP, CEP 01449-000",
  hours: "Seg a Sex das 9h às 19h\nSáb das 9h às 14h",
  instagram: "https://instagram.com/motorsstore",
  facebook: "https://facebook.com/motorsstore",
  cnpj: "12.345.678/0001-99",
};

export const DEFAULT_ABOUT_SETTINGS: AboutSettings = {
  heroTitle: "MOLDANDO A CURADORIA PREMIUM",
  heroSubtitle: "De um tradicional showroom físico na icônica Avenida Europa à vanguarda da inteligência artificial automotiva. A Motors Store é a fusão exata de legado, engenharia de procedência e tecnologia de ponta.",
  historyTitle: "A Herança da Avenida Europa",
  historyP1: "Fundada há mais de uma década no coração financeiro e automotivo de alto padrão de São Paulo, a Motors Store nasceu com a missão de transformar o mercado de veículos seminovos selecionados. Desde os primeiros supercarros clássicos até os modernos hyper-EVs, cada veículo em nosso acervo passa por uma avaliação cirúrgica.",
  historyP2: "Nosso compromisso inegociável é com a transparência total. Fomos a primeira revenda a disponibilizar laudos de perícia cautelar 100% integrados em tempo real na listagem web, garantindo ao comprador a segurança de fábrica em cada compra.",
  valuesTitle: "Perícia e Rigor Técnico",
  value1: "Laudo Cautelar 100% Livre: Histórico estrutural intocado e verificado.",
  value2: "Garantia de Showroom: Revisão profunda de 120 itens em mecânica e elétrica.",
  value3: "Valoração Fipe de Precisão: Atualização contínua com indicadores oficiais de mercado.",
  techTitle: "O MOTOR TECNOLÓGICO DA MOTORS STORE",
  techSubtitle: "Nossa plataforma web 2.0 não é apenas um catálogo digital. Criamos sistemas inteligentes locais para guiar seu investimento com máxima precisão.",
  card1Title: "PREVISÃO FIPE EXPRESS",
  card1Desc: "Algoritmo de cálculo instantâneo que traduz dados técnicos e quilometragem em uma cotação justa de mercado para seu veículo de entrada em segundos.",
  card2Title: "ALGORITMO DE DISTÂNCIA",
  card2Desc: "Sistema dinâmico que cruza faixa de investimento, buffers de tolerância de 15% para upgrades recomendados e preferências de carroceria do usuário.",
  card3Title: "ASSISTENTE SEMÂNTICO LOCAL",
  card3Desc: "Analisador natural de texto livre de alta velocidade. Extrai limites numéricos de orçamento de expressões livres e mapeia estilos de uso."
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
  companySettings: CompanySettings;
  updateCompanySettings: (settings: CompanySettings) => void;
  aboutSettings: AboutSettings;
  updateAboutSettings: (settings: AboutSettings) => void;
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeType>("luxury-light");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS);
  const [aboutSettings, setAboutSettings] = useState<AboutSettings>(DEFAULT_ABOUT_SETTINGS);

  useEffect(() => {
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

    const savedCompany = localStorage.getItem("ag_company_settings");
    if (savedCompany) {
      try {
        setCompanySettings({
          ...DEFAULT_COMPANY_SETTINGS,
          ...JSON.parse(savedCompany)
        });
      } catch (e) {
        console.error("Failed to parse company settings from localStorage", e);
      }
    }

    const savedAbout = localStorage.getItem("ag_about_settings");
    if (savedAbout) {
      try {
        setAboutSettings({
          ...DEFAULT_ABOUT_SETTINGS,
          ...JSON.parse(savedAbout)
        });
      } catch (e) {
        console.error("Failed to parse about settings from localStorage", e);
      }
    }
  }, []);

  const updateCompanySettings = (settings: CompanySettings) => {
    setCompanySettings(settings);
    localStorage.setItem("ag_company_settings", JSON.stringify(settings));
  };

  const updateAboutSettings = (settings: AboutSettings) => {
    setAboutSettings(settings);
    localStorage.setItem("ag_about_settings", JSON.stringify(settings));
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
        companySettings,
        updateCompanySettings,
        aboutSettings,
        updateAboutSettings,
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
