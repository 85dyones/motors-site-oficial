"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { getEstoque, Veiculo, getVeiculoPdpUrl } from "../lib/supabase";
import { useTheme } from "../app/ThemeContext";
import { getUtmParameters } from "../lib/telemetry";
import VehicleCompare from "./VehicleCompare";
import LeadCaptureModal from "./LeadCaptureModal";

// Formatter helpers
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

function resolveTipoCambio(car: Veiculo): string {
  const c = (car.cambio || "").toLowerCase();
  if (c.includes("manual")) return "Manual";
  return "Automático";
}

function resolveTipoCombustivel(car: Veiculo): string {
  const c = (car.combustivel || "").toLowerCase();
  if (c.includes("flex")) return "Flex";
  if (c.includes("álcool") || c.includes("alcool")) return "Álcool";
  if (c.includes("elétrico") || c.includes("eletrico") || c.includes("ev")) return "Elétrico";
  if (c.includes("híbrido") || c.includes("hibrido") || c.includes("mhev")) return "Híbrido";
  if (c.includes("diesel")) return "Diesel";
  if (c.includes("gasolina")) return "Gasolina";
  return car.combustivel || "Flex";
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

const ALL_BODY_TYPES = [
  { id: "suv", name: "SUV", matches: ["suv"] },
  { id: "sedan", name: "SEDAN", matches: ["sedã", "sedan"] },
  { id: "picape", name: "PICAPE", matches: ["picape"] },
  { id: "hatch", name: "HATCH", matches: ["hatch", "hatchback"] },
  { id: "esportivo", name: "ESPORTIVO", matches: ["esportivo", "cupê", "coupe"] },
  { id: "wagon", name: "WAGON", matches: ["wagon", "perua"] },
  { id: "utilitario", name: "UTILITÁRIO", matches: ["utilitário", "utilitario", "van", "furgão", "furgao"] },
  { id: "motos", name: "MOTOS", matches: ["moto", "motos", "motocicleta"] },
  { id: "caminhao", name: "CAMINHÃO", matches: ["caminhão", "caminhao", "truck"] },
  { id: "eletrico", name: "ELÉTRICO", matches: ["elétrico", "eletrico", "ev"] },
  { id: "premium", name: "PREMIUM", matches: ["premium"] }
];

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

// Removed obsolete filters constants

function calculateCampaignMatchScore(car: Veiculo, campaign: string): number {
  let score = 0;

  const brand = car.marca.toLowerCase();
  const model = car.modelo.toLowerCase();
  const perfil = (car.perfil_uso || "").toLowerCase();
  const tipo = (car.tipo || "").toLowerCase();
  const desc = `${car.opcionais} ${car.laudo_pericia} ${car.descricao || ""}`.toLowerCase();

  // A. Exact or partial brand name match (e.g. campaign=porsche_ads, brand=Porsche)
  if (campaign.includes(brand) && brand.length > 2) {
    score += 1000;
  }
  // B. Partial model name match (e.g. campaign=promo_hilux, model=Hilux)
  if (campaign.includes(model) && model.length > 2) {
    score += 500;
  }

  // C. Lifestyle/profile match from UTM keywords
  // Esportivos / Performance
  if (["esportivo", "sport", "turbo", "racing", "performance", "gts", "acelera", "pista"].some(k => campaign.includes(k))) {
    if (perfil === "linhagem esportiva") score += 300;
    if (tipo === "esportivo") score += 200;
    if (desc.includes("turbo") || desc.includes("esportiva")) score += 100;
  }

  // Off-Road / Força / Picape
  if (["offroad", "diesel", "4x4", "campo", "forca", "picape", "tracao", "lama", "defender"].some(k => campaign.includes(k))) {
    if (perfil === "força & off-road") score += 300;
    if (tipo === "picape" || tipo === "suv") score += 200;
    if (desc.includes("4x4") || desc.includes("diesel")) score += 100;
  }

  // Luxo / Curadoria Exclusiva
  if (["luxo", "luxury", "exclusivo", "prestige", "premium", "curadoria", "elite"].some(k => campaign.includes(k))) {
    if (perfil === "curadoria exclusiva") score += 300;
    if (car.preco_original > 200000) score += 150;
  }

  // Econômicos / Popular / Urbano
  if (["economico", "econômico", "popular", "barato", "urbano", "commute", "daily", "hatch"].some(k => campaign.includes(k))) {
    if (perfil === "urbano & eficiente") score += 300;
    if (tipo === "hatch" || tipo === "sedan") score += 200;
    if (car.preco_original < 180000) score += 150;
  }

  // D. Sold vehicles should always be penalized so they appear at the bottom of the list, even if they match the UTM!
  if (car.vendido) {
    score -= 2000;
  }

  return score;
}

function applyCustomDisplaySorting(vehicles: Veiculo[]): Veiculo[] {
  if (typeof window === "undefined" || vehicles.length === 0) return vehicles;

  try {
    const utm = getUtmParameters();
    const campaign = (utm.utm_campaign || "").toLowerCase().trim();

    // 1. UTM Campaign Match (Highest Priority)
    if (campaign) {
      console.log(`[Sorting] Applying UTM Campaign priority. Campaign: "${campaign}"`);
      
      return [...vehicles].sort((a, b) => {
        const scoreA = calculateCampaignMatchScore(a, campaign);
        const scoreB = calculateCampaignMatchScore(b, campaign);
        
        // If scores are different, sort by score descending
        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }
        
        // Fallback: price descending (default database order)
        return b.preco_original - a.preco_original;
      });
    }

    // 2. First Access (No UTM matching, display random order)
    const isFirstAccess = !localStorage.getItem("ag_visited");
    if (isFirstAccess) {
      localStorage.setItem("ag_visited", "true");
      console.log("[Sorting] First access detected. Generating and saving a session-stable random order.");
    }

    // Check if we already have a stable session randomized order for first access
    const rawSessionOrder = sessionStorage.getItem("ag_first_access_order");
    if (rawSessionOrder) {
      try {
        const orderedIds: string[] = JSON.parse(rawSessionOrder);
        const orderMap = new Map<string, number>();
        orderedIds.forEach((id, idx) => orderMap.set(id, idx));

        return [...vehicles].sort((a, b) => {
          const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
          const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
          return idxA - idxB;
        });
      } catch (e) {
        console.warn("[Sorting] Failed to parse session order, falling back to new shuffle", e);
      }
    }

    // If it's a first access or we need to generate a new shuffle
    if (isFirstAccess || !rawSessionOrder) {
      const shuffled = [...vehicles].sort(() => Math.random() - 0.5);
      const shuffledIds = shuffled.map((v) => v.id);
      sessionStorage.setItem("ag_first_access_order", JSON.stringify(shuffledIds));
      return shuffled;
    }

  } catch (err) {
    console.error("[Sorting] Error in custom display sorting:", err);
  }

  // 3. Returning Access / Fallback (Default database price order)
  return vehicles;
}

