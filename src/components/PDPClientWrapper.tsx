"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Veiculo, truncateString } from "../lib/supabase";
import { getUtmParameters, getActiveAgUid } from "../lib/telemetry";
import LeadCaptureModal from "./LeadCaptureModal";
import { useTheme } from "../app/ThemeContext";

interface PDPClientWrapperProps {
  veiculo: Veiculo;
}

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  });
}

function formatKm(value: number): string {
  if (value === 0) return "Sem Uso (0 km)";
  return `${value.toLocaleString("pt-BR")} km`;
}

function resolveDirecao(car: Veiculo): string {
  const text = `${car.opcionais} ${car.laudo_pericia} ${car.descricao || ""}`.toLowerCase();
  if (text.includes("hidráulica") || text.includes("hidraulica")) return "Hidráulica";
  if (text.includes("mecânica") || text.includes("mecanica")) return "Mecânica";
  if (car.marca.toLowerCase() === "toyota" && car.modelo.toLowerCase().includes("hilux")) {
    return "Hidráulica";
  }
  return "Elétrica";
}

function getShortVehicleId(id: string): string {
  if (!id) return "";
  const parts = id.split("-");
  if (parts.length > 1) {
    const last2 = parts.slice(-2).join("-").toUpperCase();
    if (last2.length >= 4) return last2;
  }
  return id.substring(0, 8).toUpperCase();
}

function resolveTagColorClass(color?: string): string {
  switch (color) {
    case "red":
      return "bg-red-600/90 border-red-500/20 text-white";
    case "gold":
      return "bg-amber-500/90 border-amber-400/20 text-white";
    case "gray":
      return "bg-zinc-600/90 border-zinc-500/20 text-white";
    case "primary":
      return "bg-brand-primary/95 border-brand-primary-hover/20 text-white";
    case "green":
    default:
      return "bg-green-500/90 border-emerald-400/20 text-white";
  }
}

