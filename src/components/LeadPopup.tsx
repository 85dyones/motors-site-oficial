"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getActiveAgUid, getUtmParameters } from "../lib/telemetry";
import { useTheme } from "../app/ThemeContext";

// ─── Default Configurations ───
const COOLDOWN_HOURS = 4;                  
const WHATSAPP_NUMBER = "5511999999999";

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
  whatsappNumber: string;
}

const DEFAULT_SETTINGS: PopupSettings = {
  enabled: true,
  cooldownHours: 4,
  whatsappNumber: "5511999999999",
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

  // PDP detection: /carros/[marca]/[modelo]/[versao]/[slug]
  if (path.startsWith("/carros/")) {
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

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const exitIntentRef = useRef<boolean>(false);
  const hasMountedRef = useRef(false);
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
  }, []);

  // ── CTA Click: Handles actions (whatsapp, link, compare) ──
  const handleCtaClick = useCallback(() => {
    if (typeof window === "undefined" || !activeCampaign || !settings) return;

    const agUid = getActiveAgUid();
    const utmParams = getUtmParameters();
    const timeRemaining = `${formatCountdown(countdown).minutes}:${formatCountdown(countdown).secs}`;

    const ref = agUid;
    const carro = vehicle ? `${vehicle.marca} ${vehicle.modelo}` : "";
    const preco = vehicle && vehicle.preco > 0 ? ` (${formatPrice(vehicle.preco)})` : "";

    const resolvePlaceholders = (text: string) => {
      return text
        .replace(/{carro}/g, carro)
        .replace(/{preco}/g, preco)
        .replace(/{ref}/g, ref);
    };

    if (activeCampaign.actionType === "whatsapp") {
      const leadMessage = resolvePlaceholders(activeCampaign.actionTarget);

      // Dispatch to webhook via secure server proxy
      fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "lead_whatsapp",
          canal: "Lead Popup",
          campanha: activeCampaign.name,
          variante: activeCampaign.triggerType,
          mensagem: leadMessage,
          countdown_restante: timeRemaining,
          veiculo: vehicle ? {
            id: vehicle.id,
            marca: vehicle.marca,
            modelo: vehicle.modelo,
            ano: vehicle.ano,
            preco: vehicle.preco,
            veiculo_contexto: {
              perfil_uso: "CURADORIA EXCLUSIVA",
              tipo_badge: "OFERTA RELÂMPAGO",
            },
          } : null,
          cliente: { nome: "Lead Popup" },
          utm: {
            utm_source: utmParams.utm_source || "lead-popup",
            utm_medium: utmParams.utm_medium || "organico",
            utm_campaign: utmParams.utm_campaign || activeCampaign.name,
            utm_content: utmParams.utm_content,
          },
          intencao_busca: { popup_campaign: activeCampaign.name },
          agUid,
        }),
      }).catch((err) => console.warn("[Webhook] Lead Popup campaign dispatch failed:", err));

      // Open WhatsApp
      const targetNumber = (settings?.whatsappNumber && settings.whatsappNumber !== "554198089550" && settings.whatsappNumber !== "5511999999999")
        ? settings.whatsappNumber
        : companySettings.whatsappRaw;
      const whatsappUrl = `https://wa.me/${targetNumber}?text=${encodeURIComponent(leadMessage)}`;
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");

    } else if (activeCampaign.actionType === "link") {
      const targetUrl = resolvePlaceholders(activeCampaign.actionTarget);
      window.location.href = targetUrl;
    } else if (activeCampaign.actionType === "compare") {
      window.dispatchEvent(new CustomEvent("ag-open-compare"));
    }

    console.log(`[Lead Popup] CTA clicked. Campaign: "${activeCampaign.name}", Action: "${activeCampaign.actionType}"`);
    handleDismiss();
  }, [activeCampaign, vehicle, countdown, handleDismiss, settings]);

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

  // ── Trigger logic on mount ──
  useEffect(() => {
    if (!settings || campaigns.length === 0) return;
    if (!settings.enabled) {
      console.log("[Lead Popup] Disabled by admin configurations.");
      return;
    }

    if (hasMountedRef.current) return;
    hasMountedRef.current = true;

    // Record the mount timestamp so we can enforce engagement delay for exit-intent
    mountTimestampRef.current = Date.now();

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

  // ── Don't render anything if not visible or settings not loaded ──
  if (!isVisible || !settings || !activeCampaign) return null;

  const { minutes, secs } = formatCountdown(countdown);
  const progressPercent = (countdown / 180) * 100;

  const ref = getActiveAgUid();
  const carro = vehicle ? `${vehicle.marca} ${vehicle.modelo}` : "veículo";
  const preco = vehicle && vehicle.preco > 0 ? ` (${formatPrice(vehicle.preco)})` : "";

  const resolvePlaceholders = (text: string) => {
    return text
      .replace(/{carro}/g, carro)
      .replace(/{preco}/g, preco)
      .replace(/{ref}/g, ref);
  };

  const title = resolvePlaceholders(activeCampaign.title);
  const subtitle = resolvePlaceholders(activeCampaign.subtitle);

  // Resolve the CTA text: for whatsapp campaigns, use "Garantir Proposta no WhatsApp"
  const resolvedCtaText = activeCampaign.actionType === "whatsapp"
    ? "GARANTIR PROPOSTA NO WHATSAPP"
    : activeCampaign.ctaText;

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 z-[998] bg-black/40 backdrop-blur-sm ${isExiting ? "opacity-0 transition-opacity duration-300" : "animate-fadeInBackdrop"}`}
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
        <div className="pointer-events-auto w-full max-w-[420px] bg-brand-card/95 backdrop-blur-xl border border-brand-card-border rounded-[20px] shadow-[0_12px_60px_rgba(0,0,0,0.25)] overflow-hidden relative">
          
          {/* Brand accent bar at the very top */}
          <div className="h-1 w-full bg-gradient-to-r from-brand-primary via-brand-gold to-brand-primary relative overflow-hidden">
            {!isExpired && (
              <div
                className="absolute top-0 right-0 h-full bg-brand-card/60 transition-all duration-1000 ease-linear"
                style={{ width: `${100 - progressPercent}%` }}
              />
            )}
          </div>

          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-3.5 right-3.5 h-8 w-8 flex items-center justify-center rounded-full bg-brand-bg/60 hover:bg-brand-border/80 text-brand-text/40 hover:text-brand-text/70 transition-all duration-200 text-xs z-10 cursor-pointer backdrop-blur-sm border border-brand-border/30"
            aria-label="Fechar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="px-6 pt-6 pb-5 flex flex-col items-center gap-4 text-center">

            {/* Countdown timer display */}
            {!isExpired ? (
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-[9px] font-bold text-brand-text/40 uppercase tracking-[0.2em]">
                  Condição exclusiva expira em
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="bg-brand-bg border border-brand-border rounded-xl px-3 py-2 min-w-[42px] text-center">
                    <span className="text-xl font-black text-brand-primary tabular-nums">{minutes}</span>
                  </div>
                  <span className="text-xl font-black text-brand-text/20 animate-pulse">:</span>
                  <div className="bg-brand-bg border border-brand-border rounded-xl px-3 py-2 min-w-[42px] text-center">
                    <span className="text-xl font-black text-brand-primary tabular-nums">{secs}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <span className="text-[9px] font-bold text-red-500/80 uppercase tracking-[0.2em]">
                  Tempo esgotado
                </span>
                <span className="text-[11px] text-brand-text/40 font-light">
                  Mas você ainda pode garantir sua proposta
                </span>
              </div>
            )}

            {/* Icon + Headlines */}
            <div className="flex flex-col items-center gap-2">
              <div className="h-12 w-12 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-2xl">
                {activeCampaign.icon}
              </div>
              <h3 className="text-sm font-extrabold text-brand-text uppercase tracking-wide leading-tight max-w-[300px]">
                {title}
              </h3>
              <p className="text-[11px] text-brand-text/50 leading-relaxed max-w-[300px] font-light">
                {subtitle}
              </p>
            </div>

            {/* CTA WhatsApp/Action button */}
            <button
              onClick={handleCtaClick}
              className={`w-full h-[52px] rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all duration-200 shadow-lg cursor-pointer active:scale-[0.97] ${
                activeCampaign.actionType === "whatsapp"
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20"
                  : "bg-brand-primary hover:bg-brand-primary-hover text-white shadow-brand-primary/20"
              }`}
            >
              {activeCampaign.actionType === "whatsapp" && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className="w-4.5 h-4.5">
                  <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                </svg>
              )}
              {activeCampaign.actionType === "link" && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                </svg>
              )}
              {activeCampaign.actionType === "compare" && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M6 8l-4 4 4 4M18 8l4 4-4 4" />
                </svg>
              )}
              {resolvedCtaText}
            </button>

            {/* Dismiss link */}
            <button
              onClick={handleDismiss}
              className="text-[10px] text-brand-text/70 hover:text-brand-text transition-colors duration-200 font-medium cursor-pointer py-0.5"
            >
              Não, obrigado. Talvez depois.
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
