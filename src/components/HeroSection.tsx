"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getEstoque, getVeiculoPdpUrl } from "../lib/supabase";
import type { Veiculo } from "../types";
import { useTheme } from "../app/ThemeContext";
import { getUtmParameters, trackLeadSubmission, trackContactClick } from "../lib/telemetry";
import { findMatchingQuickTag } from "../lib/tagUtils";
import SearchConsole from "./SearchConsole";
import FilterConsole from "./FilterConsole";
import QuickTagsCarousel from "./QuickTagsCarousel";
import VehicleGrid from "./VehicleGrid";
import LeadCaptureModal from "./LeadCaptureModal";

// Formatter helpers
export function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  });
}

export function formatKm(value: number): string {
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

export function resolveTagColorClass(color?: string): string {
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

function normalizeText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export interface QuickTag {
  id: string;
  name: string;
  field: "perfil_uso" | "preco" | "quilometragem" | "tipo" | "marca" | "combustivel" | "manual";
  operator: "equals" | "less" | "greater" | "contains" | "none";
  value: string;
}

const DEFAULT_QUICK_TAGS: QuickTag[] = [
  { id: "curadoria", name: "CURADORIA EXCLUSIVA", field: "perfil_uso", operator: "equals", value: "CURADORIA EXCLUSIVA" },
  { id: "economicos", name: "ECONÔMICOS", field: "preco", operator: "less", value: "180000" },
  { id: "baixa_km", name: "BAIXA QUILOMETRAGEM", field: "quilometragem", operator: "less", value: "40000" },
  { id: "parcela_1k", name: "PARCELA 1K", field: "preco", operator: "less", value: "120000" }
];

// Removed obsolete filters constants

function checkTagMatchesVehicle(tag: QuickTag, car: Veiculo, stockOverrides: any): boolean {
  // Check manual overrides first
  const manualTags = stockOverrides?.[car.id]?.quick_tags || [];
  if (manualTags.includes(tag.id)) {
    return true;
  }

  if (tag.field === "manual" || tag.operator === "none") {
    return false;
  }

  // Special fallback for the default "economicos" tag to match original behavior
  if (tag.id === "economicos" && tag.field === "preco" && tag.operator === "less" && tag.value === "180000") {
    const p = car.preco_promocional > 0 && car.preco_promocional < car.preco_original
      ? car.preco_promocional
      : car.preco_original;
    const combustivel = resolveTipoCombustivel(car);
    return p < 180000 || combustivel === "Elétrico" || combustivel === "Híbrido";
  }

  // Extract the field value from the car
  let fieldValue: any;
  if (tag.field === "preco") {
    fieldValue = car.preco_promocional > 0 && car.preco_promocional < car.preco_original
      ? car.preco_promocional
      : car.preco_original;
  } else if (tag.field === "quilometragem") {
    fieldValue = car.quilometragem;
  } else if (tag.field === "combustivel") {
    fieldValue = resolveTipoCombustivel(car);
  } else if (tag.field === "perfil_uso") {
    fieldValue = car.perfil_uso || "";
  } else if (tag.field === "tipo") {
    fieldValue = car.tipo || "";
  } else if (tag.field === "marca") {
    fieldValue = car.marca || "";
  } else {
    fieldValue = (car as any)[tag.field] || "";
  }

  const strFieldValue = String(fieldValue).toLowerCase().trim();
  const ruleValue = tag.value.toLowerCase().trim();

  // Evaluate rule based on operator
  switch (tag.operator) {
    case "equals":
      return strFieldValue === ruleValue;
    case "contains":
      return strFieldValue.includes(ruleValue);
    case "less":
      return Number(fieldValue) < Number(tag.value);
    case "greater":
      return Number(fieldValue) > Number(tag.value);
    default:
      return false;
  }
}

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

interface HeroSectionProps {
  initialQuickTag?: string;
  isLandingPage?: boolean;
  landingPageTitle?: string;
  landingPageDescription?: string;
  landingPageBgImage?: string;
  landingPageBannerMode?: "image" | "carousel";
}

export default function HeroSection({
  initialQuickTag = "todos",
  isLandingPage = false,
  landingPageTitle = "",
  landingPageDescription,
  landingPageBgImage,
  landingPageBannerMode
}: HeroSectionProps = {}) {
  const {
    addToCompare,
    removeFromCompare,
    isInCompare,
    compareIds,
    companySettings,
    quickTags: contextQuickTags,
    carouselVehicleIds,
    webhooks,
    stockOverrides
  } = useTheme();
  const [estoque, setEstoque] = useState<Veiculo[]>([]);
  const [filteredEstoque, setFilteredEstoque] = useState<Veiculo[]>([]);
  const [featuredCars, setFeaturedCars] = useState<Veiculo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();
  const [visibleCount, setVisibleCount] = useState<number>(12);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 300) {
      if (visibleCount < filteredEstoque.length) {
        setVisibleCount((prev) => prev + 12);
      }
    }
  };
  
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
  const [searchTerm, setSearchTerm] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("busca") || params.get("q") || "";
    }
    return "";
  });
  const [tempSearchTerm, setTempSearchTerm] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("busca") || params.get("q") || "";
    }
    return "";
  });
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const val = params.get("tipo") || params.get("categoria") || params.get("carroceria");
      return val ? val.toLowerCase() : "todos";
    }
    return "todos";
  });
  const [selectedQuickTag, setSelectedQuickTag] = useState<string>(() => {
    if (initialQuickTag !== "todos") {
      return initialQuickTag;
    }
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const val = params.get("destaque") || params.get("tag");
      return val ? val.toLowerCase() : "todos";
    }
    return "todos";
  });
  const [filterMarca, setFilterMarca] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("marca") || "todos";
    }
    return "todos";
  });
  const [filterModelo, setFilterModelo] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("modelo") || "todos";
    }
    return "todos";
  });
  const [filterAno, setFilterAno] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("ano") || "todos";
    }
    return "todos";
  });
  const [filterPrecoMin, setFilterPrecoMin] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("precoMin") || "todos";
    }
    return "todos";
  });
  const [filterPrecoMax, setFilterPrecoMax] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("precoMax") || "todos";
    }
    return "todos";
  });
  const [filterCambio, setFilterCambio] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("cambio") || "todos";
    }
    return "todos";
  });
  const [filterDirecao, setFilterDirecao] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("direcao") || "todos";
    }
    return "todos";
  });
  const [filterCombustivel, setFilterCombustivel] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("combustivel") || "todos";
    }
    return "todos";
  });

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
      setTempSearchTerm(buscaParam);
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

  // Synchronize active filters to the URL query parameters
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    try {
      const params = new URLSearchParams(window.location.search);
      
      const setOrDelete = (key: string, value: string) => {
        if (value && value !== "todos" && value.trim() !== "") {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      };

      // Avoid redundant query parameters if the route already defines the context
      const isDestaqueRoute = window.location.pathname.startsWith('/destaques/');
      
      setOrDelete("busca", searchTerm);
      setOrDelete("tipo", selectedCategory);
      
      if (!isDestaqueRoute) {
        setOrDelete("destaque", selectedQuickTag);
      } else {
        params.delete("destaque"); // Clean up if it was there
      }
      
      setOrDelete("marca", filterMarca);
      setOrDelete("modelo", filterModelo);
      setOrDelete("ano", filterAno);
      setOrDelete("precoMin", filterPrecoMin);
      setOrDelete("precoMax", filterPrecoMax);
      setOrDelete("cambio", filterCambio);
      setOrDelete("direcao", filterDirecao);
      setOrDelete("combustivel", filterCombustivel);
      
      const queryString = params.toString();
      const newUrl = queryString 
        ? `${window.location.pathname}?${queryString}`
        : window.location.pathname;
      
      // Update browser URL without reloading
      window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, "", newUrl);
    } catch (e) {
      console.warn("[HeroSection] Failed to synchronize filters to URL:", e);
    }
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
    filterCombustivel
  ]);

  // Clean all filters action
  const handleClearFilters = () => {
    setSearchTerm("");
    setTempSearchTerm("");
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

  // Helper to apply search term updates and reset conflicting filters to ensure results are found
  const handleApplySearch = () => {
    setSearchTerm(tempSearchTerm);
    if (tempSearchTerm.trim() !== "") {
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
    }
  };

  // Only show QuickTags that have at least one vehicle matching them
  const validQuickTags = useMemo(() => {
    if (!estoque || estoque.length === 0) return [];
    return quickTags.filter((tag) => 
      estoque.some((car) => checkTagMatchesVehicle(tag, car, stockOverrides))
    );
  }, [quickTags, estoque, stockOverrides]);

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

      // 1. Text Search Filter (Multi-word search over brand, model, version, body type, color, and year)
      if (searchTerm.trim() !== "") {
        const query = normalizeText(searchTerm);
        const queryWords = query.split(/\s+/).filter(Boolean);
        
        if (queryWords.length > 0) {
          result = result.filter((car) => {
            const brand = normalizeText(car.marca);
            const model = normalizeText(car.modelo);
            const version = normalizeText(car.versao);
            const color = normalizeText(car.cor);
            const bodyType = normalizeText(car.tipo);
            const year = String(car.ano);

            // Every typed word must match at least one attribute of the vehicle
            return queryWords.every((word) => {
              if (
                brand.includes(word) ||
                model.includes(word) ||
                version.includes(word) ||
                color.includes(word) ||
                bodyType.includes(word) ||
                year.includes(word)
              ) {
                return true;
              }

              // Also check alternative matches for body type (carroceria)
              const vehicleBodyTypeConfig = ALL_BODY_TYPES.find(t => 
                t.id === car.tipo?.toLowerCase() || 
                t.matches.includes(car.tipo?.toLowerCase() || "")
              );
              if (vehicleBodyTypeConfig) {
                const bodyTypeName = normalizeText(vehicleBodyTypeConfig.name);
                const matchesWord = vehicleBodyTypeConfig.matches.some(m => 
                  normalizeText(m).includes(word) || word.includes(normalizeText(m))
                );
                if (bodyTypeName.includes(word) || matchesWord) {
                  return true;
                }
              }

              return false;
            });
          });
        }
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
        const activeTag = findMatchingQuickTag(quickTags, selectedQuickTag);
        if (activeTag) {
          result = result.filter(car => {
            return checkTagMatchesVehicle(activeTag, car, stockOverrides);
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

  const handleLeadSubmit = async (leadData: { nome: string; email: string; whatsapp: string; turnstileToken: string }) => {
    if (!activeVehicle) return;

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
      utm: utmParams,
      intencao_busca: {},
      agUid: agUid
    };

    // Dispatch lead via secure server proxy api
    // Wrapped: API failures must NEVER block the client from reaching WhatsApp
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          turnstileToken: leadData.turnstileToken
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.warn("[Lead Submit] API returned error (non-blocking):", errorData?.error || response.status);
      }
    } catch (fetchError: any) {
      console.warn("[Lead Submit] Network error (non-blocking):", fetchError.message);
    }

    if (activeVehicle) {
      // Dispara telemetria de conversão (Lead) no GA4/Meta Pixel
      trackLeadSubmission({
        id: activeVehicle.id,
        marca: activeVehicle.marca,
        modelo: activeVehicle.modelo,
        preco: activeVehicle.preco_promocional > 0 ? activeVehicle.preco_promocional : activeVehicle.preco_original
      }, activeMessage);
    }

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

    // Redirect to WhatsApp - ALWAYS executes regardless of API outcome
    const whatsappUrl = `https://wa.me/${companySettings.whatsappRaw}?text=${encodeURIComponent(activeMessage)}`;
    trackContactClick("whatsapp", "Hero Section - Conversão WhatsApp");
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  // Dynamic tag and banner resolution
  const currentTag = useMemo(() => {
    return findMatchingQuickTag(quickTags, selectedQuickTag) || findMatchingQuickTag(quickTags, initialQuickTag);
  }, [quickTags, selectedQuickTag, initialQuickTag]);

  const activeBgImage = currentTag?.bgImageUrl || landingPageBgImage;
  const activeBannerMode = currentTag?.bannerMode || landingPageBannerMode || (activeBgImage ? "image" : "carousel");
  const activeDescription = currentTag?.description || landingPageDescription || "Selecionamos a dedo as melhores opções que se encaixam no seu estilo de vida. Carros 100% periciados com garantia de procedência e as melhores condições para você.";
  const isImageBanner = Boolean(activeBgImage && activeBannerMode !== "carousel");

  const displayCars = useMemo(() => {
    if (isLandingPage && currentTag) {
      const tagVehicles = estoque.filter(car => checkTagMatchesVehicle(currentTag, car, stockOverrides));
      if (tagVehicles.length > 0) return tagVehicles;
    }
    return featuredCars;
  }, [isLandingPage, currentTag, estoque, stockOverrides, featuredCars]);

  return (
    <div role="region" aria-label="Catálogo de Veículos" className="w-full flex flex-col gap-6 md:gap-8">
      
      {/* 1. HERO CAROUSEL / SLIDER / LANDING PAGE BANNER */}
      {isLandingPage && isImageBanner ? (
        /* Custom Photo Hero Banner (For Manual Categories with Custom Image) */
        <div className="relative w-full overflow-hidden rounded-2xl md:rounded-3xl bg-zinc-950 shadow-2xl mb-2 border border-brand-border/40 animate-fadeIn min-h-[220px] md:min-h-[300px] flex items-center justify-center">
          <Image
            src={activeBgImage}
            alt={`Carros ${landingPageTitle || currentTag?.name || ''}`}
            fill
            priority
            className="object-cover object-center filter brightness-90 transition-transform duration-[10000ms] ease-out hover:scale-105"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/35" />

          <div className="relative z-10 w-full py-10 md:py-16 px-6 sm:px-12 flex flex-col items-center justify-center text-center max-w-4xl mx-auto gap-3.5">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-[0.25em] text-brand-primary bg-brand-primary/10 border border-brand-primary/20 px-4 py-1.5 rounded-full backdrop-blur-md">
              Categoria em Destaque
            </span>
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-white uppercase tracking-tight drop-shadow-md">
              Carros {landingPageTitle || currentTag?.name || ''}
            </h1>
            <p className="text-zinc-200/90 max-w-2xl text-xs sm:text-sm md:text-base font-medium leading-relaxed drop-shadow-sm">
              {activeDescription}
            </p>
          </div>
        </div>
      ) : (
        /* Carousel Slider (or Category Header + Carousel) */
        <div className="w-full flex flex-col gap-4 animate-fadeIn">
          {isLandingPage && (
            <div className="w-full pt-2 pb-2 flex flex-col items-center justify-center text-center px-4">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-[0.25em] text-brand-primary bg-brand-primary/10 border border-brand-primary/20 px-4 py-1 rounded-full backdrop-blur-md mb-2">
                Categoria em Destaque
              </span>
              <h1 className="text-3xl md:text-5xl font-extrabold text-brand-primary uppercase tracking-tight drop-shadow-sm mb-2">
                Carros {landingPageTitle || currentTag?.name || ''}
              </h1>
              <p className="text-brand-text/80 max-w-2xl text-xs md:text-base font-medium">
                {activeDescription}
              </p>
            </div>
          )}

          {!isLandingPage && displayCars.length > 0 && (
            <div className="relative w-full h-[55vh] md:h-[70vh] max-h-[680px] rounded-2xl overflow-hidden shadow-2xl bg-zinc-950 group">
              {/* Carousel Slide Wrapper */}
              <div className="relative w-full h-full">
                {displayCars.map((car, index) => {
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
                          src={car.whatsapp_images[0] || car.web_full_images[0]}
                          alt={`${car.marca} ${car.modelo}`}
                          fill
                          priority={index === 0}
                          fetchPriority={index === 0 ? "high" : "auto"}
                          className="object-cover transition-transform duration-[8000ms] ease-out group-hover/slide-img:scale-105"
                          sizes="100vw"
                        />
                        {/* Sleek luxury gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                      </Link>

                      {/* Text Overlay details */}
                      <div className="relative z-20 flex flex-col gap-2 md:gap-4 max-w-2xl text-white transform translate-y-0 transition-transform duration-700">
                        <Link prefetch={false} href={pdpUrl} className="group/slide-text block cursor-pointer">
                          <span className="text-xs md:text-sm font-semibold uppercase tracking-widest text-brand-primary drop-shadow block mb-1">
                            {car.marca} • {car.ano}
                          </span>
                          
                          <h2 className="text-3xl md:text-6xl font-bold tracking-tight leading-none drop-shadow-md group-hover/slide-text:text-brand-primary transition-colors duration-300">
                            {car.modelo}
                          </h2>
                          
                          <p className="text-xs md:text-lg text-white/95 font-medium uppercase tracking-wide line-clamp-1 mt-1 group-hover/slide-text:text-white/80 transition-colors duration-300">
                            {car.versao}
                          </p>
                        </Link>

                        <div className="flex flex-row items-center gap-3 mt-2">
                          <div className="bg-brand-primary/90 text-white font-bold text-lg md:text-2xl px-5 h-12 rounded-xl inline-flex items-center shadow-lg border border-brand-primary-hover backdrop-blur-sm">
                            {formatPrice(promoPrice)}
                          </div>

                          <Link
                            href={pdpUrl}
                            aria-label={`Ver Detalhes do ${car.marca} ${car.modelo}`}
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
                onClick={() => setActiveSlide((prev) => (prev - 1 + displayCars.length) % displayCars.length)}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-20 h-12 w-12 rounded-full bg-black/30 hover:bg-brand-primary/90 hover:scale-105 active:scale-95 text-white flex items-center justify-center border border-white/10 backdrop-blur-sm transition-all duration-300 shadow-md pointer-events-auto cursor-pointer"
                aria-label="Anterior slide"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              </button>
              
              <button
                onClick={() => setActiveSlide((prev) => (prev + 1) % displayCars.length)}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-20 h-12 w-12 rounded-full bg-black/30 hover:bg-brand-primary/90 hover:scale-105 active:scale-95 text-white flex items-center justify-center border border-white/10 backdrop-blur-sm transition-all duration-300 shadow-md pointer-events-auto cursor-pointer"
                aria-label="Próximo slide"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </button>

              {/* Bottom Dot indicators */}
              <div className="absolute bottom-2 left-0 right-0 z-20 flex justify-center items-center">
                {displayCars.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveSlide(idx)}
                    className="w-10 h-10 flex items-center justify-center group/dot focus:outline-none"
                    aria-label={`Slide ${idx + 1}`}
                  >
                    <div className={`h-2 rounded-full transition-all duration-300 ${
                      idx === activeSlide ? "w-8 bg-brand-primary shadow-sm" : "w-2 bg-white/40 group-hover/dot:bg-white"
                    }`} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. SEARCH BAR CONSOLE & 3. FILTER CONSOLE (Grouped for closer layout) */}
      <div id="catalogo" className="flex flex-col gap-3 bg-white border border-brand-primary p-3 sm:p-4 rounded-xl shadow-[0_8px_30px_var(--brand-shadow)] animate-fadeIn select-none">
        
        {/* TOP ROW: CARROCERIA & DESTAQUES ON INDEPENDENT LINES */}
        <QuickTagsCarousel
          bodyTypes={bodyTypes}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          validQuickTags={validQuickTags}
          selectedQuickTag={selectedQuickTag}
          setSelectedQuickTag={setSelectedQuickTag}
        />

        {/* Mobile Dropdowns refinement block (Filtro Rápido Inline) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2 lg:hidden">
          
          <div className="flex flex-col gap-0.5">
            <label className="text-[8px] font-bold uppercase text-zinc-500 pl-1">Câmbio</label>
            <select
              value={filterCambio}
              onChange={(e) => setFilterCambio(e.target.value)}
              className="bg-zinc-50 border border-zinc-200 rounded-lg text-[11px] font-bold text-zinc-800 px-2 h-9 w-full focus:outline-none focus:bg-white focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/20 transition-all duration-300"
            >
              <option value="todos">Câmbio</option>
              {cambiosDisponiveis.map((cambio) => (
                <option key={cambio} value={cambio}>
                  {cambio.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[8px] font-bold uppercase text-zinc-500 pl-1">Direção</label>
            <select
              value={filterDirecao}
              onChange={(e) => setFilterDirecao(e.target.value)}
              className="bg-zinc-50 border border-zinc-200 rounded-lg text-[11px] font-bold text-zinc-800 px-2 h-9 w-full focus:outline-none focus:bg-white focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/20 transition-all duration-300"
            >
              <option value="todos">Direção</option>
              {direcoesDisponiveis.map((dir) => (
                <option key={dir} value={dir}>
                  {dir.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[8px] font-bold uppercase text-zinc-500 pl-1">Combustível</label>
            <select
              value={filterCombustivel}
              onChange={(e) => setFilterCombustivel(e.target.value)}
              className="bg-zinc-50 border border-zinc-200 rounded-lg text-[11px] font-bold text-zinc-800 px-2 h-9 w-full focus:outline-none focus:bg-white focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/20 transition-all duration-300"
            >
              <option value="todos">Combustível</option>
              {combustiveisDisponiveis.map((comb) => (
                <option key={comb} value={comb}>
                  {comb.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[8px] font-bold uppercase text-zinc-500 pl-1">Marca</label>
            <select
              value={filterMarca}
              onChange={(e) => {
                setFilterMarca(e.target.value);
                setFilterModelo("todos");
              }}
              className="bg-zinc-50 border border-zinc-200 rounded-lg text-[11px] font-bold text-zinc-800 px-2 h-9 w-full focus:outline-none focus:bg-white focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/20 transition-all duration-300"
            >
              <option value="todos">Todas Marcas</option>
              {marcasDisponiveis.map((marca) => (
                <option key={marca} value={marca}>
                  {marca}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[8px] font-bold uppercase text-zinc-500 pl-1">Modelo</label>
            <select
              value={filterModelo}
              onChange={(e) => setFilterModelo(e.target.value)}
              className="bg-zinc-50 border border-zinc-200 rounded-lg text-[11px] font-bold text-zinc-800 px-2 h-9 w-full focus:outline-none focus:bg-white focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/20 transition-all duration-300"
            >
              <option value="todos">Todos Modelos</option>
              {modelosDisponiveis.map((modelo) => (
                <option key={modelo} value={modelo}>
                  {modelo}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[8px] font-bold uppercase text-zinc-500 pl-1">Ano</label>
            <select
              value={filterAno}
              onChange={(e) => setFilterAno(e.target.value)}
              className="bg-zinc-50 border border-zinc-200 rounded-lg text-[11px] font-bold text-zinc-800 px-2 h-9 w-full focus:outline-none focus:bg-white focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/20 transition-all duration-300"
            >
              <option value="todos">Todos Anos</option>
              {anosDisponiveis.map((ano) => (
                <option key={ano} value={ano}>
                  {ano}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[8px] font-bold uppercase text-zinc-500 pl-1">Preço Mínimo</label>
            <select
              value={filterPrecoMin}
              onChange={(e) => setFilterPrecoMin(e.target.value)}
              className="bg-zinc-50 border border-zinc-200 rounded-lg text-[11px] font-bold text-zinc-800 px-2 h-9 w-full focus:outline-none focus:bg-white focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/20 transition-all duration-300"
            >
              <option value="todos">Mínimo</option>
              <option value="100000">R$ 100 mil</option>
              <option value="250000">R$ 250 mil</option>
              <option value="500000">R$ 500 mil</option>
              <option value="750000">R$ 750 mil</option>
            </select>
          </div>

          <div className="flex flex-col gap-0.5 col-span-2 md:col-span-1">
            <label className="text-[8px] font-bold uppercase text-zinc-500 pl-1">Preço Máximo</label>
            <select
              value={filterPrecoMax}
              onChange={(e) => setFilterPrecoMax(e.target.value)}
              className="bg-zinc-50 border border-zinc-200 rounded-lg text-[11px] font-bold text-zinc-800 px-2 h-9 w-full focus:outline-none focus:bg-white focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/20 transition-all duration-300"
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
            className="lg:hidden mt-1 w-full py-2 px-4 bg-zinc-100 text-brand-primary font-bold uppercase tracking-wider text-[10px] rounded-lg hover:bg-zinc-200 transition-colors duration-300"
          >
            Limpar Filtros Selecionados
          </button>
        )}

        {/* Divider line between Filters and Search */}
        <div className="h-px w-full bg-zinc-200/50 mt-1 mb-0.5" />

        {/* BOTTOM ROW: SEARCH BAR */}
        <SearchConsole
          tempSearchTerm={tempSearchTerm}
          setTempSearchTerm={setTempSearchTerm}
          handleApplySearch={handleApplySearch}
        />
      </div>

      {/* 3. DESKTOP 2-COLUMN RESPONSIVE LAYOUT (Auto Club Style - ListingsTwo.html) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: FIXED REFINE SEARCH SIDEBAR (Spans 3 cols on lg) */}
        <FilterConsole
          handleApplySearch={handleApplySearch}
          tempSearchTerm={tempSearchTerm}
          setTempSearchTerm={setTempSearchTerm}
          filterMarca={filterMarca}
          setFilterMarca={setFilterMarca}
          setFilterModelo={setFilterModelo}
          marcasDisponiveis={marcasDisponiveis}
          filterModelo={filterModelo}
          modelosDisponiveis={modelosDisponiveis}
          filterAno={filterAno}
          setFilterAno={setFilterAno}
          anosDisponiveis={anosDisponiveis}
          filterCambio={filterCambio}
          setFilterCambio={setFilterCambio}
          cambiosDisponiveis={cambiosDisponiveis}
          filterDirecao={filterDirecao}
          setFilterDirecao={setFilterDirecao}
          direcoesDisponiveis={direcoesDisponiveis}
          filterCombustivel={filterCombustivel}
          setFilterCombustivel={setFilterCombustivel}
          combustiveisDisponiveis={combustiveisDisponiveis}
          filterPrecoMin={filterPrecoMin}
          setFilterPrecoMin={setFilterPrecoMin}
          filterPrecoMax={filterPrecoMax}
          setFilterPrecoMax={setFilterPrecoMax}
          handleClearFilters={handleClearFilters}
        />

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
            <div
              className="max-h-[850px] overflow-y-auto overflow-x-hidden custom-scrollbar pr-2 pb-4"
              onScroll={handleScroll}
            >
              <VehicleGrid
                filteredEstoque={filteredEstoque}
                visibleCount={visibleCount}
                layoutMode={layoutMode}
                handleScroll={handleScroll}
                getVeiculoPdpUrl={getVeiculoPdpUrl}
                handleWhatsappClick={handleWhatsappClick}
                isInCompare={isInCompare}
                addToCompare={addToCompare}
                removeFromCompare={removeFromCompare}
              />
            </div>
          )}
        </div>

        {/* FLOATING COMPARISON CTA — appears when 2+ cars selected */}
        {/* Desktop: Fixed bottom-right floating button */}
        {compareIds.length >= 2 && (
          <button
            onClick={() => router.push('/comparar')}
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
            onClick={() => router.push('/comparar')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M6 8l-4 4 4 4M18 8l4 4-4 4" />
            </svg>
            <span className="text-sm tracking-wider">Comparar {compareIds.length} modelos</span>
          </div>
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