export default function PDPClientWrapper({ veiculo: initialVeiculo }: PDPClientWrapperProps) {
  const { companySettings, webhooks, stockOverrides } = useTheme();
  const [veiculo, setVeiculo] = useState<Veiculo>(initialVeiculo);
  const [agUid, setAgUid] = useState("ag_ref_nao_localizado");
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [opcionaisOpen, setOpcionaisOpen] = useState(true);
  const [periciaOpen, setPericiaOpen] = useState(true);
  
  // Lightbox fullscreen photo viewing states
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxImageIndex, setLightboxImageIndex] = useState(0);

  // Lead modal states
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [activeMessage, setActiveMessage] = useState("");
  
  const carouselRef = useRef<HTMLDivElement>(null);

  const displayImages = veiculo.whatsapp_images && veiculo.whatsapp_images.length > 0
    ? veiculo.whatsapp_images
    : veiculo.web_full_images;

  // Sync prop changes
  useEffect(() => {
    setVeiculo(initialVeiculo);
  }, [initialVeiculo]);

  // Handle body scroll locking when lightbox is active
  useEffect(() => {
    if (isLightboxOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isLightboxOpen]);

  // Handle lightbox keyboard navigation (Escape to close, Arrows to navigate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isLightboxOpen) return;
      if (e.key === "Escape") {
        setIsLightboxOpen(false);
      } else if (e.key === "ArrowRight") {
        setLightboxImageIndex((prev) => (prev + 1) % veiculo.web_full_images.length);
      } else if (e.key === "ArrowLeft") {
        setLightboxImageIndex((prev) => (prev - 1 + veiculo.web_full_images.length) % veiculo.web_full_images.length);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLightboxOpen, veiculo.web_full_images.length]);

  // Load client-side overrides on mount / when initialVeiculo or stockOverrides changes
  useEffect(() => {
    if (stockOverrides) {
      const itemOverrides = stockOverrides[initialVeiculo.id];
      if (itemOverrides) {
        setVeiculo((prev) => ({
          ...prev,
          ...itemOverrides,
        }));
        console.log(`[Overrides] Applied local overrides for vehicle ${initialVeiculo.id} in PDP:`, itemOverrides);
      }
    }
  }, [initialVeiculo, stockOverrides]);

  // Fetch tracking ID from LocalStorage on mount
  useEffect(() => {
    const uid = getActiveAgUid();
    setAgUid(uid);
    
    // Dynamic page view logger
    console.log(`[Antigravity Log] PageView iniciada para o veículo: ${veiculo.marca} ${veiculo.modelo} ID: ${veiculo.id}`);

    // Track seen vehicle history for homepage personalization
    if (typeof window !== "undefined") {
      try {
        const seenRaw = localStorage.getItem("ag_seen_vehicles");
        const seenArr: string[] = seenRaw ? JSON.parse(seenRaw) : [];
        if (!seenArr.includes(veiculo.id)) {
          seenArr.push(veiculo.id);
          localStorage.setItem("ag_seen_vehicles", JSON.stringify(seenArr));
        }
      } catch (e) {
        console.warn("[Telemetry] Failed to track seen vehicle:", e);
      }
    }
  }, [veiculo]);

  // Track scroll inside horizontal scroll-snap gallery to highlight corresponding thumbnail
  const handleCarouselScroll = () => {
    if (carouselRef.current) {
      const { scrollLeft, clientWidth } = carouselRef.current;
      const newIndex = Math.round(scrollLeft / clientWidth);
      setActiveImageIndex(newIndex);
    }
  };

  // Scroll carousel to selected image index on thumbnail click
  const scrollCarouselTo = (index: number) => {
    if (carouselRef.current) {
      const clientWidth = carouselRef.current.clientWidth;
      carouselRef.current.scrollTo({
        left: index * clientWidth,
        behavior: "smooth"
      });
      setActiveImageIndex(index);
    }
  };

  const hasDiscount =
    veiculo.preco_promocional > 0 &&
    veiculo.preco_promocional < veiculo.preco_original;
  
  const finalPrice = hasDiscount ? veiculo.preco_promocional : veiculo.preco_original;

  // Split comma-separated features into array
  const featuresList = veiculo.opcionais
    ? veiculo.opcionais.split(",").map((f) => f.trim()).filter(Boolean)
    : [];

  // WhatsApp lead url creation with client-side tracking reference
  const whatsappNumber = companySettings.whatsappRaw;
  
  const handleWhatsappPDPClick = () => {
    if (typeof window !== "undefined") {
      const msg = veiculo.vendido
        ? `Olá! Vi o anúncio no site do ${veiculo.marca} ${veiculo.modelo} ${veiculo.ano} que foi vendido. Gostaria de saber se possuem modelos semelhantes disponíveis. (Ref: ${agUid})`
        : `Olá! Vi o anúncio no site e gostaria de saber mais sobre o ${veiculo.marca} ${veiculo.modelo} ${veiculo.ano}. (Ref: ${agUid})`;
      
      setActiveMessage(msg);
      setIsLeadModalOpen(true);
    }
  };

  const handleProposalClick = () => {
    if (typeof window !== "undefined") {
      const msg = `Olá! Gostaria de enviar uma proposta de negociação para o veículo ${veiculo.marca} ${veiculo.modelo} ${veiculo.ano}. (Ref: ${agUid})`;
      setActiveMessage(msg);
      setIsLeadModalOpen(true);
    }
  };

  const handleLeadSubmit = async (leadData: { nome: string; email: string; whatsapp: string }) => {
    const webhookUrl = webhooks?.webhookUrl || process.env.NEXT_PUBLIC_N8N_WEBHOOK_LEAD_URL || "https://n8n.v2o5.com.br/webhook/lead-entrada";

    const utmParams = getUtmParameters();
    const tipoBadge = veiculo.baixa_km ? "BAIXA KM" : (veiculo.unico_dono ? "ÚNICO DONO" : (veiculo.cautelar_100 ? "CAUTELAR 100%" : "BAIXA KM"));
    const perfilUso = veiculo.perfil_uso || "URBANO & EFICIENTE";

    const cleanPhone = leadData.whatsapp;
    const formattedPhone = cleanPhone.length === 10 || cleanPhone.length === 11 ? "55" + cleanPhone : cleanPhone;
    const remoteJid = formattedPhone ? `${formattedPhone}@s.whatsapp.net` : "";

    const payload = {
      remoteJid,
      telefone: formattedPhone,
      tipo: "lead_whatsapp",
      canal: "WhatsApp PDP",
      mensagem: activeMessage,
      veiculo: {
        id: veiculo.id,
        marca: veiculo.marca,
        modelo: veiculo.modelo,
        versao: veiculo.versao,
        ano: veiculo.ano,
        preco: veiculo.preco_promocional > 0 ? veiculo.preco_promocional : veiculo.preco_original,
        vendido: !!veiculo.vendido,
        veiculo_contexto: {
          perfil_uso: perfilUso,
          tipo_badge: tipoBadge
        }
      },
      cliente: {
        nome: leadData.nome,
        email: leadData.email,
        whatsapp: leadData.whatsapp
      },
      utm: {
        utm_source: utmParams.utm_source,
        utm_medium: utmParams.utm_medium,
        utm_campaign: utmParams.utm_campaign,
        utm_content: utmParams.utm_content
      },
      intencao_busca: {},
      agUid: agUid
    };

    // Dispatch webhook
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    // Save lead to history
    try {
      const rawHistory = localStorage.getItem("ag_leads_history");
      const history = rawHistory ? JSON.parse(rawHistory) : [];
      history.push({
        agUid,
        timestamp: new Date().toISOString(),
        tipoLead: "lead_whatsapp_pdp",
        cliente: {
          nome: leadData.nome,
          email: leadData.email,
          whatsapp: leadData.whatsapp
        },
        veiculo: {
          id: veiculo.id,
          marca: veiculo.marca,
          modelo: veiculo.modelo
        }
      });
      localStorage.setItem("ag_leads_history", JSON.stringify(history));
    } catch (e) {
      console.warn("[Telemetry] Failed to save lead payload to history:", e);
    }

    // Redirect to WhatsApp
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(activeMessage)}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  // Reactive drivetrain (Tração) calculation based on vehicle characteristics
  const calculateTração = (): string => {
    const m = veiculo.modelo.toLowerCase();
    const t = veiculo.tipo?.toLowerCase() || "";
    if (m.includes("hilux") || m.includes("ranger") || m.includes("defender") || m.includes("x5") || m.includes("discovery") || m.includes("4x4") || m.includes("awd")) {
      return "Integral (4x4 / AWD)";
    }
    if (m.includes("911") || m.includes("carrera") || m.includes("boxster") || m.includes("cayman") || t.includes("esportivo")) {
      return "Traseira (RWD)";
    }
    return "Dianteira (FWD)";
  };

  // Reactive passenger count (Lugares) calculation
  const calculateLugares = (): string => {
    const m = veiculo.modelo.toLowerCase();
    if (m.includes("911") || m.includes("carrera") || m.includes("boxster") || m.includes("cayman")) {
      return "2 ou 4 Lugares";
    }
    if (m.includes("defender") || m.includes("commander") || m.includes("discovery")) {
      return "5 a 7 Lugares";
    }
    return "5 Lugares";
  };

  // Specs array with premium custom inline SVGs
  const quickSpecs = [
    { 
      label: "CÂMBIO", 
      value: veiculo.cambio, 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 text-brand-primary">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
        </svg>
      ) 
    },
    { 
      label: "QUILOMETRAGEM", 
      value: formatKm(veiculo.quilometragem), 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 text-brand-primary">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      ) 
    },
    { 
      label: "COMBUSTÍVEL", 
      value: veiculo.combustivel, 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 text-brand-primary">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.105-7.5 11.25-7.5 11.25S4.5 17.605 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
        </svg>
      ) 
    },
    { 
      label: "TRAÇÃO", 
      value: calculateTração(), 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 text-brand-primary">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h7.5m3 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-6-12h3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75H19.5v-3.75L17.25 9H6.75L4.5 12v3.75Z" />
        </svg>
      ) 
    },
    { 
      label: "LUGARES", 
      value: calculateLugares(), 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 text-brand-primary">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
        </svg>
      ) 
    },
    { 
      label: "COR EXTERNA", 
      value: veiculo.cor, 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 text-brand-primary">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122A3 3 0 0 0 10.5 15h3a3 3 0 0 0 .97-2.122M2.25 12a9.75 9.75 0 1 1 19.5 0 9.75 9.75 0 0 1-19.5 0Z" />
        </svg>
      ) 
    },

    { 
      label: "CATEGORIA", 
      value: veiculo.tipo || "Premium", 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 text-brand-primary">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
        </svg>
      ) 
    }
  ];

  const renderSidebar = (isMobile: boolean) => {
    return (
      <aside
        className={`w-full bg-transparent lg:bg-brand-card border-0 lg:border border-brand-border/40 p-4 sm:p-6 lg:p-8 rounded-none lg:rounded-3xl shadow-none lg:shadow-[0_8px_30px_var(--brand-shadow)] flex flex-col gap-6 max-sm:gap-4 max-sm:p-2 print:hidden ${
          isMobile ? "block lg:hidden" : "hidden lg:block"
        }`}
      >
        {/* Brand, Model, Version & Vistoria Badge */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs md:text-sm font-semibold uppercase tracking-widest text-brand-gold">
            {veiculo.marca}
          </span>
          
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-brand-text leading-tight uppercase">
            {veiculo.modelo}
          </h1>
          
          <p className="text-xs md:text-sm text-brand-text/80 font-normal uppercase tracking-wider mt-1 flex flex-wrap gap-2 items-center">
            <span>{truncateString(veiculo.versao, 35)}</span>
            <span className="text-brand-primary font-bold">•</span>
            <span>Ano {veiculo.ano}</span>
          </p>
          
          {veiculo.pericia && 
           !veiculo.pericia.toLowerCase().includes("análise") && 
           !veiculo.pericia.toLowerCase().includes("analise") && (
            <div className="flex items-center gap-1.5 mt-2 bg-emerald-500/10 text-emerald-600 px-3 py-1.5 rounded-lg text-[10px] font-bold w-fit uppercase tracking-wider border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {veiculo.pericia}
            </div>
          )}
        </div>

        {/* Pricing Box */}
        <div className="flex flex-col border-t border-b border-brand-border/40 py-3.5">
          <span className="text-[9px] font-semibold text-brand-text/50 uppercase tracking-widest leading-none mb-2">
            Preço de Venda
          </span>
          {hasDiscount ? (
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className="text-2xl font-black text-brand-primary tracking-tight">
                Por {formatPrice(veiculo.preco_promocional)}
              </span>
              <span className="text-xs font-semibold text-brand-text/60 line-through">
                De {formatPrice(veiculo.preco_original)}
              </span>
            </div>
          ) : (
            <span className="text-2xl font-black text-brand-primary tracking-tight">
              {formatPrice(veiculo.preco_original)}
            </span>
          )}
        </div>

        {/* Quick Specs Compact Grid */}
        <div className="flex flex-col gap-3">
          <span className="text-[10px] font-bold text-brand-text/40 uppercase tracking-widest">
            Especificações Rápidas
          </span>
          <div className="grid grid-cols-2 gap-2.5">
            {quickSpecs.map((spec, index) => (
              <div
                key={index}
                className="bg-brand-bg/40 border border-brand-border/40 p-2.5 rounded-xl flex items-center gap-2.5 shadow-sm hover:border-brand-primary/20 transition-all duration-300"
              >
                <span className="flex items-center justify-center h-8 w-8 rounded-full bg-brand-primary/10 flex-shrink-0 text-brand-primary">
                  {spec.icon}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-[7px] font-black uppercase text-brand-text/40 tracking-wider">
                    {spec.label}
                  </span>
                  <span className="text-[10px] font-bold text-brand-text leading-tight truncate uppercase">
                    {spec.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Primary Call-to-Actions */}
        <div className="flex flex-col gap-3 pt-2">
          <button
            onClick={handleWhatsappPDPClick}
            className="w-full h-12 bg-green-600 hover:bg-green-500 text-white font-extrabold text-xs uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 active:scale-95 shadow-[0_4px_20px_rgba(34,197,94,0.25)] hover:shadow-[0_4px_25px_rgba(34,197,94,0.35)] transition-all duration-300 cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className="w-4 h-4">
              <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
            </svg>
            {veiculo.vendido ? "Consultar Similares (Vendido)" : "Fale com a Loja"}
          </button>
          <button
            onClick={handleProposalClick}
            className="w-full h-12 bg-black hover:bg-zinc-900 text-white font-extrabold text-xs uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 active:scale-95 border border-zinc-800 transition-all duration-300 cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
            Enviar Proposta
          </button>
        </div>

        {/* Social Share & Print Row */}
        <div className="flex items-center justify-between border-t border-brand-border/40 pt-4 mt-1">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-wider text-brand-text/50 hover:text-brand-primary"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.75 9H5.25" />
            </svg>
            Imprimir Ficha
          </button>
          
          <div className="flex gap-2">
            {/* WHATSAPP */}
            <button
              onClick={() => {
                const text = `🚗 ${veiculo.marca} ${veiculo.modelo} - ${veiculo.ano}\n💰 ${formatPrice(hasDiscount ? veiculo.preco_promocional : veiculo.preco_original)}\n📋 ${veiculo.versao}\n\n🔗 ${typeof window !== 'undefined' ? window.location.href : ''}`;
                window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
              }}
              className="flex items-center justify-center h-7 w-7 rounded-full border border-brand-border/60 hover:border-emerald-500/40 text-brand-text/40 hover:text-emerald-600 hover:bg-emerald-50 transition-all duration-200"
              aria-label="Compartilhar ficha do veículo no WhatsApp"
              title="Compartilhar no WhatsApp"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className="h-3 w-3">
                <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
              </svg>
            </button>
            {/* FACEBOOK */}
            <button
              onClick={() => {
                const url = typeof window !== 'undefined' ? window.location.href : '';
                window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'width=600,height=400');
              }}
              className="flex items-center justify-center h-7 w-7 rounded-full border border-brand-border/60 hover:border-blue-500/40 text-brand-text/40 hover:text-blue-600 hover:bg-blue-50 transition-all duration-200"
              aria-label="Compartilhar ficha do veículo no Facebook"
              title="Compartilhar no Facebook"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512" fill="currentColor" className="h-3 w-3">
                <path d="M80 299.3V512H196V299.3h86.5l18-97.8H196V166.9c0-51.7 20.3-71.5 72.7-71.5c16.8 0 29.4.2 47.6 2.5L324.8 2C297.1 .4 268 0 245.6 0 147.9 0 99.5 41.6 99.5 145.5v56H16v97.8H80z" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    );
  };

  return (
    <div id="pdp-vehicle-root" data-vehicle-id={veiculo.id} data-price={finalPrice} className="w-full pb-24 bg-brand-bg text-brand-text transition-colors duration-300 flex flex-col print:pb-0">
      
      {/* PRINT ONLY HEADER */}
      <div className="hidden print:flex flex-col gap-4 border-b-2 border-black pb-4 mb-6">
        {/* Dealership header row */}
        <div className="flex flex-row justify-between items-center">
          <div>
            <span className="text-xl font-black tracking-widest text-black uppercase">{companySettings.name}</span>
            <span className="text-[9px] text-zinc-500 block uppercase font-bold tracking-wider">Ficha Técnica de Showroom</span>
          </div>
          <div className="text-right">
            <span className="text-[9px] font-mono text-zinc-500 block">ID: {getShortVehicleId(veiculo.id)}</span>
            <span className="text-[9px] text-zinc-500 block">Gerado em: {new Date().toLocaleDateString('pt-BR')}</span>
          </div>
        </div>

        {/* Vehicle details row */}
        <div className="flex flex-row justify-between items-end mt-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{veiculo.marca}</span>
            <h1 className="text-2xl font-bold text-black leading-tight mt-0.5">{veiculo.modelo}</h1>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wide mt-1">
              {veiculo.versao} • Ano {veiculo.ano} • {veiculo.cor}
            </p>
          </div>
          <div className="text-right">
            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block leading-none mb-1">Preço de Venda</span>
            {hasDiscount ? (
              <div className="flex flex-col items-end">
                <span className="text-[9px] text-zinc-400 line-through leading-none">De {formatPrice(veiculo.preco_original)}</span>
                <span className="text-lg font-black text-black tracking-tight mt-1">Por {formatPrice(veiculo.preco_promocional)}</span>
              </div>
            ) : (
              <span className="text-lg font-black text-black tracking-tight">{formatPrice(veiculo.preco_original)}</span>
            )}
          </div>
        </div>
      </div>

      {/* PRINT ONLY FEATURED IMAGE */}
      <div className="hidden print:block w-full mb-6">
        {displayImages[0] && (
          <div className="relative w-full h-[320px] bg-zinc-100 rounded-xl overflow-hidden border border-zinc-200">
            <img
              src={displayImages[0]}
              alt={`${veiculo.marca} ${veiculo.modelo}`}
              className="w-full h-full object-cover print-main-image"
            />
          </div>
        )}
      </div>

      {/* SINGLE MAIN GRID CONTAINER FOR LAYOUT (Gallery, Sidebar, Description, Accordions, Matriz) */}
      <div className="w-full mx-auto max-w-[1600px] px-0 md:px-8 mt-0 md:mt-4 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start print:grid-cols-1 print:gap-6 print:px-0 print:mt-0">
        
        {/* Left Column: Gallery, Mobile Sidebar, Description, and Accordions (spans 8 cols on lg) */}
        <div className="w-full lg:col-span-7 xl:col-span-8 flex flex-col gap-6 max-sm:gap-4 print:col-span-12 print:gap-6">
          
          {/* Gallery block */}
          <section className="w-full flex flex-col gap-3 max-sm:gap-1.5 print:hidden">
            {/* Images container fitted to generous, gorgeous full-bleed responsive heights and styled with bg-zinc-950 */}
            <div className="relative w-full aspect-video bg-zinc-950 group border-none p-0 m-0 overflow-hidden rounded-2xl shadow-lg">
              {/* Horizontal scroll snap container */}
              <div
                ref={carouselRef}
                onScroll={handleCarouselScroll}
                className="flex w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-none gap-0"
                style={{ scrollBehavior: "smooth" }}
              >
                {displayImages.map((imgUrl, index) => (
                  <div
                    key={index}
                    className="w-full h-full snap-center snap-always flex-shrink-0 relative border-none p-0 m-0"
                  >
                    <Image
                      src={imgUrl}
                      alt={`${veiculo.marca} ${veiculo.modelo} - Imagem ${index + 1}`}
                      fill
                      priority={index === 0}
                      fetchPriority={index === 0 ? "high" : "auto"}
                      className={`object-cover w-full h-full border-none p-0 m-0 ${veiculo.vendido ? "filter grayscale-[30%] opacity-75" : ""}`}
                      sizes="(max-w-1024px) 100vw, 900px"
                    />
                  </div>
                ))}
              </div>

              {/* Left and Right navigation arrows */}
              {displayImages.length > 1 && (
                <>
                  <button
                    onClick={() => scrollCarouselTo((activeImageIndex - 1 + displayImages.length) % displayImages.length)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 z-30 h-11 w-11 rounded-full bg-black/40 hover:bg-brand-primary/95 text-white flex items-center justify-center border border-white/10 backdrop-blur-sm transition-all duration-300 shadow-md active:scale-95 cursor-pointer"
                    aria-label="Imagem anterior"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                  </button>
                  <button
                    onClick={() => scrollCarouselTo((activeImageIndex + 1) % displayImages.length)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 z-30 h-11 w-11 rounded-full bg-black/40 hover:bg-brand-primary/95 text-white flex items-center justify-center border border-white/10 backdrop-blur-sm transition-all duration-300 shadow-md active:scale-95 cursor-pointer"
                    aria-label="Próxima imagem"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                </>
              )}

              {/* Float approved inspection indicator */}
              {veiculo.status_tag && (
                <div className={`absolute top-4 left-4 backdrop-blur-sm px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider text-white shadow-lg z-30 flex items-center gap-1.5 border ${resolveTagColorClass(veiculo.status_tag_color)}`}>
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  {veiculo.status_tag.toUpperCase()}
                </div>
              )}

              {/* Fullscreen Trigger Button */}
              <button
                onClick={() => {
                  setLightboxImageIndex(activeImageIndex);
                  setIsLightboxOpen(true);
                }}
                className="absolute top-4 right-4 z-30 h-10 w-10 rounded-full bg-black/40 hover:bg-brand-primary/95 text-white flex items-center justify-center border border-white/10 backdrop-blur-sm transition-all duration-300 shadow-md active:scale-95 cursor-pointer"
                title="Visualizar em tela cheia"
                aria-label="Visualizar fotos do veículo em tela cheia"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75v4.5m0-4.5h-4.5m4.5 0L15 9m5.25 11.25v-4.5m0 4.5h-4.5m4.5 0-5.25-5.25" />
                </svg>
              </button>

              {/* Sold overlay */}
              {veiculo.vendido && (
                <div className="absolute inset-0 bg-zinc-950/45 flex items-center justify-center z-20 backdrop-blur-[0.5px] pointer-events-none">
                  <div className="bg-black/80 backdrop-blur-md border border-red-500/30 px-6 py-3 rounded-lg shadow-2xl flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[11px] font-black tracking-[0.25em] text-white uppercase">
                      VENDIDO
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Interactive horizontal thumbnail strip below the active slide */}
            {displayImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin max-w-full px-4 md:px-0">
                {displayImages.map((imgUrl, index) => {
                  const isActive = index === activeImageIndex;
                  return (
                    <button
                      key={index}
                      onClick={() => scrollCarouselTo(index)}
                      className={`relative h-16 w-24 overflow-hidden flex-shrink-0 border-2 transition-all duration-300 ${
                        isActive ? "border-brand-primary scale-[0.98] shadow-md rounded-xl" : "border-brand-border hover:border-brand-primary/40 opacity-70 hover:opacity-100 rounded-xl"
                      }`}
                      aria-label={`Visualizar foto ${index + 1}`}
                    >
                      <Image
                        src={imgUrl}
                        alt={`Miniatura ${index + 1}`}
                        fill
                        className="object-cover w-full border-none p-0 m-0"
                        sizes="96px"
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Mobile Sidebar (only blocks on mobile, hidden on lg desktop) */}
          <div className="px-4 md:px-0 block lg:hidden print:hidden">
            {renderSidebar(true)}
          </div>

          {/* Description Section */}
          <div className="px-4 md:px-0 print:px-0">
            <section className="bg-brand-card border border-brand-border/40 p-6 md:p-8 max-sm:p-4 rounded-3xl shadow-[0_8px_30px_var(--brand-shadow)] print-avoid-break">
              <h3 className="text-xs font-black uppercase tracking-widest text-brand-primary border-b border-brand-border pb-3 mb-4 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5A3.375 3.375 0 0 0 10.125 2.25H3.75A1.125 1.125 0 0 0 2.625 3.375v17.25c0 .621.504 1.125 1.125 1.125h16.5a1.125 1.125 0 0 0 1.125-1.125V14.25z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 16.5h16.5M3.75 12h16.5M3.75 7.5h7.5" />
                </svg>
                DESCRIÇÃO DO VEÍCULO
              </h3>
              {veiculo.descricao && /<[a-z][\s\S]*>/i.test(veiculo.descricao) ? (
                <div 
                  className="text-base text-brand-text/75 leading-relaxed font-normal max-w-4xl rich-text-content"
                  dangerouslySetInnerHTML={{ __html: veiculo.descricao }}
                />
              ) : (
                <p className="text-base text-brand-text/75 leading-relaxed font-normal max-w-4xl whitespace-pre-line">
                  {veiculo.descricao}
                </p>
              )}
            </section>
          </div>

          {/* Accordion: Opcionais e Acessórios */}
          <div className="px-4 md:px-0 print:px-0">
            <div className="bg-brand-card border border-brand-card-border shadow-[0_8px_30px_var(--brand-shadow)] rounded-3xl overflow-hidden transition-all duration-300 print-avoid-break">
              <button
                onClick={() => setOpcionaisOpen(!opcionaisOpen)}
                className="w-full flex items-center justify-between p-5 max-sm:p-4 text-left font-black text-base text-brand-text"
                aria-expanded={opcionaisOpen}
              >
                <span className="uppercase tracking-widest text-sm max-sm:text-xs">OPCIONAIS E ACESSÓRIOS DE SÉRIE</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2.5"
                  stroke="currentColor"
                  className={`w-4 h-4 text-brand-primary transition-transform duration-300 print:hidden ${
                    opcionaisOpen ? "rotate-180" : ""
                  }`}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              
              <div
                className={`transition-all duration-300 overflow-hidden print:max-h-none print:p-6 print:border-t print:block ${
                  opcionaisOpen ? "max-h-[1000px] border-t border-brand-border p-6 max-sm:p-4" : "max-h-0"
                }`}
              >
                {featuresList.length > 0 ? (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-3 text-xs text-brand-text/70">
                    {featuresList.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <span className="text-brand-primary font-black text-sm">✓</span>
                        <span className="font-medium">{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-brand-text/40">Itens padrão de fábrica.</p>
                )}
              </div>
            </div>
          </div>

          {/* Accordion: Perícia Cautelar */}
          <div className="px-4 md:px-0 print:px-0">
            <div className="bg-brand-card border border-brand-card-border shadow-[0_8px_30px_var(--brand-shadow)] rounded-3xl overflow-hidden transition-all duration-300 print-avoid-break">
              <button
                onClick={() => setPericiaOpen(!periciaOpen)}
                className="w-full flex items-center justify-between p-5 max-sm:p-4 text-left font-black text-base text-brand-text"
                aria-expanded={periciaOpen}
              >
                <span className="uppercase tracking-widest text-sm max-sm:text-xs">LAUDO DE PERÍCIA CAUTELAR CERTIFICADO</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2.5"
                  stroke="currentColor"
                  className={`w-4 h-4 text-brand-primary transition-transform duration-300 print:hidden ${
                    periciaOpen ? "rotate-180" : ""
                  }`}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              
              <div
                className={`transition-all duration-300 overflow-hidden print:max-h-none print:p-6 print:border-t print:block ${
                  periciaOpen ? "max-h-[500px] border-t border-brand-border p-6 max-sm:p-4" : "max-h-0"
                }`}
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-500/10 text-emerald-600 p-2.5 rounded-full">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                        <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 0 0-1.032 0 11.209 11.209 0 0 1-7.877 3.08.75.75 0 0 0-.722.515A12.74 12.74 0 0 0 2.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 0 0 .374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 0 0-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08ZM12 8.25a.75.75 0 0 1 .75.75v3.25a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 6a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-emerald-600 uppercase tracking-wide">LAUDO TÉCNICO APROVADO</h4>
                      <p className="text-[10px] text-brand-text/40 font-bold uppercase tracking-wider">Histórico livre de sinistros e leilão</p>
                    </div>
                  </div>
                  <p className="text-xs text-brand-text/70 leading-relaxed italic bg-brand-bg p-4 rounded-xl border border-brand-border font-medium">
                    &ldquo;{veiculo.laudo_pericia || "Estrutura e longarinas intactas, numeração de motor e chassi originais, pintura em perfeito estado com laudo 100% livre."}&rdquo;
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: Desktop Sidebar and Matriz de Especificações (spans 5 cols on lg) */}
        <div className="w-full lg:col-span-5 xl:col-span-4 flex flex-col gap-6 max-sm:gap-4 px-4 lg:px-0 print:col-span-12 print:px-0 print:gap-6">
          
          {/* Desktop Sidebar (only blocks on lg desktop, hidden on mobile) */}
          <div className="hidden lg:block print:hidden">
            {renderSidebar(false)}
          </div>

          {/* Specification Matrix Table */}
          <aside className="bg-brand-card border border-brand-border/40 p-6 max-sm:p-4 rounded-3xl shadow-[0_8px_30px_var(--brand-shadow)] w-full print-avoid-break">
            <h3 className="text-sm font-black uppercase tracking-widest text-brand-primary border-b border-brand-border pb-4 mb-4">
              MATRIZ DE ESPECIFICAÇÕES
            </h3>

            {/* Matrix detailed table */}
            <div className="flex flex-col divide-y divide-brand-border/40 print:grid print:grid-cols-2 print:gap-x-8 print:gap-y-0 print:divide-y-0">
              <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                <span className="text-brand-gold font-bold uppercase">MARCA</span>
                <span className="text-brand-text font-extrabold">{veiculo.marca}</span>
              </div>
              <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                <span className="text-brand-gold font-bold uppercase">MODELO</span>
                <span className="text-brand-text font-extrabold">{veiculo.modelo}</span>
              </div>
              <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                <span className="text-brand-gold font-bold uppercase">ANO / MODELO</span>
                <span className="text-brand-text font-extrabold">{veiculo.ano}</span>
              </div>
              <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                <span className="text-brand-gold font-bold uppercase">QUILOMETRAGEM</span>
                <span className="text-brand-text font-extrabold">{formatKm(veiculo.quilometragem)}</span>
              </div>
              <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                <span className="text-brand-gold font-bold uppercase">TRANSMISSÃO</span>
                <span className="text-brand-text font-extrabold">{veiculo.cambio}</span>
              </div>
              <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                <span className="text-brand-gold font-bold uppercase">COMBUSTÍVEL</span>
                <span className="text-brand-text font-extrabold">{veiculo.combustivel}</span>
              </div>
              <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                <span className="text-brand-gold font-bold uppercase">DIREÇÃO</span>
                <span className="text-brand-text font-extrabold">{resolveDirecao(veiculo).toUpperCase()}</span>
              </div>
              <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                <span className="text-brand-gold font-bold uppercase">COR EXTERNA</span>
                <span className="text-brand-text font-extrabold">{veiculo.cor}</span>
              </div>
              <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                <span className="text-brand-gold font-bold uppercase">ID DO VEÍCULO</span>
                <span className="text-brand-text font-extrabold font-mono">{getShortVehicleId(veiculo.id)}</span>
              </div>
              <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                <span className="text-brand-gold font-bold uppercase">FIPE REFERÊNCIA</span>
                <span className="text-brand-text font-extrabold">{veiculo.fipe}</span>
              </div>
              {veiculo.tipo && (
                <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                  <span className="text-brand-gold font-bold uppercase">CARROCERIA</span>
                  <span className="text-brand-text font-extrabold">{veiculo.tipo}</span>
                </div>
              )}
              {veiculo.perfil_uso && (
                <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                  <span className="text-brand-gold font-bold uppercase">PERFIL RECOMENDADO</span>
                  <span className="text-brand-text font-extrabold">{veiculo.perfil_uso}</span>
                </div>
              )}
            </div>

            {/* Direct contact CTA box in side desk bar */}
            <div className="mt-6 pt-6 border-t border-brand-border/40 flex flex-col gap-4 print:hidden">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-brand-primary/10 border border-brand-primary flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 h-4 text-brand-primary">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.387a12.035 12.035 0 0 1-7.108-7.108c-.155-.44.01-1.037.387-1.318l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                  </svg>
                </div>
                <div>
                  <h5 className="text-xs font-black text-brand-text uppercase leading-none">Canal Especialista</h5>
                  <p className="text-[10px] text-brand-text/50 font-semibold tracking-wide uppercase mt-1">Negociação Rápida Direct</p>
                </div>
              </div>

              <button
                onClick={handleWhatsappPDPClick}
                className="w-full h-14 bg-green-600 hover:bg-green-500 text-white font-extrabold text-xs uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 active:scale-95 shadow-[0_4px_20px_rgba(34,197,94,0.25)] hover:shadow-[0_4px_25px_rgba(34,197,94,0.35)] transition-all duration-300"
                style={{ minHeight: "48px" }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className="w-4 h-4 animate-bounce">
                  <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                </svg>
                {veiculo.vendido ? "Consultar Similares (Vendido)" : "Iniciar Atendimento WhatsApp"}
              </button>
            </div>
          </aside>

        </div>

      </div>

      {/* 5. STICKY BOTTOM BAR (Mobile Thumb Zone CTA) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-brand-card/90 border-t border-brand-border backdrop-blur-md px-4 py-3.5 flex justify-center pb-safe shadow-lg md:hidden print:hidden">
        <button
          onClick={handleWhatsappPDPClick}
          className="w-full max-w-md flex items-center justify-center gap-2.5 bg-green-600 hover:bg-green-500 text-white font-extrabold text-xs uppercase tracking-widest py-4 px-6 rounded-2xl active:scale-95 shadow-[0_0_20px_rgba(34,197,94,0.25)] transition-all duration-300 cursor-pointer"
          style={{ minHeight: "48px" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className="w-4 h-4 animate-bounce">
            <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
          </svg>
          {veiculo.vendido ? "Consultar Veículos Similares" : "Garantir Proposta no WhatsApp"}
        </button>
      </div>

      {/* 6. LIGHTBOX MODAL (Fullscreen View) */}
      {isLightboxOpen && (
        <div className="fixed inset-0 bg-black/95 z-[9999] backdrop-blur-md flex flex-col justify-between p-4 transition-all duration-300 select-none print:hidden">
          {/* Header section of Lightbox */}
          <div className="flex justify-between items-center w-full max-w-[1600px] mx-auto py-2 px-4">
            <div className="text-white text-xs font-black uppercase tracking-widest">
              {veiculo.marca} {veiculo.modelo}
            </div>
            <button
              onClick={() => setIsLightboxOpen(false)}
              className="h-10 w-10 rounded-full bg-white/10 hover:bg-white hover:text-black text-white flex items-center justify-center transition-all duration-300 border border-white/10 active:scale-95 cursor-pointer"
              title="Fechar tela cheia"
              aria-label="Fechar visualização em tela cheia"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Main image container */}
          <div className="relative flex-grow flex items-center justify-center w-full max-w-[1600px] mx-auto my-4 h-[70vh]">
            {/* Left navigation arrow */}
            {veiculo.web_full_images.length > 1 && (
              <button
                onClick={() => setLightboxImageIndex((prev) => (prev - 1 + veiculo.web_full_images.length) % veiculo.web_full_images.length)}
                className="absolute left-4 z-50 h-12 w-12 rounded-full bg-black/60 hover:bg-brand-primary text-white flex items-center justify-center border border-white/10 transition-all duration-300 active:scale-95 cursor-pointer"
                aria-label="Imagem anterior"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              </button>
            )}

            {/* Centered Image */}
            <div className="relative w-full h-full max-h-[80vh] flex items-center justify-center">
              <Image
                src={veiculo.web_full_images[lightboxImageIndex]}
                alt={`${veiculo.marca} ${veiculo.modelo} - Imagem ampliada ${lightboxImageIndex + 1}`}
                fill
                className="object-contain w-full h-full"
                sizes="100vw"
                priority
              />
            </div>

            {/* Right navigation arrow */}
            {veiculo.web_full_images.length > 1 && (
              <button
                onClick={() => setLightboxImageIndex((prev) => (prev + 1) % veiculo.web_full_images.length)}
                className="absolute right-4 z-50 h-12 w-12 rounded-full bg-black/60 hover:bg-brand-primary text-white flex items-center justify-center border border-white/10 transition-all duration-300 active:scale-95 cursor-pointer"
                aria-label="Próxima imagem"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            )}
          </div>

          {/* Footer section of Lightbox: Page Indicator */}
          <div className="text-center text-white/60 text-[10px] font-bold tracking-widest uppercase py-2">
            {lightboxImageIndex + 1} / {veiculo.web_full_images.length}
          </div>
        </div>
      )}

      {/* Positive Friction Lead Capture Modal */}
      <LeadCaptureModal
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        onSubmit={handleLeadSubmit}
        vehicleInfo={{
          marca: veiculo.marca,
          modelo: veiculo.modelo,
          ano: veiculo.ano
        }}
      />

      {/* PRINT ONLY FOOTER */}
      <div className="hidden print:flex flex-row justify-between items-center border-t border-zinc-200 pt-4 mt-8 print-avoid-break">
        <div className="text-[9px] text-zinc-500 leading-normal">
          <span className="font-bold text-zinc-700 block uppercase tracking-wider mb-0.5">{companySettings.name}</span>
          <span>{companySettings.address}</span>
          {companySettings.cnpj && <span className="block mt-0.5 font-mono">CNPJ: {companySettings.cnpj}</span>}
        </div>
        <div className="text-right text-[9px] text-zinc-500 leading-normal">
          <span className="font-bold text-zinc-700 block uppercase tracking-wider mb-0.5">Contato & Atendimento</span>
          <span>Tel: {companySettings.phone} • WhatsApp: {companySettings.whatsapp}</span>
          <span className="block mt-0.5">{companySettings.hours.replace(/\n/g, " | ")}</span>
        </div>
      </div>

    </div>
  );
}
