"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getEstoque, Veiculo, supabase } from "../lib/supabase";
import { useTheme, ThemeType } from "../app/ThemeContext";

interface Campaign {
  id: string;
  name: string;
  enabled: boolean;
  targetPage: "home" | "pdp" | "any" | "specific";
  targetVehicleId?: string;
  triggerType: "time" | "exit";
  delaySeconds: number;
  actionType: "whatsapp" | "link" | "compare";
  actionTarget: string; // whatsapp message templates OR anchor link (e.g. /#avaliacao-express)
  icon: string;
  title: string;
  subtitle: string;
  ctaText: string;
}

interface PopupSettings {
  enabled: boolean;
  cooldownHours: number;
  whatsappNumber: string;
}

const DEFAULT_POPUP_SETTINGS: PopupSettings = {
  enabled: true,
  cooldownHours: 4,
  whatsappNumber: "554198089550",
};

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

const DEFAULT_CAMPAIGNS: Campaign[] = [
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
    name: "⚡ Oferta Ficha Técnica (WhatsApp)",
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

export default function ConfiguracoesClientWrapper() {
  const { theme, setTheme, companySettings, updateCompanySettings } = useTheme();
  const [activeTab, setActiveTab] = useState<"estoque" | "integracao" | "popups" | "destaques" | "empresa">("estoque");
  const [loading, setLoading] = useState(true);

  // Company settings states
  const [companyForm, setCompanyForm] = useState(companySettings);
  const [companyStatus, setCompanyStatus] = useState<"idle" | "saved">("idle");

  // Sync company settings form when settings change
  useEffect(() => {
    setCompanyForm(companySettings);
  }, [companySettings]);

  // Carousel selection state
  const [carouselVehicleIds, setCarouselVehicleIds] = useState<string[]>([]);

  // Quick tags manager state
  const [quickTags, setQuickTags] = useState<QuickTag[]>([]);
  const [editingQuickTag, setEditingQuickTag] = useState<QuickTag | null>(null);
  const [isCreatingQuickTag, setIsCreatingQuickTag] = useState(false);

  // Popup settings states
  const [popupSettings, setPopupSettings] = useState<PopupSettings>(DEFAULT_POPUP_SETTINGS);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [popupStatus, setPopupStatus] = useState<"idle" | "saved">("idle");

  // Editing campaign states
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  // Authentication states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  
  // Stock data states
  const [vehicles, setVehicles] = useState<Veiculo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Local overrides states: mapping of vehicle.id -> { tipo?: string, perfil_uso?: string, status_tag?: string, status_tag_color?: string, vendido?: boolean, descricao?: string }
  const [overrides, setOverrides] = useState<Record<string, { tipo?: string; perfil_uso?: string; status_tag?: string; status_tag_color?: string; vendido?: boolean; descricao?: string }>>({});
  
  // Single vehicle save notifications: mapping of vehicle.id -> boolean
  const [savedNotifications, setSavedNotifications] = useState<Record<string, boolean>>({});

  // Webhook integration states
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookStatus, setWebhookStatus] = useState<"idle" | "saved">("idle");
  const [webhookAvaliacaoUrl, setWebhookAvaliacaoUrl] = useState("");
  const [webhookAvaliacaoStatus, setWebhookAvaliacaoStatus] = useState<"idle" | "saved">("idle");

  // Check login state on session restore
  useEffect(() => {
    if (typeof window !== "undefined") {
      const loggedIn = sessionStorage.getItem("ag_admin_logged_in") === "true";
      if (loggedIn) {
        setIsAuthenticated(true);
      }
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email === "motors@motorsstoreoficial.com.br" && password === "test123456") {
      setIsAuthenticated(true);
      setAuthError("");
      if (typeof window !== "undefined") {
        sessionStorage.setItem("ag_admin_logged_in", "true");
      }
    } else {
      setAuthError("Credenciais inválidas. Verifique seu e-mail e senha.");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setEmail("");
    setPassword("");
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("ag_admin_logged_in");
    }
  };

  // Load database catalog and localStorage configurations on mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // Load stock from database client wrapper
        const data = await getEstoque();
        setVehicles(data);

        // Load overrides
        const rawOverrides = localStorage.getItem("ag_stock_overrides");
        if (rawOverrides) {
          setOverrides(JSON.parse(rawOverrides));
        }

        // Load webhook URL
        const customWebhook = localStorage.getItem("ag_webhook_url");
        const defaultWebhook = process.env.NEXT_PUBLIC_N8N_WEBHOOK_LEAD_URL || "https://n8n.v2o5.com.br/webhook/lead-entrada";
        setWebhookUrl(customWebhook || defaultWebhook);

        // Load evaluation webhook URL
        const customWebhookAvaliacao = localStorage.getItem("ag_webhook_avaliacao_url");
        const defaultWebhookAvaliacao = process.env.NEXT_PUBLIC_N8N_WEBHOOK_AVALIACAO_URL || "https://n8n.v2o5.com.br/webhook/sdr-captura-lead";
        setWebhookAvaliacaoUrl(customWebhookAvaliacao || defaultWebhookAvaliacao);

        // Load popup settings
        const rawPopupSettings = localStorage.getItem("ag_popup_settings");
        if (rawPopupSettings) {
          try {
            setPopupSettings({
              ...DEFAULT_POPUP_SETTINGS,
              ...JSON.parse(rawPopupSettings)
            });
          } catch (e) {
            console.error("Error parsing ag_popup_settings:", e);
          }
        }

        // Load campaigns
        const rawCampaigns = localStorage.getItem("ag_popup_campaigns");
        if (rawCampaigns) {
          try {
            setCampaigns(JSON.parse(rawCampaigns));
          } catch (e) {
            setCampaigns(DEFAULT_CAMPAIGNS);
          }
        } else {
          setCampaigns(DEFAULT_CAMPAIGNS);
          localStorage.setItem("ag_popup_campaigns", JSON.stringify(DEFAULT_CAMPAIGNS));
        }

        // Load carousel vehicle selections
        const rawCarousel = localStorage.getItem("ag_carousel_vehicles");
        if (rawCarousel) {
          try {
            setCarouselVehicleIds(JSON.parse(rawCarousel));
          } catch (e) {}
        }

        // Load quick tags
        const rawQuickTags = localStorage.getItem("ag_quick_tags");
        if (rawQuickTags) {
          try {
            setQuickTags(JSON.parse(rawQuickTags));
          } catch (e) {
            setQuickTags(DEFAULT_QUICK_TAGS);
          }
        } else {
          setQuickTags(DEFAULT_QUICK_TAGS);
          localStorage.setItem("ag_quick_tags", JSON.stringify(DEFAULT_QUICK_TAGS));
        }
      } catch (err) {
        console.error("Error loading settings panel data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Filter vehicles based on search bar text query
  const filteredVehicles = vehicles.filter((v) => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return true;
    return (
      v.marca.toLowerCase().includes(term) ||
      v.modelo.toLowerCase().includes(term) ||
      v.versao.toLowerCase().includes(term) ||
      v.id.toLowerCase().includes(term)
    );
  });

  // Handle single vehicle override values change
  const handleOverrideChange = (id: string, field: "tipo" | "perfil_uso" | "status_tag" | "status_tag_color" | "vendido" | "descricao", value: any) => {
    setOverrides((prev) => {
      const vehicleOverrides = prev[id] || {};
      return {
        ...prev,
        [id]: {
          ...vehicleOverrides,
          [field]: value,
        },
      };
    });
  };

  // Save changes for a single vehicle override
  const handleSaveVehicleOverride = async (id: string) => {
    const itemOverrides = overrides[id];
    if (!itemOverrides) return;

    try {
      const currentOverrides = localStorage.getItem("ag_stock_overrides");
      const parsedOverrides = currentOverrides ? JSON.parse(currentOverrides) : {};
      
      parsedOverrides[id] = {
        ...parsedOverrides[id],
        ...itemOverrides,
      };

      localStorage.setItem("ag_stock_overrides", JSON.stringify(parsedOverrides));

      // Persist to live Supabase database directly if Supabase is active
      if (supabase) {
        const dbUpdates: any = {};
        if (itemOverrides.tipo !== undefined) dbUpdates.tipo = itemOverrides.tipo;
        if (itemOverrides.perfil_uso !== undefined) dbUpdates.perfil_uso = itemOverrides.perfil_uso;
        if (itemOverrides.descricao !== undefined) dbUpdates.descricao = itemOverrides.descricao;

        if (Object.keys(dbUpdates).length > 0) {
          const targetId = /^\d+$/.test(id) ? parseInt(id, 10) : id;
          const { error } = await supabase
            .from("veiculos")
            .update(dbUpdates)
            .eq("id", targetId);

          if (error) {
            console.warn(`[Supabase] Failed to persist updates to db for ${id}:`, error.message);
          } else {
            console.log(`[Supabase] Successfully persisted updates to db for ${id}:`, dbUpdates);
          }
        }
      }
      
      // Trigger Antigravity telemetry log
      console.log(`[Telemetry] Veículo ${id} atualizado. Carroceria: "${itemOverrides.tipo || "não alterada"}", Estilo: "${itemOverrides.perfil_uso || "não alterado"}"`);

      // Trigger temporary visual validation notification
      setSavedNotifications((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setSavedNotifications((prev) => ({ ...prev, [id]: false }));
      }, 2500);
    } catch (e) {
      console.error("Failed to save local vehicle override:", e);
    }
  };

  // Reset override for a single vehicle back to original default schema
  const handleResetVehicleOverride = (id: string) => {
    try {
      const currentOverrides = localStorage.getItem("ag_stock_overrides");
      if (currentOverrides) {
        const parsedOverrides = JSON.parse(currentOverrides);
        delete parsedOverrides[id];
        localStorage.setItem("ag_stock_overrides", JSON.stringify(parsedOverrides));
      }

      setOverrides((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });

      // Refetch / reset locally
      console.log(`[Telemetry] Veículo ${id} revertido para as categorias originais de fábrica.`);
      
      setSavedNotifications((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setSavedNotifications((prev) => ({ ...prev, [id]: false }));
      }, 2000);
    } catch (e) {
      console.error("Failed to reset local vehicle override:", e);
    }
  };

  // Reset all stock overrides globally
  const handlePurgeAllOverrides = () => {
    if (confirm("Deseja realmente redefinir todos os veículos para a categorização original do banco de dados?")) {
      try {
        localStorage.removeItem("ag_stock_overrides");
        setOverrides({});
        console.log("[Telemetry] Todas as categorizações manuais foram removidas. Reset global concluído.");
        alert("Todos os veículos foram restaurados aos valores originais com sucesso!");
        
        // Reload stock list
        getEstoque().then((data) => setVehicles(data));
      } catch (e) {
        console.error("Failed to purge overrides:", e);
      }
    }
  };

  // Save general webhook URL
  const handleSaveWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem("ag_webhook_url", webhookUrl.trim());
      setWebhookStatus("saved");
      console.log(`[Telemetry] Webhook de recebimento de leads atualizado para: ${webhookUrl}`);
      setTimeout(() => setWebhookStatus("idle"), 2500);
    } catch (e) {
      console.error("Failed to save custom webhook:", e);
    }
  };

  // Save appraisal webhook URL
  const handleSaveWebhookAvaliacao = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem("ag_webhook_avaliacao_url", webhookAvaliacaoUrl.trim());
      setWebhookAvaliacaoStatus("saved");
      console.log(`[Telemetry] Webhook de avaliação de veículos atualizado para: ${webhookAvaliacaoUrl}`);
      setTimeout(() => setWebhookAvaliacaoStatus("idle"), 2500);
    } catch (e) {
      console.error("Failed to save custom evaluation webhook:", e);
    }
  };

  // Save popup settings
  const handleSavePopupSettings = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem("ag_popup_settings", JSON.stringify(popupSettings));
      localStorage.setItem("ag_popup_campaigns", JSON.stringify(campaigns));
      setPopupStatus("saved");
      console.log(`[Telemetry] Configurações do Motor de Campanhas atualizadas.`);
      setTimeout(() => setPopupStatus("idle"), 2500);
    } catch (e) {
      console.error("Failed to save popup settings:", e);
    }
  };

  // Save company settings
  const handleSaveCompanySettings = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      updateCompanySettings(companyForm);
      setCompanyStatus("saved");
      console.log("[Telemetry] Dados da Concessionária atualizados.");
      setTimeout(() => setCompanyStatus("idle"), 2500);
    } catch (e) {
      console.error("Failed to save company settings:", e);
    }
  };

  // Reset company settings to default
  const handleResetCompanySettings = () => {
    if (confirm("Deseja realmente redefinir todos os dados da concessionária para os padrões de fábrica?")) {
      const defaultSettings = {
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
      setCompanyForm(defaultSettings);
      updateCompanySettings(defaultSettings);
      alert("Dados da concessionária redefinidos com sucesso!");
    }
  };

  // Save campaign edit / create
  const handleSaveCampaign = (campaign: Campaign) => {
    setCampaigns((prev) => {
      const exists = prev.some((c) => c.id === campaign.id);
      let nextList: Campaign[];
      if (exists) {
        nextList = prev.map((c) => (c.id === campaign.id ? campaign : c));
      } else {
        nextList = [...prev, campaign];
      }
      localStorage.setItem("ag_popup_campaigns", JSON.stringify(nextList));
      return nextList;
    });
    setEditingCampaign(null);
    setIsCreating(false);
  };

  // Delete campaign
  const handleDeleteCampaign = (id: string) => {
    if (confirm("Deseja realmente excluir esta campanha de pop-up?")) {
      setCampaigns((prev) => {
        const nextList = prev.filter((c) => c.id !== id);
        localStorage.setItem("ag_popup_campaigns", JSON.stringify(nextList));
        return nextList;
      });
    }
  };

  // Toggle single campaign active status
  const handleToggleCampaign = (id: string) => {
    setCampaigns((prev) => {
      const nextList = prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c));
      localStorage.setItem("ag_popup_campaigns", JSON.stringify(nextList));
      return nextList;
    });
  };

  // Reset popup settings and campaigns to defaults
  const handleResetPopupSettings = () => {
    if (confirm("Deseja realmente redefinir todos os pop-ups e campanhas para os padrões de fábrica?")) {
      setPopupSettings(DEFAULT_POPUP_SETTINGS);
      setCampaigns(DEFAULT_CAMPAIGNS);
      localStorage.removeItem("ag_popup_settings");
      localStorage.setItem("ag_popup_campaigns", JSON.stringify(DEFAULT_CAMPAIGNS));
      alert("Configurações e campanhas redefinidas com sucesso!");
    }
  };

  // Dropdown options
  const bodyTypes = ["SUV", "Sedan", "Picape", "Hatch", "Esportivo", "Conversível", "Coupe", "Wagon", "Premium"];
  const usageProfiles = ["URBANO & EFICIENTE", "FORÇA & OFF-ROAD", "LINHAGEM ESPORTIVA", "CURADORIA EXCLUSIVA"];

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col flex-grow items-center justify-center bg-brand-bg text-brand-text transition-colors duration-300 py-16 px-4 sm:px-6 lg:px-8 min-h-[75vh]">
        <div className="max-w-md w-full bg-brand-card border border-brand-card-border p-8 rounded-3xl shadow-[0_8px_30px_var(--brand-shadow)] relative overflow-hidden backdrop-blur-md">
          {/* Accent Glows */}
          <div className="absolute -left-16 -top-16 h-36 w-36 rounded-full bg-brand-primary/5 blur-[50px] pointer-events-none" />
          <div className="absolute -right-16 -bottom-16 h-36 w-36 rounded-full bg-brand-primary/5 blur-[50px] pointer-events-none" />
          
          <div className="flex flex-col items-center text-center gap-1.5 mb-8">
            <span className="text-[9px] font-bold text-brand-gold uppercase tracking-[0.2em]">
              ÁREA RESTRITA
            </span>
            <h2 className="text-xl font-extrabold text-brand-text tracking-tight uppercase">
              Acesso ao Painel
            </h2>
            <p className="text-xs text-brand-text/50">
              Insira suas credenciais administrativas para gerenciar o site.
            </p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {authError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-[11px] px-3.5 py-2.5 rounded-xl flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                  <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                </svg>
                <span>{authError}</span>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-email" className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">E-mail</label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@dominio.com.br"
                className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                style={{ minHeight: "48px" }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-password" className="text-[10px] font-bold uppercase text-brand-text/50 pl-1">Senha</label>
              <input
                id="auth-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                style={{ minHeight: "48px" }}
              />
            </div>

            <button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-brand-primary to-brand-primary-hover text-white font-extrabold text-xs uppercase tracking-widest rounded-xl shadow-lg hover:opacity-95 active:scale-95 transition-all duration-300 flex items-center justify-center gap-2 mt-2 cursor-pointer"
              style={{ minHeight: "48px" }}
            >
              Acessar Painel
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.22 5.03a.75.75 0 1 1 1.06-1.06l5.5 5.5a.75.75 0 0 1 0 1.06l-5.5 5.5a.75.75 0 1 1-1.06-1.06l4.168-4.17H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-grow items-center justify-start bg-brand-bg text-brand-text transition-colors duration-300 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto w-full flex flex-col gap-6">
        


        {/* Title Header */}
        <section className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-2">
          <div className="flex flex-col gap-1.5 text-center sm:text-left">
            <span className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.2em]">
              PAINEL DE CONFIGURAÇÃO DO SITE
            </span>
            <h1 className="text-2xl font-extrabold text-brand-text tracking-tight uppercase">
              🤖 CONTROLE ADMINISTRATIVO
            </h1>
            <p className="text-xs text-brand-text/60 leading-relaxed font-light">
              Gerencie categorizações de estoque, parametrização de canais de webhooks para o n8n e personalize a experiência de buscas e de IA de forma segura.
            </p>
          </div>
          
          <button
            onClick={handleLogout}
            className="self-center sm:self-start h-9 bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 border border-red-500/25 hover:border-red-500/40 text-[9px] font-bold uppercase tracking-widest px-4 rounded-xl transition-all duration-300 active:scale-95 cursor-pointer shrink-0"
          >
            Sair do Painel
          </button>
        </section>

        {/* Tab Switcher - Standard caixa alta uppercase */}
        <div className="flex items-center justify-start border-b border-brand-border/60 gap-4 mb-4">
          <button
            onClick={() => setActiveTab("estoque")}
            className={`py-3 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-all cursor-pointer ${
              activeTab === "estoque"
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-brand-text/40 hover:text-brand-text/70"
            }`}
          >
            Categorização de Estoque
          </button>
          <button
            onClick={() => setActiveTab("integracao")}
            className={`py-3 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-all cursor-pointer ${
              activeTab === "integracao"
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-brand-text/40 hover:text-brand-text/70"
            }`}
          >
            Integração & Layout
          </button>
          <button
            onClick={() => setActiveTab("destaques")}
            className={`py-3 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-all cursor-pointer ${
              activeTab === "destaques"
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-brand-text/40 hover:text-brand-text/70"
            }`}
          >
            Destaques Rápidos
          </button>
          <button
            onClick={() => setActiveTab("popups")}
            className={`py-3 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-all cursor-pointer ${
              activeTab === "popups"
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-brand-text/40 hover:text-brand-text/70"
            }`}
          >
            Pop-ups de Lead
          </button>
          <button
            onClick={() => setActiveTab("empresa")}
            className={`py-3 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-all cursor-pointer ${
              activeTab === "empresa"
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-brand-text/40 hover:text-brand-text/70"
            }`}
          >
            Dados da Concessionária
          </button>
        </div>

        {/* Tab Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 bg-brand-card border border-brand-card-border rounded-3xl">
            <span className="h-6 w-6 border-2 border-brand-primary/30 border-t-brand-primary rounded-full animate-spin" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-text/40">Carregando painel...</span>
          </div>
        ) : activeTab === "estoque" ? (
          // TABLE/LIST OF CAR CATEGORY OVERRIDES
          <div className="flex flex-col gap-4 animate-fadeIn">
            {/* Top Bar with Search & Reset */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-brand-card border border-brand-card-border rounded-2xl p-4 shadow-sm">
              <div className="relative w-full sm:max-w-xs">
                <input
                  type="text"
                  placeholder="BUSCAR NO ESTOQUE (EX: PORSCHE)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs uppercase font-thin tracking-wider outline-none focus:border-brand-primary transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-text/40 hover:text-brand-text text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                onClick={handlePurgeAllOverrides}
                className="w-full sm:w-auto h-9 bg-brand-card hover:bg-brand-bg text-brand-gold hover:text-brand-primary border border-brand-card-border hover:border-brand-primary/30 text-[10px] font-bold uppercase tracking-widest px-4 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
              >
                Redefinir Todos
              </button>
            </div>

            {/* Vehicles Listing */}
            <div className="flex flex-col gap-3">
              {filteredVehicles.length === 0 ? (
                <div className="text-center py-12 bg-brand-card border border-brand-card-border rounded-3xl">
                  <p className="text-xs text-brand-text/50 font-light">Nenhum veículo localizado para a busca informada.</p>
                </div>
              ) : (
                filteredVehicles.map((vehicle) => {
                  const hasLocalOverride = !!overrides[vehicle.id];
                  const currentTipo = overrides[vehicle.id]?.tipo ?? vehicle.tipo ?? "Hatch";
                  const currentPerfil = overrides[vehicle.id]?.perfil_uso ?? vehicle.perfil_uso ?? "URBANO & EFICIENTE";
                  const currentStatusTag = overrides[vehicle.id]?.status_tag ?? vehicle.status_tag ?? "";

                  return (
                    <div
                      key={vehicle.id}
                      className={`bg-brand-card border rounded-3xl p-5 shadow-sm transition-all duration-300 ${
                        hasLocalOverride ? "border-brand-primary/35" : "border-brand-card-border"
                      }`}
                    >
                      <div className="flex flex-col gap-4">
                        
                        {/* Row 1: Header (Info + Action Buttons) */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-brand-border/30 pb-3">
                          {/* Car Details info */}
                          <div className="flex items-center gap-3">
                            {/* Mini Thumbnail */}
                            <div className="h-12 w-16 bg-brand-bg rounded-lg overflow-hidden flex-shrink-0 border border-brand-border/60">
                              <img
                                src={vehicle.whatsapp_images[0] || "/logo.png"}
                                alt={vehicle.modelo}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[9px] font-bold text-brand-gold uppercase tracking-wider">
                                ID: {vehicle.id} {hasLocalOverride && "• PERSONALIZADO"}
                              </span>
                              <h3 className="text-sm font-bold text-brand-text uppercase leading-none">
                                {vehicle.marca} {vehicle.modelo}
                              </h3>
                              <p className="text-[10px] text-brand-text/50 leading-relaxed font-light">
                                {vehicle.versao} • {vehicle.ano} • R$ {vehicle.preco_original.toLocaleString("pt-BR")}
                              </p>
                            </div>
                          </div>

                          {/* Action CTA Buttons in header */}
                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                            <button
                              onClick={() => handleSaveVehicleOverride(vehicle.id)}
                              className="h-8.5 bg-brand-primary hover:bg-brand-primary-hover text-white text-[10px] font-bold uppercase tracking-widest px-4 rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1 shrink-0 shadow-sm"
                            >
                              {savedNotifications[vehicle.id] ? "Salvo! ✓" : "Salvar"}
                            </button>
                            
                            {hasLocalOverride && (
                              <button
                                onClick={() => handleResetVehicleOverride(vehicle.id)}
                                className="h-8.5 bg-brand-bg border border-brand-card-border hover:border-brand-primary/30 text-brand-text/60 hover:text-brand-primary text-[10px] font-bold uppercase tracking-widest px-3 rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center shrink-0"
                                title="Reverter para originais"
                              >
                                Reverter
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Row 2: Overrides Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5 w-full">
                          {/* Body Type (Carroceria) Select */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[8px] font-bold text-brand-text/40 uppercase tracking-widest pl-1">
                              Carroceria
                            </label>
                            <select
                              value={currentTipo}
                              onChange={(e) => handleOverrideChange(vehicle.id, "tipo", e.target.value)}
                              className="bg-brand-bg text-brand-text border border-brand-card-border rounded-xl px-3 py-2 text-[11px] font-medium outline-none focus:border-brand-primary cursor-pointer w-full"
                            >
                              {bodyTypes.map((t) => (
                                <option key={t} value={t}>
                                  {t.toUpperCase()}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Profile Use (Estilo) Select */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[8px] font-bold text-brand-text/40 uppercase tracking-widest pl-1">
                              Estilo de Vida
                            </label>
                            <select
                              value={currentPerfil}
                              onChange={(e) => handleOverrideChange(vehicle.id, "perfil_uso", e.target.value)}
                              className="bg-brand-bg text-brand-text border border-brand-card-border rounded-xl px-3 py-2 text-[11px] font-medium outline-none focus:border-brand-primary cursor-pointer w-full"
                            >
                              {usageProfiles.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Status Tag (Custom Tag) Text Input */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[8px] font-bold text-brand-text/40 uppercase tracking-widest pl-1">
                              Tag de Destaque
                            </label>
                            <input
                              type="text"
                              placeholder="EX: ÚNICO DONO"
                              value={currentStatusTag}
                              onChange={(e) => handleOverrideChange(vehicle.id, "status_tag", e.target.value)}
                              className="bg-brand-bg text-brand-text border border-brand-card-border rounded-xl px-3 py-2 text-[11px] font-medium outline-none focus:border-brand-primary placeholder-brand-text/30 uppercase tracking-wider w-full"
                            />
                          </div>

                          {/* Status Tag Color Select */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[8px] font-bold text-brand-text/40 uppercase tracking-widest pl-1">
                              Cor da Tag
                            </label>
                            <select
                              value={overrides[vehicle.id]?.status_tag_color ?? vehicle.status_tag_color ?? "green"}
                              onChange={(e) => handleOverrideChange(vehicle.id, "status_tag_color", e.target.value)}
                              className="bg-brand-bg text-brand-text border border-brand-card-border rounded-xl px-3 py-2 text-[11px] font-medium outline-none focus:border-brand-primary cursor-pointer w-full"
                            >
                              <option value="green">VERDE</option>
                              <option value="red">VERMELHO</option>
                              <option value="primary">PALETA PRINCIPAL</option>
                              <option value="gold">PALETA OURO</option>
                              <option value="gray">CINZA</option>
                            </select>
                          </div>

                          {/* Sold status select */}
                          <div className="flex flex-col gap-1.5 col-span-2 sm:col-span-1">
                            <label className="text-[8px] font-bold text-brand-text/40 uppercase tracking-widest pl-1">
                              Disponibilidade
                            </label>
                            <select
                              value={overrides[vehicle.id]?.vendido ? "true" : "false"}
                              onChange={(e) => handleOverrideChange(vehicle.id, "vendido", e.target.value === "true")}
                              className="bg-brand-bg text-brand-text border border-brand-card-border rounded-xl px-3 py-2 text-[11px] font-medium outline-none focus:border-brand-primary cursor-pointer w-full"
                            >
                              <option value="false">DISPONÍVEL</option>
                              <option value="true">VENDIDO</option>
                            </select>
                          </div>
                        </div>
                        
                        {/* Descrição de SEO / Editorial */}
                        <div className="flex flex-col gap-1.5 w-full">
                          <label className="text-[8px] font-bold text-brand-text/40 uppercase tracking-widest pl-1">
                            Descrição de SEO / Editorial (Salva diretamente no banco de dados)
                          </label>
                          <textarea
                            rows={3}
                            value={overrides[vehicle.id]?.descricao ?? vehicle.descricao ?? ""}
                            onChange={(e) => handleOverrideChange(vehicle.id, "descricao", e.target.value)}
                            placeholder="Escreva uma descrição atraente, com quebras de linha e otimizada para o Google..."
                            className="bg-brand-bg text-brand-text border border-brand-card-border rounded-xl px-3.5 py-2.5 text-[11px] font-medium outline-none focus:border-brand-primary placeholder-brand-text/30 w-full resize-y font-sans leading-relaxed"
                          />
                        </div>

                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : activeTab === "integracao" ? (
          // WEBHOOK & THEME INTEGRATIONS
          <div className="flex flex-col gap-6 animate-fadeIn">
            
            {/* Webhook Settings Section */}
            <div className="bg-brand-card border border-brand-card-border rounded-3xl p-6 shadow-sm">
              <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest">
                CONEXÃO E INTEGRAÇÃO DE SDR
              </span>
              <h2 className="text-lg font-bold text-brand-text mb-2 uppercase">
                WEBHOOK GERAL DE LEADS
              </h2>
              <p className="text-xs text-brand-text/50 mb-4 font-light leading-relaxed">
                Configure a URL de destino para os envios de formulário de contato do site. Leads capturados serão transmitidos instantaneamente para a automação no n8n.
              </p>

              <form onSubmit={handleSaveWebhook} className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="webhook-input" className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                    URL do Webhook (n8n / Make / Custom)
                  </label>
                  <input
                    id="webhook-input"
                    type="url"
                    required
                    placeholder="https://n8n.dominio.com/webhook/..."
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary font-mono transition-all"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="h-10 bg-brand-primary hover:bg-brand-primary-hover text-white text-[10px] font-bold uppercase tracking-widest px-5 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
                  >
                    {webhookStatus === "saved" ? "WEBHOOK SALVO ✓" : "SALVAR WEBHOOK"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const fallbackUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_LEAD_URL || "https://n8n.v2o5.com.br/webhook/lead-entrada";
                      setWebhookUrl(fallbackUrl);
                      localStorage.setItem("ag_webhook_url", fallbackUrl);
                      alert("Webhook redefinido para o padrão com sucesso!");
                    }}
                    className="h-10 bg-brand-bg border border-brand-card-border text-brand-text/60 text-[10px] font-bold uppercase tracking-widest px-4 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
                  >
                    Restaurar Padrão
                  </button>
                </div>
              </form>
            </div>

            {/* Webhook Avaliação Settings Section */}
            <div className="bg-brand-card border border-brand-card-border rounded-3xl p-6 shadow-sm">
              <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest">
                AVALIAÇÃO DE VEÍCULOS
              </span>
              <h2 className="text-lg font-bold text-brand-text mb-2 uppercase">
                WEBHOOK DE AVALIAÇÃO (APPRAISAL)
              </h2>
              <p className="text-xs text-brand-text/50 mb-4 font-light leading-relaxed">
                Configure a URL de destino exclusiva para os envios de leads de auto-avaliação do site. Leads de avaliação serão transmitidos de forma isolada no n8n.
              </p>

              <form onSubmit={handleSaveWebhookAvaliacao} className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="webhook-avaliacao-input" className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                    URL do Webhook de Avaliação (n8n / Make / Custom)
                  </label>
                  <input
                    id="webhook-avaliacao-input"
                    type="url"
                    required
                    placeholder="https://n8n.dominio.com/webhook/..."
                    value={webhookAvaliacaoUrl}
                    onChange={(e) => setWebhookAvaliacaoUrl(e.target.value)}
                    className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary font-mono transition-all"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="h-10 bg-brand-primary hover:bg-brand-primary-hover text-white text-[10px] font-bold uppercase tracking-widest px-5 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
                  >
                    {webhookAvaliacaoStatus === "saved" ? "WEBHOOK DE AVALIAÇÃO SALVO ✓" : "SALVAR WEBHOOK DE AVALIAÇÃO"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const fallbackUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_AVALIACAO_URL || "https://n8n.v2o5.com.br/webhook/sdr-captura-lead";
                      setWebhookAvaliacaoUrl(fallbackUrl);
                      localStorage.setItem("ag_webhook_avaliacao_url", fallbackUrl);
                      alert("Webhook de avaliação redefinido para o padrão com sucesso!");
                    }}
                    className="h-10 bg-brand-bg border border-brand-card-border text-brand-text/60 text-[10px] font-bold uppercase tracking-widest px-4 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
                  >
                    Restaurar Padrão
                  </button>
                </div>
              </form>
            </div>

            {/* Layout Aesthetics & Dynamic Presets Selector */}
            <div className="bg-brand-card border border-brand-card-border rounded-3xl p-6 shadow-sm">
              <span className="text-[9px] font-bold text-brand-primary uppercase tracking-widest">
                PERSONALIZAÇÃO DE MARCA
              </span>
              <h2 className="text-lg font-bold text-brand-text mb-2 uppercase">
                ESTILO E CORES DO PORTAL
              </h2>
              <p className="text-xs text-brand-text/50 mb-4 font-light leading-relaxed">
                Alterne os temas visuais da Motors Store. A paleta do portal inteiro é controlada dinamicamente com base nas opções de curadoria selecionadas.
              </p>

              {/* Grid Preview Palettes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                {[
                  {
                    id: "luxury-light",
                    name: "Luxury Laranja Claro",
                    colors: ["#fafafc", "#C83F00", "#1a1a23"],
                    bgClass: "bg-[#fafafc] border border-gray-200",
                    textClass: "text-[#1a1a23]",
                    primaryHex: "#C83F00",
                  },
                  {
                    id: "stealth-dark",
                    name: "Stealth Carbon Dark",
                    colors: ["#09090B", "#D4AF37", "#14141B"],
                    bgClass: "bg-[#09090B] border border-neutral-800",
                    textClass: "text-[#fafafc]",
                    primaryHex: "#D4AF37",
                  },
                  {
                    id: "sport-nardo",
                    name: "Sport Nardo Red",
                    colors: ["#1A1D20", "#E30613", "#272B30"],
                    bgClass: "bg-[#1A1D20] border border-neutral-700",
                    textClass: "text-white",
                    primaryHex: "#E30613",
                  },
                ].map((preset) => {
                  const isActive = theme === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => setTheme(preset.id as ThemeType)}
                      className={`text-left p-4 rounded-2xl flex flex-col gap-3 transition-all duration-300 active:scale-98 cursor-pointer ${
                        preset.bgClass
                      } ${
                        isActive
                          ? "ring-2 ring-brand-primary ring-offset-2 ring-offset-brand-bg shadow-md"
                          : "opacity-60 hover:opacity-100"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${preset.textClass}`}>
                          {preset.name}
                        </span>
                        {isActive && (
                          <span className="text-[9px] text-brand-primary font-bold">✓</span>
                        )}
                      </div>
                      
                      {/* Swatch dots */}
                      <div className="flex items-center gap-1.5">
                        {preset.colors.map((c, i) => (
                          <span
                            key={i}
                            className="h-4.5 w-4.5 rounded-full border border-black/10 flex-shrink-0"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      
                      {/* Color Preview Block */}
                      <div
                        className="h-4 w-full rounded-md"
                        style={{ backgroundColor: preset.primaryHex }}
                      />
                    </button>
                  );
                })}
              </div>

              {/* Color Block Preview (Real time CSS styles) */}
              <div className="border border-brand-border bg-brand-bg/60 p-5 rounded-2xl flex flex-col gap-3">
                <span className="text-[8px] font-bold text-brand-text/40 uppercase tracking-widest">
                  Visualização do Design System em Tempo Real
                </span>
                <div className="flex items-center gap-3">
                  <div className="h-8 px-4 bg-brand-primary text-white rounded-lg flex items-center justify-center text-[10px] font-bold uppercase tracking-widest shadow-sm">
                    Botão Primário
                  </div>
                  <div className="h-8 px-4 bg-brand-card border border-brand-card-border text-brand-text/80 rounded-lg flex items-center justify-center text-[10px] font-bold uppercase tracking-widest shadow-sm">
                    Botão Secundário
                  </div>
                  <div className="h-8 px-4 text-brand-gold font-bold text-[10px] uppercase tracking-widest flex items-center">
                    Texto Gold
                  </div>
                </div>
                <div className="text-[10px] text-brand-text/40 leading-relaxed font-light">
                  A cor primária do seu portal atual é <span className="font-mono text-brand-primary font-bold">{theme === "luxury-light" ? "#C83F00" : theme === "stealth-dark" ? "#D4AF37" : "#E30613"}</span>.
                </div>
              </div>
            </div>

            {/* Featured Carousel Configuration Section */}
            <div className="bg-brand-card border border-brand-card-border rounded-3xl p-6 shadow-sm mt-6">
              <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest">
                Curadoria de Destaques
              </span>
              <h2 className="text-lg font-bold text-brand-text mb-2 uppercase">
                Veículos do Carrossel de Topo
              </h2>
              <p className="text-xs text-brand-text/50 mb-4 font-light leading-relaxed">
                Selecione os veículos que serão exibidos no carrossel de topo (Hero Banner) na página inicial. Se nenhum veículo for selecionado, os 3 primeiros carros do estoque serão exibidos automaticamente.
              </p>

              <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto border border-brand-border bg-brand-bg/60 p-4 rounded-2xl mb-4">
                {vehicles.map((vehicle) => {
                  const isChecked = carouselVehicleIds.includes(vehicle.id);
                  return (
                    <label
                      key={vehicle.id}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                        isChecked 
                          ? "bg-brand-primary/10 border-brand-primary/30" 
                          : "bg-brand-card border-brand-card-border hover:border-brand-primary/20"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setCarouselVehicleIds(prev => {
                              const next = prev.includes(vehicle.id)
                                ? prev.filter(id => id !== vehicle.id)
                                : [...prev, vehicle.id];
                              localStorage.setItem("ag_carousel_vehicles", JSON.stringify(next));
                              console.log(`[Carousel Configuration] Destaques atualizados:`, next);
                              return next;
                            });
                          }}
                          className="h-4 w-4 rounded border-brand-border text-brand-primary focus:ring-brand-primary"
                        />
                        <div className="flex items-center gap-2">
                          <img
                            src={vehicle.whatsapp_images[0] || "/logo.png"}
                            alt={vehicle.modelo}
                            className="h-8 w-12 object-cover rounded"
                          />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-brand-text uppercase leading-none">
                              {vehicle.marca} {vehicle.modelo}
                            </span>
                            <span className="text-[9px] text-brand-text/50 uppercase leading-none mt-1">
                              {vehicle.versao} • {vehicle.ano}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-extrabold text-brand-primary">
                        R$ {vehicle.preco_original.toLocaleString("pt-BR")}
                      </span>
                    </label>
                  );
                })}
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-brand-text/50 uppercase">
                  {carouselVehicleIds.length} veículo(s) selecionado(s)
                </span>
                {carouselVehicleIds.length > 0 && (
                  <button
                    onClick={() => {
                      setCarouselVehicleIds([]);
                      localStorage.removeItem("ag_carousel_vehicles");
                      alert("Destaques do carrossel redefinidos para o padrão.");
                    }}
                    className="h-8 bg-brand-bg border border-brand-card-border text-brand-text/60 text-[9px] font-bold uppercase tracking-widest px-3 rounded-lg active:scale-95 transition-all cursor-pointer"
                  >
                    Limpar Seleção
                  </button>
                )}
              </div>
            </div>

          </div>
        ) : activeTab === "destaques" ? (
          // DESTAQUES RÁPIDOS CRUD
          <div className="flex flex-col gap-6 animate-fadeIn">
            <div className="bg-brand-card border border-brand-card-border rounded-3xl p-6 shadow-sm">
              <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest">
                Gerenciador de Tags de Destaque
              </span>
              <h2 className="text-lg font-bold text-brand-text mb-2 uppercase">
                Categorias de Destaques Rápidos
              </h2>
              <p className="text-xs text-brand-text/50 mb-6 font-light leading-relaxed">
                Adicione, remova ou modifique as categorias rápidas de filtragem que aparecem no console principal da página inicial do portal.
              </p>

              {/* Edit/Create Form */}
              {(editingQuickTag || isCreatingQuickTag) && (
                <div className="bg-brand-bg/60 border border-brand-border p-5 rounded-2xl mb-6 flex flex-col gap-4">
                  <h3 className="text-xs font-bold text-brand-text uppercase tracking-wider">
                    {isCreatingQuickTag ? "Criar Novo Destaque" : `Editar Destaque: ${editingQuickTag?.name}`}
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">Nome da Categoria</label>
                      <input
                        type="text"
                        placeholder="EX: SUPER ESPORTIVOS"
                        value={editingQuickTag?.name || ""}
                        onChange={(e) => setEditingQuickTag(prev => prev ? { ...prev, name: e.target.value } : { id: "custom-" + Date.now(), name: e.target.value, field: "tipo", operator: "equals", value: "" })}
                        className="bg-brand-card border border-brand-border rounded-xl text-xs text-brand-text px-3 h-10 w-full placeholder-brand-text/30 uppercase"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">Campo Mapeado</label>
                      <select
                        value={editingQuickTag?.field || "tipo"}
                        onChange={(e) => setEditingQuickTag(prev => prev ? { ...prev, field: e.target.value as any } : null)}
                        className="bg-brand-card border border-brand-border rounded-xl text-xs text-brand-text px-3 h-10 w-full cursor-pointer"
                      >
                        <option value="tipo">Carroceria (Tipo)</option>
                        <option value="perfil_uso">Estilo de Vida (Perfil de Uso)</option>
                        <option value="preco">Preço de Venda</option>
                        <option value="quilometragem">Quilometragem</option>
                        <option value="marca">Marca (Fabricante)</option>
                        <option value="combustivel">Combustível</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">Operador de Regra</label>
                      <select
                        value={editingQuickTag?.operator || "equals"}
                        onChange={(e) => setEditingQuickTag(prev => prev ? { ...prev, operator: e.target.value as any } : null)}
                        className="bg-brand-card border border-brand-border rounded-xl text-xs text-brand-text px-3 h-10 w-full cursor-pointer"
                      >
                        <option value="equals">Igual a</option>
                        <option value="contains">Contém Texto</option>
                        <option value="less">Menor que (&lt;)</option>
                        <option value="greater">Maior que (&gt;)</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">Valor Mapeado</label>
                      <input
                        type="text"
                        placeholder="EX: ESPORTIVO ou 150000"
                        value={editingQuickTag?.value || ""}
                        onChange={(e) => setEditingQuickTag(prev => prev ? { ...prev, value: e.target.value } : null)}
                        className="bg-brand-card border border-brand-border rounded-xl text-xs text-brand-text px-3 h-10 w-full placeholder-brand-text/30"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={() => {
                        setEditingQuickTag(null);
                        setIsCreatingQuickTag(false);
                      }}
                      className="h-9 bg-brand-card border border-brand-border text-brand-text/60 text-[10px] font-bold uppercase tracking-widest px-4 rounded-xl active:scale-95 transition-all cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (!editingQuickTag?.name.trim() || !editingQuickTag?.value.trim()) {
                          alert("Preencha todos os campos corretamente.");
                          return;
                        }
                        
                        setQuickTags(prev => {
                          const exists = prev.some(t => t.id === editingQuickTag.id);
                          const next = exists
                            ? prev.map(t => t.id === editingQuickTag.id ? editingQuickTag : t)
                            : [...prev, editingQuickTag];
                          localStorage.setItem("ag_quick_tags", JSON.stringify(next));
                          return next;
                        });
                        
                        setEditingQuickTag(null);
                        setIsCreatingQuickTag(false);
                      }}
                      className="h-9 bg-brand-primary text-white text-[10px] font-bold uppercase tracking-widest px-5 rounded-xl active:scale-95 transition-all cursor-pointer"
                    >
                      Salvar Regra
                    </button>
                  </div>
                </div>
              )}

              {/* List of current quick tags */}
              <div className="flex flex-col gap-3">
                {quickTags.map((tag) => (
                  <div key={tag.id} className="flex items-center justify-between p-4 bg-brand-bg/60 border border-brand-border rounded-2xl">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-brand-gold uppercase tracking-wider">{tag.name}</span>
                      <span className="text-[9px] text-brand-text/50 font-mono">
                        Regra: {tag.field} {tag.operator} &ldquo;{tag.value}&rdquo;
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingQuickTag({ ...tag });
                          setIsCreatingQuickTag(false);
                        }}
                        className="h-8 bg-brand-card border border-brand-border hover:border-brand-primary/30 text-brand-text/60 hover:text-brand-primary text-[9px] font-bold uppercase tracking-widest px-3 rounded-lg active:scale-95 transition-all cursor-pointer"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Deseja realmente remover o destaque rápido "${tag.name}"?`)) {
                            setQuickTags(prev => {
                              const next = prev.filter(t => t.id !== tag.id);
                              localStorage.setItem("ag_quick_tags", JSON.stringify(next));
                              return next;
                            });
                          }
                        }}
                        className="h-8 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 text-[9px] font-bold uppercase tracking-widest px-3 rounded-lg active:scale-95 transition-all cursor-pointer"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {!isCreatingQuickTag && !editingQuickTag && (
                <button
                  onClick={() => {
                    setEditingQuickTag({
                      id: "quick-tag-" + Date.now(),
                      name: "",
                      field: "tipo",
                      operator: "equals",
                      value: ""
                    });
                    setIsCreatingQuickTag(true);
                  }}
                  className="mt-6 w-full h-11 bg-brand-primary hover:bg-brand-primary-hover text-white text-[10px] font-bold uppercase tracking-widest rounded-xl active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  Criar Nova Categoria de Destaque
                </button>
              )}
            </div>
          </div>
        ) : activeTab === "popups" ? (
          // POPUPS CAMPAIGNS CONFIGURATION
          <div className="flex flex-col gap-6 animate-fadeIn">
            {/* Global parameters card */}
            <div className="bg-brand-card border border-brand-card-border rounded-3xl p-6 shadow-sm">
              <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest">
                GATILHOS E COMPORTAMENTO
              </span>
              <h2 className="text-lg font-bold text-brand-text mb-2 uppercase">
                MOTOR DE CAMPANHAS DE POP-UP
              </h2>
              <p className="text-xs text-brand-text/50 mb-6 font-light leading-relaxed">
                Configure as diretrizes globais do sistema de pop-ups e gerencie campanhas comportamentais direcionadas para maximizar a conversão.
              </p>

              <form onSubmit={handleSavePopupSettings} className="flex flex-col gap-6">
                
                {/* Global Toggle */}
                <div className="flex items-center justify-between p-4 bg-brand-bg/60 border border-brand-border rounded-2xl">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-brand-text uppercase">Ativar Sistema de Pop-ups</span>
                    <span className="text-[10px] text-brand-text/40 font-light">Se desativado, nenhuma campanha será exibida aos usuários.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPopupSettings(prev => ({ ...prev, enabled: !prev.enabled }))}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      popupSettings.enabled ? "bg-brand-primary" : "bg-neutral-800"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        popupSettings.enabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* WhatsApp Number */}
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                      Número do WhatsApp Destinatário (Código do País + DDD + Número)
                    </label>
                    <input
                      type="text"
                      value={popupSettings.whatsappNumber}
                      onChange={(e) => setPopupSettings(prev => ({ ...prev, whatsappNumber: e.target.value }))}
                      placeholder="Ex: 554198089550"
                      className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all font-mono"
                    />
                  </div>

                  {/* Cooldown Hours */}
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                      Período de Silêncio/Cooldown Geral (Horas entre exibições por cliente)
                    </label>
                    <input
                      type="number"
                      value={popupSettings.cooldownHours}
                      onChange={(e) => setPopupSettings(prev => ({ ...prev, cooldownHours: parseInt(e.target.value) || 0 }))}
                      className="w-full p-3.5 bg-brand-bg text-brand-text border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all"
                    />
                  </div>
                </div>

                {/* Save Global Settings */}
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="h-10 bg-brand-primary hover:bg-brand-primary-hover text-white text-[10px] font-bold uppercase tracking-widest px-5 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
                  >
                    {popupStatus === "saved" ? "CONFIGURAÇÕES SALVAS ✓" : "SALVAR DIRETRIZES"}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetPopupSettings}
                    className="h-10 bg-brand-bg border border-brand-card-border text-brand-text/60 text-[10px] font-bold uppercase tracking-widest px-4 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
                  >
                    Restaurar Padrões
                  </button>
                </div>
              </form>
            </div>

            {/* Campaign Creator and Manager view */}
            <div className="bg-brand-card border border-brand-card-border rounded-3xl p-6 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-brand-border/60 pb-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest">CAMPANHAS ATIVAS</span>
                  <h3 className="text-base font-bold text-brand-text">GERENCIAR CAMPANHAS</h3>
                </div>
                {!isCreating && !editingCampaign && (
                  <button
                    onClick={() => {
                      setIsCreating(true);
                      setEditingCampaign({
                        id: `camp-${Date.now()}`,
                        name: "Nova Campanha de Pop-up",
                        enabled: true,
                        targetPage: "home",
                        triggerType: "time",
                        delaySeconds: 30,
                        actionType: "whatsapp",
                        actionTarget: "Olá! Vi a condição especial no site e gostaria de falar com um especialista agora! (Ref: {ref})",
                        icon: "🔥",
                        title: "TÍTULO DA CAMPANHA",
                        subtitle: "Descrição sutil e engajadora que aparecerá no pop-up para direcionar a ação do lead.",
                        ctaText: "FALAR COM ESPECIALISTA AGORA"
                      });
                    }}
                    className="h-9 bg-brand-primary hover:bg-brand-primary-hover text-white text-[10px] font-bold uppercase tracking-widest px-4 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    + Criar Campanha
                  </button>
                )}
              </div>

              {/* Campaign Edit Form */}
              {(isCreating || editingCampaign) && editingCampaign && (
                <div className="bg-brand-bg/60 border border-brand-border p-5 rounded-2xl flex flex-col gap-4 animate-scaleUp">
                  <h4 className="text-xs font-bold text-brand-primary uppercase">
                    {isCreating ? "Criar Nova Campanha" : `Editar Campanha: ${editingCampaign.name}`}
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Name */}
                    <div className="flex flex-col gap-1.5 col-span-2">
                      <label className="text-[9px] font-bold text-brand-text/50 uppercase">Nome Interno da Campanha</label>
                      <input
                        type="text"
                        value={editingCampaign.name}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, name: e.target.value })}
                        className="w-full p-3 bg-brand-bg text-brand-text border border-brand-card-border rounded-lg text-xs outline-none focus:border-brand-primary"
                      />
                    </div>

                    {/* Icon */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-brand-text/50 uppercase">Emoji / Ícone</label>
                      <input
                        type="text"
                        value={editingCampaign.icon}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, icon: e.target.value })}
                        placeholder="Ex: 🔥, 🤖, 📊"
                        className="w-full p-3 bg-brand-bg text-brand-text border border-brand-card-border rounded-lg text-xs outline-none focus:border-brand-primary"
                      />
                    </div>

                     {/* Target Page */}
                     <div className="flex flex-col gap-1.5">
                       <label className="text-[9px] font-bold text-brand-text/50 uppercase">Segmentação de Página</label>
                       <select
                         value={editingCampaign.targetPage}
                         onChange={(e) => setEditingCampaign({ 
                           ...editingCampaign, 
                           targetPage: e.target.value as any,
                           targetVehicleId: e.target.value === "specific" ? (editingCampaign.targetVehicleId || "") : undefined
                         })}
                         className="w-full p-3 bg-brand-bg text-brand-text border border-brand-card-border rounded-lg text-xs outline-none focus:border-brand-primary"
                       >
                         <option value="home">Apenas na Página Inicial (Home)</option>
                         <option value="pdp">Apenas nas Fichas de Carros (PDP Geral)</option>
                         <option value="specific">Apenas em um Veículo Específico</option>
                         <option value="any">Em Qualquer Página</option>
                       </select>
                     </div>

                     {/* Specific Vehicle Target Selector */}
                     {editingCampaign.targetPage === "specific" && (
                       <div className="flex flex-col gap-1.5 col-span-2">
                         <label className="text-[9px] font-bold text-brand-text/50 uppercase">
                           Veículo de Destino Especial
                         </label>
                         <select
                           value={editingCampaign.targetVehicleId || ""}
                           onChange={(e) => setEditingCampaign({ ...editingCampaign, targetVehicleId: e.target.value })}
                           className="w-full p-3 bg-brand-bg text-brand-text border border-brand-card-border rounded-lg text-xs outline-none focus:border-brand-primary cursor-pointer"
                         >
                           <option value="">Selecione o veículo...</option>
                           {vehicles.map((v) => (
                             <option key={v.id} value={v.id}>
                               {v.marca.toUpperCase()} {v.modelo.toUpperCase()} ({v.ano}) - R$ {v.preco_promocional > 0 ? v.preco_promocional.toLocaleString("pt-BR") : v.preco_original.toLocaleString("pt-BR")} [{v.id}]
                             </option>
                           ))}
                         </select>
                         <span className="text-[9px] text-brand-text/30">
                           Esta campanha será exibida com exclusividade apenas na ficha técnica (PDP) do veículo selecionado acima.
                         </span>
                       </div>
                     )}

                    {/* Trigger Type */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-brand-text/50 uppercase">Gatilho (Trigger)</label>
                      <select
                        value={editingCampaign.triggerType}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, triggerType: e.target.value as any })}
                        className="w-full p-3 bg-brand-bg text-brand-text border border-brand-card-border rounded-lg text-xs outline-none focus:border-brand-primary"
                      >
                        <option value="time">Por Tempo de Permanência</option>
                        <option value="exit">Por Intenção de Saída (Exit Intent)</option>
                      </select>
                    </div>

                    {/* Delay seconds */}
                    {editingCampaign.triggerType === "time" && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-brand-text/50 uppercase">Delay de Exibição (Segundos)</label>
                        <input
                          type="number"
                          value={editingCampaign.delaySeconds}
                          onChange={(e) => setEditingCampaign({ ...editingCampaign, delaySeconds: parseInt(e.target.value) || 0 })}
                          className="w-full p-3 bg-brand-bg text-brand-text border border-brand-card-border rounded-lg text-xs outline-none focus:border-brand-primary"
                        />
                      </div>
                    )}

                    {/* Action Type */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-brand-text/50 uppercase">Ação ao Clicar (CTA)</label>
                      <select
                        value={editingCampaign.actionType}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, actionType: e.target.value as any })}
                        className="w-full p-3 bg-brand-bg text-brand-text border border-brand-card-border rounded-lg text-xs outline-none focus:border-brand-primary"
                      >
                        <option value="whatsapp">💬 Enviar mensagem no WhatsApp</option>
                        <option value="link">🔗 Redirecionar para link interno</option>
                        <option value="compare">📊 Abrir matriz comparativa de carros</option>
                      </select>
                    </div>

                    {/* Action Target (WhatsApp text template or target URL link) */}
                    {editingCampaign.actionType !== "compare" && (
                      <div className="flex flex-col gap-1.5 col-span-2">
                        <label className="text-[9px] font-bold text-brand-text/50 uppercase">
                          {editingCampaign.actionType === "whatsapp" 
                            ? "Template de Mensagem do WhatsApp" 
                            : "Endereço de destino (Link / Âncora)"}
                        </label>
                        <textarea
                          value={editingCampaign.actionTarget}
                          onChange={(e) => setEditingCampaign({ ...editingCampaign, actionTarget: e.target.value })}
                          rows={2}
                          placeholder={editingCampaign.actionType === "whatsapp" ? "Ex: Olá! Gostaria de mais informações..." : "Ex: /#avaliacao-express"}
                          className="w-full p-3 bg-brand-bg text-brand-text border border-brand-card-border rounded-lg text-xs outline-none focus:border-brand-primary resize-none font-mono"
                        />
                        {editingCampaign.actionType === "whatsapp" && (
                          <span className="text-[9px] text-brand-text/30">Suporta placeholders: {"{ref}"} (Lead ID), {"{carro}"} (Veículo PDP), {"{preco}"} (Preço PDP).</span>
                        )}
                        {editingCampaign.actionType === "link" && (
                          <span className="text-[9px] text-brand-text/30">Dica: use links como `/#avaliacao-express` ou `/#match-garagem` para rolar até as ferramentas.</span>
                        )}
                      </div>
                    )}

                    {/* Header/Title */}
                    <div className="flex flex-col gap-1.5 col-span-2">
                      <label className="text-[9px] font-bold text-brand-text/50 uppercase">Título do Pop-up (Visual)</label>
                      <input
                        type="text"
                        value={editingCampaign.title}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, title: e.target.value })}
                        className="w-full p-3 bg-brand-bg text-brand-text border border-brand-card-border rounded-lg text-xs outline-none focus:border-brand-primary"
                      />
                    </div>

                    {/* Subtitle */}
                    <div className="flex flex-col gap-1.5 col-span-2">
                      <label className="text-[9px] font-bold text-brand-text/50 uppercase">Subtítulo do Pop-up (Descrição)</label>
                      <textarea
                        value={editingCampaign.subtitle}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, subtitle: e.target.value })}
                        rows={2}
                        className="w-full p-3 bg-brand-bg text-brand-text border border-brand-card-border rounded-lg text-xs outline-none focus:border-brand-primary resize-none"
                      />
                    </div>

                    {/* CTA Text */}
                    <div className="flex flex-col gap-1.5 col-span-2">
                      <label className="text-[9px] font-bold text-brand-text/50 uppercase">Texto do Botão CTA</label>
                      <input
                        type="text"
                        value={editingCampaign.ctaText}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, ctaText: e.target.value })}
                        className="w-full p-3 bg-brand-bg text-brand-text border border-brand-card-border rounded-lg text-xs outline-none focus:border-brand-primary"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => handleSaveCampaign(editingCampaign)}
                      className="h-10 bg-brand-primary hover:bg-brand-primary-hover text-white text-[10px] font-bold uppercase tracking-widest px-4 rounded-lg transition-all active:scale-95 cursor-pointer"
                    >
                      Salvar Campanha
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCampaign(null);
                        setIsCreating(false);
                      }}
                      className="h-10 bg-brand-bg border border-brand-border text-brand-text/60 hover:text-brand-primary text-[10px] font-bold uppercase tracking-widest px-4 rounded-lg transition-all active:scale-95 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* List campaigns */}
              <div className="flex flex-col gap-3 mt-2">
                {campaigns.length === 0 ? (
                  <div className="text-center py-8 bg-brand-bg/40 border border-brand-border rounded-2xl">
                    <p className="text-xs text-brand-text/50 font-light">Nenhuma campanha cadastrada no momento.</p>
                  </div>
                ) : (
                  campaigns.map((camp) => (
                    <div
                      key={camp.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-brand-bg/40 border rounded-2xl gap-4 transition-all ${
                        camp.enabled ? "border-brand-border" : "border-brand-border/30 opacity-60"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-xl pt-0.5">{camp.icon}</span>
                        <div className="flex flex-col gap-0.5">
                          <h4 className="text-xs font-bold text-brand-text uppercase leading-none">
                            {camp.name} {!camp.enabled && " (INATIVA)"}
                          </h4>
                          <span className="text-[8px] font-bold text-brand-gold uppercase tracking-wider">
                            PÁGINA: {camp.targetPage === "specific" ? `VEÍCULO (${camp.targetVehicleId})` : camp.targetPage.toUpperCase()} • TRIGGER: {camp.triggerType.toUpperCase()}
                            {camp.triggerType === "time" && ` (${camp.delaySeconds}s)`} • AÇÃO: {camp.actionType.toUpperCase()}
                          </span>
                          <p className="text-[10px] text-brand-text/50 font-light mt-1 max-w-md">{camp.title}: {camp.subtitle}</p>
                        </div>
                      </div>

                      {/* Action controllers */}
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        {/* Toggle active */}
                        <button
                          onClick={() => handleToggleCampaign(camp.id)}
                          className={`h-8 px-3 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all cursor-pointer ${
                            camp.enabled
                              ? "bg-brand-primary/10 text-brand-primary border border-brand-primary/20 hover:bg-brand-primary/20"
                              : "bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-white"
                          }`}
                        >
                          {camp.enabled ? "Desativar" : "Ativar"}
                        </button>

                        {/* Edit */}
                        <button
                          onClick={() => {
                            setIsCreating(false);
                            setEditingCampaign(camp);
                          }}
                          className="h-8 bg-brand-bg border border-brand-border hover:border-brand-primary/30 text-brand-text/60 hover:text-brand-primary text-[9px] font-bold uppercase tracking-widest px-3 rounded-lg transition-all cursor-pointer"
                        >
                          Editar
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => handleDeleteCampaign(camp.id)}
                          className="h-8 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[9px] font-bold uppercase tracking-widest px-2.5 rounded-lg border border-red-500/20 transition-all cursor-pointer"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : activeTab === "empresa" ? (
          <div className="flex flex-col gap-6 animate-fadeIn">
            {/* Company Settings Section */}
            <div className="bg-brand-card border border-brand-card-border rounded-3xl p-6 shadow-sm">
              <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest">
                Identidade & Atendimento
              </span>
              <h2 className="text-lg font-bold text-brand-text mb-2 uppercase">
                DADOS DA CONCESSIONÁRIA
              </h2>
              <p className="text-xs text-brand-text/50 mb-6 font-light leading-relaxed">
                Configure as informações básicas da sua empresa. Esses dados serão exibidos de forma dinâmica em todo o portal (rodapé, cabeçalho, formulários, botões de WhatsApp e PDPs).
              </p>

              <form onSubmit={handleSaveCompanySettings} className="flex flex-col gap-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Company Name */}
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                      Nome Comercial da Concessionária
                    </label>
                    <input
                      type="text"
                      required
                      value={companyForm.name}
                      onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                      placeholder="Motors Store"
                      className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all"
                    />
                  </div>

                  {/* Phone */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                      Telefone Comercial / Fixo
                    </label>
                    <input
                      type="text"
                      required
                      value={companyForm.phone}
                      onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                      placeholder="(11) 4003-0000"
                      className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all"
                    />
                  </div>

                  {/* CNPJ */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                      CNPJ
                    </label>
                    <input
                      type="text"
                      value={companyForm.cnpj}
                      onChange={(e) => setCompanyForm({ ...companyForm, cnpj: e.target.value })}
                      placeholder="12.345.678/0001-99"
                      className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all font-mono"
                    />
                  </div>

                  {/* WhatsApp Formatted */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                      WhatsApp (Exibição Formatada)
                    </label>
                    <input
                      type="text"
                      required
                      value={companyForm.whatsapp}
                      onChange={(e) => setCompanyForm({ ...companyForm, whatsapp: e.target.value })}
                      placeholder="(11) 99999-9999"
                      className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all"
                    />
                  </div>

                  {/* WhatsApp Raw */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                      WhatsApp Link (Apenas números com DDI: ex: 5511999999999)
                    </label>
                    <input
                      type="text"
                      required
                      value={companyForm.whatsappRaw}
                      onChange={(e) => setCompanyForm({ ...companyForm, whatsappRaw: e.target.value.replace(/\D/g, "") })}
                      placeholder="5511999999999"
                      className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all font-mono"
                    />
                  </div>

                  {/* Address */}
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                      Endereço da Loja Física
                    </label>
                    <input
                      type="text"
                      required
                      value={companyForm.address}
                      onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                      placeholder="Av. Europa, 1000 - Jardim Europa, São Paulo - SP, CEP 01449-000"
                      className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all"
                    />
                  </div>

                  {/* Business Hours */}
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                      Horário de Funcionamento
                    </label>
                    <textarea
                      required
                      rows={2}
                      value={companyForm.hours}
                      onChange={(e) => setCompanyForm({ ...companyForm, hours: e.target.value })}
                      placeholder="Seg a Sex das 9h às 19h&#10;Sáb das 9h às 14h"
                      className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all resize-none"
                    />
                  </div>

                  {/* Instagram */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                      Instagram (Link Completo)
                    </label>
                    <input
                      type="url"
                      value={companyForm.instagram}
                      onChange={(e) => setCompanyForm({ ...companyForm, instagram: e.target.value })}
                      placeholder="https://instagram.com/usuario"
                      className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all font-mono"
                    />
                  </div>

                  {/* Facebook */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                      Facebook (Link Completo)
                    </label>
                    <input
                      type="url"
                      value={companyForm.facebook}
                      onChange={(e) => setCompanyForm({ ...companyForm, facebook: e.target.value })}
                      placeholder="https://facebook.com/pagina"
                      className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Submit buttons */}
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="h-10 bg-brand-primary hover:bg-brand-primary-hover text-white text-[10px] font-bold uppercase tracking-widest px-5 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
                  >
                    {companyStatus === "saved" ? "DADOS SALVOS ✓" : "SALVAR INFORMAÇÕES"}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetCompanySettings}
                    className="h-10 bg-brand-bg border border-brand-card-border text-brand-text/60 text-[10px] font-bold uppercase tracking-widest px-4 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
                  >
                    Restaurar Padrões
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

      </div>
    </div>
  );
}