export default function HeroSection() {
  const {
    addToCompare,
    removeFromCompare,
    isInCompare,
    compareIds,
    companySettings,
    quickTags: contextQuickTags,
    carouselVehicleIds,
    webhooks
  } = useTheme();
  const [estoque, setEstoque] = useState<Veiculo[]>([]);
  const [filteredEstoque, setFilteredEstoque] = useState<Veiculo[]>([]);
  const [featuredCars, setFeaturedCars] = useState<Veiculo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [compareOpen, setCompareOpen] = useState<boolean>(false);
  
  // Lead modal states
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [activeVehicle, setActiveVehicle] = useState<Veiculo | null>(null);
  const [activeMessage, setActiveMessage] = useState("");

  // Layout mode state ("grid" | "list")
  const [layoutMode, setLayoutMode] = useState<"grid" | "list">("grid");

  // Hero carousel active index
  const [activeSlide, setActiveSlide] = useState<number>(0);
  const carouselTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Search and Advanced filters
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("todos");
  const [selectedQuickTag, setSelectedQuickTag] = useState<string>("todos");
  const [filterMarca, setFilterMarca] = useState<string>("todos");
  const [filterModelo, setFilterModelo] = useState<string>("todos");
  const [filterAno, setFilterAno] = useState<string>("todos");
  const [filterPrecoMin, setFilterPrecoMin] = useState<string>("todos");
  const [filterPrecoMax, setFilterPrecoMax] = useState<string>("todos");
  const [filterCambio, setFilterCambio] = useState<string>("todos");
  const [filterDirecao, setFilterDirecao] = useState<string>("todos");
  const [filterCombustivel, setFilterCombustivel] = useState<string>("todos");

  // Fetch telemetry ID from cookies or localstorage
  const [agUid, setAgUid] = useState<string>("ag_ref_nao_localizado");
  const [quickTags, setQuickTags] = useState<QuickTag[]>(DEFAULT_QUICK_TAGS);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const uid = localStorage.getItem("ag_uid") || "ag_ref_nao_localizado";
      setAgUid(uid);
    }
  }, []);

  // Sync quick tags from Supabase Context
  useEffect(() => {
    if (contextQuickTags && contextQuickTags.length > 0) {
      setQuickTags(contextQuickTags);
    }
  }, [contextQuickTags]);

  // Parse URL search parameters on mount (for SEO brand/model footer links)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const marcaParam = params.get("marca");
    const modeloParam = params.get("modelo");
    const buscaParam = params.get("busca");

    let hasParam = false;
    if (marcaParam) {
      setFilterMarca(marcaParam);
      hasParam = true;
    }
    if (modeloParam) {
      setFilterModelo(modeloParam);
      hasParam = true;
    }
    if (buscaParam) {
      setSearchTerm(buscaParam);
      hasParam = true;
    }

    if (hasParam) {
      setTimeout(() => {
        const catalogEl = document.getElementById("catalogo");
        if (catalogEl) {
          catalogEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 600);
    }
  }, []);

  const activeBodyTypes = ALL_BODY_TYPES.filter(type => {
    return estoque.some(car => {
      const carTipo = (car.tipo || "").toLowerCase();
      return type.matches.some(m => carTipo === m);
    });
  });

  const bodyTypes = [
    { id: "todos", name: "TODOS" },
    ...activeBodyTypes
  ];

  // Removed obsolete filter options

  // Fetch live inventory
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      const data = await getEstoque();
      const sortedData = applyCustomDisplaySorting(data);
      setEstoque(sortedData);
      setFilteredEstoque(sortedData);
      setIsLoading(false);
    }
    loadData();
  }, []);

  // Sync featured cars when inventory or selected carousel IDs change
  useEffect(() => {
    if (estoque.length === 0) return;
    const carouselIds = carouselVehicleIds || [];
    if (carouselIds.length > 0) {
      const matched = carouselIds
        .map(id => estoque.find(c => c.id === id))
        .filter((c): c is Veiculo => !!c);
      
      if (matched.length > 0) {
        setFeaturedCars(matched);
      } else {
        setFeaturedCars(estoque.slice(0, 3));
      }
    } else {
      setFeaturedCars(estoque.slice(0, 3));
    }
  }, [carouselVehicleIds, estoque]);

  // Auto-play timer logic for Hero Carousel
  useEffect(() => {
    if (featuredCars.length > 1) {
      if (carouselTimerRef.current) clearInterval(carouselTimerRef.current);
      carouselTimerRef.current = setInterval(() => {
        setActiveSlide((prev) => (prev + 1) % featuredCars.length);
      }, 6000);
    }
    return () => {
      if (carouselTimerRef.current) clearInterval(carouselTimerRef.current);
    };
  }, [featuredCars]);

  // Clean all filters action
  const handleClearFilters = () => {
    setSearchTerm("");
    setSelectedCategory("todos");
    setSelectedQuickTag("todos");
    setFilterMarca("todos");
    setFilterModelo("todos");
    setFilterAno("todos");
    setFilterPrecoMin("todos");
    setFilterPrecoMax("todos");
    setFilterCambio("todos");
    setFilterDirecao("todos");
    setFilterCombustivel("todos");
  };

  // Generate dynamic options for selects based on the active inventory items
  const marcasDisponiveis = Array.from(new Set(estoque.map((c) => c.marca))).sort();
  
  // Model list adapts dynamically depending on selected brand to avoid empty list search matches
  const modelosDisponiveis = Array.from(
    new Set(
      estoque
        .filter((c) => filterMarca === "todos" || c.marca === filterMarca)
        .map((c) => c.modelo)
    )
  ).sort();

  const anosDisponiveis = Array.from(new Set(estoque.map((c) => String(c.ano)))).sort(
    (a, b) => Number(b) - Number(a)
  );

  const cambiosDisponiveis = Array.from(new Set(estoque.map((c) => resolveTipoCambio(c)))).sort();
  const direcoesDisponiveis = Array.from(new Set(estoque.map((c) => resolveDirecao(c)))).sort();
  const combustiveisDisponiveis = Array.from(new Set(estoque.map((c) => resolveTipoCombustivel(c)))).sort();

  // Apply filters reactively
  useEffect(() => {
    setIsLoading(true);
    const delay = setTimeout(() => {
      let result = [...estoque];

      // 1. Text Search Filter
      if (searchTerm.trim() !== "") {
        const query = searchTerm.toLowerCase();
        result = result.filter(
          (car) =>
            car.marca.toLowerCase().includes(query) ||
            car.modelo.toLowerCase().includes(query) ||
            car.versao.toLowerCase().includes(query) ||
            car.cor.toLowerCase().includes(query)
        );
      }

      // 2. Select Type (Carroceria) Filter
      if (selectedCategory !== "todos") {
        const bodyTypeConfig = ALL_BODY_TYPES.find(t => t.id === selectedCategory);
        if (bodyTypeConfig) {
          result = result.filter(car => {
            const carTipo = (car.tipo || "").toLowerCase();
            return bodyTypeConfig.matches.some(m => carTipo === m);
          });
        }
      }

      // 2b. Select Quick Tag Filter
      if (selectedQuickTag !== "todos") {
        const activeTag = quickTags.find(t => t.id === selectedQuickTag);
        if (activeTag) {
          result = result.filter(car => {
            // Special fallback for the default "economicos" tag to match original behavior
            if (activeTag.id === "economicos" && activeTag.field === "preco" && activeTag.operator === "less" && activeTag.value === "180000") {
              const p = car.preco_promocional > 0 && car.preco_promocional < car.preco_original
                ? car.preco_promocional
                : car.preco_original;
              const combustivel = resolveTipoCombustivel(car);
              return p < 180000 || combustivel === "Elétrico" || combustivel === "Híbrido";
            }

            // Extract the field value from the car
            let fieldValue: any;
            if (activeTag.field === "preco") {
              fieldValue = car.preco_promocional > 0 && car.preco_promocional < car.preco_original
                ? car.preco_promocional
                : car.preco_original;
            } else if (activeTag.field === "quilometragem") {
              fieldValue = car.quilometragem;
            } else if (activeTag.field === "combustivel") {
              fieldValue = resolveTipoCombustivel(car);
            } else if (activeTag.field === "perfil_uso") {
              fieldValue = car.perfil_uso || "";
            } else if (activeTag.field === "tipo") {
              fieldValue = car.tipo || "";
            } else if (activeTag.field === "marca") {
              fieldValue = car.marca || "";
            } else {
              fieldValue = (car as any)[activeTag.field] || "";
            }

            const strFieldValue = String(fieldValue).toLowerCase().trim();
            const ruleValue = activeTag.value.toLowerCase().trim();

            // Evaluate rule based on operator
            switch (activeTag.operator) {
              case "equals":
                return strFieldValue === ruleValue;
              case "contains":
                return strFieldValue.includes(ruleValue);
              case "less":
                return Number(fieldValue) < Number(activeTag.value);
              case "greater":
                return Number(fieldValue) > Number(activeTag.value);
              default:
                return false;
            }
          });
        }
      }

      // 3. Dropdowns refine
      if (filterMarca !== "todos") {
        result = result.filter((car) => car.marca === filterMarca);
      }
      if (filterModelo !== "todos") {
        result = result.filter((car) => car.modelo === filterModelo);
      }
      if (filterAno !== "todos") {
        result = result.filter((car) => String(car.ano) === filterAno);
      }
      if (filterCambio !== "todos") {
        result = result.filter((car) => resolveTipoCambio(car) === filterCambio);
      }
      if (filterDirecao !== "todos") {
        result = result.filter((car) => resolveDirecao(car) === filterDirecao);
      }
      if (filterCombustivel !== "todos") {
        result = result.filter((car) => resolveTipoCombustivel(car) === filterCombustivel);
      }

      // 4. Price limits refine
      if (filterPrecoMin !== "todos") {
        result = result.filter((car) => car.preco_original >= Number(filterPrecoMin));
      }
      if (filterPrecoMax !== "todos") {
        result = result.filter((car) => car.preco_original <= Number(filterPrecoMax));
      }

      setFilteredEstoque(result);
      setIsLoading(false);
    }, 300);

    return () => clearTimeout(delay);
  }, [
    searchTerm,
    selectedCategory,
    selectedQuickTag,
    filterMarca,
    filterModelo,
    filterAno,
    filterPrecoMin,
    filterPrecoMax,
    filterCambio,
    filterDirecao,
    filterCombustivel,
    estoque,
    quickTags
  ]);

  // Click conversion logging and tracking for direct WhatsApp click
  const handleWhatsappClick = (e: React.MouseEvent, veiculo: Veiculo) => {
    e.preventDefault();
    e.stopPropagation();

    console.log(`[Antigravity Click] Conversão direta via Card de Veículo ID: ${veiculo.id}`);

    if (typeof window !== "undefined") {
      const activeUid = localStorage.getItem("ag_uid") || "ag_ref_nao_localizado";
      
      const leadPayload = {
        agUid: activeUid,
        timestamp: new Date().toISOString(),
        tipoLead: "direct_whatsapp_card",
        veiculo: {
          id: veiculo.id,
          marca: veiculo.marca,
          modelo: veiculo.modelo,
          ano: veiculo.ano,
        }
      };
      
      (window as any).ag_last_direct_click = leadPayload;
      const customEvent = new CustomEvent("agTelemetryDirectClick", { detail: leadPayload });
      window.dispatchEvent(customEvent);

      const msg = veiculo.vendido
        ? `Olá! Vi o ${veiculo.marca} ${veiculo.modelo} ${veiculo.ano} no site, mas consta como vendido. Gostaria de saber se possuem modelos semelhantes disponíveis. (Ref: ${activeUid})`
        : `Olá! Vi o ${veiculo.marca} ${veiculo.modelo} ${veiculo.ano} na listagem do site e gostaria de receber a ficha técnica. (Ref: ${activeUid})`;

      setActiveVehicle(veiculo);
      setActiveMessage(msg);
      setIsLeadModalOpen(true);
    }
  };

  const handleLeadSubmit = async (leadData: { nome: string; email: string; whatsapp: string }) => {
    if (!activeVehicle) return;

    const webhookUrl = webhooks?.webhookUrl || process.env.NEXT_PUBLIC_N8N_WEBHOOK_LEAD_URL || "https://n8n.v2o5.com.br/webhook/lead-entrada";

    const utmParams = getUtmParameters();
    const tipoBadge = activeVehicle.baixa_km ? "BAIXA KM" : (activeVehicle.unico_dono ? "ÚNICO DONO" : (activeVehicle.cautelar_100 ? "CAUTELAR 100%" : "BAIXA KM"));
    const perfilUso = activeVehicle.perfil_uso || "URBANO & EFICIENTE";

    const cleanPhone = leadData.whatsapp;
    const formattedPhone = cleanPhone.length === 10 || cleanPhone.length === 11 ? "55" + cleanPhone : cleanPhone;
    const remoteJid = formattedPhone ? `${formattedPhone}@s.whatsapp.net` : "";

    const payload = {
      remoteJid,
      telefone: formattedPhone,
      tipo: "lead_whatsapp",
      canal: "WhatsApp Card",
      mensagem: activeMessage,
      veiculo: {
        id: activeVehicle.id,
        marca: activeVehicle.marca,
        modelo: activeVehicle.modelo,
        versao: activeVehicle.versao,
        ano: activeVehicle.ano,
        preco: activeVehicle.preco_promocional > 0 ? activeVehicle.preco_promocional : activeVehicle.preco_original,
        vendido: !!activeVehicle.vendido,
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
        tipoLead: "lead_whatsapp_card",
        cliente: {
          nome: leadData.nome,
          email: leadData.email,
          whatsapp: leadData.whatsapp
        },
        veiculo: {
          id: activeVehicle.id,
          marca: activeVehicle.marca,
          modelo: activeVehicle.modelo
        }
      });
      localStorage.setItem("ag_leads_history", JSON.stringify(history));
    } catch (e) {
      console.warn("[Telemetry] Failed to save lead payload to history:", e);
    }

    // Redirect to WhatsApp
    const whatsappUrl = `https://wa.me/${companySettings.whatsappRaw}?text=${encodeURIComponent(activeMessage)}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="w-full flex flex-col gap-10">
      
      {/* 1. HERO CAROUSEL / SLIDER (Auto Club Top Slider Look) */}
      {featuredCars.length > 0 && (
        <div className="relative w-full h-[60vh] md:h-[75vh] max-h-[720px] rounded-2xl overflow-hidden shadow-2xl bg-zinc-950 animate-fadeIn group">
          {/* Carousel Slide Wrapper */}
          <div className="relative w-full h-full">
            {featuredCars.map((car, index) => {
              const isActive = index === activeSlide;
              const pdpUrl = getVeiculoPdpUrl(car);

              const promoPrice = car.preco_promocional > 0 && car.preco_promocional < car.preco_original
                ? car.preco_promocional
                : car.preco_original;

              return (
                <div
                  key={car.id}
                  className={`absolute inset-0 w-full h-full transition-opacity duration-1000 flex flex-col justify-end p-6 md:p-16 ${
                    isActive ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
                  }`}
                >
                  {/* Clickable cover image + gradient background */}
                  <Link prefetch={false} href={pdpUrl} className="absolute inset-0 block z-0 group/slide-img cursor-pointer overflow-hidden">
                    <Image
                      src={car.web_full_images[0] || car.whatsapp_images[0]}
                      alt={`${car.marca} ${car.modelo}`}
                      fill
                      priority={index === 0}
                      className="object-cover transition-transform duration-[8000ms] ease-out group-hover/slide-img:scale-105"
                      sizes="100vw"
                    />
                    {/* Sleek luxury gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                  </Link>

                  {/* Letters Garrafais Text Overlay details */}
                  <div className="relative z-20 flex flex-col gap-2 md:gap-4 max-w-2xl text-white transform translate-y-0 transition-transform duration-700">
                    <span className="text-xs md:text-sm font-semibold uppercase tracking-widest text-brand-primary drop-shadow">
                      {car.marca} • {car.ano}
                    </span>
                    
                    <h2 className="text-3xl md:text-6xl font-bold tracking-tight leading-none drop-shadow-md">
                      {car.modelo}
                    </h2>
                    
                    <p className="text-xs md:text-lg text-white/95 font-medium uppercase tracking-wide line-clamp-1">
                      {car.versao}
                    </p>

                    <div className="flex flex-row items-center gap-3 mt-2">
                      {/* Gold Highlight Promo Price */}
                      <div className="bg-brand-primary/90 text-white font-bold text-lg md:text-2xl px-5 h-12 rounded-xl inline-flex items-center shadow-lg border border-brand-primary-hover backdrop-blur-sm">
                        {formatPrice(promoPrice)}
                      </div>

                      <Link
                        href={pdpUrl}
                        className="bg-white/10 hover:bg-white hover:text-black transition-all duration-300 font-semibold text-[11px] uppercase tracking-widest px-5 h-12 rounded-xl border border-white/30 backdrop-blur-sm shadow-md inline-flex items-center justify-center"
                      >
                        Ver Detalhes
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Slider Left/Right Arrows */}
          <button
            onClick={() => setActiveSlide((prev) => (prev - 1 + featuredCars.length) % featuredCars.length)}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 h-12 w-12 rounded-full bg-black/30 hover:bg-brand-primary/90 hover:scale-105 active:scale-95 text-white flex items-center justify-center border border-white/10 backdrop-blur-sm transition-all duration-300 shadow-md pointer-events-auto"
            aria-label="Anterior slide"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          
          <button
            onClick={() => setActiveSlide((prev) => (prev + 1) % featuredCars.length)}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 h-12 w-12 rounded-full bg-black/30 hover:bg-brand-primary/90 hover:scale-105 active:scale-95 text-white flex items-center justify-center border border-white/10 backdrop-blur-sm transition-all duration-300 shadow-md pointer-events-auto"
            aria-label="Próximo slide"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>

          {/* Bottom Dot indicators */}
          <div className="absolute bottom-4 left-0 right-0 z-20 flex justify-center gap-2">
            {featuredCars.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveSlide(idx)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  idx === activeSlide ? "w-8 bg-brand-primary" : "w-2 bg-white/40 hover:bg-white"
                }`}
                aria-label={`Slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* 2. SEARCH BAR CONSOLE & 3. FILTER CONSOLE (Grouped for closer layout) */}
      <div className="flex flex-col gap-3.5">
        {/* 2. SEARCH BAR CONSOLE (Abaixo do Slider) */}
        <div id="catalogo" className="w-full bg-white dark:bg-zinc-900 border border-brand-primary px-6 py-4 md:px-8 md:py-5 rounded-2xl shadow-[0_8px_30px_var(--brand-shadow)] flex flex-col md:flex-row items-center justify-between gap-4 md:gap-8 animate-fadeIn select-none relative group">
        
        {/* Left Side: Refined typography with hover animation */}
        <div className="flex items-center gap-2.5 self-start md:self-auto cursor-default">
          <span className="h-2 w-2 rounded-full bg-brand-primary animate-pulse" />
          <div className="relative py-1 group/title">
            <h3 className="text-zinc-800 dark:text-zinc-100 text-xs md:text-sm font-extrabold tracking-[0.2em] uppercase transition-colors duration-300 group-hover/title:text-brand-primary select-none whitespace-nowrap">
              ENCONTRE SEU VEÍCULO
            </h3>
            {/* Hover slide line animation */}
            <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-brand-primary transition-all duration-300 group-hover/title:w-full" />
          </div>
        </div>

        {/* Right Side: Clean Input Box */}
        <div className="relative flex-grow w-full max-w-2xl">
          {/* Magnifying Glass Icon (Left) */}
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </div>

          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquise por modelo ou marca..."
            className="w-full bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100/70 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 pl-11 pr-16 py-3 md:py-3.5 rounded-xl text-xs md:text-sm font-bold border border-zinc-200 dark:border-zinc-800 focus:border-brand-primary dark:focus:border-brand-primary focus:bg-white dark:focus:bg-zinc-950 focus:ring-4 focus:ring-brand-primary/10 outline-none transition-all duration-300 shadow-sm"
            style={{ minHeight: "48px" }}
            aria-label="Pesquise por modelo ou marca"
          />

          {/* Clean "Search" tag on the right */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 bg-zinc-200/50 dark:bg-zinc-800/80 border border-zinc-300/30 dark:border-zinc-700/50 text-[10px] text-zinc-500 dark:text-zinc-400 font-extrabold px-2 py-1 rounded-md tracking-wider select-none pointer-events-none uppercase">
            Buscar
          </div>
        </div>
      </div>

      {/* 3. TWO-LINE SIMPLIFIED FILTER CONSOLE (Abaixo do Slider) */}
      <div className="flex flex-col gap-4 bg-brand-card border border-brand-card-border p-4 sm:p-6 rounded-2xl shadow-[0_4px_25px_var(--brand-shadow)] animate-fadeIn">
        
        {/* Row 1: CARROCERIA */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold text-brand-text/40 uppercase tracking-[0.16em] pl-1 select-none">
            CARROCERIA
          </span>
          <div className="flex overflow-x-auto scrollbar-none gap-2 pb-1.5 w-full select-none -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth">
            {bodyTypes.map((style) => {
              const isSelected = selectedCategory === style.id;
              return (
                <button
                  key={style.id}
                  onClick={() => setSelectedCategory(style.id)}
                  className={`inline-flex items-center justify-center px-4 py-2 rounded-lg border text-center transition-all duration-300 active:scale-95 text-xs font-medium uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${
                    isSelected
                      ? "bg-brand-primary text-white border-brand-primary shadow-sm font-semibold"
                      : "bg-brand-card border-brand-border text-brand-text/70 shadow-sm hover:border-brand-primary/45 hover:text-brand-primary"
                  }`}
                >
                  {style.name.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider line */}
        <div className="h-px w-full bg-brand-border/40" />

        {/* Row 2: DESTAQUES RÁPIDOS */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold text-brand-text/40 uppercase tracking-[0.16em] pl-1 select-none">
            DESTAQUES RÁPIDOS
          </span>
          <div className="flex overflow-x-auto scrollbar-none gap-2 pb-1.5 w-full select-none -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth">
            {[
              { id: "todos", name: "TODOS" },
              ...quickTags
            ].map((opt) => {
              const isSelected = selectedQuickTag === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setSelectedQuickTag(opt.id)}
                  className={`inline-flex items-center justify-center px-4 py-2 rounded-lg border text-center transition-all duration-300 active:scale-95 text-xs font-medium uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${
                    isSelected
                      ? "bg-brand-primary text-white border-brand-primary shadow-sm font-semibold"
                      : "bg-brand-card border-brand-border text-brand-text/70 shadow-sm hover:border-brand-primary/45 hover:text-brand-primary"
                  }`}
                >
                  {opt.name.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mobile Dropdowns refinement block (Filtro Rápido Inline) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 lg:hidden">
          
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold uppercase text-brand-text/40">Câmbio</label>
            <select
              value={filterCambio}
              onChange={(e) => setFilterCambio(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-3 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
              style={{ minHeight: "48px" }}
            >
              <option value="todos">Câmbio</option>
              {cambiosDisponiveis.map((cambio) => (
                <option key={cambio} value={cambio}>
                  {cambio.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold uppercase text-brand-text/40">Direção</label>
            <select
              value={filterDirecao}
              onChange={(e) => setFilterDirecao(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-3 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
              style={{ minHeight: "48px" }}
            >
              <option value="todos">Direção</option>
              {direcoesDisponiveis.map((dir) => (
                <option key={dir} value={dir}>
                  {dir.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold uppercase text-brand-text/40">Combustível</label>
            <select
              value={filterCombustivel}
              onChange={(e) => setFilterCombustivel(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-3 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
              style={{ minHeight: "48px" }}
            >
              <option value="todos">Combustível</option>
              {combustiveisDisponiveis.map((comb) => (
                <option key={comb} value={comb}>
                  {comb.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold uppercase text-brand-text/40">Marca</label>
            <select
              value={filterMarca}
              onChange={(e) => {
                setFilterMarca(e.target.value);
                setFilterModelo("todos");
              }}
              className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-3 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
              style={{ minHeight: "48px" }}
            >
              <option value="todos">Todas Marcas</option>
              {marcasDisponiveis.map((marca) => (
                <option key={marca} value={marca}>
                  {marca}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold uppercase text-brand-text/40">Modelo</label>
            <select
              value={filterModelo}
              onChange={(e) => setFilterModelo(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-3 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
              style={{ minHeight: "48px" }}
            >
              <option value="todos">Todos Modelos</option>
              {modelosDisponiveis.map((modelo) => (
                <option key={modelo} value={modelo}>
                  {modelo}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold uppercase text-brand-text/40">Ano</label>
            <select
              value={filterAno}
              onChange={(e) => setFilterAno(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-3 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
              style={{ minHeight: "48px" }}
            >
              <option value="todos">Todos Anos</option>
              {anosDisponiveis.map((ano) => (
                <option key={ano} value={ano}>
                  {ano}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold uppercase text-brand-text/40">Preço Mínimo</label>
            <select
              value={filterPrecoMin}
              onChange={(e) => setFilterPrecoMin(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-3 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
              style={{ minHeight: "48px" }}
            >
              <option value="todos">Mínimo</option>
              <option value="100000">R$ 100 mil</option>
              <option value="250000">R$ 250 mil</option>
              <option value="500000">R$ 500 mil</option>
              <option value="750000">R$ 750 mil</option>
            </select>
          </div>

          <div className="flex flex-col gap-1 col-span-2 md:col-span-1">
            <label className="text-[9px] font-bold uppercase text-brand-text/40">Preço Máximo</label>
            <select
              value={filterPrecoMax}
              onChange={(e) => setFilterPrecoMax(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-3 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
              style={{ minHeight: "48px" }}
            >
              <option value="todos">Máximo</option>
              <option value="300000">R$ 300 mil</option>
              <option value="600000">R$ 600 mil</option>
              <option value="1000000">R$ 1.0 milhão</option>
              <option value="1500000">R$ 1.5 milhão</option>
            </select>
          </div>
        </div>

        {/* Clear Filters CTA for mobile */}
        {(searchTerm || selectedCategory !== "todos" || selectedQuickTag !== "todos" || filterMarca !== "todos" || filterModelo !== "todos" || filterAno !== "todos" || filterPrecoMin !== "todos" || filterPrecoMax !== "todos" || filterCambio !== "todos" || filterDirecao !== "todos" || filterCombustivel !== "todos") && (
          <button
            onClick={handleClearFilters}
            className="lg:hidden mt-2 w-full py-3 px-4 bg-brand-bg text-brand-gold font-bold uppercase tracking-wider text-xs rounded-xl hover:bg-brand-card-border transition-colors duration-300"
            style={{ minHeight: "48px" }}
          >
            Limpar Filtros Selecionados
          </button>
        )}
      </div>
      </div>

      {/* 3. DESKTOP 2-COLUMN RESPONSIVE LAYOUT (Auto Club Style - ListingsTwo.html) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: FIXED REFINE SEARCH SIDEBAR (Spans 3 cols on lg) */}
        <aside className="hidden lg:flex lg:col-span-3 flex-col gap-6 sticky top-24 lg:h-[calc(100vh-120px)] lg:overflow-y-auto pr-2 bg-brand-card border border-brand-card-border p-6 rounded-3xl shadow-[0_8px_30px_var(--brand-shadow)]">
          <div className="flex flex-col gap-1 border-b border-brand-border pb-4">
            <span className="text-[9px] font-extrabold uppercase text-brand-primary tracking-widest">
              Filtros Avançados
            </span>
            <h4 className="text-md font-black text-brand-text">
              Refinar Busca
            </h4>
          </div>

          <div className="flex flex-col gap-4">
            {/* Direct Text input inside sidebar */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-brand-text/50">O que você procura?</label>
              <input
                type="text"
                placeholder="Ex: Porsche, 911, M Sport..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text px-4 h-12 w-full placeholder-brand-text/30 focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                style={{ minHeight: "48px" }}
              />
            </div>

            {/* Brand Select */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-brand-text/50">Marca</label>
              <select
                value={filterMarca}
                onChange={(e) => {
                  setFilterMarca(e.target.value);
                  setFilterModelo("todos");
                }}
                className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                style={{ minHeight: "48px" }}
              >
                <option value="todos">Todas Marcas</option>
                {marcasDisponiveis.map((marca) => (
                  <option key={marca} value={marca}>
                    {marca}
                  </option>
                ))}
              </select>
            </div>

            {/* Model Select */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-brand-text/50">Modelo</label>
              <select
                value={filterModelo}
                onChange={(e) => setFilterModelo(e.target.value)}
                className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                style={{ minHeight: "48px" }}
              >
                <option value="todos">Todos Modelos</option>
                {modelosDisponiveis.map((modelo) => (
                  <option key={modelo} value={modelo}>
                    {modelo}
                  </option>
                ))}
              </select>
            </div>

            {/* Year Select */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-brand-text/50">Ano de Fabricação</label>
              <select
                value={filterAno}
                onChange={(e) => setFilterAno(e.target.value)}
                className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                style={{ minHeight: "48px" }}
              >
                <option value="todos">Todos Anos</option>
                {anosDisponiveis.map((ano) => (
                  <option key={ano} value={ano}>
                    {ano}
                  </option>
                ))}
              </select>
            </div>

            {/* Câmbio Select */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-brand-text/50">Câmbio</label>
              <select
                value={filterCambio}
                onChange={(e) => setFilterCambio(e.target.value)}
                className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                style={{ minHeight: "48px" }}
              >
                <option value="todos">Todos Câmbios</option>
                {cambiosDisponiveis.map((cambio) => (
                  <option key={cambio} value={cambio}>
                    {cambio.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Direção Select */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-brand-text/50">Direção</label>
              <select
                value={filterDirecao}
                onChange={(e) => setFilterDirecao(e.target.value)}
                className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                style={{ minHeight: "48px" }}
              >
                <option value="todos">Todas Direções</option>
                {direcoesDisponiveis.map((dir) => (
                  <option key={dir} value={dir}>
                    {dir.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Combustível Select */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-brand-text/50">Combustível</label>
              <select
                value={filterCombustivel}
                onChange={(e) => setFilterCombustivel(e.target.value)}
                className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                style={{ minHeight: "48px" }}
              >
                <option value="todos">Todos Combustíveis</option>
                {combustiveisDisponiveis.map((comb) => (
                  <option key={comb} value={comb}>
                    {comb.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Min Price Select */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-brand-text/50">Preço Mínimo</label>
              <select
                value={filterPrecoMin}
                onChange={(e) => setFilterPrecoMin(e.target.value)}
                className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                style={{ minHeight: "48px" }}
              >
                <option value="todos">Qualquer Valor</option>
                <option value="100000">R$ 100 mil</option>
                <option value="250000">R$ 250 mil</option>
                <option value="500000">R$ 500 mil</option>
                <option value="750000">R$ 750 mil</option>
                <option value="1000000">R$ 1.0 milhão</option>
              </select>
            </div>

            {/* Max Price Select */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase text-brand-text/50">Preço Máximo</label>
              <select
                value={filterPrecoMax}
                onChange={(e) => setFilterPrecoMax(e.target.value)}
                className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                style={{ minHeight: "48px" }}
              >
                <option value="todos">Qualquer Valor</option>
                <option value="300000">R$ 300 mil</option>
                <option value="600000">R$ 600 mil</option>
                <option value="1000000">R$ 1.0 milhão</option>
                <option value="1500000">R$ 1.5 milhão</option>
                <option value="2000000">R$ 2.0 milhões</option>
              </select>
            </div>

            {/* Clear Filter Sidebar Button */}
            <button
              onClick={handleClearFilters}
              className="mt-2 w-full py-4 bg-brand-bg hover:bg-brand-card-border border border-brand-border text-brand-gold hover:text-brand-primary font-black uppercase tracking-wider text-xs rounded-xl transition-all duration-300"
              style={{ minHeight: "48px" }}
            >
              Limpar Filtros
            </button>
          </div>
        </aside>

        {/* RIGHT COLUMN: MAIN CATALOG LISTING AREA (Spans 9 cols on lg) */}
        <div className="w-full lg:col-span-9 flex flex-col gap-6">
          
          {/* Header catalog bar: items counter and Layout Mode Toggle buttons */}
          <div className="flex items-center justify-between bg-brand-card border border-brand-card-border px-5 py-4 rounded-2xl shadow-sm">
            <span className="text-xs md:text-sm font-extrabold text-brand-text flex items-center gap-1.5">
              {isLoading ? (
                <span className="h-4 w-32 bg-brand-bg rounded animate-pulse inline-block" />
              ) : (
                <>
                  Disponível em Estoque:
                  <span className="text-brand-primary font-black">
                    {filteredEstoque.length} veículos
                  </span>
                </>
              )}
            </span>

            {/* Desktop Layout Mode Switcher Toggle */}
            <div className="flex items-center gap-1.5 border border-brand-border bg-brand-bg p-1 rounded-xl">
              <button
                onClick={() => setLayoutMode("grid")}
                className={`p-2 rounded-lg transition-all duration-300 ${
                  layoutMode === "grid"
                    ? "bg-brand-primary text-white shadow-sm"
                    : "text-brand-text/40 hover:text-brand-text"
                }`}
                title="Visualizar em Grid"
                aria-label="Layout Grid"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25A2.25 2.25 0 0 1 13.5 8.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                </svg>
              </button>

              <button
                onClick={() => setLayoutMode("list")}
                className={`p-2 rounded-lg transition-all duration-300 ${
                  layoutMode === "list"
                    ? "bg-brand-primary text-white shadow-sm"
                    : "text-brand-text/40 hover:text-brand-text"
                }`}
                title="Visualizar em Linha"
                aria-label="Layout Linha/Lista"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5" />
                </svg>
              </button>
            </div>
          </div>

          {/* CATALOG MAIN CONTAINER */}
          {isLoading ? (
            // Premium shimmer skeleton loader
            <div className={`grid gap-6 ${layoutMode === "grid" ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" : "grid-cols-1"}`}>
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="w-full bg-brand-card border border-brand-card-border p-4 rounded-3xl animate-pulse flex flex-col md:flex-row gap-4"
                  style={{ minHeight: "180px" }}
                >
                  <div className="h-32 w-full md:w-44 bg-brand-card-border rounded-xl flex-shrink-0" />
                  <div className="flex flex-col justify-between w-full py-1 gap-2">
                    <div className="h-4 w-1/3 bg-brand-card-border rounded" />
                    <div className="h-5 w-2/3 bg-brand-card-border rounded" />
                    <div className="h-3 w-full bg-brand-card-border rounded" />
                    <div className="h-6 w-1/4 bg-brand-card-border rounded self-start mt-2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredEstoque.length === 0 ? (
            <div className="text-center py-20 bg-brand-card border border-brand-card-border rounded-3xl text-brand-text/50 text-sm flex flex-col items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-10 h-10 text-brand-primary/45">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <span>Nenhum veículo corresponde à filtragem atual.</span>
              <button
                onClick={handleClearFilters}
                className="mt-2 text-xs font-black uppercase bg-brand-primary text-white px-4 py-2.5 rounded-xl active:scale-95 transition-all duration-300"
              >
                Resetar Filtros
              </button>
            </div>
          ) : (
            // Responsive vehicles listings: Grid vs List Layouts
            <div className={`grid gap-6 ${
              layoutMode === "grid" ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" : "grid-cols-1"
            }`}>
              {filteredEstoque.map((veiculo) => {
                const pdpUrl = getVeiculoPdpUrl(veiculo);

                const hasDiscount = veiculo.preco_promocional > 0 && veiculo.preco_promocional < veiculo.preco_original;
                const activePrice = hasDiscount ? veiculo.preco_promocional : veiculo.preco_original;

                // GRID COMPONENT CARD (Mimics Auto Club item style)
                if (layoutMode === "grid") {
                  return (
                    <div
                      key={veiculo.id}
                      className="group bg-brand-card border border-brand-card-border hover:border-brand-primary/40 rounded-3xl flex flex-col justify-between shadow-[0_8px_30px_var(--brand-shadow)] hover:shadow-xl transition-all duration-300 relative overflow-hidden animate-fadeIn"
                    >
                      {/* Image block container - Perfect Full-Bleed (no borders/padding surrounding) */}
                      <Link prefetch={false} href={pdpUrl} className="relative w-full aspect-video overflow-hidden bg-brand-bg flex-shrink-0 block cursor-pointer">
                        <Image
                          src={veiculo.whatsapp_images[0] || "/logo.png"}
                          alt={`${veiculo.marca} ${veiculo.modelo}`}
                          fill
                          sizes="(max-w-768px) 100vw, 350px"
                          className={`w-full border-none p-0 m-0 object-cover transition-transform duration-700 group-hover:scale-105 ${veiculo.vendido ? "filter grayscale-[30%] opacity-75" : ""}`}
                        />
                        {/* Elegant inspection / status badge */}
                        {veiculo.status_tag && (
                          <div className={`absolute top-2.5 left-2.5 backdrop-blur-sm text-[8px] font-black uppercase px-2 py-0.5 rounded shadow-lg tracking-wider flex items-center gap-1 z-10 border ${resolveTagColorClass(veiculo.status_tag_color)}`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                            {veiculo.status_tag.toUpperCase()}
                          </div>
                        )}
                        {/* Sold overlay */}
                        {veiculo.vendido && (
                          <div className="absolute inset-0 bg-zinc-950/45 flex items-center justify-center z-20 backdrop-blur-[0.5px]">
                            <div className="bg-black/80 backdrop-blur-md border border-red-500/30 px-4 py-2 rounded-lg shadow-2xl flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                              <span className="text-[9px] font-black tracking-[0.25em] text-white uppercase">
                                VENDIDO
                              </span>
                            </div>
                          </div>
                        )}
                      </Link>

                      {/* Info details block */}
                      <div className="p-4 max-sm:p-2 flex flex-col flex-grow justify-between gap-3 max-sm:gap-1.5">
                        {/* Brand, Model, Version Link */}
                        <Link prefetch={false} href={pdpUrl} className="flex flex-col gap-1 group/link cursor-pointer">
                          <span className="text-[9px] font-medium text-brand-gold uppercase tracking-widest leading-none">
                            {veiculo.marca}
                          </span>
                          <h4 className="text-base max-sm:text-sm font-bold text-brand-text leading-tight max-sm:leading-tight group-hover/link:text-brand-primary transition-colors duration-200 uppercase mt-0.5">
                            {veiculo.modelo}
                          </h4>
                          <span className="text-[10px] max-sm:text-[9px] text-brand-text/40 truncate max-w-[240px] font-light uppercase tracking-wide mt-0.5 block">
                            {veiculo.versao}
                          </span>
                        </Link>

                        {/* Specs Grid Link */}
                        <Link prefetch={false} href={pdpUrl} className="block cursor-pointer">
                          <div className="grid grid-cols-3 gap-1 max-sm:gap-0.5 py-1 max-sm:py-0.5 border-t border-b border-brand-border/40 my-1 text-center font-thin uppercase tracking-wider text-[9px] max-sm:text-[8px] max-sm:h-auto text-brand-text/50 hover:border-brand-primary/30 transition-all duration-300">
                            <div className="flex flex-col gap-0.5 border-r border-brand-border/40 last:border-r-0 py-0.5">
                              <span className="text-[7px] text-brand-text/30 font-semibold">ANO</span>
                              <span className="text-brand-text/70 font-semibold">{veiculo.ano}</span>
                            </div>
                            <div className="flex flex-col gap-0.5 border-r border-brand-border/40 last:border-r-0 py-0.5 truncate">
                              <span className="text-[7px] text-brand-text/30 font-semibold">KM</span>
                              <span className="text-brand-text/70 font-semibold truncate">{veiculo.quilometragem === 0 ? "NOVO" : formatKm(veiculo.quilometragem).split(" ")[0]}</span>
                            </div>
                            <div className="flex flex-col gap-0.5 border-r border-brand-border/40 last:border-r-0 py-0.5 truncate">
                              <span className="text-[7px] text-brand-text/30 font-semibold">CÂMBIO</span>
                              <span className="text-brand-text/70 font-semibold truncate">{veiculo.cambio.split(" ")[0].toUpperCase()}</span>
                            </div>
                          </div>
                        </Link>

                        {/* Price & Green WhatsApp trigger button */}
                        <div className="flex items-end justify-between gap-2 mt-1.5">
                          {/* Price Link */}
                          <Link prefetch={false} href={pdpUrl} className="flex flex-col cursor-pointer flex-grow">
                            {hasDiscount ? (
                              <>
                                <span className="text-[9px] text-brand-text/40 line-through leading-none mb-0.5">
                                  De {formatPrice(veiculo.preco_original)}
                                </span>
                                <span className="text-base max-sm:text-sm font-bold text-brand-primary leading-none">
                                  Por {formatPrice(veiculo.preco_promocional)}
                                </span>
                              </>
                            ) : (
                              <span className="text-base max-sm:text-sm font-bold text-brand-primary leading-none">
                                {formatPrice(veiculo.preco_original)}
                              </span>
                            )}
                          </Link>

                          {/* CTAs Group */}
                          <div className="flex items-center gap-2 max-sm:gap-1.5 self-end flex-shrink-0">
                            {/* Toggle Comparar Button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isInCompare(veiculo.id)) {
                                  removeFromCompare(veiculo.id);
                                } else {
                                  addToCompare(veiculo.id);
                                }
                              }}
                              className={`flex items-center gap-1.5 max-sm:gap-1 text-[10px] max-sm:text-[9px] font-bold cursor-pointer select-none rounded-lg px-3 py-2 max-sm:px-2.5 transition-all duration-300 active:scale-95 shadow-sm border ${
                                isInCompare(veiculo.id)
                                  ? "bg-brand-primary text-white border-brand-primary shadow-md"
                                  : "bg-brand-bg text-brand-text/70 border-brand-border hover:bg-brand-primary/10 hover:border-brand-primary/45 hover:text-brand-primary"
                              }`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3 flex-shrink-0">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M6 8l-4 4 4 4M18 8l4 4-4 4" />
                              </svg>
                              <span>{isInCompare(veiculo.id) ? "Comparando" : "Comparar"}</span>
                            </button>

                            {/* Square Green Emerald WhatsApp Button (w-12 h-12 / 48x48px) */}
                            <button
                              type="button"
                              onClick={(e) => handleWhatsappClick(e, veiculo)}
                              className="w-12 h-12 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl flex items-center justify-center transition-all duration-300 shadow-md shadow-emerald-950/15 cursor-pointer select-none border border-transparent flex-shrink-0"
                              aria-label="Contatar via WhatsApp"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className="w-5 h-5">
                                <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                // LIST COMPONENT CARD (Mimics Auto Club ListingsTwo.html Look - Expandido Horizontal)
                return (
                    <div
                      key={veiculo.id}
                      className="group bg-brand-card border border-brand-card-border hover:border-brand-primary/40 rounded-3xl p-0 flex flex-col md:flex-row gap-6 max-sm:gap-4.5 shadow-[0_8px_30px_var(--brand-shadow)] hover:shadow-xl transition-all duration-300 relative overflow-hidden animate-fadeIn"
                    >
                    {/* Big Image on Left - Full-Bleed marginless top/left/bottom */}
                    <Link prefetch={false} href={pdpUrl} className="w-full md:w-2/5 aspect-video overflow-hidden bg-brand-bg flex-shrink-0 relative block cursor-pointer">
                      <Image
                        src={veiculo.whatsapp_images[0] || "/logo.png"}
                        alt={`${veiculo.marca} ${veiculo.modelo}`}
                        fill
                        sizes="(max-w-1024px) 100vw, 400px"
                        className={`w-full border-none p-0 m-0 object-cover transition-transform duration-700 group-hover:scale-105 ${veiculo.vendido ? "filter grayscale-[30%] opacity-75" : ""}`}
                      />
                      {/* Elegant status tag */}
                      {veiculo.status_tag && (
                        <div className={`absolute top-3 left-3 backdrop-blur-sm text-[9px] font-black uppercase px-2.5 py-0.5 rounded shadow-lg tracking-wider z-10 border ${resolveTagColorClass(veiculo.status_tag_color)}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                          {veiculo.status_tag.toUpperCase()}
                        </div>
                      )}
                      {/* Sold overlay */}
                      {veiculo.vendido && (
                        <div className="absolute inset-0 bg-zinc-950/45 flex items-center justify-center z-20 backdrop-blur-[0.5px]">
                          <div className="bg-black/80 backdrop-blur-md border border-red-500/30 px-4 py-2.5 rounded-lg shadow-2xl flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-[9px] font-black tracking-[0.25em] text-white uppercase">
                              VENDIDO
                            </span>
                          </div>
                        </div>
                      )}
                    </Link>

                    {/* Mid Block Column: Title & Specs matrix */}
                    <div className="flex flex-col justify-between flex-grow gap-4 py-4 pr-5 max-sm:p-2 max-sm:pt-0 max-sm:pr-2 max-sm:m-0">
                      <Link prefetch={false} href={pdpUrl} className="flex flex-col gap-1.5 group/link cursor-pointer">
                        <span className="text-[10px] font-medium text-brand-gold uppercase tracking-widest leading-none">
                          {veiculo.marca}
                        </span>
                        <h4 className="text-xl max-sm:text-base font-bold text-brand-text leading-tight max-sm:leading-tight group-hover/link:text-brand-primary transition-colors duration-200 uppercase">
                          {veiculo.modelo}
                        </h4>
                        <p className="text-xs text-brand-text/50 font-thin uppercase leading-relaxed max-w-xl">
                          <span className="font-thin uppercase">{veiculo.versao}</span>
                          {veiculo.pericia && 
                           !veiculo.pericia.toLowerCase().includes("análise") && 
                           !veiculo.pericia.toLowerCase().includes("analise") && 
                           ` • ${veiculo.pericia.toUpperCase()}`}
                        </p>
                      </Link>

                      {/* Technical specifications bar - Horizontal Row with Dynamic Brand SVGs */}
                      <Link prefetch={false} href={pdpUrl} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-brand-border/40 pt-3 text-xs text-brand-text/70 hover:border-brand-primary/30 transition-all duration-300 cursor-pointer">
                        {/* 1. ANO */}
                        <div className="flex items-center gap-1.5 pr-4 border-r border-brand-border/40 last:border-0 last:pr-0">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5 flex-shrink-0 text-brand-primary">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                          </svg>
                          <span className="font-thin uppercase text-[10px] tracking-wider text-brand-text/40">ANO:</span>
                          <span className="font-semibold uppercase text-brand-text text-[11px]">{veiculo.ano}</span>
                        </div>

                        {/* 2. QUILOMETRAGEM */}
                        <div className="flex items-center gap-1.5 pr-4 border-r border-brand-border/40 last:border-0 last:pr-0">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5 flex-shrink-0 text-brand-primary">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                          </svg>
                          <span className="font-thin uppercase text-[10px] tracking-wider text-brand-text/40">KM:</span>
                          <span className="font-semibold uppercase text-brand-text text-[11px]">{formatKm(veiculo.quilometragem)}</span>
                        </div>

                        {/* 3. CÂMBIO */}
                        <div className="flex items-center gap-1.5 pr-4 border-r border-brand-border/40 last:border-0 last:pr-0">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5 flex-shrink-0 text-brand-primary">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0 0 15 0m-15 0a7.5 7.5 0 1 1 15 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.25 0h8.25" />
                          </svg>
                          <span className="font-thin uppercase text-[10px] tracking-wider text-brand-text/40">CÂMBIO:</span>
                          <span className="font-semibold uppercase text-brand-text text-[11px]">{veiculo.cambio}</span>
                        </div>

                        {/* 4. COMBUSTÍVEL */}
                        <div className="flex items-center gap-1.5 pr-4 border-r border-brand-border/40 last:border-0 last:pr-0">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5 flex-shrink-0 text-brand-primary">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.375 7.5c0 1.242-1.008 2.25-2.25 2.25h-2.25v-4.5h2.25c1.242 0 2.25 1.008 2.25 2.25ZM2.25 12h20.25M6.75 6h10.5M6.75 18h10.5M10.875 13.5c0 1.242-1.008 2.25-2.25 2.25h-1.875v-4.5h1.875c1.242 0 2.25 1.008 2.25 2.25Z" />
                          </svg>
                          <span className="font-thin uppercase text-[10px] tracking-wider text-brand-text/40">COMB:</span>
                          <span className="font-semibold uppercase text-brand-text text-[11px]">{veiculo.combustivel}</span>
                        </div>

                        {/* 5. STATUS DA PERÍCIA */}
                        {veiculo.pericia && 
                         !veiculo.pericia.toLowerCase().includes("análise") && 
                         !veiculo.pericia.toLowerCase().includes("analise") && (
                          <div className="flex items-center gap-1.5 pr-4 last:border-0 last:pr-0">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5 flex-shrink-0 text-brand-primary">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
                            </svg>
                            <span className="font-thin uppercase text-[10px] tracking-wider text-brand-text/40">PERÍCIA:</span>
                            <span className="font-semibold uppercase text-brand-text text-[11px]">{veiculo.pericia}</span>
                          </div>
                        )}
                      </Link>
                    </div>

                    {/* Right Block Column: Pricing & CTAs */}
                    <div className="w-full md:w-1/4 flex flex-col justify-between items-stretch border-t md:border-t-0 md:border-l border-brand-border/60 pt-4 md:pt-4 pb-4 px-5 md:pl-6 flex-shrink-0 gap-4">
                      
                      {/* Price tag display */}
                      <div className="flex flex-col md:items-end">
                        <Link prefetch={false} href={pdpUrl} className="flex flex-col md:items-end cursor-pointer group/price mb-2 w-full">
                          <span className="text-[10px] text-brand-text/40 group-hover/price:text-brand-primary uppercase font-semibold tracking-wider mb-1">Preço Especial</span>
                          {hasDiscount ? (
                            <div className="flex flex-col md:items-end">
                              <span className="text-xs text-brand-text/40 line-through">
                                De {formatPrice(veiculo.preco_original)}
                              </span>
                              <span className="text-2xl font-bold text-brand-primary">
                                {formatPrice(veiculo.preco_promocional)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-2xl font-bold text-brand-primary">
                              {formatPrice(veiculo.preco_original)}
                            </span>
                          )}
                        </Link>

                        {/* Toggle Comparar Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isInCompare(veiculo.id)) {
                              removeFromCompare(veiculo.id);
                            } else {
                              addToCompare(veiculo.id);
                            }
                          }}
                          className={`flex items-center gap-1.5 max-sm:gap-1 text-[10px] max-sm:text-[9px] font-bold cursor-pointer select-none rounded-lg px-3 py-2 max-sm:px-2.5 transition-all duration-300 active:scale-95 mt-2 shadow-sm border ${
                            isInCompare(veiculo.id)
                              ? "bg-brand-primary text-white border-brand-primary shadow-md"
                              : "bg-brand-bg text-brand-text/70 border-brand-border hover:bg-brand-primary/10 hover:border-brand-primary/45 hover:text-brand-primary"
                          }`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3 flex-shrink-0">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M6 8l-4 4 4 4M18 8l4 4-4 4" />
                          </svg>
                          <span>{isInCompare(veiculo.id) ? "Comparando" : "Comparar"}</span>
                        </button>
                      </div>

                      {/* Direct Click Buttons Block CTAs */}
                      <div className="flex items-center gap-2 mt-auto w-full">
                        {/* Ver Detalhes Button */}
                        <Link
                          href={pdpUrl}
                          className="flex-grow h-11 border border-brand-primary hover:bg-brand-primary hover:text-white text-brand-gold hover:text-white font-semibold text-[10px] uppercase tracking-widest rounded-xl flex items-center justify-center transition-all duration-300 select-none cursor-pointer"
                        >
                          Ver Detalhes
                        </Link>

                        {/* WhatsApp Square Icon Only Button (w-12 h-12 / 48x48px) */}
                        <button
                          type="button"
                          onClick={(e) => handleWhatsappClick(e, veiculo)}
                          className="w-12 h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl flex items-center justify-center transition-all duration-300 shadow-md shadow-emerald-950/15 cursor-pointer select-none border border-transparent flex-shrink-0"
                          aria-label="Contatar via WhatsApp"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className="w-5 h-5">
                            <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* FLOATING COMPARISON CTA — appears when 2+ cars selected */}
        {/* Desktop: Fixed bottom-right floating button */}
        {compareIds.length >= 2 && (
          <button
            onClick={() => setCompareOpen(true)}
            className="hidden lg:flex fixed bottom-8 right-8 z-50 items-center gap-3 bg-brand-primary hover:bg-brand-primary/90 text-white font-semibold text-sm uppercase tracking-wider pl-5 pr-4 py-4 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.2)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.3)] transition-all duration-300 hover:scale-105 active:scale-95 animate-[slideUp_0.4s_ease-out]"
            aria-label="Comparar veículos selecionados"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M6 8l-4 4 4 4M18 8l4 4-4 4" />
            </svg>
            <span>Comparar {compareIds.length} modelos</span>
            <span className="bg-white/20 rounded-full h-7 w-7 flex items-center justify-center text-xs font-bold">{compareIds.length}</span>
          </button>
        )}

        {/* Mobile: Fixed bottom full-width CTA bar */}
        {compareIds.length >= 2 && (
          <div
            className="lg:hidden fixed bottom-0 left-0 w-full z-40 bg-brand-primary text-white font-semibold text-center uppercase p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.2)] flex items-center justify-center gap-3 cursor-pointer active:opacity-90 transition-all duration-300 animate-[slideUp_0.3s_ease-out]"
            onClick={() => setCompareOpen(true)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M6 8l-4 4 4 4M18 8l4 4-4 4" />
            </svg>
            <span className="text-sm tracking-wider">Comparar {compareIds.length} modelos</span>
          </div>
        )}

        {/* Comparison Full-Screen Modal */}
        {compareOpen && (
          <VehicleCompare onClose={() => setCompareOpen(false)} />
        )}

      {/* Positive Friction Lead Capture Modal */}
      <LeadCaptureModal
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        onSubmit={handleLeadSubmit}
        vehicleInfo={activeVehicle ? {
          marca: activeVehicle.marca,
          modelo: activeVehicle.modelo,
          ano: activeVehicle.ano
        } : undefined}
      />
      </div>

    </div>
  );
}
