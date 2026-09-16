"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ehCaminhoDePdp } from "../lib/veiculoUrl";
import { getActiveAgUid, getUtmParameters, refCurta, trackLeadSubmission, trackContactClick } from "../lib/telemetry";
import { getMatchParams } from "../lib/tracking-identity";
import { linkWhatsApp, telefoneDoLead } from "../lib/whatsapp";
import { useTheme } from "../app/ThemeContext";
import LeadCaptureModal from "./LeadCaptureModal";
import { IconeWhatsApp, Seta } from "./modernist/primitivos";
import { ACOES } from "../lib/turnstile";

// ─── Default Configurations ───
const COOLDOWN_HOURS = 4;

// Minimum time (ms) the user must be on the page before exit-intent can fire.
// This prevents the false trigger that occurs when the browser fires mouseleave
// immediately on page load (cursor starts outside viewport).
const EXIT_INTENT_ENGAGEMENT_DELAY_MS = 5000;

interface Campaign {
  id: string;
  name: string;
  enabled: boolean;
  targetPage: "home" | "pdp" | "any" | "specific";
  targetVehicleId?: string;
  triggerType: "time" | "exit";
  delaySeconds: number;
  actionType: "whatsapp" | "link" | "compare";
  actionTarget: string;
  icon: string;
  title: string;
  subtitle: string;
  ctaText: string;
}

interface PopupSettings {
  enabled: boolean;
  cooldownHours: number;
}

const DEFAULT_SETTINGS: PopupSettings = {
  enabled: true,
  cooldownHours: 4,
};

// ─── Anti-Spam Storage Keys ───
const SESSION_KEY = "ag_popup_shown";
const COOLDOWN_KEY = "ag_popup_cooldown_ts";

// ─── Pop-up Variant Types ───
type PopupPageType = "home" | "pdp" | "any" | "specific";

interface VehicleContext {
  marca: string;
  modelo: string;
  ano: number;
  preco: number;
  id: string;
}

/**
 * O que o clique no CTA deixa armado para o envio de verdade.
 *
 * O pop-up se fecha ao abrir o modal de captura, então tudo o que a mensagem
 * e o payload precisam — campanha, veículo, texto resolvido e o countdown
 * congelado no clique — fica guardado aqui até o visitante confirmar o nome.
 */
interface LeadPendente {
  campaign: Campaign;
  vehicle: VehicleContext | null;
  leadMessage: string;
  timeRemaining: string;
}

// ─── Helper: Format price ───
function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

// ─── Helper: Format countdown MM:SS ───
function formatCountdown(seconds: number): { minutes: string; secs: string } {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return {
    minutes: String(m).padStart(2, "0"),
    secs: String(s).padStart(2, "0"),
  };
}

// ─── Helper: Check if on mobile viewport ───
function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 768;
}

// ─── Helper: Detect current page context ───
function detectPageContext(): { pageType: PopupPageType; vehicle: VehicleContext | null } {
  if (typeof window === "undefined") {
    return { pageType: "home", vehicle: null };
  }

  const path = window.location.pathname;

  // Ficha de veículo: /carros/… ou /motos/… (P6, 2026-08-19).
  // A régua mora em `lib/veiculoUrl.ts` — quando o segmento de moto
  // entrou, um `startsWith("/carros/")` aqui teria deixado a moto sem
  // popup de lead, e ninguém perceberia.
  if (ehCaminhoDePdp(path)) {
    try {
      const h1 = document.querySelector("h1");
      const segments = path.split("/").filter(Boolean);
      if (segments.length >= 4) {
        const marca = decodeURIComponent(segments[1]).replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        const modelo = decodeURIComponent(segments[2]).replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        
        let preco = 0;
        const priceEl = document.querySelector("[data-price]");
        if (priceEl) {
          preco = parseInt(priceEl.getAttribute("data-price") || "0");
        }
        if (preco === 0) {
          const allText = document.body.innerText;
          const priceMatch = allText.match(/R\$\s*([\d.]+)/);
          if (priceMatch) {
            preco = parseInt(priceMatch[1].replace(/\./g, ""));
          }
        }

        // Expose correct vehicle ID from data-vehicle-id attribute if available, or fall back to parsing slug
        let vehicleId = "";
        const rootEl = document.getElementById("pdp-vehicle-root");
        if (rootEl) {
          vehicleId = rootEl.getAttribute("data-vehicle-id") || "";
        }
        if (!vehicleId) {
          const lastSegment = segments[segments.length - 1] || "";
          const cleanSlug = lastSegment.replace(/\.html$/, "");
          const slugParts = cleanSlug.split("-");
          vehicleId = slugParts[slugParts.length - 1] || "";
        }

        return {
          pageType: "pdp",
          vehicle: {
            marca,
            modelo,
            ano: new Date().getFullYear(),
            preco,
            id: vehicleId,
          },
        };
      }
    } catch (e) {
      // Graceful fallback
    }

    return { pageType: "pdp", vehicle: null };
  }

  return { pageType: "home", vehicle: null };
}

