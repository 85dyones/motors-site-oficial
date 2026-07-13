"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useConfirm } from "./admin/ConfirmDialog";
import { getEstoque, Veiculo, supabase } from "../lib/supabase";
import { useTheme, ThemeType, AboutSettings, DEFAULT_ABOUT_SETTINGS, DEFAULT_COMPANY_SETTINGS } from "../app/ThemeContext";
import { createBrowserSupabaseClient } from "../lib/supabase-browser";

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

export default function ConfiguracoesClientWrapper() {
  const { confirm } = useConfirm();
  const {
    theme,
    setTheme,
    companySettings,
    updateCompanySettings,
    aboutSettings,
    updateAboutSettings,
    webhooks: contextWebhooks,
    updateWebhooks,
    popups: contextPopups,
    popupSettings: contextPopupSettings,
    updatePopups,
    updatePopupSettings,
    quickTags: contextQuickTags,
    updateQuickTags,
    stockOverrides: contextStockOverrides,
    updateStockOverrides,
    carouselVehicleIds: contextCarouselVehicleIds,
    updateCarouselVehicleIds,
  } = useTheme();

  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab") as "estoque" | "integracao" | "popups" | "destaques" | "empresa" | "sobre" | null;

  const [activeTab, setActiveTab] = useState<"estoque" | "integracao" | "popups" | "destaques" | "empresa" | "sobre">("estoque");
  const [loading, setLoading] = useState(true);

  // Synchronize state with URL search param changes
  useEffect(() => {
    if (tabParam && ["estoque", "integracao", "popups", "destaques", "empresa", "sobre"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const handleTabChange = (newTab: "estoque" | "integracao" | "popups" | "destaques" | "empresa" | "sobre") => {
    setActiveTab(newTab);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", newTab);
    router.replace(`/admin/configuracoes?${params.toString()}`);
  };

  // Company settings states
  const [companyForm, setCompanyForm] = useState(companySettings);
  const [companyStatus, setCompanyStatus] = useState<"idle" | "saved">("idle");

  // About page settings states
  const [aboutForm, setAboutForm] = useState<AboutSettings>(aboutSettings);
  const [aboutStatus, setAboutStatus] = useState<"idle" | "saved">("idle");

  // Sync about settings form when settings change
  useEffect(() => {
    setAboutForm(aboutSettings);
  }, [aboutSettings]);

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
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [authError, setAuthError] = useState("");
  
  // Stock data states
  const [vehicles, setVehicles] = useState<Veiculo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Local overrides states: mapping of vehicle.id -> { tipo?, perfil_uso?, status_tag?, status_tag_color?, vendido?, preco_compra?, descricao?, laudo_pericia?, opcionais? }
  const [overrides, setOverrides] = useState<Record<string, { tipo?: string; perfil_uso?: string; status_tag?: string; status_tag_color?: string; vendido?: boolean; preco_compra?: number; descricao?: string; laudo_pericia?: string; opcionais?: string }>>({});
  
  // Single vehicle save notifications: mapping of vehicle.id -> boolean
  const [savedNotifications, setSavedNotifications] = useState<Record<string, boolean>>({});

  // Webhook integration states
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookStatus, setWebhookStatus] = useState<"idle" | "saved">("idle");
  const [webhookAvaliacaoUrl, setWebhookAvaliacaoUrl] = useState("");
  const [webhookAvaliacaoStatus, setWebhookAvaliacaoStatus] = useState<"idle" | "saved">("idle");
  const [webhookNotificacoesUrl, setWebhookNotificacoesUrl] = useState("");
  const [webhookNotificacoesStatus, setWebhookNotificacoesStatus] = useState<"idle" | "saved">("idle");
  const [eventsConfig, setEventsConfig] = useState<Record<string, boolean>>({
    conta_vencida: true,
    conta_criada: true,
    conta_atualizada: true,
    conta_paga: true,
    conta_deletada: true,
    fornecedor_criado: true,
    usuario_criado: true,
    compra_registrada: true,
    recorrente_criada: true,
    recorrente_atualizada: true,
    recorrente_deletada: true
  });

  // Check login state on session restore
  useEffect(() => {
    if (typeof window !== "undefined") {
      const loggedIn = sessionStorage.getItem("ag_admin_logged_in") === "true";
      if (loggedIn) {
        setIsAuthenticated(true);
        return;
      }
    }

    const checkSupabaseSession = async () => {
      try {
        const browserClient = createBrowserSupabaseClient();
        const { data: { session } } = await browserClient.auth.getSession();
        if (session) {
          setIsAuthenticated(true);
          return;
        }
      } catch (err) {
        console.warn("[Configuracoes] Failed to restore SSR session:", err);
      }

      if (supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            setIsAuthenticated(true);
          }
        } catch (err) {
          console.warn("[Configuracoes] Failed to restore Supabase session:", err);
        }
      }
    };
    checkSupabaseSession();
  }, []);

  const getAuthToken = async (): Promise<string | null> => {
    try {
      const browserClient = createBrowserSupabaseClient();
      const sessionRes = await browserClient.auth.getSession();
      const token = sessionRes.data?.session?.access_token;
      if (token) return token;
    } catch (e) {
      console.warn("[Auth] Failed to read browser session token:", e);
    }

    if (supabase) {
      try {
        const sessionRes = await supabase.auth.getSession();
        return sessionRes.data?.session?.access_token || null;
      } catch (e) {
        console.warn("[Auth] Failed to read legacy session token:", e);
      }
    }
    return null;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    
    // 1. Tenta fazer login real via Supabase se configurado
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) {
          console.warn("[Auth] Supabase authentication failed, trying local fallback:", error.message);
        } else if (data?.user) {
          setIsAuthenticated(true);
          if (typeof window !== "undefined") {
            sessionStorage.setItem("ag_admin_logged_in", "true");
          }
          return;
        }
      } catch (err) {
        console.warn("[Auth] Supabase connection error, trying local fallback:", err);
      }
    }

    // 2. Fallback local/mock
    if (email === "motors@motorsstoreoficial.com.br" && password === "test123456") {
      setIsAuthenticated(true);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("ag_admin_logged_in", "true");
      }
    } else {
      setAuthError("Credenciais inválidas. Verifique seu e-mail e senha.");
    }
  };

  const handleLogout = async () => {
    setIsAuthenticated(false);
    setEmail("");
    setPassword("");
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("ag_admin_logged_in");
    }
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn("[Auth] Failed to sign out from Supabase:", err);
      }
    }
  };

  // Load database catalog on mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // Load stock from database client wrapper
        const data = await getEstoque();
        setVehicles(data);
      } catch (err) {
        console.error("Error loading settings panel stock:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Sync state values with Supabase context when they are loaded
  useEffect(() => {
    if (contextStockOverrides) {
      setOverrides(contextStockOverrides);
    }
  }, [contextStockOverrides]);

  useEffect(() => {
    if (contextWebhooks) {
      setWebhookUrl(contextWebhooks.webhookUrl || "");
      setWebhookAvaliacaoUrl(contextWebhooks.webhookAvaliacaoUrl || "");
      setWebhookNotificacoesUrl(contextWebhooks.webhookNotificacoesUrl || "");
      if (contextWebhooks.events) {
        setEventsConfig({
          conta_vencida: contextWebhooks.events.conta_vencida !== false,
          conta_criada: contextWebhooks.events.conta_criada !== false,
          conta_atualizada: contextWebhooks.events.conta_atualizada !== false,
          conta_paga: contextWebhooks.events.conta_paga !== false,
          conta_deletada: contextWebhooks.events.conta_deletada !== false,
          fornecedor_criado: contextWebhooks.events.fornecedor_criado !== false,
          usuario_criado: contextWebhooks.events.usuario_criado !== false,
          compra_registrada: contextWebhooks.events.compra_registrada !== false,
          recorrente_criada: contextWebhooks.events.recorrente_criada !== false,
          recorrente_atualizada: contextWebhooks.events.recorrente_atualizada !== false,
          recorrente_deletada: contextWebhooks.events.recorrente_deletada !== false
        });
      }
    }
  }, [contextWebhooks]);

  useEffect(() => {
    if (contextPopupSettings) {
      setPopupSettings(contextPopupSettings);
    }
  }, [contextPopupSettings]);

  useEffect(() => {
    if (contextPopups) {
      setCampaigns(contextPopups);
    }
  }, [contextPopups]);

  useEffect(() => {
    if (contextCarouselVehicleIds) {
      setCarouselVehicleIds(contextCarouselVehicleIds);
    }
  }, [contextCarouselVehicleIds]);

  useEffect(() => {
    if (contextQuickTags) {
      setQuickTags(contextQuickTags);
    }
  }, [contextQuickTags]);

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
  const handleOverrideChange = (id: string, field: "tipo" | "perfil_uso" | "status_tag" | "status_tag_color" | "vendido" | "descricao" | "laudo_pericia" | "opcionais" | "preco_compra", value: any) => {
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
      const nextOverrides = {
        ...overrides,
        [id]: {
          ...(overrides[id] || {}),
          ...itemOverrides,
        },
      };

      await updateStockOverrides(nextOverrides);

      // Persist to live Supabase database directly if Supabase is active
      if (supabase) {
        const dbUpdates: any = {};
        if (itemOverrides.tipo !== undefined) dbUpdates.tipo = itemOverrides.tipo;
        if (itemOverrides.perfil_uso !== undefined) dbUpdates.perfil_uso = itemOverrides.perfil_uso;
        if (itemOverrides.descricao !== undefined) dbUpdates.descricao = itemOverrides.descricao;
        if (itemOverrides.laudo_pericia !== undefined) dbUpdates.laudo_pericia = itemOverrides.laudo_pericia;
        if (itemOverrides.opcionais !== undefined) dbUpdates.opcionais = itemOverrides.opcionais;

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
  const handleResetVehicleOverride = async (id: string) => {
    try {
      const nextOverrides = { ...overrides };
      delete nextOverrides[id];
      await updateStockOverrides(nextOverrides);
      setOverrides(nextOverrides);

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
  const handlePurgeAllOverrides = async () => {
    const isConfirmed = await confirm({
      title: "Resetar Categorização de Estoque",
      message: "Deseja realmente redefinir todos os veículos para a categorização original do banco de dados?",
      type: "danger",
      confirmLabel: "Resetar Tudo",
      cancelLabel: "Cancelar"
    });
    if (isConfirmed) {
      try {
        await updateStockOverrides({});
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
  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateWebhooks({
        webhookUrl: webhookUrl.trim(),
        webhookAvaliacaoUrl: webhookAvaliacaoUrl.trim(),
        webhookNotificacoesUrl: webhookNotificacoesUrl.trim(),
        events: eventsConfig
      });
      setWebhookStatus("saved");
      console.log(`[Telemetry] Webhook de recebimento de leads atualizado para: ${webhookUrl}`);
      setTimeout(() => setWebhookStatus("idle"), 2500);
    } catch (e) {
      console.error("Failed to save custom webhook:", e);
    }
  };

  // Save appraisal webhook URL
  const handleSaveWebhookAvaliacao = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateWebhooks({
        webhookUrl: webhookUrl.trim(),
        webhookAvaliacaoUrl: webhookAvaliacaoUrl.trim(),
        webhookNotificacoesUrl: webhookNotificacoesUrl.trim(),
        events: eventsConfig
      });
      setWebhookAvaliacaoStatus("saved");
      console.log(`[Telemetry] Webhook de avaliação de veículos atualizado para: ${webhookAvaliacaoUrl}`);
      setTimeout(() => setWebhookAvaliacaoStatus("idle"), 2500);
    } catch (e) {
      console.error("Failed to save custom evaluation webhook:", e);
    }
  };

  // Save notification webhook URL
  const handleSaveWebhookNotificacoes = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateWebhooks({
        webhookUrl: webhookUrl.trim(),
        webhookAvaliacaoUrl: webhookAvaliacaoUrl.trim(),
        webhookNotificacoesUrl: webhookNotificacoesUrl.trim(),
        events: eventsConfig
      });
      setWebhookNotificacoesStatus("saved");
      console.log(`[Telemetry] Webhook de notificações do sistema atualizado para: ${webhookNotificacoesUrl}`);
      setTimeout(() => setWebhookNotificacoesStatus("idle"), 2500);
    } catch (e) {
      console.error("Failed to save notification webhook:", e);
    }
  };

  // Save popup settings
  const handleSavePopupSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updatePopupSettings(popupSettings);
      await updatePopups(campaigns);
      setPopupStatus("saved");
      console.log(`[Telemetry] Configurações do Motor de Campanhas atualizadas.`);
      setTimeout(() => setPopupStatus("idle"), 2500);
    } catch (e) {
      console.error("Failed to save popup settings:", e);
    }
  };

  // Save company settings
  const handleSaveCompanySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updatedForm = { ...companyForm, isCustom: true };
      
      // 1. Prompt Injection frontend filter
      if (hasPromptInjection(updatedForm)) {
        alert("Erro de segurança: O conteúdo contém termos não permitidos (potencial injeção de instruções). Por favor, remova comandos em inglês semelhantes a instruções de sistema.");
        return;
      }

      // 2. Fetch Auth Token
      const token = await getAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      // 3. Save to Supabase via API
      const response = await fetch("/api/settings", {
        method: "POST",
        headers,
        body: JSON.stringify({ companySettings: updatedForm })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with ${response.status}`);
      }
      
      const result = await response.json();
      console.log("[Settings] Company settings saved to Supabase:", result);
      
      // 4. Update React state
      updateCompanySettings(updatedForm);
      setCompanyStatus("saved");
      
      setTimeout(() => setCompanyStatus("idle"), 2500);
    } catch (e: any) {
      console.error("Failed to save company settings:", e);
      alert(e.message || "Erro ao salvar as configurações no servidor. Verifique a conexão.");
      setCompanyStatus("idle");
    }
  };

  // Save about page settings
  const handleSaveAboutSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updatedForm = { ...aboutForm, isCustom: true };
      
      // 1. Prompt Injection frontend filter
      if (hasPromptInjection(updatedForm)) {
        alert("Erro de segurança: O conteúdo contém termos não permitidos (potencial injeção de instruções). Por favor, remova comandos em inglês semelhantes a instruções de sistema.");
        return;
      }

      // 2. Fetch Auth Token
      const token = await getAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      // 3. Save to Supabase via API
      const response = await fetch("/api/settings", {
        method: "POST",
        headers,
        body: JSON.stringify({ aboutSettings: updatedForm })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with ${response.status}`);
      }
      
      const result = await response.json();
      console.log("[Settings] About settings saved to Supabase:", result);
      
      // 4. Update React state
      updateAboutSettings(updatedForm);
      setAboutStatus("saved");
      
      setTimeout(() => setAboutStatus("idle"), 2500);
    } catch (e: any) {
      console.error("Failed to save about settings:", e);
      alert(e.message || "Erro ao salvar as configurações no servidor. Verifique a conexão.");
      setAboutStatus("idle");
    }
  };

  // Reset about settings to default
  const handleResetAboutSettings = async () => {
    const isConfirmed = await confirm({
      title: "Redefinir Quem Somos",
      message: "Deseja realmente redefinir todos os dados da página Quem Somos para os padrões de fábrica?",
      type: "danger",
      confirmLabel: "Redefinir",
      cancelLabel: "Cancelar"
    });
    if (isConfirmed) {
      try {
        const resetForm = { ...DEFAULT_ABOUT_SETTINGS, isCustom: false };
        
        const token = await getAuthToken();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        // 1. Save reset to Supabase first
        const response = await fetch("/api/settings", {
          method: "POST",
          headers,
          body: JSON.stringify({ aboutSettings: resetForm })
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Server responded with ${response.status}`);
        }
        
        // 2. Update React state
        setAboutForm(resetForm);
        updateAboutSettings(resetForm);
        
        alert("Dados da página Quem Somos redefinidos com sucesso!");
      } catch (e: any) {
        console.error("Failed to reset about settings:", e);
        alert(e.message || "Erro ao redefinir as configurações no servidor.");
      }
    }
  };

  // Reset company settings to default
  const handleResetCompanySettings = async () => {
    const isConfirmed = await confirm({
      title: "Redefinir Dados da Concessionária",
      message: "Deseja realmente redefinir todos os dados da concessionária para os padrões de fábrica?",
      type: "danger",
      confirmLabel: "Redefinir",
      cancelLabel: "Cancelar"
    });
    if (isConfirmed) {
      try {
        const resetForm = { ...DEFAULT_COMPANY_SETTINGS, isCustom: false };
        
        const token = await getAuthToken();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        // 1. Save reset to Supabase first
        const response = await fetch("/api/settings", {
          method: "POST",
          headers,
          body: JSON.stringify({ companySettings: resetForm })
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Server responded with ${response.status}`);
        }
        
        // 2. Update React state
        setCompanyForm(resetForm);
        updateCompanySettings(resetForm);
        
        alert("Dados da concessionária redefinidos com sucesso!");
      } catch (e: any) {
        console.error("Failed to reset company settings:", e);
        alert(e.message || "Erro ao redefinir as configurações no servidor.");
      }
    }
  };

  // Save campaign edit / create
  const handleSaveCampaign = async (campaign: Campaign) => {
    const exists = campaigns.some((c) => c.id === campaign.id);
    let nextList: Campaign[];
    if (exists) {
      nextList = campaigns.map((c) => (c.id === campaign.id ? campaign : c));
    } else {
      nextList = [...campaigns, campaign];
    }
    setCampaigns(nextList);
    await updatePopups(nextList);
    setEditingCampaign(null);
    setIsCreating(false);
  };

  // Delete campaign
  const handleDeleteCampaign = async (id: string) => {
    const isConfirmed = await confirm({
      title: "Excluir Campanha",
      message: "Deseja realmente excluir esta campanha de pop-up?",
      type: "danger",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar"
    });
    if (isConfirmed) {
      const nextList = campaigns.filter((c) => c.id !== id);
      setCampaigns(nextList);
      await updatePopups(nextList);
    }
  };

  // Toggle single campaign active status
  const handleToggleCampaign = async (id: string) => {
    const nextList = campaigns.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c));
    setCampaigns(nextList);
    await updatePopups(nextList);
  };

  // Reset popup settings and campaigns to defaults
  const handleResetPopupSettings = async () => {
    const isConfirmed = await confirm({
      title: "Redefinir Pop-ups e Campanhas",
      message: "Deseja realmente redefinir todos os pop-ups e campanhas para os padrões de fábrica?",
      type: "danger",
      confirmLabel: "Redefinir",
      cancelLabel: "Cancelar"
    });
    if (isConfirmed) {
      setPopupSettings(DEFAULT_POPUP_SETTINGS);
      setCampaigns(DEFAULT_CAMPAIGNS);
      await updatePopupSettings(DEFAULT_POPUP_SETTINGS);
      await updatePopups(DEFAULT_CAMPAIGNS);
      alert("Configurações e campanhas redefinidas com sucesso!");
    }
  };

  // Dropdown options
  const bodyTypes = ["SUV", "Sedan", "Picape", "Hatch", "Esportivo", "Conversível", "Coupe", "Wagon", "Premium"];
  const usageProfiles = ["URBANO & EFICIENTE", "FORÇA & OFF-ROAD", "LINHAGEM ESPORTIVA", "CURADORIA EXCLUSIVA"];



  const getTabLabel = (tab: string) => {
    switch (tab) {
      case "estoque": return "Categorização de Estoque";
      case "integracao": return "Integração & Layout";
      case "destaques": return "Destaques Rápidos";
      case "popups": return "Pop-ups de Lead";
      case "empresa": return "Dados da Concessionária";
      case "sobre": return "Página Quem Somos";
      default: return "Controle Administrativo";
    }
  };

  return (
    <div className="flex flex-col flex-grow w-full text-brand-text transition-colors duration-300">
      <div className="w-full flex flex-col gap-6">
        
        {/* Title Header */}
        <section className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-2">
          <div className="flex flex-col gap-1.5 text-left">
            <span className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.2em]">
              Painel de Configuração
            </span>
            <h1 className="text-2xl font-extrabold text-brand-text tracking-tight uppercase">
              🤖 {getTabLabel(activeTab)}
            </h1>
            <p className="text-xs text-brand-text/60 leading-relaxed font-light">
              Gerencie as definições e parametrizações do seu site com segurança em tempo real.
            </p>
          </div>
        </section>

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
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3.5 w-full">
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

                          {/* Preço de Entrada (Compra) Text Input */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[8px] font-bold text-brand-text/40 uppercase tracking-widest pl-1">
                              Preço de Entrada (Compra)
                            </label>
                            <input
                              type="number"
                              placeholder="EX: 45000"
                              value={overrides[vehicle.id]?.preco_compra ?? vehicle.preco_compra ?? ""}
                              onChange={(e) => handleOverrideChange(vehicle.id, "preco_compra", e.target.value ? parseFloat(e.target.value) : undefined)}
                              className="bg-brand-bg text-brand-text border border-brand-card-border rounded-xl px-3 py-2 text-[11px] font-medium outline-none focus:border-brand-primary placeholder-brand-text/30 w-full"
                            />
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
                          <RichTextEditor
                            value={overrides[vehicle.id]?.descricao ?? vehicle.descricao ?? ""}
                            onChange={(value) => handleOverrideChange(vehicle.id, "descricao", value)}
                            placeholder="Escreva uma descrição atraente, formatada com títulos H1-H4, listas de marcadores, negrito e tabulação..."
                          />
                        </div>

                        {/* Laudo de Perícia Cautelar */}
                        <div className="flex flex-col gap-1.5 w-full">
                          <label className="text-[8px] font-bold text-brand-text/40 uppercase tracking-widest pl-1 flex items-center gap-1.5">
                            <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-emerald-500/10 text-emerald-500 text-[8px]">🔬</span>
                            Laudo de Perícia Cautelar (Exibido na ficha do veículo)
                          </label>
                          <textarea
                            rows={3}
                            value={overrides[vehicle.id]?.laudo_pericia ?? vehicle.laudo_pericia ?? ""}
                            onChange={(e) => handleOverrideChange(vehicle.id, "laudo_pericia", e.target.value)}
                            placeholder="Ex: Laudo cautelar 100% aprovado pela SuperVisão. Pintura 100% original, sem retoques. Todas as revisões realizadas na concessionária..."
                            className="bg-brand-bg text-brand-text border border-emerald-500/20 rounded-xl px-3.5 py-2.5 text-[11px] font-medium outline-none focus:border-emerald-500 placeholder-brand-text/30 w-full resize-y font-sans leading-relaxed"
                          />
                        </div>

                        {/* Opcionais e Acessórios */}
                        <div className="flex flex-col gap-1.5 w-full">
                          <label className="text-[8px] font-bold text-brand-text/40 uppercase tracking-widest pl-1 flex items-center gap-1.5">
                            <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-brand-primary/10 text-brand-primary text-[8px]">⚙️</span>
                            Opcionais e Acessórios (Separados por vírgula)
                          </label>
                          <textarea
                            rows={3}
                            value={overrides[vehicle.id]?.opcionais ?? vehicle.opcionais ?? ""}
                            onChange={(e) => handleOverrideChange(vehicle.id, "opcionais", e.target.value)}
                            placeholder="Ex: Ar Condicionado Digital, Bancos em Couro, Central Multimídia, Câmera de Ré, Teto Solar Panorâmico, Rodas Aro 20..."
                            className="bg-brand-bg text-brand-text border border-brand-primary/20 rounded-xl px-3.5 py-2.5 text-[11px] font-medium outline-none focus:border-brand-primary placeholder-brand-text/30 w-full resize-y font-sans leading-relaxed"
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
                    onClick={async () => {
                      const fallbackUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_LEAD_URL || "https://n8n.v2o5.com.br/webhook/lead-entrada";
                      setWebhookUrl(fallbackUrl);
                      await updateWebhooks({
                        webhookUrl: fallbackUrl,
                        webhookAvaliacaoUrl: webhookAvaliacaoUrl,
                        webhookNotificacoesUrl: webhookNotificacoesUrl,
                        events: eventsConfig
                      });
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
                    onClick={async () => {
                      const fallbackUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_AVALIACAO_URL || "https://n8n.v2o5.com.br/webhook/sdr-captura-lead";
                      setWebhookAvaliacaoUrl(fallbackUrl);
                      await updateWebhooks({
                        webhookUrl: webhookUrl,
                        webhookAvaliacaoUrl: fallbackUrl,
                        webhookNotificacoesUrl: webhookNotificacoesUrl,
                        events: eventsConfig
                      });
                      alert("Webhook de avaliação redefinido para o padrão com sucesso!");
                    }}
                    className="h-10 bg-brand-bg border border-brand-card-border text-brand-text/60 text-[10px] font-bold uppercase tracking-widest px-4 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
                  >
                    Restaurar Padrão
                  </button>
                </div>
              </form>
            </div>

            {/* Webhook Notificações Settings Section */}
            <div className="bg-brand-card border border-brand-card-border rounded-3xl p-6 shadow-sm">
              <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest">
                NOTIFICAÇÕES DO SISTEMA
              </span>
              <h2 className="text-lg font-bold text-brand-text mb-2 uppercase">
                WEBHOOK DE NOTIFICAÇÕES ADMINISTRATIVAS
              </h2>
              <p className="text-xs text-brand-text/50 mb-4 font-light leading-relaxed">
                Configure a URL de webhook para onde serão enviadas as notificações geradas pelo sistema administrativo (como alertas de contas a pagar pendentes ou vencidas).
              </p>

              <form onSubmit={handleSaveWebhookNotificacoes} className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="webhook-notificacoes-input" className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                    URL do Webhook de Notificações (n8n / Make / Custom)
                  </label>
                  <input
                    id="webhook-notificacoes-input"
                    type="url"
                    required
                    placeholder="https://n8n.dominio.com/webhook/..."
                    value={webhookNotificacoesUrl}
                    onChange={(e) => setWebhookNotificacoesUrl(e.target.value)}
                    className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary font-mono transition-all"
                  />
                </div>

                {/* Event checklist */}
                <div className="flex flex-col gap-2.5 mt-2 border-t border-brand-border/20 pt-4">
                  <span className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest block">
                    Eventos a enviar para o Webhook Administrativo
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1.5">
                    {/* Event item 1 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-brand-text/75 hover:text-brand-text select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.conta_vencida}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, conta_vencida: e.target.checked })}
                        className="rounded border-brand-card-border text-brand-primary focus:ring-brand-primary h-4.5 w-4.5 bg-brand-bg transition-all"
                      />
                      <span>Contas Vencidas / Alertas de Vencimento</span>
                    </label>
                    {/* Event item 2 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-brand-text/75 hover:text-brand-text select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.conta_criada}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, conta_criada: e.target.checked })}
                        className="rounded border-brand-card-border text-brand-primary focus:ring-brand-primary h-4.5 w-4.5 bg-brand-bg transition-all"
                      />
                      <span>Novo Lançamento Financeiro (Conta)</span>
                    </label>
                    {/* Event item 3 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-brand-text/75 hover:text-brand-text select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.fornecedor_criado}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, fornecedor_criado: e.target.checked })}
                        className="rounded border-brand-card-border text-brand-primary focus:ring-brand-primary h-4.5 w-4.5 bg-brand-bg transition-all"
                      />
                      <span>Novo Parceiro/Fornecedor Cadastrado</span>
                    </label>
                    {/* Event item 4 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-brand-text/75 hover:text-brand-text select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.usuario_criado}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, usuario_criado: e.target.checked })}
                        className="rounded border-brand-card-border text-brand-primary focus:ring-brand-primary h-4.5 w-4.5 bg-brand-bg transition-all"
                      />
                      <span>Novo Usuário Criado no Painel</span>
                    </label>
                    {/* Event item 5 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-brand-text/75 hover:text-brand-text select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.compra_registrada}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, compra_registrada: e.target.checked })}
                        className="rounded border-brand-card-border text-brand-primary focus:ring-brand-primary h-4.5 w-4.5 bg-brand-bg transition-all"
                      />
                      <span>Nova Compra de Insumo Registrada</span>
                    </label>
                    {/* Event item 6 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-brand-text/75 hover:text-brand-text select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.conta_atualizada}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, conta_atualizada: e.target.checked })}
                        className="rounded border-brand-card-border text-brand-primary focus:ring-brand-primary h-4.5 w-4.5 bg-brand-bg transition-all"
                      />
                      <span>Lançamento Financeiro Alterado (Conta)</span>
                    </label>
                    {/* Event item 7 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-brand-text/75 hover:text-brand-text select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.conta_paga}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, conta_paga: e.target.checked })}
                        className="rounded border-brand-card-border text-brand-primary focus:ring-brand-primary h-4.5 w-4.5 bg-brand-bg transition-all"
                      />
                      <span>Pagamento / Baixa Realizada (Conta)</span>
                    </label>
                    {/* Event item 8 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-brand-text/75 hover:text-brand-text select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.conta_deletada}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, conta_deletada: e.target.checked })}
                        className="rounded border-brand-card-border text-brand-primary focus:ring-brand-primary h-4.5 w-4.5 bg-brand-bg transition-all"
                      />
                      <span>Lançamento Financeiro Excluído (Conta)</span>
                    </label>
                    {/* Event item 9 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-brand-text/75 hover:text-brand-text select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.recorrente_criada}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, recorrente_criada: e.target.checked })}
                        className="rounded border-brand-card-border text-brand-primary focus:ring-brand-primary h-4.5 w-4.5 bg-brand-bg transition-all"
                      />
                      <span>Nova Despesa Recorrente Criada</span>
                    </label>
                    {/* Event item 10 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-brand-text/75 hover:text-brand-text select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.recorrente_atualizada}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, recorrente_atualizada: e.target.checked })}
                        className="rounded border-brand-card-border text-brand-primary focus:ring-brand-primary h-4.5 w-4.5 bg-brand-bg transition-all"
                      />
                      <span>Despesa Recorrente Alterada</span>
                    </label>
                    {/* Event item 11 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-brand-text/75 hover:text-brand-text select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.recorrente_deletada}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, recorrente_deletada: e.target.checked })}
                        className="rounded border-brand-card-border text-brand-primary focus:ring-brand-primary h-4.5 w-4.5 bg-brand-bg transition-all"
                      />
                      <span>Despesa Recorrente Excluída</span>
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="h-10 bg-brand-primary hover:bg-brand-primary-hover text-white text-[10px] font-bold uppercase tracking-widest px-5 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
                  >
                    {webhookNotificacoesStatus === "saved" ? "WEBHOOK DE NOTIFICAÇÕES SALVO ✓" : "SALVAR WEBHOOK DE NOTIFICAÇÕES"}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setWebhookNotificacoesUrl("");
                      await updateWebhooks({
                        webhookUrl: webhookUrl,
                        webhookAvaliacaoUrl: webhookAvaliacaoUrl,
                        webhookNotificacoesUrl: "",
                        events: eventsConfig
                      });
                      alert("Webhook de notificações redefinido com sucesso!");
                    }}
                    className="h-10 bg-brand-bg border border-brand-card-border text-brand-text/60 text-[10px] font-bold uppercase tracking-widest px-4 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
                  >
                    Limpar / Padrão
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
                          onChange={async () => {
                            const next = carouselVehicleIds.includes(vehicle.id)
                              ? carouselVehicleIds.filter(id => id !== vehicle.id)
                              : [...carouselVehicleIds, vehicle.id];
                            setCarouselVehicleIds(next);
                            await updateCarouselVehicleIds(next);
                            console.log(`[Carousel Configuration] Destaques atualizados:`, next);
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
                    onClick={async () => {
                      setCarouselVehicleIds([]);
                      await updateCarouselVehicleIds([]);
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
                      onClick={async () => {
                        if (!editingQuickTag?.name.trim() || !editingQuickTag?.value.trim()) {
                          alert("Preencha todos os campos corretamente.");
                          return;
                        }
                        
                        const exists = quickTags.some(t => t.id === editingQuickTag.id);
                        const next = exists
                          ? quickTags.map(t => t.id === editingQuickTag.id ? editingQuickTag : t)
                          : [...quickTags, editingQuickTag];
                        setQuickTags(next);
                        await updateQuickTags(next);
                        
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
                        onClick={async () => {
                          const isConfirmed = await confirm({
                            title: "Remover Destaque Rápido",
                            message: `Deseja realmente remover o destaque rápido "${tag.name}"?`,
                            type: "danger",
                            confirmLabel: "Remover",
                            cancelLabel: "Cancelar"
                          });
                          if (isConfirmed) {
                            const next = quickTags.filter(t => t.id !== tag.id);
                            setQuickTags(next);
                            await updateQuickTags(next);
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

                  {/* Favicon URL */}
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                      Favicon Personalizado (URL do ícone ou imagem)
                    </label>
                    <input
                      type="url"
                      value={companyForm.faviconUrl || ""}
                      onChange={(e) => setCompanyForm({ ...companyForm, faviconUrl: e.target.value })}
                      placeholder="https://sua-empresa.com.br/logo-favicon.png"
                      className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all font-mono"
                    />
                    <p className="text-[10px] text-brand-text/40 font-light leading-relaxed">
                      Insira a URL de uma imagem para ser usada como o ícone da aba do navegador (favicon). Deixe em branco para usar o padrão da Motors.
                    </p>
                  </div>

                  {/* Logo URL */}
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                      Logo Personalizado (URL da imagem)
                    </label>
                    <input
                      type="url"
                      value={companyForm.logoUrl || ""}
                      onChange={(e) => setCompanyForm({ ...companyForm, logoUrl: e.target.value })}
                      placeholder="https://sua-empresa.com.br/logo.png"
                      className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all font-mono"
                    />
                    <p className="text-[10px] text-brand-text/40 font-light leading-relaxed">
                      Insira a URL de uma imagem para ser usada como logotipo do site (exibido no topo da página e no menu lateral do painel). Deixe em branco para usar o padrão da Motors.
                    </p>
                  </div>

                  {/* GA4 ID */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                      ID de Medição do Google Analytics 4 (GA4)
                    </label>
                    <input
                      type="text"
                      value={companyForm.ga4Id || ""}
                      onChange={(e) => setCompanyForm({ ...companyForm, ga4Id: e.target.value })}
                      placeholder="G-XXXXXXXXXX"
                      className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all font-mono"
                    />
                  </div>

                  {/* Meta Pixel ID */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                      ID do Meta Pixel
                    </label>
                    <input
                      type="text"
                      value={companyForm.metaPixelId || ""}
                      onChange={(e) => setCompanyForm({ ...companyForm, metaPixelId: e.target.value })}
                      placeholder="123456789012345"
                      className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all font-mono"
                    />
                  </div>

                  {/* Instagram Username */}
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                      Username do Instagram (Para o feed preview - sem o @)
                    </label>
                    <input
                      type="text"
                      value={companyForm.instagramUsername || ""}
                      onChange={(e) => setCompanyForm({ ...companyForm, instagramUsername: e.target.value })}
                      placeholder="motorsstore.oficial"
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
        ) : activeTab === "sobre" ? (
          <div className="flex flex-col gap-6 animate-fadeIn">
            {/* About Page Settings Section */}
            <div className="bg-brand-card border border-brand-card-border rounded-3xl p-6 shadow-sm">
              <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest">
                Conteúdo & Manifesto
              </span>
              <h2 className="text-lg font-bold text-brand-text mb-2 uppercase">
                PÁGINA QUEM SOMOS
              </h2>
              <p className="text-xs text-brand-text/50 mb-6 font-light leading-relaxed">
                Personalize o conteúdo da página "Quem Somos" (/sobre). Digite as informações em caixa alta nos títulos se desejar seguir a estética premium do site.
              </p>

              <form onSubmit={handleSaveAboutSettings} className="flex flex-col gap-8">
                {/* Seção 1: Hero */}
                <div className="flex flex-col gap-4 border-b border-brand-border/60 pb-6">
                  <h3 className="text-xs font-bold text-brand-primary uppercase tracking-widest">
                    Seção 1: Manifesto Principal (Hero)
                  </h3>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                        Título Principal
                      </label>
                      <input
                        type="text"
                        required
                        value={aboutForm.heroTitle}
                        onChange={(e) => setAboutForm({ ...aboutForm, heroTitle: e.target.value })}
                        placeholder="MOLDANDO A CURADORIA PREMIUM"
                        className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                        Texto do Manifesto
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={aboutForm.heroSubtitle}
                        onChange={(e) => setAboutForm({ ...aboutForm, heroSubtitle: e.target.value })}
                        placeholder="De um tradicional showroom físico..."
                        className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all resize-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Seção 2: Trajetória */}
                <div className="flex flex-col gap-4 border-b border-brand-border/60 pb-6">
                  <h3 className="text-xs font-bold text-brand-primary uppercase tracking-widest">
                    Seção 2: Nossa Trajetória
                  </h3>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                        Título da Seção
                      </label>
                      <input
                        type="text"
                        required
                        value={aboutForm.historyTitle}
                        onChange={(e) => setAboutForm({ ...aboutForm, historyTitle: e.target.value })}
                        placeholder="A Herança da Avenida Europa"
                        className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                        Parágrafo 1 (História)
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={aboutForm.historyP1}
                        onChange={(e) => setAboutForm({ ...aboutForm, historyP1: e.target.value })}
                        placeholder="Fundada há mais de uma década..."
                        className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all resize-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                        Parágrafo 2 (História)
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={aboutForm.historyP2}
                        onChange={(e) => setAboutForm({ ...aboutForm, historyP2: e.target.value })}
                        placeholder="Nosso compromisso inegociável..."
                        className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all resize-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Seção 3: Diferenciais */}
                <div className="flex flex-col gap-4 border-b border-brand-border/60 pb-6">
                  <h3 className="text-xs font-bold text-brand-primary uppercase tracking-widest">
                    Seção 3: Qualidade Absoluta (Diferenciais)
                  </h3>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                        Título do Bloco Lateral
                      </label>
                      <input
                        type="text"
                        required
                        value={aboutForm.valuesTitle}
                        onChange={(e) => setAboutForm({ ...aboutForm, valuesTitle: e.target.value })}
                        placeholder="Perícia e Rigor Técnico"
                        className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                        Diferencial 1 (Use dois pontos ":" para separar o título em negrito da descrição)
                      </label>
                      <input
                        type="text"
                        required
                        value={aboutForm.value1}
                        onChange={(e) => setAboutForm({ ...aboutForm, value1: e.target.value })}
                        placeholder="Laudo Cautelar 100% Livre: Histórico estrutural..."
                        className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                        Diferencial 2 (Use dois pontos ":" para separar o título em negrito da descrição)
                      </label>
                      <input
                        type="text"
                        required
                        value={aboutForm.value2}
                        onChange={(e) => setAboutForm({ ...aboutForm, value2: e.target.value })}
                        placeholder="Garantia de Showroom: Revisão profunda..."
                        className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                        Diferencial 3 (Use dois pontos ":" para separar o título em negrito da descrição)
                      </label>
                      <input
                        type="text"
                        required
                        value={aboutForm.value3}
                        onChange={(e) => setAboutForm({ ...aboutForm, value3: e.target.value })}
                        placeholder="Valoração Fipe de Precisão: Atualização contínua..."
                        className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Seção 4: Tecnologia */}
                <div className="flex flex-col gap-4">
                  <h3 className="text-xs font-bold text-brand-primary uppercase tracking-widest">
                    Seção 4: Pilares de Excelência
                  </h3>
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                          Título Principal da Tecnologia
                        </label>
                        <input
                          type="text"
                          required
                          value={aboutForm.techTitle}
                          onChange={(e) => setAboutForm({ ...aboutForm, techTitle: e.target.value })}
                          placeholder="NOSSOS PILARES DE EXCELÊNCIA"
                          className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                          Subtítulo da Tecnologia
                        </label>
                        <input
                          type="text"
                          required
                          value={aboutForm.techSubtitle}
                          onChange={(e) => setAboutForm({ ...aboutForm, techSubtitle: e.target.value })}
                          placeholder="Nossa plataforma web 2.0 não é apenas..."
                          className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
                      {/* Card 1 */}
                      <div className="flex flex-col gap-3 p-4 bg-brand-bg border border-brand-card-border rounded-2xl animate-none">
                        <span className="text-[9px] font-black text-brand-gold">CARD 1</span>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[8px] font-bold text-brand-text/40">Título</label>
                          <input
                            type="text"
                            required
                            value={aboutForm.card1Title}
                            onChange={(e) => setAboutForm({ ...aboutForm, card1Title: e.target.value })}
                            placeholder="PRECISÃO FIPE EXPRESS"
                            className="w-full p-2 bg-brand-card border border-brand-card-border rounded-lg text-xs outline-none focus:border-brand-primary"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[8px] font-bold text-brand-text/40">Descrição</label>
                          <textarea
                            required
                            rows={3}
                            value={aboutForm.card1Desc}
                            onChange={(e) => setAboutForm({ ...aboutForm, card1Desc: e.target.value })}
                            placeholder="Algoritmo de cálculo..."
                            className="w-full p-2 bg-brand-card border border-brand-card-border rounded-lg text-xs outline-none focus:border-brand-primary resize-none"
                          />
                        </div>
                      </div>

                      {/* Card 2 */}
                      <div className="flex flex-col gap-3 p-4 bg-brand-bg border border-brand-card-border rounded-2xl animate-none">
                        <span className="text-[9px] font-black text-brand-gold">CARD 2</span>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[8px] font-bold text-brand-text/40">Título</label>
                          <input
                            type="text"
                            required
                            value={aboutForm.card2Title}
                            onChange={(e) => setAboutForm({ ...aboutForm, card2Title: e.target.value })}
                            placeholder="ALGORITMO DE DISTÂNCIA"
                            className="w-full p-2 bg-brand-card border border-brand-card-border rounded-lg text-xs outline-none focus:border-brand-primary"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[8px] font-bold text-brand-text/40">Descrição</label>
                          <textarea
                            required
                            rows={3}
                            value={aboutForm.card2Desc}
                            onChange={(e) => setAboutForm({ ...aboutForm, card2Desc: e.target.value })}
                            placeholder="Sistema dinâmico..."
                            className="w-full p-2 bg-brand-card border border-brand-card-border rounded-lg text-xs outline-none focus:border-brand-primary resize-none"
                          />
                        </div>
                      </div>

                      {/* Card 3 */}
                      <div className="flex flex-col gap-3 p-4 bg-brand-bg border border-brand-card-border rounded-2xl animate-none">
                        <span className="text-[9px] font-black text-brand-gold">CARD 3</span>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[8px] font-bold text-brand-text/40">Título</label>
                          <input
                            type="text"
                            required
                            value={aboutForm.card3Title}
                            onChange={(e) => setAboutForm({ ...aboutForm, card3Title: e.target.value })}
                            placeholder="ASSISTENTE SEMÂNTICO LOCAL"
                            className="w-full p-2 bg-brand-card border border-brand-card-border rounded-lg text-xs outline-none focus:border-brand-primary"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[8px] font-bold text-brand-text/40">Descrição</label>
                          <textarea
                            required
                            rows={3}
                            value={aboutForm.card3Desc}
                            onChange={(e) => setAboutForm({ ...aboutForm, card3Desc: e.target.value })}
                            placeholder="Analisador natural..."
                            className="w-full p-2 bg-brand-card border border-brand-card-border rounded-lg text-xs outline-none focus:border-brand-primary resize-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Seção 5: Chamada para Ação Final (CTA) */}
                <div className="flex flex-col gap-4 border-t border-brand-border/40 pt-6">
                  <h3 className="text-xs font-bold text-brand-primary uppercase tracking-widest">
                    Seção 5: Chamada para Ação Final (CTA)
                  </h3>
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                          Título Central (H2)
                        </label>
                        <input
                          type="text"
                          required
                          value={aboutForm.ctaTitle || ""}
                          onChange={(e) => setAboutForm({ ...aboutForm, ctaTitle: e.target.value })}
                          placeholder="PRONTO PARA ENCONTRAR SEU PRÓXIMO DESTINO?"
                          className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                          Texto de Apoio
                        </label>
                        <textarea
                          required
                          rows={3}
                          value={aboutForm.ctaDescription || ""}
                          onChange={(e) => setAboutForm({ ...aboutForm, ctaDescription: e.target.value })}
                          placeholder="Experimente a segurança da nossa curadoria digital..."
                          className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all resize-none"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                          Texto do Botão 1 (Destaque)
                        </label>
                        <input
                          type="text"
                          required
                          value={aboutForm.ctaBtn1Text || ""}
                          onChange={(e) => setAboutForm({ ...aboutForm, ctaBtn1Text: e.target.value })}
                          placeholder="INICIAR CURADORIA IA"
                          className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                          Texto do Botão 2 (Borda)
                        </label>
                        <input
                          type="text"
                          required
                          value={aboutForm.ctaBtn2Text || ""}
                          onChange={(e) => setAboutForm({ ...aboutForm, ctaBtn2Text: e.target.value })}
                          placeholder="FALE CONOSCO"
                          className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl text-xs outline-none focus:border-brand-primary transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submit buttons */}
                <div className="flex items-center gap-3 mt-4 border-t border-brand-border/60 pt-6">
                  <button
                    type="submit"
                    className="h-10 bg-brand-primary hover:bg-brand-primary-hover text-white text-[10px] font-bold uppercase tracking-widest px-5 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
                  >
                    {aboutStatus === "saved" ? "CONTEÚDO SALVO ✓" : "SALVAR CONTEÚDO"}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetAboutSettings}
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

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  
  // Set initial content and handle external updates (like reset/revert)
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const executeCommand = (command: string, value: string = "") => {
    document.execCommand(command, false, value);
    handleInput();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        executeCommand("outdent");
      } else {
        executeCommand("indent");
      }
    }
  };

  return (
    <div className="rich-text-editor-container border border-brand-card-border rounded-xl bg-brand-bg overflow-hidden flex flex-col focus-within:border-brand-primary transition-colors w-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 bg-brand-card border-b border-brand-card-border text-brand-text">
        {/* Headings */}
        <select
          onChange={(e) => {
            const val = e.target.value;
            if (val) {
              executeCommand("formatBlock", `<${val}>`);
              e.target.value = ""; // reset selection
            }
          }}
          defaultValue=""
          className="bg-brand-bg text-brand-text border border-brand-card-border rounded px-2 py-1 text-[10px] font-semibold outline-none cursor-pointer"
        >
          <option value="" disabled>Título</option>
          <option value="H1">Título 1</option>
          <option value="H2">Título 2</option>
          <option value="H3">Título 3</option>
          <option value="H4">Título 4</option>
          <option value="P">Texto Normal</option>
        </select>

        <span className="w-px h-4 bg-brand-card-border mx-1" />

        {/* Formatting Buttons */}
        <button
          type="button"
          onClick={() => executeCommand("bold")}
          className="p-1 px-2 hover:bg-brand-bg rounded font-bold text-[10px] cursor-pointer"
          title="Negrito"
        >
          B
        </button>

        <button
          type="button"
          onClick={() => executeCommand("insertUnorderedList")}
          className="p-1 px-2 hover:bg-brand-bg rounded text-[10px] cursor-pointer"
          title="Lista com Marcadores"
        >
          • Lista
        </button>

        <span className="w-px h-4 bg-brand-card-border mx-1" />

        {/* Indent / Outdent Buttons */}
        <button
          type="button"
          onClick={() => executeCommand("outdent")}
          className="p-1 px-2 hover:bg-brand-bg rounded text-[10px] cursor-pointer"
          title="Recuar (Shift+Tab)"
        >
          ← Recuar
        </button>

        <button
          type="button"
          onClick={() => executeCommand("indent")}
          className="p-1 px-2 hover:bg-brand-bg rounded text-[10px] cursor-pointer"
          title="Indentar (Tab)"
        >
          Indentar →
        </button>
      </div>

      {/* Editable Area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
        className="rich-text-content p-3.5 outline-none min-h-[120px] text-[11px] text-brand-text leading-relaxed cursor-text bg-brand-bg"
      />
    </div>
  );
}

