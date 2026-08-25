"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useConfirm } from "./admin/ConfirmDialog";
import AparenciaCores from "./admin/AparenciaCores";
import FaixaProcedenciaTextos from "./admin/FaixaProcedenciaTextos";
import InstagramCuradoria from "./admin/InstagramCuradoria";
import CardsCompartilhamento from "./admin/CardsCompartilhamento";
import { getEstoque, Veiculo, supabase } from "../lib/supabase";
import { useTheme, DEFAULT_ABOUT_SETTINGS, DEFAULT_COMPANY_SETTINGS, DEFAULT_POPUP_SETTINGS, DEFAULT_QUICK_TAGS, DEFAULT_CAMPAIGNS } from "../app/ThemeContext";
import { createBrowserSupabaseClient } from "../lib/supabase-browser";
import { processImage } from "../lib/imageProcessor";
import { slugifyTag } from "../lib/tagUtils";
import type {
  ThemeType,
  AboutSettings,
  CompanySettings,
  Campaign,
  CompartilhamentoSettings,
  PopupSettings,
  QuickTag
} from "../types";

// Types imported from ../types

/**
 * As abas desta tela. A lista era repetida quatro vezes como união literal;
 * virou constante única quando `aparencia` entrou — quatro lugares para
 * lembrar é o tipo de coisa que deixa uma aba acessível pela URL e invisível
 * na navegação.
 */