// ─── Anti-Spam Checks ───
function hasBeenShownThisSession(): boolean {
  if (typeof window === "undefined") return true;
  return sessionStorage.getItem(SESSION_KEY) === "true";
}

function isInCooldownPeriod(cooldownHours: number): boolean {
  if (typeof window === "undefined") return true;
  try {
    const ts = localStorage.getItem(COOLDOWN_KEY);
    if (!ts) return false;
    
    const cooldownEnd = parseInt(ts) + cooldownHours * 60 * 60 * 1000;
    return Date.now() < cooldownEnd;
  } catch {
    return false;
  }
}

function markAsShown(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SESSION_KEY, "true");
  localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
}

// ─── Main Component ───
export default function LeadPopup() {
  const { companySettings, popups: campaigns, popupSettings: settings, webhooks } = useTheme();
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [vehicle, setVehicle] = useState<VehicleContext | null>(null);
  const [countdown, setCountdown] = useState(180);
  const [isExpired, setIsExpired] = useState(false);
  const [leadPendente, setLeadPendente] = useState<LeadPendente | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const exitIntentRef = useRef<boolean>(false);
  const mountTimestampRef = useRef<number>(0);

  // ── Dismiss popup with exit animation ──
  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    markAsShown();
    console.log("[Lead Popup] Dismissed by user.");
    setTimeout(() => {
      setIsVisible(false);
      setIsExiting(false);
    }, 380);
  }, []);

  // ── Lock body scroll while the popup is open (same pattern as the PDP lightbox) ──
  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isVisible]);

  // ── Show popup ──
  const triggerPopup = useCallback((campaign: Campaign, vehicleCtx: VehicleContext | null) => {
    if (hasBeenShownThisSession() || isInCooldownPeriod(settings?.cooldownHours ?? COOLDOWN_HOURS)) {
      console.log("[Lead Popup] Suppressed — anti-spam rule active.");
      return;
    }

    setActiveCampaign(campaign);
    setVehicle(vehicleCtx);
    setCountdown(180);
    setIsExpired(false);
    setIsVisible(true);
    markAsShown();

    console.log(`[Lead Popup] Triggered campaign: "${campaign.name}" targetPage: "${campaign.targetPage}"`);
    // `settings` nas deps: o disparo acontece segundos depois do arme, e a
    // checagem de cooldown acima precisa do valor que o admin salvou — com
    // `[]`, ela rodava para sempre com o default de fábrica.
  }, [settings]);

  // ── CTA Click: Handles actions (whatsapp, link, compare) ──
  const handleCtaClick = useCallback(() => {
    if (typeof window === "undefined" || !activeCampaign || !settings) return;

    const timeRemaining = `${formatCountdown(countdown).minutes}:${formatCountdown(countdown).secs}`;

    const ref = refCurta();
    const carro = vehicle ? `${vehicle.marca} ${vehicle.modelo}` : "";
    const preco = vehicle && vehicle.preco > 0 ? ` (${formatPrice(vehicle.preco)})` : "";

    // Sem referência, o template salvo no painel deixaria um "(Ref: )" órfão
    // na mensagem — a limpeza final tira o parêntese vazio inteiro.
    const resolvePlaceholders = (text: string) => {
      return text
        .replace(/{carro}/g, carro)
        .replace(/{preco}/g, preco)
        .replace(/{ref}/g, ref)
        .replace(/\s*\(Ref:\s*\)/g, "");
    };

    if (activeCampaign.actionType === "whatsapp") {
      // O clique NÃO é lead. Até 2026-08-19 este ramo postava um lead com o
      // nome fixo "Lead Popup" e disparava o pixel de conversão sem gente por
      // trás — funil inflado e evento vazio treinando o Meta. Decisão do
      // dono: nome real antes de qualquer evento, no mesmo modal (com
      // Turnstile) dos outros fluxos. O envio acontece em handleLeadSubmit.
      setLeadPendente({
        campaign: activeCampaign,
        vehicle,
        leadMessage: resolvePlaceholders(activeCampaign.actionTarget),
        timeRemaining,
      });

    } else if (activeCampaign.actionType === "link") {
      const targetUrl = resolvePlaceholders(activeCampaign.actionTarget);
      window.location.href = targetUrl;
    } else if (activeCampaign.actionType === "compare") {
      window.dispatchEvent(new CustomEvent("ag-open-compare"));
    }

    console.log(`[Lead Popup] CTA clicked. Campaign: "${activeCampaign.name}", Action: "${activeCampaign.actionType}"`);
    handleDismiss();
  }, [activeCampaign, vehicle, countdown, handleDismiss, settings]);

  // ── Envio de verdade: nome real + Turnstile, no padrão dos outros fluxos ──
  const handleLeadSubmit = async (leadData: { nome: string; email: string; whatsapp: string; turnstileToken: string }) => {
    if (!leadPendente) return;
    const { campaign, vehicle: veiculoDaCampanha, leadMessage, timeRemaining } = leadPendente;

    const agUid = getActiveAgUid();
    const utmParams = getUtmParameters();

    // `telefoneDoLead` normaliza o que veio do campo — que agora chega
    // mascarado, "(41) 99737-2165". As três linhas que estavam aqui tinham um
    // `cleanPhone` que não limpava nada: com 15 caracteres o teste de
    // comprimento falhava e o número seguia para o CRM com parênteses dentro
    // do `remoteJid`. Ver o comentário em `lib/whatsapp.ts`.
    const telefone = telefoneDoLead(leadData.whatsapp);
    const formattedPhone = telefone.comDDI ?? "";
    const remoteJid = telefone.remoteJid;

    // Dispara telemetria de conversão (Lead) no GA4/Meta Pixel ANTES do POST,
    // para reaproveitar o mesmo event_id na deduplicação do CAPI (servidor)
    const phoneE164 = telefone.e164;
    const eventId = trackLeadSubmission(
      veiculoDaCampanha
        ? { id: veiculoDaCampanha.id, marca: veiculoDaCampanha.marca, modelo: veiculoDaCampanha.modelo, preco: veiculoDaCampanha.preco }
        : { marca: "Lead Popup", modelo: campaign.name, preco: 0 },
      leadMessage,
      {
        googleAdsId: companySettings?.googleAdsId,
        googleAdsConversionLabel: companySettings?.googleAdsConversionLabel,
        email: leadData.email,
        phoneE164,
        tipoDeLead: "contato",
        formId: "form-popup-lead",
      }
    );
    const { fbp, fbc } = getMatchParams();

    // Dispatch lead via secure server proxy api
    // Wrapped: API failures must NEVER block the client from reaching WhatsApp
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remoteJid,
          telefone: formattedPhone,
          tipo: "lead_whatsapp",
          canal: "Lead Popup",
          campanha: campaign.name,
          variante: campaign.triggerType,
          mensagem: leadMessage,
          countdown_restante: timeRemaining,
          veiculo: veiculoDaCampanha ? {
            id: veiculoDaCampanha.id,
            marca: veiculoDaCampanha.marca,
            modelo: veiculoDaCampanha.modelo,
            ano: veiculoDaCampanha.ano,
            preco: veiculoDaCampanha.preco,
            veiculo_contexto: {
              perfil_uso: "CURADORIA EXCLUSIVA",
              tipo_badge: "OFERTA RELÂMPAGO",
            },
          } : null,
          cliente: {
            nome: leadData.nome,
            email: leadData.email,
            whatsapp: leadData.whatsapp
          },
          // Spread primeiro, defaults depois: preserva `gclid`, `gbraid`,
          // `wbraid`, `utm_term` e `fbclid` — que a versão anterior descartava
          // ao remontar o objeto campo a campo — sem perder a atribuição
          // própria do pop-up para quem chegou sem UTM nenhum.
          utm: {
            ...utmParams,
            utm_source: utmParams.utm_source || "lead-popup",
            utm_medium: utmParams.utm_medium || "organico",
            utm_campaign: utmParams.utm_campaign || campaign.name,
          },
          intencao_busca: { popup_campaign: campaign.name },
          agUid,
          eventId,
          eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
          fbp,
          fbc,
          turnstileToken: leadData.turnstileToken,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.warn("[Lead Submit Popup] API returned error (non-blocking):", errorData?.error || response.status);
      }
    } catch (fetchError) {
      console.warn(
        "[Lead Submit Popup] Network error (non-blocking):",
        fetchError instanceof Error ? fetchError.message : fetchError,
      );
    }

    // Save lead to history
    try {
      const rawHistory = localStorage.getItem("ag_leads_history");
      const history = rawHistory ? JSON.parse(rawHistory) : [];
      history.push({
        agUid,
        timestamp: new Date().toISOString(),
        tipoLead: "lead_whatsapp_popup",
        cliente: {
          nome: leadData.nome,
          email: leadData.email,
          whatsapp: leadData.whatsapp
        },
        campanha: campaign.name
      });
      localStorage.setItem("ag_leads_history", JSON.stringify(history));
    } catch (e) {
      console.warn("[Telemetry] Failed to save lead payload to history:", e);
    }

    // O pop-up tinha número próprio e escolhia comparando contra dois
    // valores mágicos, o que permitia à loja atender em dois números sem
    // perceber. Agora é o número da empresa, como no resto do site.
    const whatsappUrl = linkWhatsApp(companySettings, leadMessage);
    if (whatsappUrl) {
      // Consequência do lead recém-registrado — ver `pos_lead` em `lib/dataLayer.ts`.
      trackContactClick("whatsapp", "Lead Popup - Conversão WhatsApp", { pos_lead: true });
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    } else {
      console.warn("[LeadPopup] Sem número de WhatsApp configurado — nada a abrir.");
    }
  };

  // ── Countdown timer ──
  useEffect(() => {
    if (!isVisible || isExiting) return;

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setIsExpired(true);
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [isVisible, isExiting]);

  // ── Trigger logic ──
  //
  // Este efeito ARMA os gatilhos e o cleanup os DESARMA — então ele precisa
  // re-armar a cada mudança de settings/campanhas. Até 2026-08-19 havia um
  // `hasMountedRef` retornando cedo na segunda rodada, e a sequência real de
  // produção era: mount arma com as campanhas DEFAULT → o fetch do banco
  // chega ~1s depois e troca `campaigns` → o cleanup desarma tudo → a rodada
  // nova retorna cedo sem re-armar. Resultado: nenhuma campanha do painel
  // disparava, nunca — nem em produção, nem em dev (lá o StrictMode produzia
  // o mesmo desarme já no mount duplo).
  useEffect(() => {
    if (!settings || campaigns.length === 0) return;
    if (!settings.enabled) {
      console.log("[Lead Popup] Disabled by admin configurations.");
      return;
    }

    // O engajamento mínimo do exit-intent conta do PRIMEIRO arme — re-armar
    // por causa de um refetch de settings não devolve os 5s ao visitante.
    if (!mountTimestampRef.current) mountTimestampRef.current = Date.now();

    if (typeof window === "undefined") return;
    if (hasBeenShownThisSession() || isInCooldownPeriod(settings?.cooldownHours ?? COOLDOWN_HOURS)) {
      console.log("[Lead Popup] Suppressed on mount — anti-spam rule active.");
      return;
    }

    // Determine context
    const { pageType: detectedPageType, vehicle: detectedVehicle } = detectPageContext();

    // Filter active campaigns matching context
    const activeCampaigns = campaigns.filter(c => c.enabled);
    const eligibleCampaigns = activeCampaigns.filter((c) => {
      if (c.targetPage === "any") return true;
      if (c.targetPage === "home" && detectedPageType === "home") return true;
      if (c.targetPage === "pdp" && detectedPageType === "pdp") {
        // If the campaign specifically specifies a vehicle ID, it shouldn't show up on other PDPs
        if (c.targetVehicleId && c.targetVehicleId.trim() !== "") {
          return detectedVehicle?.id === c.targetVehicleId.trim();
        }
        return true; // generic PDP campaign
      }
      if (c.targetPage === "specific" && detectedPageType === "pdp") {
        return detectedVehicle?.id === c.targetVehicleId?.trim();
      }
      return false;
    });

    if (eligibleCampaigns.length === 0) return;

    // Time-based campaign trigger
    const timeCampaign = eligibleCampaigns.find(c => c.triggerType === "time");
    if (timeCampaign) {
      let delay = (timeCampaign.delaySeconds || 30) * 1000;
      if (isMobileViewport()) {
        delay += 15000; // Delay additional extra 15 seconds on mobile
      }
      timerRef.current = setTimeout(() => {
        triggerPopup(timeCampaign, detectedVehicle);
      }, delay);
    }

    // Exit-intent campaign trigger (DESKTOP ONLY — ≥1024px)
    // FIX: Uses mouseout on documentElement instead of mouseleave on document.
    // mouseleave on document fires falsely on page load when cursor starts outside viewport.
    // We also enforce a minimum engagement delay so the user must interact with the page
    // for at least EXIT_INTENT_ENGAGEMENT_DELAY_MS before exit-intent can fire.
    const exitCampaign = eligibleCampaigns.find(c => c.triggerType === "exit");
    if (exitCampaign && !isMobileViewport()) {
      let hasMouseEnteredPage = false;

      // Track when the mouse first enters the document — exit intent only makes sense
      // if the user's cursor was already inside the page and then moved to leave.
      // mousemove is more reliable than mouseenter because the cursor might already be inside the viewport on load
      const handleMouseMove = () => {
        hasMouseEnteredPage = true;
      };

      const handleExitIntent = (e: MouseEvent) => {
        // Guard 1: Only fire on desktop viewports
        if (window.innerWidth < 1024) return;

        // Guard 2: Must have already entered the page (prevents fire on initial load)
        if (!hasMouseEnteredPage) return;

        // Guard 3: Enforce minimum engagement time on the page
        const elapsed = Date.now() - mountTimestampRef.current;
        if (elapsed < EXIT_INTENT_ENGAGEMENT_DELAY_MS) return;

        // Guard 4: Only fire once
        if (exitIntentRef.current) return;

        // Guard 5: Mouse must be leaving through the top of the viewport (towards browser chrome/tabs)
        if (e.clientY > 20) return;

        // Guard 6: Verify the mouse is actually leaving the document bounds via relatedTarget
        const relatedTarget = e.relatedTarget as Node | null;
        if (relatedTarget && document.documentElement.contains(relatedTarget)) return;

        exitIntentRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        triggerPopup(exitCampaign, detectedVehicle);
        console.log("[Lead Popup] Exit-intent triggered after user engagement.");
      };

      // Use mousemove for initial detection and mouseout for exit intent
      document.documentElement.addEventListener("mousemove", handleMouseMove, { once: true });
      document.documentElement.addEventListener("mouseout", handleExitIntent);

      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        document.documentElement.removeEventListener("mousemove", handleMouseMove);
        document.documentElement.removeEventListener("mouseout", handleExitIntent);
      };
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [triggerPopup, settings, campaigns]);

  // ── Modal de captura: fora do guard do pop-up de propósito. O clique no
  // CTA fecha o pop-up (isVisible = false) e o retorno antecipado abaixo
  // desmontaria o modal junto — o lead pendente morreria sem envio. ──
  const modalCaptura = (
    <LeadCaptureModal
      action={ACOES.popup}
      isOpen={leadPendente !== null}
      onClose={() => setLeadPendente(null)}
      onSubmit={handleLeadSubmit}
      vehicleInfo={
        // Sem `ano`: o contexto do pop-up chuta o ano corrente, e mostrar
        // ano errado no modal é pior que não mostrar.
        leadPendente?.vehicle
          ? { marca: leadPendente.vehicle.marca, modelo: leadPendente.vehicle.modelo }
          : undefined
      }
    />
  );

  // ── Don't render anything if not visible or settings not loaded ──
  if (!isVisible || !settings || !activeCampaign) return modalCaptura;

  const { minutes, secs } = formatCountdown(countdown);
  const progressPercent = (countdown / 180) * 100;

  const ref = refCurta();
  const carro = vehicle ? `${vehicle.marca} ${vehicle.modelo}` : "veículo";
  const preco = vehicle && vehicle.preco > 0 ? ` (${formatPrice(vehicle.preco)})` : "";

  const resolvePlaceholders = (text: string) => {
    return text
      .replace(/{carro}/g, carro)
      .replace(/{preco}/g, preco)
      .replace(/{ref}/g, ref)
      .replace(/\s*\(Ref:\s*\)/g, "");
  };

  const title = resolvePlaceholders(activeCampaign.title);
  const subtitle = resolvePlaceholders(activeCampaign.subtitle);

  // Resolve the CTA text: for whatsapp campaigns, use "Garantir Proposta no WhatsApp"
  const resolvedCtaText = activeCampaign.actionType === "whatsapp"
    ? "GARANTIR PROPOSTA NO WHATSAPP"
    : activeCampaign.ctaText;

  return (
    <>
      {/* Backdrop overlay — véu chapado, sem vidro: o sistema separa por
          régua e sombra, não por desfoque */}
      <div
        className={`fixed inset-0 z-[998] bg-black/50 ${isExiting ? "opacity-0 transition-opacity duration-300" : "animate-fadeInBackdrop"}`}
        onClick={handleDismiss}
        aria-hidden="true"
      />

      {/* Pop-up card — centered on desktop, bottom-sheet on mobile */}
      <div
        className={`fixed z-[999] flex justify-center pointer-events-none
          bottom-0 left-0 right-0 px-4 pb-4
          sm:inset-0 sm:items-center sm:px-6 sm:pb-0
          ${isExiting ? "animate-slideDownPopup" : "animate-slideUpPopup"}`}
        role="dialog"
        aria-modal="true"
        aria-label="Oferta especial"
      >
        <div className="pointer-events-auto w-full max-w-[420px] max-h-[calc(100dvh-2rem)] flex flex-col bg-mt-bg text-mt-ink shadow-[var(--mt-shadow-lg)] overflow-hidden relative">

          {/* Trilho do countdown — a barra de acento esvazia com o tempo */}
          <div className="h-[3px] w-full shrink-0 bg-mt-regua-fina relative overflow-hidden">
            {!isExpired && (
              <div
                className="absolute top-0 left-0 h-full bg-mt-accent transition-all duration-1000 ease-linear"
                style={{ width: `${progressPercent}%` }}
              />
            )}
          </div>

          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-[3px] right-0 h-11 w-11 flex items-center justify-center text-mt-neutral-600 hover:text-mt-ink hover:bg-black/5 transition-colors duration-150 z-10 cursor-pointer mt-foco"
            aria-label="Fechar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="min-h-0 overflow-y-auto overscroll-contain px-6 pt-6 pb-5 sm:px-7 sm:pt-7 sm:pb-6 flex flex-col text-left">

            {/* Countdown — rótulo em versalete e dígitos em tinta; vermelho
                fica reservado ao CTA e ao trilho, onde há decisão */}
            {!isExpired ? (
              <div className="flex items-baseline justify-between gap-4 pr-12">
                <span className="mt-rotulo">Condição exclusiva expira em</span>
                <span className="text-[26px] font-extrabold leading-none tracking-[-.03em] tabular-nums">
                  {minutes}:{secs}
                </span>
              </div>
            ) : (
              <div className="flex items-baseline justify-between gap-4 pr-12">
                <span className="mt-rotulo mt-rotulo-accent">Tempo esgotado</span>
                <span className="text-[11px] text-mt-neutral-600">
                  Ainda dá para garantir sua proposta
                </span>
              </div>
            )}

            <div className="mt-4 border-t-2 border-mt-regua" aria-hidden="true" />

            {/* Icon + Headlines */}
            <div className="mt-5 flex flex-col gap-2.5">
              {activeCampaign.icon && (
                <span className="text-[26px] leading-none" aria-hidden="true">
                  {activeCampaign.icon}
                </span>
              )}
              <h3 className="m-0 text-[22px] font-extrabold leading-[1.08] tracking-[-.02em] text-mt-ink">
                {title}
              </h3>
              <p className="m-0 text-[13px] leading-relaxed text-mt-neutral-700">
                {subtitle}
              </p>
            </div>

            {/* CTA — botão do sistema: acento, zero raio, rótulo à esquerda.
                O verde de WhatsApp era herança do desenho antigo; na loja
                Modernist todo CTA de WhatsApp é o primário (BotaoWhatsApp) */}
            <button
              onClick={handleCtaClick}
              className="mt-btn mt-btn-primario mt-btn-bloco mt-foco mt-6 uppercase"
            >
              {activeCampaign.actionType === "whatsapp" && <IconeWhatsApp size={17} />}
              {activeCampaign.actionType === "link" && <Seta size={16} />}
              {activeCampaign.actionType === "compare" && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M6 8l-4 4 4 4M18 8l4 4-4 4" />
                </svg>
              )}
              {resolvedCtaText}
            </button>

            {/* Dismiss link */}
            <button
              onClick={handleDismiss}
              className="mt-3.5 self-start py-1 text-[11px] font-medium text-mt-neutral-600 hover:text-mt-ink transition-colors duration-150 cursor-pointer"
            >
              Não, obrigado. Talvez depois.
            </button>
          </div>
        </div>
      </div>
      {modalCaptura}
    </>
  );
}