const ABAS = [
  "destaques",
  "aparencia",
  "sobre",
  "compartilhamento",
  "procedencia",
  "instagram",
  "integracao",
  "popups",
  "empresa",
] as const;
type AbaConfiguracoes = (typeof ABAS)[number];

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
    procedencia,
    updateProcedencia,
    instagramCuradoria,
    updateInstagramCuradoria,
  } = useTheme();

  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab") as AbaConfiguracoes | null;

  // A aba padrão era `estoque`, que virou tela própria (`/admin/estoque`) em
  // 2026-08-08. Sem ela, quem chega em /admin/configuracoes sem `?tab=` cai
  // nos destaques rápidos, a primeira da lista.
  const [activeTab, setActiveTab] = useState<AbaConfiguracoes>("destaques");
  const [loading, setLoading] = useState(true);

  // Synchronize state with URL search param changes
  useEffect(() => {
    if (tabParam && ABAS.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const handleTabChange = (newTab: AbaConfiguracoes) => {
    setActiveTab(newTab);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", newTab);
    router.replace(`/admin/configuracoes?${params.toString()}`);
  };

  // Company settings states
  const [companyForm, setCompanyForm] = useState(companySettings);
  const [companyStatus, setCompanyStatus] = useState<"idle" | "saved">("idle");
  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'favicon') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'logo') setIsUploadingLogo(true);
    else setIsUploadingFavicon(true);

    try {
      const processedBlob = await processImage(file, type);
      const formData = new FormData();
      formData.append('file', processedBlob, file.name);
      formData.append('type', type);

      if (companyForm.s3AccessKeyId) formData.append('s3AccessKeyId', companyForm.s3AccessKeyId);
      if (companyForm.s3SecretAccessKey) formData.append('s3SecretAccessKey', companyForm.s3SecretAccessKey);

      const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null;

      const res = await fetch('/api/upload-branding', {
        method: 'POST',
        headers: token ? {
          'Authorization': `Bearer ${token}`
        } : {},
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao fazer upload da imagem');
      }

      if (type === 'logo') {
        setCompanyForm({ ...companyForm, logoUrl: data.url });
      } else {
        setCompanyForm({ ...companyForm, faviconUrl: data.url });
      }
      
      alert('Upload concluído com sucesso!');
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(error.message || 'Erro inesperado ao processar imagem.');
    } finally {
      setIsUploadingLogo(false);
      setIsUploadingFavicon(false);
    }
  };

  /**
   * Upload de arte de compartilhamento.
   *
   * Tipo próprio, e não `logo`: o processador recorta em 1200×630 e exporta
   * JPEG. O caminho do logo entrega WebP, que o WhatsApp não renderiza em
   * prévia de link — a arte subiria, apareceria certa aqui no painel, e o
   * card sairia sem imagem no celular do cliente.
   *
   * A rota também não cai em base64 para este tipo: nenhum scraper busca
   * `data:`, então um erro visível é melhor que uma URL que só funciona aqui.
   */
  const enviarArteDeCompartilhamento = async (arquivo: File): Promise<string> => {
    const processada = await processImage(arquivo, "compartilhamento");
    const formData = new FormData();
    formData.append("file", processada, "compartilhamento.jpg");
    formData.append("type", "compartilhamento");

    if (companyForm.s3AccessKeyId) formData.append("s3AccessKeyId", companyForm.s3AccessKeyId);
    if (companyForm.s3SecretAccessKey) formData.append("s3SecretAccessKey", companyForm.s3SecretAccessKey);

    const token = await getAuthToken();
    const res = await fetch("/api/upload-branding", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) {
      throw new Error(data?.error || "Erro ao enviar a imagem de compartilhamento.");
    }
    return data.url as string;
  };

  /**
   * Grava a partir de `companySettings` (o que está no ar), não de
   * `companyForm`: o rascunho da aba "Dados da concessionária" pode ter
   * alteração não salva, e salvar o card não pode publicar de carona um
   * telefone que a loja ainda estava digitando.
   */
  const salvarCompartilhamento = async (valor: CompartilhamentoSettings) => {
    const atualizado: CompanySettings = {
      ...companySettings,
      compartilhamento: valor,
      isCustom: true,
    };

    const token = await getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch("/api/settings", {
      method: "POST",
      headers,
      body: JSON.stringify({ companySettings: atualizado }),
    });

    if (!response.ok) {
      const erro = await response.json().catch(() => ({}));
      throw new Error(erro.error || `Server responded with ${response.status}`);
    }

    updateCompanySettings(atualizado);
    setCompanyForm((anterior) => ({ ...anterior, compartilhamento: valor }));
  };

  const [isUploadingTagBg, setIsUploadingTagBg] = useState(false);
  const handleTagBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingTagBg(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'banner');

      if (companyForm.s3AccessKeyId) formData.append('s3AccessKeyId', companyForm.s3AccessKeyId);
      if (companyForm.s3SecretAccessKey) formData.append('s3SecretAccessKey', companyForm.s3SecretAccessKey);

      const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null;

      const res = await fetch('/api/upload-branding', {
        method: 'POST',
        headers: token ? {
          'Authorization': `Bearer ${token}`
        } : {},
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao fazer upload da imagem');
      }

      if (data.url || data.publicUrl) {
        const url = data.url || data.publicUrl;
        setEditingQuickTag(prev => prev ? { ...prev, bgImageUrl: url, bannerMode: "image" } : null);
      }
    } catch (err: any) {
      alert("Falha no upload da imagem: " + (err.message || "Erro desconhecido"));
    } finally {
      setIsUploadingTagBg(false);
      e.target.value = '';
    }
  };

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
  
  // Stock data states
  const [vehicles, setVehicles] = useState<Veiculo[]>([]);
  
  // Overrides do estoque, aqui só para LEITURA: a aba de destaques conta
  // quantos veículos cada categoria alcança, e a associação manual vive no
  // JSON (`quick_tags`). A edição de veículo saiu desta tela em 2026-08-08 —
  // é a tabela A6 (`/admin/estoque`) e o editor A15 que escrevem, por rota
  // autenticada, nas colunas do banco.
  const [overrides, setOverrides] = useState<Record<string, { quick_tags?: string[] }>>({});
  

  // Webhook integration states
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookStatus, setWebhookStatus] = useState<"idle" | "saved">("idle");
  const [webhookAvaliacaoUrl, setWebhookAvaliacaoUrl] = useState("");
  const [webhookAvaliacaoStatus, setWebhookAvaliacaoStatus] = useState<"idle" | "saved">("idle");
  const [webhookNotificacoesUrl, setWebhookNotificacoesUrl] = useState("");
  const [webhookNotificacoesStatus, setWebhookNotificacoesStatus] = useState<"idle" | "saved">("idle");
  const [webhookPropostaUrl, setWebhookPropostaUrl] = useState("");
  const [webhookPropostaStatus, setWebhookPropostaStatus] = useState<"idle" | "saved">("idle");
  const [webhookDuvidasUrl, setWebhookDuvidasUrl] = useState("");
  const [webhookDuvidasStatus, setWebhookDuvidasStatus] = useState<"idle" | "saved">("idle");
  const [apiSecretToken, setApiSecretToken] = useState("");
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

  // Load database catalog on mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // Load stock from database client wrapper.
        // `incluirForaDoFeed` — o painel precisa enxergar TAMBÉM os veículos que
        // saíram do feed do RevendaMais. O site público não os mostra, mas é
        // aqui que eles são marcados como vendidos e conferidos na margem;
        // escondê-los deixaria o veículo inalcançável.
        const data = await getEstoque({ incluirForaDoFeed: true });
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
      setWebhookPropostaUrl(contextWebhooks.webhookPropostaUrl || "");
      setWebhookDuvidasUrl(contextWebhooks.webhookDuvidasUrl || "");
      setApiSecretToken(contextWebhooks.apiSecretToken || "");
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
    if (contextQuickTags) {
      setQuickTags(contextQuickTags);
    }
  }, [contextQuickTags]);

  // Save general webhook URL
  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateWebhooks({
        webhookUrl: webhookUrl.trim(),
        webhookAvaliacaoUrl: webhookAvaliacaoUrl.trim(),
        webhookNotificacoesUrl: webhookNotificacoesUrl.trim(),
        webhookPropostaUrl: webhookPropostaUrl.trim(),
        webhookDuvidasUrl: webhookDuvidasUrl.trim(),
        events: eventsConfig,
        apiSecretToken: apiSecretToken.trim()
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
        webhookPropostaUrl: webhookPropostaUrl.trim(),
        webhookDuvidasUrl: webhookDuvidasUrl.trim(),
        events: eventsConfig,
        apiSecretToken: apiSecretToken.trim()
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
        webhookPropostaUrl: webhookPropostaUrl.trim(),
        webhookDuvidasUrl: webhookDuvidasUrl.trim(),
        events: eventsConfig,
        apiSecretToken: apiSecretToken.trim()
      });
      setWebhookNotificacoesStatus("saved");
      console.log(`[Telemetry] Webhook de notificações do sistema atualizado para: ${webhookNotificacoesUrl}`);
      setTimeout(() => setWebhookNotificacoesStatus("idle"), 2500);
    } catch (e) {
      console.error("Failed to save notification webhook:", e);
    }
  };

  // Save proposal webhook URL
  const handleSaveWebhookProposta = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateWebhooks({
        webhookUrl: webhookUrl.trim(),
        webhookAvaliacaoUrl: webhookAvaliacaoUrl.trim(),
        webhookNotificacoesUrl: webhookNotificacoesUrl.trim(),
        webhookPropostaUrl: webhookPropostaUrl.trim(),
        webhookDuvidasUrl: webhookDuvidasUrl.trim(),
        events: eventsConfig,
        apiSecretToken: apiSecretToken.trim()
      });
      setWebhookPropostaStatus("saved");
      console.log(`[Telemetry] Webhook de proposta atualizado para: ${webhookPropostaUrl}`);
      setTimeout(() => setWebhookPropostaStatus("idle"), 2500);
    } catch (e) {
      console.error("Failed to save proposal webhook:", e);
    }
  };

  // Save doubts webhook URL
  const handleSaveWebhookDuvidas = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateWebhooks({
        webhookUrl: webhookUrl.trim(),
        webhookAvaliacaoUrl: webhookAvaliacaoUrl.trim(),
        webhookNotificacoesUrl: webhookNotificacoesUrl.trim(),
        webhookPropostaUrl: webhookPropostaUrl.trim(),
        webhookDuvidasUrl: webhookDuvidasUrl.trim(),
        events: eventsConfig,
        apiSecretToken: apiSecretToken.trim()
      });
      setWebhookDuvidasStatus("saved");
      console.log(`[Telemetry] Webhook de dúvidas atualizado para: ${webhookDuvidasUrl}`);
      setTimeout(() => setWebhookDuvidasStatus("idle"), 2500);
    } catch (e) {
      console.error("Failed to save doubts webhook:", e);
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


  const getTabLabel = (tab: string) => {
    switch (tab) {
      case "integracao": return "Integrações & Webhooks";
      case "aparencia": return "Aparência e Cores";
      case "destaques": return "Destaques Rápidos";
      case "popups": return "Pop-ups de Lead";
      case "empresa": return "Dados da Concessionária";
      case "sobre": return "Página Quem Somos";
      case "compartilhamento": return "Compartilhamento em Redes e WhatsApp";
      case "procedencia": return "Faixa de Procedência";
      case "instagram": return "Faixa do Instagram";
      default: return "Controle Administrativo";
    }
  };

  return (
    <div className="flex flex-col flex-grow w-full text-mt-ink transition-colors duration-300">
      <div className="w-full flex flex-col gap-6">
        
        {/* Cabeçalho da tela, na anatomia do design doc: rótulo em versalete
            e título apertado, sem ornamento. */}
        <section className="flex flex-col gap-1.5 border-b-2 border-mt-regua pb-5">
          <div className="mt-rotulo mt-rotulo-accent">Painel de configuração</div>
          <h1 className="mt-titulo text-3xl md:text-4xl">{getTabLabel(activeTab)}</h1>
          <p className="mt-1 max-w-[620px] text-sm text-mt-neutral-800">
            As alterações valem no site em tempo real assim que salvas.
          </p>
        </section>

        {/* Tab Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 bg-mt-surface border border-mt-regua-fina">
            <span className="h-6 w-6 border-2 border-mt-accent-300 border-t-mt-accent rounded-full animate-spin" />
            <span className="mt-rotulo">Carregando painel</span>
          </div>
        ) : activeTab === "integracao" ? (
          // WEBHOOK & THEME INTEGRATIONS
          <div className="flex flex-col gap-6">

            {/* Webhook Settings Section */}
            <div className="bg-mt-surface border border-mt-regua-fina p-6">
              <span className="mt-rotulo mt-rotulo-accent">
                CONEXÃO E INTEGRAÇÃO DE SDR
              </span>
              <h2 className="mb-2 text-[17px] font-extrabold tracking-[-.015em] text-mt-ink">
                WEBHOOK GERAL DE LEADS
              </h2>
              <p className="text-xs text-mt-neutral-700 mb-4 font-normal leading-relaxed">
                Configure a URL de destino para os envios de formulário de contato do site. Leads capturados serão transmitidos instantaneamente para a automação no n8n.
              </p>

              <form onSubmit={handleSaveWebhook} className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="webhook-input" className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                    URL do Webhook (n8n / Make / Custom)
                  </label>
                  <input
                    id="webhook-input"
                    type="url"
                    required
                    placeholder="https://n8n.dominio.com/webhook/..."
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent font-mono transition-all"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="h-10 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-[10px] font-bold uppercase tracking-widest px-5 transition-all duration-200  cursor-pointer shrink-0"
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
                        webhookPropostaUrl: webhookPropostaUrl,
                        webhookDuvidasUrl: webhookDuvidasUrl,
                        events: eventsConfig,
                        apiSecretToken: apiSecretToken
                      });
                      alert("Webhook redefinido para o padrão com sucesso!");
                    }}
                    className="h-10 bg-mt-bg border border-mt-regua-fina text-mt-neutral-700 text-[10px] font-bold uppercase tracking-widest px-4 transition-all duration-200  cursor-pointer shrink-0"
                  >
                    Restaurar Padrão
                  </button>
                </div>
              </form>
            </div>

            {/* Webhook Proposta Settings Section */}
            <div className="bg-mt-surface border border-mt-regua-fina p-6">
              <span className="mt-rotulo mt-rotulo-accent">
                GARANTIA DE PROPOSTA
              </span>
              <h2 className="mb-2 text-[17px] font-extrabold tracking-[-.015em] text-mt-ink">
                WEBHOOK DE GARANTIA DE PROPOSTA
              </h2>
              <p className="text-xs text-mt-neutral-700 mb-4 font-normal leading-relaxed">
                Configure a URL de destino exclusiva para os leads gerados no botão "Garantir Proposta no WhatsApp". Se deixado em branco, usará o Webhook Geral.
              </p>

              <form onSubmit={handleSaveWebhookProposta} className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="webhook-proposta-input" className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                    URL do Webhook de Proposta (n8n / Make / Custom)
                  </label>
                  <input
                    id="webhook-proposta-input"
                    type="url"
                    placeholder="https://n8n.dominio.com/webhook/..."
                    value={webhookPropostaUrl}
                    onChange={(e) => setWebhookPropostaUrl(e.target.value)}
                    className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent font-mono transition-all"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="h-10 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-[10px] font-bold uppercase tracking-widest px-5 transition-all duration-200  cursor-pointer shrink-0"
                  >
                    {webhookPropostaStatus === "saved" ? "WEBHOOK DE PROPOSTA SALVO ✓" : "SALVAR WEBHOOK DE PROPOSTA"}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setWebhookPropostaUrl("");
                      await updateWebhooks({
                        webhookUrl: webhookUrl,
                        webhookAvaliacaoUrl: webhookAvaliacaoUrl,
                        webhookNotificacoesUrl: webhookNotificacoesUrl,
                        webhookPropostaUrl: "",
                        webhookDuvidasUrl: webhookDuvidasUrl,
                        events: eventsConfig,
                        apiSecretToken: apiSecretToken
                      });
                      alert("Webhook de proposta redefinido com sucesso!");
                    }}
                    className="h-10 bg-mt-bg border border-mt-regua-fina text-mt-neutral-700 text-[10px] font-bold uppercase tracking-widest px-4 transition-all duration-200  cursor-pointer shrink-0"
                  >
                    Limpar / Padrão
                  </button>
                </div>
              </form>
            </div>

            {/* Webhook Dúvidas Settings Section */}
            <div className="bg-mt-surface border border-mt-regua-fina p-6">
              <span className="mt-rotulo mt-rotulo-accent">
                DÚVIDAS COM VENDEDOR
              </span>
              <h2 className="mb-2 text-[17px] font-extrabold tracking-[-.015em] text-mt-ink">
                WEBHOOK DE TIRAR DÚVIDAS
              </h2>
              <p className="text-xs text-mt-neutral-700 mb-4 font-normal leading-relaxed">
                Configure a URL de destino exclusiva para os leads gerados no botão "Tirar dúvidas com o vendedor". Se deixado em branco, usará o Webhook Geral.
              </p>

              <form onSubmit={handleSaveWebhookDuvidas} className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="webhook-duvidas-input" className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                    URL do Webhook de Dúvidas (n8n / Make / Custom)
                  </label>
                  <input
                    id="webhook-duvidas-input"
                    type="url"
                    placeholder="https://n8n.dominio.com/webhook/..."
                    value={webhookDuvidasUrl}
                    onChange={(e) => setWebhookDuvidasUrl(e.target.value)}
                    className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent font-mono transition-all"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="h-10 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-[10px] font-bold uppercase tracking-widest px-5 transition-all duration-200  cursor-pointer shrink-0"
                  >
                    {webhookDuvidasStatus === "saved" ? "WEBHOOK DE DÚVIDAS SALVO ✓" : "SALVAR WEBHOOK DE DÚVIDAS"}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setWebhookDuvidasUrl("");
                      await updateWebhooks({
                        webhookUrl: webhookUrl,
                        webhookAvaliacaoUrl: webhookAvaliacaoUrl,
                        webhookNotificacoesUrl: webhookNotificacoesUrl,
                        webhookPropostaUrl: webhookPropostaUrl,
                        webhookDuvidasUrl: "",
                        events: eventsConfig,
                        apiSecretToken: apiSecretToken
                      });
                      alert("Webhook de dúvidas redefinido com sucesso!");
                    }}
                    className="h-10 bg-mt-bg border border-mt-regua-fina text-mt-neutral-700 text-[10px] font-bold uppercase tracking-widest px-4 transition-all duration-200  cursor-pointer shrink-0"
                  >
                    Limpar / Padrão
                  </button>
                </div>
              </form>
            </div>

            {/* Webhook Avaliação Settings Section */}
            <div className="bg-mt-surface border border-mt-regua-fina p-6">
              <span className="mt-rotulo mt-rotulo-accent">
                AVALIAÇÃO DE VEÍCULOS
              </span>
              <h2 className="mb-2 text-[17px] font-extrabold tracking-[-.015em] text-mt-ink">
                WEBHOOK DE AVALIAÇÃO (APPRAISAL)
              </h2>
              <p className="text-xs text-mt-neutral-700 mb-4 font-normal leading-relaxed">
                Configure a URL de destino exclusiva para os envios de leads de auto-avaliação do site. Leads de avaliação serão transmitidos de forma isolada no n8n.
              </p>

              <form onSubmit={handleSaveWebhookAvaliacao} className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="webhook-avaliacao-input" className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                    URL do Webhook de Avaliação (n8n / Make / Custom)
                  </label>
                  <input
                    id="webhook-avaliacao-input"
                    type="url"
                    required
                    placeholder="https://n8n.dominio.com/webhook/..."
                    value={webhookAvaliacaoUrl}
                    onChange={(e) => setWebhookAvaliacaoUrl(e.target.value)}
                    className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent font-mono transition-all"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="h-10 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-[10px] font-bold uppercase tracking-widest px-5 transition-all duration-200  cursor-pointer shrink-0"
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
                        webhookPropostaUrl: webhookPropostaUrl,
                        webhookDuvidasUrl: webhookDuvidasUrl,
                        events: eventsConfig,
                        apiSecretToken: apiSecretToken
                      });
                      alert("Webhook de avaliação redefinido para o padrão com sucesso!");
                    }}
                    className="h-10 bg-mt-bg border border-mt-regua-fina text-mt-neutral-700 text-[10px] font-bold uppercase tracking-widest px-4 transition-all duration-200  cursor-pointer shrink-0"
                  >
                    Restaurar Padrão
                  </button>
                </div>
              </form>
            </div>

            {/* Webhook Notificações Settings Section */}
            <div className="bg-mt-surface border border-mt-regua-fina p-6">
              <span className="mt-rotulo mt-rotulo-accent">
                NOTIFICAÇÕES DO SISTEMA
              </span>
              <h2 className="mb-2 text-[17px] font-extrabold tracking-[-.015em] text-mt-ink">
                WEBHOOK DE NOTIFICAÇÕES ADMINISTRATIVAS
              </h2>
              <p className="text-xs text-mt-neutral-700 mb-4 font-normal leading-relaxed">
                Configure a URL de webhook para onde serão enviadas as notificações geradas pelo sistema administrativo (como alertas de contas a pagar pendentes ou vencidas).
              </p>

              <form onSubmit={handleSaveWebhookNotificacoes} className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="webhook-notificacoes-input" className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                    URL do Webhook de Notificações (n8n / Make / Custom)
                  </label>
                  <input
                    id="webhook-notificacoes-input"
                    type="url"
                    required
                    placeholder="https://n8n.dominio.com/webhook/..."
                    value={webhookNotificacoesUrl}
                    onChange={(e) => setWebhookNotificacoesUrl(e.target.value)}
                    className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent font-mono transition-all"
                  />
                </div>

                {/* Event checklist */}
                <div className="flex flex-col gap-2.5 mt-2 border-t border-mt-regua-fina pt-4">
                  <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700 block">
                    Eventos a enviar para o Webhook Administrativo
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1.5">
                    {/* Event item 1 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-mt-neutral-800 hover:text-mt-ink select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.conta_vencida}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, conta_vencida: e.target.checked })}
                        className="border-mt-regua-fina text-mt-accent focus:ring-mt-accent h-4.5 w-4.5 bg-mt-bg transition-all"
                      />
                      <span>Contas Vencidas / Alertas de Vencimento</span>
                    </label>
                    {/* Event item 2 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-mt-neutral-800 hover:text-mt-ink select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.conta_criada}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, conta_criada: e.target.checked })}
                        className="border-mt-regua-fina text-mt-accent focus:ring-mt-accent h-4.5 w-4.5 bg-mt-bg transition-all"
                      />
                      <span>Novo Lançamento Financeiro (Conta)</span>
                    </label>
                    {/* Event item 3 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-mt-neutral-800 hover:text-mt-ink select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.fornecedor_criado}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, fornecedor_criado: e.target.checked })}
                        className="border-mt-regua-fina text-mt-accent focus:ring-mt-accent h-4.5 w-4.5 bg-mt-bg transition-all"
                      />
                      <span>Novo Parceiro/Fornecedor Cadastrado</span>
                    </label>
                    {/* Event item 4 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-mt-neutral-800 hover:text-mt-ink select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.usuario_criado}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, usuario_criado: e.target.checked })}
                        className="border-mt-regua-fina text-mt-accent focus:ring-mt-accent h-4.5 w-4.5 bg-mt-bg transition-all"
                      />
                      <span>Novo Usuário Criado no Painel</span>
                    </label>
                    {/* Event item 5 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-mt-neutral-800 hover:text-mt-ink select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.compra_registrada}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, compra_registrada: e.target.checked })}
                        className="border-mt-regua-fina text-mt-accent focus:ring-mt-accent h-4.5 w-4.5 bg-mt-bg transition-all"
                      />
                      <span>Nova Compra de Insumo Registrada</span>
                    </label>
                    {/* Event item 6 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-mt-neutral-800 hover:text-mt-ink select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.conta_atualizada}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, conta_atualizada: e.target.checked })}
                        className="border-mt-regua-fina text-mt-accent focus:ring-mt-accent h-4.5 w-4.5 bg-mt-bg transition-all"
                      />
                      <span>Lançamento Financeiro Alterado (Conta)</span>
                    </label>
                    {/* Event item 7 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-mt-neutral-800 hover:text-mt-ink select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.conta_paga}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, conta_paga: e.target.checked })}
                        className="border-mt-regua-fina text-mt-accent focus:ring-mt-accent h-4.5 w-4.5 bg-mt-bg transition-all"
                      />
                      <span>Pagamento / Baixa Realizada (Conta)</span>
                    </label>
                    {/* Event item 8 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-mt-neutral-800 hover:text-mt-ink select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.conta_deletada}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, conta_deletada: e.target.checked })}
                        className="border-mt-regua-fina text-mt-accent focus:ring-mt-accent h-4.5 w-4.5 bg-mt-bg transition-all"
                      />
                      <span>Lançamento Financeiro Excluído (Conta)</span>
                    </label>
                    {/* Event item 9 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-mt-neutral-800 hover:text-mt-ink select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.recorrente_criada}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, recorrente_criada: e.target.checked })}
                        className="border-mt-regua-fina text-mt-accent focus:ring-mt-accent h-4.5 w-4.5 bg-mt-bg transition-all"
                      />
                      <span>Nova Despesa Recorrente Criada</span>
                    </label>
                    {/* Event item 10 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-mt-neutral-800 hover:text-mt-ink select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.recorrente_atualizada}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, recorrente_atualizada: e.target.checked })}
                        className="border-mt-regua-fina text-mt-accent focus:ring-mt-accent h-4.5 w-4.5 bg-mt-bg transition-all"
                      />
                      <span>Despesa Recorrente Alterada</span>
                    </label>
                    {/* Event item 11 */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-mt-neutral-800 hover:text-mt-ink select-none">
                      <input
                        type="checkbox"
                        checked={eventsConfig.recorrente_deletada}
                        onChange={(e) => setEventsConfig({ ...eventsConfig, recorrente_deletada: e.target.checked })}
                        className="border-mt-regua-fina text-mt-accent focus:ring-mt-accent h-4.5 w-4.5 bg-mt-bg transition-all"
                      />
                      <span>Despesa Recorrente Excluída</span>
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="h-10 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-[10px] font-bold uppercase tracking-widest px-5 transition-all duration-200  cursor-pointer shrink-0"
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
                        webhookPropostaUrl: webhookPropostaUrl,
                        webhookDuvidasUrl: webhookDuvidasUrl,
                        events: eventsConfig,
                        apiSecretToken: apiSecretToken
                      });
                      alert("Webhook de notificações redefinido com sucesso!");
                    }}
                    className="h-10 bg-mt-bg border border-mt-regua-fina text-mt-neutral-700 text-[10px] font-bold uppercase tracking-widest px-4 transition-all duration-200  cursor-pointer shrink-0"
                  >
                    Limpar / Padrão
                  </button>
                </div>
              </form>
            </div>

            {/* API Security Config Section (WhatsApp query token) */}
            <div className="bg-mt-surface border border-mt-regua-fina p-6">
              <span className="mt-rotulo mt-rotulo-accent">
                SEGURANÇA DA API DE CONSULTA (WHATSAPP)
              </span>
              <h2 className="mb-2 text-[17px] font-extrabold tracking-[-.015em] text-mt-ink">
                TOKEN DE AUTENTICAÇÃO DA API (HEADERS)
              </h2>
              <p className="text-xs text-mt-neutral-700 mb-4 font-normal leading-relaxed">
                Token exigido pelo endpoint de consulta de margens por WhatsApp (<code>/api/financeiro/margens/consulta</code>): toda consulta precisa do cabeçalho <code>Authorization: Bearer [Token]</code>. Sem token configurado em lugar nenhum, o endpoint responde 503 — ele não abre sem autenticação.
              </p>

              <div className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="api-secret-token-input" className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                    Token de Segurança (N8N_SECRET_TOKEN)
                  </label>
                  <input
                    id="api-secret-token-input"
                    type="text"
                    placeholder="Insira um token seguro (ex: 32 caracteres)..."
                    value={apiSecretToken}
                    onChange={(e) => setApiSecretToken(e.target.value)}
                    className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent font-mono transition-all"
                  />
                  <p className="text-[9px] text-mt-neutral-500 leading-relaxed font-normal">
                    * Deixe este campo em branco: a fonte oficial do token é a variável <code>N8N_SECRET_TOKEN</code> na Vercel (decisão de 2026-08-12 — uma fonte só, e é a env). Preencher aqui cria uma segunda fonte que passa a valer na frente da env.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={async () => {
                      try {
                        await updateWebhooks({
                          webhookUrl: webhookUrl.trim(),
                          webhookAvaliacaoUrl: webhookAvaliacaoUrl.trim(),
                          webhookNotificacoesUrl: webhookNotificacoesUrl.trim(),
                          webhookPropostaUrl: webhookPropostaUrl.trim(),
                          webhookDuvidasUrl: webhookDuvidasUrl.trim(),
                          events: eventsConfig,
                          apiSecretToken: apiSecretToken.trim()
                        });
                        alert("Token de segurança da API atualizado com sucesso!");
                      } catch (e) {
                        console.error("Failed to save security token:", e);
                      }
                    }}
                    className="h-10 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-[10px] font-bold uppercase tracking-widest px-5 transition-all duration-200  cursor-pointer shrink-0"
                  >
                    SALVAR CONFIGURAÇÃO DE SEGURANÇA
                  </button>
                  {apiSecretToken && (
                    <button
                      onClick={async () => {
                        setApiSecretToken("");
                        await updateWebhooks({
                          webhookUrl: webhookUrl.trim(),
                          webhookAvaliacaoUrl: webhookAvaliacaoUrl.trim(),
                          webhookNotificacoesUrl: webhookNotificacoesUrl.trim(),
                          webhookPropostaUrl: webhookPropostaUrl.trim(),
                          webhookDuvidasUrl: webhookDuvidasUrl.trim(),
                          events: eventsConfig,
                          apiSecretToken: ""
                        });
                        alert("Token de segurança removido (API agora é pública).");
                      }}
                      className="h-10 bg-mt-bg border border-mt-regua-fina text-mt-neutral-700 text-[10px] font-bold uppercase tracking-widest px-4 transition-all duration-200  cursor-pointer shrink-0"
                    >
                      Remover Token
                    </button>
                  )}
                </div>
              </div>
            </div>

          </div>
        ) : activeTab === "aparencia" ? (
          <AparenciaCores
            theme={theme}
            setTheme={setTheme}
            companySettings={companySettings}
            aoAbrirDadosDaEmpresa={() => handleTabChange("empresa")}
          />
        ) : activeTab === "compartilhamento" ? (
          <CardsCompartilhamento
            valor={companySettings.compartilhamento ?? {}}
            nomeLoja={companySettings.name}
            tituloDaAba={companySettings.tabTitle}
            aoEnviarImagem={enviarArteDeCompartilhamento}
            aoSalvar={salvarCompartilhamento}
          />
        ) : activeTab === "procedencia" ? (
          <FaixaProcedenciaTextos itens={procedencia} aoSalvar={updateProcedencia} />
        ) : activeTab === "instagram" ? (
          <InstagramCuradoria
            publicacoes={instagramCuradoria}
            aoSalvar={updateInstagramCuradoria}
          />
        ) : activeTab === "destaques" ? (
          // DESTAQUES RÁPIDOS CRUD
          <div className="flex flex-col gap-6">
            <div className="bg-mt-surface border border-mt-regua-fina p-6">
              <span className="mt-rotulo mt-rotulo-accent">
                Gerenciador de Tags de Destaque
              </span>
              <h2 className="mb-2 text-[17px] font-extrabold tracking-[-.015em] text-mt-ink">
                Categorias de Destaques Rápidos
              </h2>
              <p className="text-xs text-mt-neutral-700 mb-6 font-normal leading-relaxed">
                Adicione, remova ou modifique as categorias rápidas de filtragem que aparecem no console principal da página inicial do portal.
              </p>

              {/* Edit/Create Form */}
              {(editingQuickTag || isCreatingQuickTag) && (
                <div className="bg-mt-bg border border-mt-regua-fina p-5 mb-6 flex flex-col gap-4">
                  <h3 className="text-xs font-bold text-mt-ink uppercase tracking-wider">
                    {isCreatingQuickTag ? "Criar Novo Destaque" : `Editar Destaque: ${editingQuickTag?.name}`}
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">Nome da Categoria</label>
                      {/* O `uppercase` da classe é só CSS: mostrava em caixa alta e
                          gravava o que foi digitado. Foi assim que "pole position
                          motors" saiu em caixa baixa no trilho da home enquanto o
                          painel jurava o contrário. Agora grava o que mostra. */}
                      <input
                        type="text"
                        placeholder="EX: SUPER ESPORTIVOS"
                        value={editingQuickTag?.name || ""}
                        onChange={(e) => {
                          const nome = e.target.value.toUpperCase();
                          setEditingQuickTag(prev => prev ? { ...prev, name: nome } : { id: "custom-" + Date.now(), name: nome, field: "tipo", operator: "equals", value: "" });
                        }}
                        className="bg-mt-surface border border-mt-regua-fina text-xs text-mt-ink px-3 h-10 w-full placeholder-mt-neutral-500 uppercase"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">Campo Mapeado</label>
                      <select
                        value={editingQuickTag?.field || "tipo"}
                        onChange={(e) => {
                          const newField = e.target.value as any;
                          setEditingQuickTag(prev => prev ? { 
                            ...prev, 
                            field: newField,
                            operator: newField === "manual" ? "none" : prev.operator === "none" ? "equals" : prev.operator,
                            value: newField === "manual" ? "" : prev.value 
                          } : null);
                        }}
                        className="bg-mt-surface border border-mt-regua-fina text-xs text-mt-ink px-3 h-10 w-full cursor-pointer"
                      >
                        <option value="tipo">Carroceria (Tipo)</option>
                        <option value="perfil_uso">Estilo de Vida (Perfil de Uso)</option>
                        <option value="preco">Preço de Venda</option>
                        <option value="quilometragem">Quilometragem</option>
                        <option value="marca">Marca (Fabricante)</option>
                        <option value="combustivel">Combustível</option>
                        <option value="manual">Manual (Apenas Associação Direta)</option>
                      </select>
                    </div>

                    {editingQuickTag?.field !== "manual" && (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">Operador de Regra</label>
                          <select
                            value={editingQuickTag?.operator || "equals"}
                            onChange={(e) => setEditingQuickTag(prev => prev ? { ...prev, operator: e.target.value as any } : null)}
                            className="bg-mt-surface border border-mt-regua-fina text-xs text-mt-ink px-3 h-10 w-full cursor-pointer"
                          >
                            <option value="equals">Igual a</option>
                            <option value="contains">Contém Texto</option>
                            <option value="less">Menor que (&lt;)</option>
                            <option value="greater">Maior que (&gt;)</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">Valor Mapeado</label>
                          <input
                            type="text"
                            placeholder="EX: ESPORTIVO ou 150000"
                            value={editingQuickTag?.value || ""}
                            onChange={(e) => setEditingQuickTag(prev => prev ? { ...prev, value: e.target.value } : null)}
                            className="bg-mt-surface border border-mt-regua-fina text-xs text-mt-ink px-3 h-10 w-full placeholder-mt-neutral-500"
                          />
                        </div>
                      </>
                    )}

                    {/* Banner Mode Selector (Allows image background option or carousel for any category) */}
                    <div className="flex flex-col gap-1.5 sm:col-span-2 border-t border-mt-regua-fina pt-3">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                        Modo de Exibição do Banner no Topo da Landing Page
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingQuickTag(prev => prev ? { ...prev, bannerMode: "carousel" } : null)}
                          className={`h-10 px-3 text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                            (editingQuickTag?.bannerMode || "carousel") === "carousel"
                              ? "bg-mt-accent border-mt-accent text-mt-inverso"
                              : "bg-mt-surface border-mt-regua-fina text-mt-neutral-800 hover:border-mt-accent"
                          }`}
                        >
                          <span>Carrossel / Lista de Veículos</span>
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => setEditingQuickTag(prev => prev ? { ...prev, bannerMode: "image" } : null)}
                          className={`h-10 px-3 text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                            editingQuickTag?.bannerMode === "image"
                              ? "bg-mt-accent border-mt-accent text-mt-inverso"
                              : "bg-mt-surface border-mt-regua-fina text-mt-neutral-800 hover:border-mt-accent"
                          }`}
                        >
                          <span>Foto de Fundo Customizada</span>
                        </button>
                      </div>
                    </div>

                    {/* Custom Landing Page Description */}
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                        Descrição da Landing Page (Customizada)
                      </label>
                      <textarea
                        rows={2}
                        placeholder="EX: Selecionamos a dedo as melhores opções que se encaixam no seu estilo de vida..."
                        value={editingQuickTag?.description || ""}
                        onChange={(e) => setEditingQuickTag(prev => prev ? { ...prev, description: e.target.value } : null)}
                        className="bg-mt-surface border border-mt-regua-fina text-xs text-mt-ink p-3 w-full placeholder-mt-neutral-500 resize-none"
                      />
                    </div>

                    {/* Custom Landing Page Background Image (Shown when bannerMode is image OR when bgImageUrl exists) */}
                    {(editingQuickTag?.bannerMode === "image" || editingQuickTag?.bgImageUrl) && (
                      <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                          Imagem de Fundo do Banner (URL ou Upload)
                        </label>
                        <div className="flex flex-col sm:flex-row items-center gap-2">
                          <input
                            type="text"
                            placeholder="https://exemplo.com/imagem-fundo.jpg"
                            value={editingQuickTag?.bgImageUrl || ""}
                            onChange={(e) => setEditingQuickTag(prev => prev ? { ...prev, bgImageUrl: e.target.value, bannerMode: e.target.value ? "image" : prev.bannerMode } : null)}
                            className="bg-mt-surface border border-mt-regua-fina text-xs text-mt-ink px-3 h-10 w-full placeholder-mt-neutral-500"
                          />
                          <label className="h-10 px-4 bg-mt-surface hover:bg-mt-accent-100 border border-mt-regua-fina hover:border-mt-accent text-mt-ink text-[10px] font-bold uppercase tracking-widest flex items-center justify-center shrink-0 cursor-pointer transition-all ">
                            {isUploadingTagBg ? "Enviando..." : "Enviar imagem"}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={isUploadingTagBg}
                              onChange={handleTagBgUpload}
                            />
                          </label>
                        </div>
                        {editingQuickTag?.bgImageUrl && (
                          <div className="relative w-full h-28 overflow-hidden border border-mt-regua-fina mt-1">
                            <img
                              src={editingQuickTag.bgImageUrl}
                              alt="Preview de Fundo"
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => setEditingQuickTag(prev => prev ? { ...prev, bgImageUrl: "", bannerMode: "carousel" } : null)}
                              className="absolute top-2 right-2 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-[9px] font-bold px-2.5 py-1"
                            >
                              Remover Imagem
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={() => {
                        setEditingQuickTag(null);
                        setIsCreatingQuickTag(false);
                      }}
                      className="h-9 bg-mt-surface border border-mt-regua-fina text-mt-neutral-700 text-[10px] font-bold uppercase tracking-widest px-4  transition-all cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={async () => {
                        if (!editingQuickTag) return;
                        const isManual = editingQuickTag.field === "manual";
                        if (!editingQuickTag.name.trim() || (!isManual && !editingQuickTag.value.trim())) {
                          alert("Preencha todos os campos corretamente.");
                          return;
                        }
                        
                        const generatedId = slugifyTag(editingQuickTag.name) || "tag-" + Date.now();
                        const tagToSave: QuickTag = {
                          ...editingQuickTag,
                          id: isCreatingQuickTag ? generatedId : editingQuickTag.id,
                          operator: isManual ? "none" : editingQuickTag.operator,
                          value: isManual ? "" : editingQuickTag.value,
                          description: editingQuickTag.description || "",
                          bgImageUrl: editingQuickTag.bgImageUrl || "",
                          bannerMode: editingQuickTag.bannerMode || (editingQuickTag.bgImageUrl ? "image" : "carousel")
                        };
                        
                        const exists = quickTags.some(t => t.id === tagToSave.id);
                        const next = exists
                          ? quickTags.map(t => t.id === tagToSave.id ? tagToSave : t)
                          : [...quickTags, tagToSave];
                        setQuickTags(next);
                        await updateQuickTags(next);
                        
                        setEditingQuickTag(null);
                        setIsCreatingQuickTag(false);
                      }}
                      className="h-9 bg-mt-accent text-mt-inverso text-[10px] font-bold uppercase tracking-widest px-5  transition-all cursor-pointer"
                    >
                      Salvar Regra
                    </button>
                  </div>
                </div>
              )}

              {/* List of current quick tags */}
              <div className="flex flex-col gap-3">
                {quickTags.map((tag) => {
                  const tagSlug = slugifyTag(tag.name) || tag.id;
                  const linkedCount = vehicles.filter((v) => {
                    const manualTags = overrides[v.id]?.quick_tags ?? [];
                    if (manualTags.includes(tag.id) || manualTags.includes(tagSlug)) return true;
                    if (tag.field === "manual" || tag.operator === "none") return false;
                    let val: any = (v as any)[tag.field];
                    if (tag.field === "preco") val = v.preco_promocional > 0 && v.preco_promocional < v.preco_original ? v.preco_promocional : v.preco_original;
                    if (tag.field === "quilometragem") val = v.quilometragem;
                    const strVal = String(val || "").toLowerCase();
                    const targetVal = tag.value.toLowerCase();
                    if (tag.operator === "equals") return strVal === targetVal;
                    if (tag.operator === "contains") return strVal.includes(targetVal);
                    if (tag.operator === "less") return Number(val) < Number(tag.value);
                    if (tag.operator === "greater") return Number(val) > Number(tag.value);
                    return false;
                  }).length;

                  return (
                    <div key={tag.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-mt-bg border border-mt-regua-fina gap-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold text-mt-accent uppercase tracking-wider">{tag.name}</span>
                          <span className={`text-[8px] font-bold px-2 py-0.5 uppercase tracking-wider border ${
                            linkedCount > 0 
                              ? "bg-mt-surface text-mt-accent-800 border-mt-regua-fina" 
                              : "bg-mt-accent-100 text-mt-accent-800 border-mt-accent-300"
                          }`}>
                            {linkedCount} {linkedCount === 1 ? "veículo vinculado" : "veículos vinculados"}
                          </span>
                        </div>
                        <span className="text-[9px] text-mt-neutral-700 font-mono">
                          {tag.field === "manual" ? "Regra: Associação manual direta por veículo" : `Regra: ${tag.field} ${tag.operator} "${tag.value}"`}
                        </span>
                        {linkedCount === 0 && (
                          <span className="text-[9px] text-mt-accent-800 font-medium">
                            Nenhum veículo vinculado. Edite os veículos desejados na tabela de estoque abaixo e marque esta categoria para exibi-la na Home.
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          onClick={() => {
                            setEditingQuickTag({ ...tag });
                            setIsCreatingQuickTag(false);
                          }}
                          className="h-8 bg-mt-surface border border-mt-regua-fina hover:border-mt-accent text-mt-neutral-700 hover:text-mt-accent text-[9px] font-bold uppercase tracking-widest px-3  transition-all cursor-pointer"
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
                          className="h-8 bg-mt-accent-100 hover:bg-mt-accent-100 text-mt-accent border border-mt-accent-300 text-[9px] font-bold uppercase tracking-widest px-3  transition-all cursor-pointer"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}
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
                  className="mt-6 w-full h-11 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-[10px] font-bold uppercase tracking-widest  transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  Criar Nova Categoria de Destaque
                </button>
              )}
            </div>
          </div>
        ) : activeTab === "popups" ? (
          // POPUPS CAMPAIGNS CONFIGURATION
          <div className="flex flex-col gap-6">
            {/* Global parameters card */}
            <div className="bg-mt-surface border border-mt-regua-fina p-6">
              <span className="mt-rotulo mt-rotulo-accent">
                GATILHOS E COMPORTAMENTO
              </span>
              <h2 className="mb-2 text-[17px] font-extrabold tracking-[-.015em] text-mt-ink">
                MOTOR DE CAMPANHAS DE POP-UP
              </h2>
              <p className="text-xs text-mt-neutral-700 mb-6 font-normal leading-relaxed">
                Configure as diretrizes globais do sistema de pop-ups e gerencie campanhas comportamentais direcionadas para maximizar a conversão.
              </p>

              <form onSubmit={handleSavePopupSettings} className="flex flex-col gap-6">
                
                {/* Global Toggle */}
                <div className="flex items-center justify-between p-4 bg-mt-bg border border-mt-regua-fina">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-mt-ink uppercase">Ativar Sistema de Pop-ups</span>
                    <span className="text-[10px] text-mt-neutral-600 font-normal">Se desativado, nenhuma campanha será exibida aos usuários.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPopupSettings(prev => ({ ...prev, enabled: !prev.enabled }))}
                    className={`mt-foco relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center border-2 px-0.5 transition-colors duration-200 ease-in-out ${
                      popupSettings.enabled
                        ? "justify-end border-mt-accent bg-mt-accent"
                        : "justify-start border-mt-regua bg-transparent"
                    }`}
                  >
                    {/* Interruptor quadrado, como nas telas A3 e A12 do doc */}
                    <span
                      className={`pointer-events-none inline-block h-3.5 w-3.5 ${
                        popupSettings.enabled ? "bg-mt-inverso" : "bg-mt-neutral-500"
                      }`}
                    />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* O campo de número saiu daqui em 2026-08-10. Era o único
                      ponto do painel capaz de criar um segundo WhatsApp de
                      atendimento, e nada na tela avisava. O pop-up usa o
                      número de "Dados da concessionária", como o site todo. */}
                  <div className="col-span-2 border border-mt-regua-fina bg-mt-bg p-3.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      WhatsApp de destino
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-mt-neutral-700">
                      O pop-up abre a conversa no número cadastrado em{" "}
                      <strong className="text-mt-ink">Dados da concessionária</strong>. O
                      site inteiro usa esse mesmo número — para trocar, altere lá e vale
                      em todos os pontos de contato.
                    </p>
                  </div>

                  {/* Cooldown Hours */}
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      Período de Silêncio/Cooldown Geral (Horas entre exibições por cliente)
                    </label>
                    <input
                      type="number"
                      value={popupSettings.cooldownHours}
                      onChange={(e) => setPopupSettings(prev => ({ ...prev, cooldownHours: parseInt(e.target.value) || 0 }))}
                      className="w-full p-3.5 bg-mt-bg text-mt-ink border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                    />
                  </div>
                </div>

                {/* Save Global Settings */}
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="h-10 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-[10px] font-bold uppercase tracking-widest px-5 transition-all duration-200  cursor-pointer shrink-0"
                  >
                    {popupStatus === "saved" ? "CONFIGURAÇÕES SALVAS ✓" : "SALVAR DIRETRIZES"}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetPopupSettings}
                    className="h-10 bg-mt-bg border border-mt-regua-fina text-mt-neutral-700 text-[10px] font-bold uppercase tracking-widest px-4 transition-all duration-200  cursor-pointer shrink-0"
                  >
                    Restaurar Padrões
                  </button>
                </div>
              </form>
            </div>

            {/* Campaign Creator and Manager view */}
            <div className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-mt-regua-fina pb-3">
                <div className="flex flex-col gap-0.5">
                  <span className="mt-rotulo mt-rotulo-accent">CAMPANHAS ATIVAS</span>
                  <h3 className="text-base font-bold text-mt-ink">GERENCIAR CAMPANHAS</h3>
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
                    className="h-9 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-[10px] font-bold uppercase tracking-widest px-4 transition-all duration-200  cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    + Criar Campanha
                  </button>
                )}
              </div>

              {/* Campaign Edit Form */}
              {(isCreating || editingCampaign) && editingCampaign && (
                <div className="bg-mt-bg border border-mt-regua-fina p-5 flex flex-col gap-4 animate-scaleUp">
                  <h4 className="text-xs font-bold text-mt-accent uppercase">
                    {isCreating ? "Criar Nova Campanha" : `Editar Campanha: ${editingCampaign.name}`}
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Name */}
                    <div className="flex flex-col gap-1.5 col-span-2">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">Nome Interno da Campanha</label>
                      <input
                        type="text"
                        value={editingCampaign.name}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, name: e.target.value })}
                        className="w-full p-3 bg-mt-bg text-mt-ink border border-mt-regua-fina text-xs outline-none focus:border-mt-accent"
                      />
                    </div>

                    {/* Icon */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">Emoji / Ícone</label>
                      <input
                        type="text"
                        value={editingCampaign.icon}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, icon: e.target.value })}
                        placeholder="Ex: 🔥, 🤖, 📊"
                        className="w-full p-3 bg-mt-bg text-mt-ink border border-mt-regua-fina text-xs outline-none focus:border-mt-accent"
                      />
                    </div>

                     {/* Target Page */}
                     <div className="flex flex-col gap-1.5">
                       <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">Segmentação de Página</label>
                       <select
                         value={editingCampaign.targetPage}
                         onChange={(e) => setEditingCampaign({ 
                           ...editingCampaign, 
                           targetPage: e.target.value as any,
                           targetVehicleId: e.target.value === "specific" ? (editingCampaign.targetVehicleId || "") : undefined
                         })}
                         className="w-full p-3 bg-mt-bg text-mt-ink border border-mt-regua-fina text-xs outline-none focus:border-mt-accent"
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
                         <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                           Veículo de Destino Especial
                         </label>
                         <select
                           value={editingCampaign.targetVehicleId || ""}
                           onChange={(e) => setEditingCampaign({ ...editingCampaign, targetVehicleId: e.target.value })}
                           className="w-full p-3 bg-mt-bg text-mt-ink border border-mt-regua-fina text-xs outline-none focus:border-mt-accent cursor-pointer"
                         >
                           <option value="">Selecione o veículo...</option>
                           {vehicles.map((v) => (
                             <option key={v.id} value={v.id}>
                               {v.marca.toUpperCase()} {v.modelo.toUpperCase()} ({v.ano}) - R$ {v.preco_promocional > 0 ? v.preco_promocional.toLocaleString("pt-BR") : v.preco_original.toLocaleString("pt-BR")} [{v.id}]
                             </option>
                           ))}
                         </select>
                         <span className="text-[9px] text-mt-neutral-500">
                           Esta campanha será exibida com exclusividade apenas na ficha técnica (PDP) do veículo selecionado acima.
                         </span>
                       </div>
                     )}

                    {/* Trigger Type */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">Gatilho (Trigger)</label>
                      <select
                        value={editingCampaign.triggerType}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, triggerType: e.target.value as any })}
                        className="w-full p-3 bg-mt-bg text-mt-ink border border-mt-regua-fina text-xs outline-none focus:border-mt-accent"
                      >
                        <option value="time">Por Tempo de Permanência</option>
                        <option value="exit">Por Intenção de Saída (Exit Intent)</option>
                      </select>
                    </div>

                    {/* Delay seconds */}
                    {editingCampaign.triggerType === "time" && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">Delay de Exibição (Segundos)</label>
                        <input
                          type="number"
                          value={editingCampaign.delaySeconds}
                          onChange={(e) => setEditingCampaign({ ...editingCampaign, delaySeconds: parseInt(e.target.value) || 0 })}
                          className="w-full p-3 bg-mt-bg text-mt-ink border border-mt-regua-fina text-xs outline-none focus:border-mt-accent"
                        />
                      </div>
                    )}

                    {/* Action Type */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">Ação ao Clicar (CTA)</label>
                      <select
                        value={editingCampaign.actionType}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, actionType: e.target.value as any })}
                        className="w-full p-3 bg-mt-bg text-mt-ink border border-mt-regua-fina text-xs outline-none focus:border-mt-accent"
                      >
                        <option value="whatsapp">Enviar mensagem no WhatsApp</option>
                        <option value="link">Redirecionar para link interno</option>
                        <option value="compare">Abrir matriz comparativa de carros</option>
                      </select>
                    </div>

                    {/* Action Target (WhatsApp text template or target URL link) */}
                    {editingCampaign.actionType !== "compare" && (
                      <div className="flex flex-col gap-1.5 col-span-2">
                        <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                          {editingCampaign.actionType === "whatsapp" 
                            ? "Template de Mensagem do WhatsApp" 
                            : "Endereço de destino (Link / Âncora)"}
                        </label>
                        <textarea
                          value={editingCampaign.actionTarget}
                          onChange={(e) => setEditingCampaign({ ...editingCampaign, actionTarget: e.target.value })}
                          rows={2}
                          placeholder={editingCampaign.actionType === "whatsapp" ? "Ex: Olá! Gostaria de mais informações..." : "Ex: /avaliacao"}
                          className="w-full p-3 bg-mt-bg text-mt-ink border border-mt-regua-fina text-xs outline-none focus:border-mt-accent resize-none font-mono"
                        />
                        {editingCampaign.actionType === "whatsapp" && (
                          <span className="text-[9px] text-mt-neutral-500">Suporta placeholders: {"{ref}"} (Lead ID), {"{carro}"} (Veículo PDP), {"{preco}"} (Preço PDP).</span>
                        )}
                        {editingCampaign.actionType === "link" && (
                          <span className="text-[9px] text-mt-neutral-500">Dica: use links internos como `/avaliacao`, `/carro-perfeito` ou `/estoque`.</span>
                        )}
                      </div>
                    )}

                    {/* Header/Title */}
                    <div className="flex flex-col gap-1.5 col-span-2">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">Título do Pop-up (Visual)</label>
                      <input
                        type="text"
                        value={editingCampaign.title}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, title: e.target.value })}
                        className="w-full p-3 bg-mt-bg text-mt-ink border border-mt-regua-fina text-xs outline-none focus:border-mt-accent"
                      />
                    </div>

                    {/* Subtitle */}
                    <div className="flex flex-col gap-1.5 col-span-2">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">Subtítulo do Pop-up (Descrição)</label>
                      <textarea
                        value={editingCampaign.subtitle}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, subtitle: e.target.value })}
                        rows={2}
                        className="w-full p-3 bg-mt-bg text-mt-ink border border-mt-regua-fina text-xs outline-none focus:border-mt-accent resize-none"
                      />
                    </div>

                    {/* CTA Text */}
                    <div className="flex flex-col gap-1.5 col-span-2">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">Texto do Botão CTA</label>
                      <input
                        type="text"
                        value={editingCampaign.ctaText}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, ctaText: e.target.value })}
                        className="w-full p-3 bg-mt-bg text-mt-ink border border-mt-regua-fina text-xs outline-none focus:border-mt-accent"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => handleSaveCampaign(editingCampaign)}
                      className="h-10 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-[10px] font-bold uppercase tracking-widest px-4 transition-all  cursor-pointer"
                    >
                      Salvar Campanha
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCampaign(null);
                        setIsCreating(false);
                      }}
                      className="h-10 bg-mt-bg border border-mt-regua-fina text-mt-neutral-700 hover:text-mt-accent text-[10px] font-bold uppercase tracking-widest px-4 transition-all  cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* List campaigns */}
              <div className="flex flex-col gap-3 mt-2">
                {campaigns.length === 0 ? (
                  <div className="text-center py-8 bg-mt-bg border border-mt-regua-fina">
                    <p className="text-xs text-mt-neutral-700 font-normal">Nenhuma campanha cadastrada no momento.</p>
                  </div>
                ) : (
                  campaigns.map((camp) => (
                    <div
                      key={camp.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-mt-bg border gap-4 transition-all ${
                        camp.enabled ? "border-mt-regua-fina" : "border-mt-regua-fina opacity-60"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-xl pt-0.5">{camp.icon}</span>
                        <div className="flex flex-col gap-0.5">
                          <h4 className="text-xs font-bold text-mt-ink uppercase leading-none">
                            {camp.name} {!camp.enabled && " (INATIVA)"}
                          </h4>
                          <span className="text-[8px] font-bold text-mt-accent uppercase tracking-wider">
                            PÁGINA: {camp.targetPage === "specific" ? `VEÍCULO (${camp.targetVehicleId})` : camp.targetPage.toUpperCase()} • TRIGGER: {camp.triggerType.toUpperCase()}
                            {camp.triggerType === "time" && ` (${camp.delaySeconds}s)`} • AÇÃO: {camp.actionType.toUpperCase()}
                          </span>
                          <p className="text-[10px] text-mt-neutral-700 font-normal mt-1 max-w-md">{camp.title}: {camp.subtitle}</p>
                        </div>
                      </div>

                      {/* Action controllers */}
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        {/* Toggle active */}
                        <button
                          onClick={() => handleToggleCampaign(camp.id)}
                          className={`h-8 px-3 text-[9px] font-bold uppercase tracking-widest transition-all cursor-pointer ${
                            camp.enabled
                              ? "bg-mt-accent-100 text-mt-accent border border-mt-accent-300 hover:bg-mt-accent-100"
                              : "border border-mt-regua bg-transparent text-mt-neutral-700 hover:text-mt-ink"
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
                          className="h-8 bg-mt-bg border border-mt-regua-fina hover:border-mt-accent text-mt-neutral-700 hover:text-mt-accent text-[9px] font-bold uppercase tracking-widest px-3 transition-all cursor-pointer"
                        >
                          Editar
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => handleDeleteCampaign(camp.id)}
                          className="h-8 bg-mt-accent-100 hover:bg-mt-accent-100 text-mt-accent text-[9px] font-bold uppercase tracking-widest px-2.5 border border-mt-accent-300 transition-all cursor-pointer"
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
          <div className="flex flex-col gap-6">
            {/* Company Settings Section */}
            <div className="bg-mt-surface border border-mt-regua-fina p-6">
              <span className="mt-rotulo mt-rotulo-accent">
                Identidade & Atendimento
              </span>
              <h2 className="mb-2 text-[17px] font-extrabold tracking-[-.015em] text-mt-ink">
                DADOS DA CONCESSIONÁRIA
              </h2>
              <p className="text-xs text-mt-neutral-700 mb-6 font-normal leading-relaxed">
                Configure as informações básicas da sua empresa. Esses dados serão exibidos de forma dinâmica em todo o portal (rodapé, cabeçalho, formulários, botões de WhatsApp e PDPs).
              </p>

              <form onSubmit={handleSaveCompanySettings} className="flex flex-col gap-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Company Name */}
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      Nome Comercial da Concessionária
                    </label>
                    <input
                      type="text"
                      required
                      value={companyForm.name}
                      onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                      placeholder="Motors Store"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                    />
                  </div>

                  {/* Phone */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      Telefone Comercial / Fixo
                    </label>
                    <input
                      type="text"
                      required
                      value={companyForm.phone}
                      onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                      placeholder="(11) 4003-0000"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                    />
                  </div>

                  {/* CNPJ */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      CNPJ
                    </label>
                    <input
                      type="text"
                      value={companyForm.cnpj}
                      onChange={(e) => setCompanyForm({ ...companyForm, cnpj: e.target.value })}
                      placeholder="12.345.678/0001-99"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all font-mono"
                    />
                  </div>

                  {/* WhatsApp Formatted */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      WhatsApp (Exibição Formatada)
                    </label>
                    <input
                      type="text"
                      required
                      value={companyForm.whatsapp}
                      onChange={(e) => setCompanyForm({ ...companyForm, whatsapp: e.target.value })}
                      placeholder="(11) 99999-9999"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                    />
                  </div>

                  {/* WhatsApp Raw — o único número de atendimento do site.
                      Todo botão de WhatsApp, o pop-up de lead e o telefone do
                      schema.org saem daqui. Ver `lib/whatsapp.ts`. */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      WhatsApp de atendimento (só números, com DDI e DDD)
                    </label>
                    <input
                      type="text"
                      required
                      value={companyForm.whatsappRaw}
                      onChange={(e) => setCompanyForm({ ...companyForm, whatsappRaw: e.target.value.replace(/\D/g, "") })}
                      placeholder="DDI + DDD + número"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all font-mono"
                    />
                    <p className="text-[11px] leading-relaxed text-mt-neutral-700">
                      É o número usado em <strong className="text-mt-ink">todo</strong> o
                      site: botões do topo e do rodapé, ficha do veículo, curadoria,
                      avaliação e pop-up de lead. Trocar aqui troca em todos.
                    </p>
                  </div>

                  {/* Address */}
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      Endereço da Loja Física
                    </label>
                    <input
                      type="text"
                      required
                      value={companyForm.address}
                      onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                      placeholder="Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                    />
                  </div>

                  {/* Coordenadas do pin — alimentam o `geo` do AutoDealer.
                      Em branco o campo não é publicado: coordenada aproximada
                      diverge do pin do Perfil da Empresa, e divergência conta
                      contra o ranqueamento local. Ver `lib/schemaLoja.ts`. */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      Latitude do pin (opcional)
                    </label>
                    <input
                      type="text"
                      value={companyForm.latitude || ""}
                      onChange={(e) => setCompanyForm({ ...companyForm, latitude: e.target.value.trim() })}
                      placeholder="-25.3921"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                    />
                    <p className="text-[10px] leading-relaxed text-mt-neutral-600">
                      No Google Maps, clique com o botão direito sobre a entrada da loja e
                      copie as coordenadas. Só publique as reais — aproximação atrapalha.
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      Longitude do pin (opcional)
                    </label>
                    <input
                      type="text"
                      value={companyForm.longitude || ""}
                      onChange={(e) => setCompanyForm({ ...companyForm, longitude: e.target.value.trim() })}
                      placeholder="-49.2280"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                    />
                  </div>

                  {/* Business Hours */}
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      Horário de Funcionamento
                    </label>
                    <textarea
                      required
                      rows={2}
                      value={companyForm.hours}
                      onChange={(e) => setCompanyForm({ ...companyForm, hours: e.target.value })}
                      placeholder="Seg a Sex das 9h às 19h&#10;Sáb das 9h às 14h"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all resize-none"
                    />
                  </div>

                  {/* Instagram */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      Instagram (Link Completo)
                    </label>
                    <input
                      type="url"
                      value={companyForm.instagram}
                      onChange={(e) => setCompanyForm({ ...companyForm, instagram: e.target.value })}
                      placeholder="https://instagram.com/usuario"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all font-mono"
                    />
                  </div>

                  {/* Facebook */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      Facebook (Link Completo)
                    </label>
                    <input
                      type="url"
                      value={companyForm.facebook}
                      onChange={(e) => setCompanyForm({ ...companyForm, facebook: e.target.value })}
                      placeholder="https://facebook.com/pagina"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all font-mono"
                    />
                  </div>

                  {/* Favicon URL */}
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      Frase da Aba do Navegador (Opcional)
                    </label>
                    <input
                      type="text"
                      value={companyForm.tabTitle || ""}
                      onChange={(e) => setCompanyForm({ ...companyForm, tabTitle: e.target.value })}
                      placeholder="Ex: Motors Store | Seminovos Selecionados em Curitiba"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all font-mono"
                    />
                    <span className="text-[9px] text-mt-neutral-600 ml-1">
                      O título que aparece na aba do navegador.
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5 col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      Favicon Personalizado
                    </label>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      {companyForm.faviconUrl && (
                        <div className="w-12 h-12 bg-mt-bg border border-mt-regua-fina flex items-center justify-center p-2 overflow-hidden shrink-0">
                          <img src={companyForm.faviconUrl} alt="Favicon" className="w-full h-full object-contain" />
                        </div>
                      )}
                      <label className={`flex items-center justify-center gap-2 px-4 py-3 border border-mt-regua-fina text-xs font-bold transition-all cursor-pointer ${isUploadingFavicon ? 'opacity-50 cursor-not-allowed' : 'hover:bg-mt-accent-100 hover:border-mt-accent hover:text-mt-accent'}`}>
                        {isUploadingFavicon ? (
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        )}
                        <span>{isUploadingFavicon ? 'ENVIANDO...' : 'FAZER UPLOAD'}</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          disabled={isUploadingFavicon}
                          onChange={(e) => handleImageUpload(e, 'favicon')} 
                        />
                      </label>
                      {companyForm.faviconUrl && (
                        <button
                          type="button"
                          onClick={() => setCompanyForm({ ...companyForm, faviconUrl: "" })}
                          className="text-xs text-mt-accent-800 hover:text-mt-accent transition-colors px-2 py-3"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-mt-neutral-600 font-normal leading-relaxed">
                      Faça o upload de uma imagem para ser usada como o ícone da aba do navegador.
                    </p>
                  </div>

                  {/* Logo Upload */}
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      Logo Personalizado
                    </label>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      {companyForm.logoUrl && (
                        <div className="w-24 h-12 bg-mt-bg border border-mt-regua-fina flex items-center justify-center p-2 overflow-hidden shrink-0">
                          <img src={companyForm.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                        </div>
                      )}
                      <label className={`flex items-center justify-center gap-2 px-4 py-3 border border-mt-regua-fina text-xs font-bold transition-all cursor-pointer ${isUploadingLogo ? 'opacity-50 cursor-not-allowed' : 'hover:bg-mt-accent-100 hover:border-mt-accent hover:text-mt-accent'}`}>
                        {isUploadingLogo ? (
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        )}
                        <span>{isUploadingLogo ? 'ENVIANDO...' : 'FAZER UPLOAD'}</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          disabled={isUploadingLogo}
                          onChange={(e) => handleImageUpload(e, 'logo')} 
                        />
                      </label>
                      {companyForm.logoUrl && (
                        <button
                          type="button"
                          onClick={() => setCompanyForm({ ...companyForm, logoUrl: "" })}
                          className="text-xs text-mt-accent-800 hover:text-mt-accent transition-colors px-2 py-3"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-mt-neutral-600 font-normal leading-relaxed">
                      Faça o upload do logotipo oficial da empresa (será exibido no topo da página e menu lateral).
                    </p>
                  </div>

                  {/* E-mail de contato para LGPD */}
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <label htmlFor="input-privacy-email" className="text-[9px] font-bold text-mt-neutral-800 uppercase tracking-widest">
                      E-mail para Solicitações de Privacidade (LGPD)
                    </label>
                    <input
                      id="input-privacy-email"
                      type="email"
                      value={companyForm.privacyContactEmail || ""}
                      onChange={(e) => setCompanyForm({ ...companyForm, privacyContactEmail: e.target.value })}
                      placeholder="privacidade@motorsstore.com.br"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all font-mono"
                    />
                    <p className="text-[10px] text-mt-neutral-700 font-normal leading-relaxed">
                      Canal por onde clientes pedem acesso, correção ou exclusão dos dados deles. Exibido na página <code className="font-mono text-mt-accent">/privacidade</code>. A LGPD exige um canal de contato identificado — se ficar vazio, a página direciona para o formulário de contato como alternativa.
                    </p>
                  </div>

                  {/* GA4 / Google Tag ID */}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="input-ga4-id" className="text-[9px] font-bold text-mt-neutral-800 uppercase tracking-widest">
                      ID da Google Tag / Analytics (gtag.js)
                    </label>
                    <input
                      id="input-ga4-id"
                      type="text"
                      value={companyForm.ga4Id || ""}
                      onChange={(e) => setCompanyForm({ ...companyForm, ga4Id: e.target.value })}
                      placeholder="G-KBL1MFN9E3"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all font-mono"
                    />
                    <p className="text-[10px] text-mt-neutral-700 font-normal leading-relaxed">
                      Código da Google Tag (ex: <code className="font-mono text-mt-accent">G-KBL1MFN9E3</code>). O script da Google Tag é injetado automaticamente no &lt;head&gt; de todas as páginas.
                    </p>
                  </div>

                  {/* Google Tag Manager ID */}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="input-gtm-id" className="text-[9px] font-bold text-mt-neutral-800 uppercase tracking-widest">
                      ID do Google Tag Manager (Opcional)
                    </label>
                    <input
                      id="input-gtm-id"
                      type="text"
                      value={companyForm.gtmId || ""}
                      onChange={(e) => setCompanyForm({ ...companyForm, gtmId: e.target.value })}
                      placeholder="GTM-TB665RN9"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all font-mono"
                    />
                    <p className="text-[10px] text-mt-neutral-700 font-normal leading-relaxed">
                      Cole apenas o ID (ex: <code className="font-mono text-mt-accent">GTM-TB665RN9</code>) — se colar o snippet inteiro, o ID é extraído automaticamente. O container é injetado no &lt;head&gt; após o aceite de cookies.
                      <br />
                      <strong className="text-mt-accent-800">Atenção:</strong> GA4, Google Ads e Meta Pixel já são carregados diretamente pelo site. Não recrie essas tags dentro do GTM ou os eventos vão contar em dobro.
                    </p>
                  </div>

                  {/* Meta Pixel ID */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      ID do Meta Pixel
                    </label>
                    <input
                      type="text"
                      value={companyForm.metaPixelId || ""}
                      onChange={(e) => setCompanyForm({ ...companyForm, metaPixelId: e.target.value })}
                      placeholder="123456789012345"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all font-mono"
                    />
                  </div>

                  {/* Google Ads ID */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      ID de Conversão do Google Ads
                    </label>
                    <input
                      type="text"
                      value={companyForm.googleAdsId || ""}
                      onChange={(e) => setCompanyForm({ ...companyForm, googleAdsId: e.target.value })}
                      placeholder="AW-123456789"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all font-mono"
                    />
                  </div>

                  {/* Google Ads Conversion Label */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      Rótulo de Conversão do Google Ads (Opcional)
                    </label>
                    <input
                      type="text"
                      value={companyForm.googleAdsConversionLabel || ""}
                      onChange={(e) => setCompanyForm({ ...companyForm, googleAdsConversionLabel: e.target.value })}
                      placeholder="AbCdEfGhIjKlMnOpQrS"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all font-mono"
                    />
                  </div>

                  {/* Instagram Username */}
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      Username do Instagram (Para o feed preview - sem o @)
                    </label>
                    <input
                      type="text"
                      value={companyForm.instagramUsername || ""}
                      onChange={(e) => setCompanyForm({ ...companyForm, instagramUsername: e.target.value })}
                      placeholder="motorsstore.oficial"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all font-mono"
                    />
                  </div>

                  {/* Os dois campos de ID do Elfsight que ficavam aqui saíram
                      junto com o widget. A faixa do Instagram agora é curada em
                      "Faixa do Instagram", e as avaliações do Google vêm do
                      sync do n8n para o banco — nenhuma das duas depende de
                      código colado de fornecedor. */}
                  {/* Section Titles */}
                  <div className="flex flex-col gap-1.5 col-span-2 sm:col-span-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      Título da Seção: Match de Garagem
                    </label>
                    <input
                      type="text"
                      value={companyForm.carMatchTitle || ""}
                      onChange={(e) => setCompanyForm({ ...companyForm, carMatchTitle: e.target.value })}
                      placeholder="Match de Garagem"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 col-span-2 sm:col-span-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      Título da Seção: Avaliação Express
                    </label>
                    <input
                      type="text"
                      value={companyForm.avaliacaoExpressTitle || ""}
                      onChange={(e) => setCompanyForm({ ...companyForm, avaliacaoExpressTitle: e.target.value })}
                      placeholder="Avaliação Express"
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-mt-regua-fina">
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <label className="mt-rotulo mt-rotulo-accent">
                      Configurações de Storage S3 (Supabase)
                    </label>
                    <p className="text-[10px] text-mt-neutral-700 font-normal leading-relaxed">
                      Insira suas credenciais S3 do Supabase caso queira permitir a criação automática de buckets de storage via SDK da AWS (opcional).
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      Access Key ID
                    </label>
                    <input
                      type="text"
                      value={companyForm.s3AccessKeyId || ""}
                      onChange={(e) => setCompanyForm({ ...companyForm, s3AccessKeyId: e.target.value })}
                      placeholder="Ex: d41d8cd98f00b204e980..."
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                      Secret Access Key
                    </label>
                    <input
                      type="password"
                      value={companyForm.s3SecretAccessKey || ""}
                      onChange={(e) => setCompanyForm({ ...companyForm, s3SecretAccessKey: e.target.value })}
                      placeholder="Ex: 098f6bcd4621d373cade..."
                      className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Submit buttons */}
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="h-10 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-[10px] font-bold uppercase tracking-widest px-5 transition-all duration-200  cursor-pointer shrink-0"
                  >
                    {companyStatus === "saved" ? "DADOS SALVOS ✓" : "SALVAR INFORMAÇÕES"}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetCompanySettings}
                    className="h-10 bg-mt-bg border border-mt-regua-fina text-mt-neutral-700 text-[10px] font-bold uppercase tracking-widest px-4 transition-all duration-200  cursor-pointer shrink-0"
                  >
                    Restaurar Padrões
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : activeTab === "sobre" ? (
          <div className="flex flex-col gap-6">
            {/* About Page Settings Section */}
            <div className="bg-mt-surface border border-mt-regua-fina p-6">
              <span className="mt-rotulo mt-rotulo-accent">
                Conteúdo & Manifesto
              </span>
              <h2 className="mb-2 text-[17px] font-extrabold tracking-[-.015em] text-mt-ink">
                PÁGINA QUEM SOMOS
              </h2>
              <p className="text-xs text-mt-neutral-700 mb-6 font-normal leading-relaxed">
                Personalize o conteúdo da página "Quem Somos" (/sobre). Digite as informações em caixa alta nos títulos se desejar seguir a estética do site.
              </p>
              <p className="text-xs text-mt-neutral-700 mb-6 font-normal leading-relaxed">
                Nenhum campo é obrigatório: o que ficar em branco simplesmente não aparece
                na página — sem texto de exemplo no lugar. Para esvaziar uma seção inteira,
                deixe todos os campos dela em branco.
              </p>

              <form onSubmit={handleSaveAboutSettings} className="flex flex-col gap-8">
                {/* Seção 1: Hero */}
                <div className="flex flex-col gap-4 border-b border-mt-regua-fina pb-6">
                  <h3 className="text-xs font-bold text-mt-accent uppercase tracking-widest">
                    Seção 1: Manifesto Principal (Hero)
                  </h3>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                        Título Principal
                      </label>
                      <input
                        type="text"
                        value={aboutForm.heroTitle}
                        onChange={(e) => setAboutForm({ ...aboutForm, heroTitle: e.target.value })}
                        placeholder="3 DE CADA 10 ENTRAM"
                        className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                        Texto do Manifesto
                      </label>
                      <textarea
                        rows={3}
                        value={aboutForm.heroSubtitle}
                        onChange={(e) => setAboutForm({ ...aboutForm, heroSubtitle: e.target.value })}
                        placeholder="De um tradicional showroom físico..."
                        className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all resize-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Seção 2: Trajetória */}
                <div className="flex flex-col gap-4 border-b border-mt-regua-fina pb-6">
                  <h3 className="text-xs font-bold text-mt-accent uppercase tracking-widest">
                    Seção 2: Nossa Trajetória
                  </h3>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                        Título da Seção
                      </label>
                      <input
                        type="text"
                        value={aboutForm.historyTitle}
                        onChange={(e) => setAboutForm({ ...aboutForm, historyTitle: e.target.value })}
                        placeholder="A Herança da Motors Store"
                        className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                        Parágrafo 1 (História)
                      </label>
                      <textarea
                        rows={3}
                        value={aboutForm.historyP1}
                        onChange={(e) => setAboutForm({ ...aboutForm, historyP1: e.target.value })}
                        placeholder="Fundada há mais de uma década..."
                        className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all resize-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                        Parágrafo 2 (História)
                      </label>
                      <textarea
                        rows={3}
                        value={aboutForm.historyP2}
                        onChange={(e) => setAboutForm({ ...aboutForm, historyP2: e.target.value })}
                        placeholder="Nosso compromisso inegociável..."
                        className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all resize-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Seção 3: Diferenciais */}
                <div className="flex flex-col gap-4 border-b border-mt-regua-fina pb-6">
                  <h3 className="text-xs font-bold text-mt-accent uppercase tracking-widest">
                    Seção 3: Qualidade Absoluta (Diferenciais)
                  </h3>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                        Título do Bloco Lateral
                      </label>
                      <input
                        type="text"
                        value={aboutForm.valuesTitle}
                        onChange={(e) => setAboutForm({ ...aboutForm, valuesTitle: e.target.value })}
                        placeholder="Perícia e Rigor Técnico"
                        className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                        Diferencial 1 (Use dois pontos ":" para separar o título em negrito da descrição)
                      </label>
                      <input
                        type="text"
                        value={aboutForm.value1}
                        onChange={(e) => setAboutForm({ ...aboutForm, value1: e.target.value })}
                        placeholder="Laudo Cautelar 100% Livre: Histórico estrutural..."
                        className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                        Diferencial 2 (Use dois pontos ":" para separar o título em negrito da descrição)
                      </label>
                      <input
                        type="text"
                        value={aboutForm.value2}
                        onChange={(e) => setAboutForm({ ...aboutForm, value2: e.target.value })}
                        placeholder="Garantia de Showroom: Revisão profunda..."
                        className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                        Diferencial 3 (Use dois pontos ":" para separar o título em negrito da descrição)
                      </label>
                      <input
                        type="text"
                        value={aboutForm.value3}
                        onChange={(e) => setAboutForm({ ...aboutForm, value3: e.target.value })}
                        placeholder="Valoração Fipe de Precisão: Atualização contínua..."
                        className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Seção 4: Tecnologia */}
                <div className="flex flex-col gap-4">
                  <h3 className="text-xs font-bold text-mt-accent uppercase tracking-widest">
                    Seção 4: Pilares de Excelência
                  </h3>
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                          Título Principal da Tecnologia
                        </label>
                        <input
                          type="text"
                          value={aboutForm.techTitle}
                          onChange={(e) => setAboutForm({ ...aboutForm, techTitle: e.target.value })}
                          placeholder="NOSSOS PILARES DE EXCELÊNCIA"
                          className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                          Subtítulo da Tecnologia
                        </label>
                        <input
                          type="text"
                          value={aboutForm.techSubtitle}
                          onChange={(e) => setAboutForm({ ...aboutForm, techSubtitle: e.target.value })}
                          placeholder="Nossa plataforma web 2.0 não é apenas..."
                          className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
                      {/* Card 1 */}
                      <div className="flex flex-col gap-3 p-4 bg-mt-bg border border-mt-regua-fina animate-none">
                        <span className="text-[9px] font-extrabold text-mt-accent">CARD 1</span>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[8px] font-bold text-mt-neutral-600">Título</label>
                          <input
                            type="text"
                            value={aboutForm.card1Title}
                            onChange={(e) => setAboutForm({ ...aboutForm, card1Title: e.target.value })}
                            placeholder="PRECISÃO FIPE EXPRESS"
                            className="w-full p-2 bg-mt-surface border border-mt-regua-fina text-xs outline-none focus:border-mt-accent"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[8px] font-bold text-mt-neutral-600">Descrição</label>
                          <textarea
                            rows={3}
                            value={aboutForm.card1Desc}
                            onChange={(e) => setAboutForm({ ...aboutForm, card1Desc: e.target.value })}
                            placeholder="Algoritmo de cálculo..."
                            className="w-full p-2 bg-mt-surface border border-mt-regua-fina text-xs outline-none focus:border-mt-accent resize-none"
                          />
                        </div>
                      </div>

                      {/* Card 2 */}
                      <div className="flex flex-col gap-3 p-4 bg-mt-bg border border-mt-regua-fina animate-none">
                        <span className="text-[9px] font-extrabold text-mt-accent">CARD 2</span>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[8px] font-bold text-mt-neutral-600">Título</label>
                          <input
                            type="text"
                            value={aboutForm.card2Title}
                            onChange={(e) => setAboutForm({ ...aboutForm, card2Title: e.target.value })}
                            placeholder="ALGORITMO DE DISTÂNCIA"
                            className="w-full p-2 bg-mt-surface border border-mt-regua-fina text-xs outline-none focus:border-mt-accent"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[8px] font-bold text-mt-neutral-600">Descrição</label>
                          <textarea
                            rows={3}
                            value={aboutForm.card2Desc}
                            onChange={(e) => setAboutForm({ ...aboutForm, card2Desc: e.target.value })}
                            placeholder="Sistema dinâmico..."
                            className="w-full p-2 bg-mt-surface border border-mt-regua-fina text-xs outline-none focus:border-mt-accent resize-none"
                          />
                        </div>
                      </div>

                      {/* Card 3 */}
                      <div className="flex flex-col gap-3 p-4 bg-mt-bg border border-mt-regua-fina animate-none">
                        <span className="text-[9px] font-extrabold text-mt-accent">CARD 3</span>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[8px] font-bold text-mt-neutral-600">Título</label>
                          <input
                            type="text"
                            value={aboutForm.card3Title}
                            onChange={(e) => setAboutForm({ ...aboutForm, card3Title: e.target.value })}
                            placeholder="ASSISTENTE SEMÂNTICO LOCAL"
                            className="w-full p-2 bg-mt-surface border border-mt-regua-fina text-xs outline-none focus:border-mt-accent"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[8px] font-bold text-mt-neutral-600">Descrição</label>
                          <textarea
                            rows={3}
                            value={aboutForm.card3Desc}
                            onChange={(e) => setAboutForm({ ...aboutForm, card3Desc: e.target.value })}
                            placeholder="Analisador natural..."
                            className="w-full p-2 bg-mt-surface border border-mt-regua-fina text-xs outline-none focus:border-mt-accent resize-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Seção 5: Chamada para Ação Final (CTA) */}
                <div className="flex flex-col gap-4 border-t border-mt-regua-fina pt-6">
                  <h3 className="text-xs font-bold text-mt-accent uppercase tracking-widest">
                    Seção 5: Chamada para Ação Final (CTA)
                  </h3>
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                          Título Central (H2)
                        </label>
                        <input
                          type="text"
                          value={aboutForm.ctaTitle || ""}
                          onChange={(e) => setAboutForm({ ...aboutForm, ctaTitle: e.target.value })}
                          placeholder="PRONTO PARA ENCONTRAR SEU PRÓXIMO DESTINO?"
                          className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                          Texto de Apoio
                        </label>
                        <textarea
                          rows={3}
                          value={aboutForm.ctaDescription || ""}
                          onChange={(e) => setAboutForm({ ...aboutForm, ctaDescription: e.target.value })}
                          placeholder="Experimente a segurança da nossa curadoria digital..."
                          className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all resize-none"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                          Texto do Botão 1 (Destaque)
                        </label>
                        <input
                          type="text"
                          value={aboutForm.ctaBtn1Text || ""}
                          onChange={(e) => setAboutForm({ ...aboutForm, ctaBtn1Text: e.target.value })}
                          placeholder="INICIAR CURADORIA IA"
                          className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                          Texto do Botão 2 (Borda)
                        </label>
                        <input
                          type="text"
                          value={aboutForm.ctaBtn2Text || ""}
                          onChange={(e) => setAboutForm({ ...aboutForm, ctaBtn2Text: e.target.value })}
                          placeholder="FALE CONOSCO"
                          className="w-full p-3.5 bg-mt-bg text-mt-ink placeholder-mt-neutral-500 border border-mt-regua-fina text-xs outline-none focus:border-mt-accent transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submit buttons */}
                <div className="flex items-center gap-3 mt-4 border-t border-mt-regua-fina pt-6">
                  <button
                    type="submit"
                    className="h-10 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-[10px] font-bold uppercase tracking-widest px-5 transition-all duration-200  cursor-pointer shrink-0"
                  >
                    {aboutStatus === "saved" ? "CONTEÚDO SALVO ✓" : "SALVAR CONTEÚDO"}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetAboutSettings}
                    className="h-10 bg-mt-bg border border-mt-regua-fina text-mt-neutral-700 text-[10px] font-bold uppercase tracking-widest px-4 transition-all duration-200  cursor-pointer shrink-0"
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
