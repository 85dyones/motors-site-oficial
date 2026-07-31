"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { logFlowInitiated, getActiveAgUid, getUtmParameters, trackAppraisalSubmit, trackLeadSubmission, trackContactClick } from "../lib/telemetry";
import { getMatchParams } from "../lib/tracking-identity";
import LeadCaptureModal from "./LeadCaptureModal";
import Turnstile from "./Turnstile";
import { useTheme } from "../app/ThemeContext";

// ─── FIPE API Types ───
interface FipeBrand { codigo: string; nome: string; }
interface FipeModel { codigo: number; nome: string; }
interface FipeYear  { codigo: string; nome: string; }

interface Step1Data {
  marca: string;
  modelo: string;
  ano: string;
}

interface Step2Data {
  estadoMecanico: string;
  estadoConservacao: string;
  observacoes: string;
}

interface Step3Data {
  nome: string;
  whatsapp: string;
}

const FIPE_BASE = "https://parallelum.com.br/fipe/api/v1";

// ─── Reusable Searchable Combobox Component ───
function SearchableCombobox({
  id,
  label,
  placeholder,
  items,
  value,
  displayValue,
  onSelect,
  onClear,
  loading,
  disabled,
  emptyMessage,
  toolParamDescription,
}: {
  id: string;
  label: string;
  placeholder: string;
  items: { key: string; label: string }[];
  value: string;
  displayValue: string;
  onSelect: (key: string, label: string) => void;
  onClear: () => void;
  loading: boolean;
  disabled?: boolean;
  emptyMessage?: string;
  toolParamDescription?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isUserTyping = useRef(false);

  // Sync display value when parent changes it — but NOT while user is actively typing
  useEffect(() => {
    if (!isUserTyping.current) {
      setSearch(displayValue);
    }
  }, [displayValue]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        isUserTyping.current = false;
        // If no valid selection, revert to display value
        if (!value) setSearch(displayValue);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [value, displayValue]);

  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const filtered = search.trim() && search !== displayValue
    ? items.filter((i) => normalize(i.label).includes(normalize(search)))
    : items;

  const handleSelect = (key: string, label: string) => {
    isUserTyping.current = false;
    setSearch(label);
    setOpen(false);
    onSelect(key, label);
  };

  const handleClear = () => {
    isUserTyping.current = false;
    setSearch("");
    setOpen(true);
    onClear();
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-2 relative">
      <label className="text-xs font-bold text-brand-text/60" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        {/* Search icon */}
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-brand-text/30">
          {loading ? (
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          disabled={disabled || loading}
          placeholder={loading ? "Carregando..." : placeholder}
          value={search}
          onFocus={() => !disabled && setOpen(true)}
          onChange={(e) => {
            isUserTyping.current = true;
            setSearch(e.target.value);
            setOpen(true);
            // If user modifies text after having a selection, clear it
            if (value) {
              isUserTyping.current = true;
              onClear();
            }
          }}
          className={`w-full h-12 bg-brand-card border rounded-xl pl-10 pr-10 text-sm text-brand-text placeholder-brand-text/40 focus:outline-none transition-all duration-200 ${
            disabled ? "opacity-50 cursor-not-allowed" :
            value
              ? "border-brand-primary ring-2 ring-brand-primary/20 shadow-[0_0_12px_var(--brand-shadow)]"
              : "border-brand-border focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
          }`}
          toolparamdescription={toolParamDescription}
        />
        {/* Clear button */}
        {search && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text/40 hover:text-brand-text/70 transition-colors"
            aria-label="Limpar campo de pesquisa"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && !disabled && !loading && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 bg-brand-card/95 backdrop-blur-xl border border-brand-border rounded-2xl shadow-[0_12px_40px_var(--brand-shadow)] max-h-52 overflow-y-auto overscroll-contain"
          style={{ scrollbarWidth: "thin" }}
        >
          {filtered.length > 0 ? (
            <div className="p-1.5">
              {filtered.map((item) => {
                const isSelected = value === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleSelect(item.key, item.label)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 flex items-center justify-between ${
                      isSelected
                        ? "bg-brand-primary/10 text-brand-gold border border-brand-primary/30"
                        : "text-brand-text/70 hover:bg-brand-bg hover:text-brand-text border border-transparent"
                    }`}
                  >
                    <span>{item.label}</span>
                    {isSelected && (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-brand-primary shrink-0">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-center">
              <p className="text-xs text-brand-text/40 font-medium">
                {emptyMessage || `Nenhum resultado para "${search}"`}
              </p>
              <p className="text-[10px] text-brand-text/30 mt-1">Verifique a ortografia e tente novamente</p>
            </div>
          )}
        </div>
      )}

      {/* Confirmed badge */}
      {value && (
        <span className="text-[10px] text-green-600 font-bold self-start mt-0.5 animate-fadeIn flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
            <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
          </svg>
          Selecionado: {displayValue}
        </span>
      )}
    </div>
  );
}


export default function AutoAvaliacao() {
  const { companySettings, webhooks } = useTheme();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [agUid, setAgUid] = useState("ag_ref_nao_localizado");
  const [loading, setLoading] = useState(false);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [activeMessage, setActiveMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  // Type of vehicle
  const [vehicleType, setVehicleType] = useState<"carros" | "motos" | "caminhoes">("carros");

  // Form states
  const [step1, setStep1] = useState<Step1Data>({ marca: "", modelo: "", ano: "" });
  const [step2, setStep2] = useState<Step2Data>({ estadoMecanico: "", estadoConservacao: "", observacoes: "" });
  const [step3, setStep3] = useState<Step3Data>({ nome: "", whatsapp: "" });

  // ─── FIPE API States ───
  const [fipeBrands, setFipeBrands] = useState<FipeBrand[]>([]);
  const [fipeModels, setFipeModels] = useState<FipeModel[]>([]);
  const [fipeYears, setFipeYears] = useState<FipeYear[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingYears, setLoadingYears] = useState(false);

  // Selected FIPE IDs (needed for cascading API calls)
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedYearId, setSelectedYearId] = useState("");

  // FIPE Value states
  const [fipeValor, setFipeValor] = useState("");
  const [fipeCodigo, setFipeCodigo] = useState("");

  // Display labels
  const [brandDisplay, setBrandDisplay] = useState("");
  const [modelDisplay, setModelDisplay] = useState("");
  const [yearDisplay, setYearDisplay] = useState("");

  // Handler for changing vehicle type tab
  const handleVehicleTypeChange = (type: "carros" | "motos" | "caminhoes") => {
    setVehicleType(type);
    setStep1({ marca: "", modelo: "", ano: "" });
    setSelectedBrandId("");
    setSelectedModelId("");
    setSelectedYearId("");
    setFipeValor("");
    setFipeCodigo("");
    setBrandDisplay("");
    setModelDisplay("");
    setYearDisplay("");
    setFipeModels([]);
    setFipeYears([]);
  };

  // ─── Fetch Brands when vehicleType changes ───
  useEffect(() => {
    const fetchBrands = async () => {
      setLoadingBrands(true);
      try {
        const res = await fetch(`${FIPE_BASE}/${vehicleType}/marcas`);
        const data: FipeBrand[] = await res.json();
        setFipeBrands(data);
      } catch (err) {
        console.error("[FIPE] Erro ao buscar marcas:", err);
      } finally {
        setLoadingBrands(false);
      }
    };
    fetchBrands();
  }, [vehicleType]);

  // ─── Fetch Models when brand changes ───
  const fetchModels = useCallback(async (brandId: string) => {
    setLoadingModels(true);
    setFipeModels([]);
    setFipeYears([]);
    try {
      const res = await fetch(`${FIPE_BASE}/${vehicleType}/marcas/${brandId}/modelos`);
      const data = await res.json();
      setFipeModels(data.modelos || []);
    } catch (err) {
      console.error("[FIPE] Erro ao buscar modelos:", err);
    } finally {
      setLoadingModels(false);
    }
  }, [vehicleType]);

  // ─── Fetch Years when model changes ───
  const fetchYears = useCallback(async (brandId: string, modelId: string) => {
    setLoadingYears(true);
    setFipeYears([]);
    try {
      const res = await fetch(`${FIPE_BASE}/${vehicleType}/marcas/${brandId}/modelos/${modelId}/anos`);
      const data: FipeYear[] = await res.json();
      // Filter out "32000" (zero-km placeholder) and sort descending
      const filtered = data
        .filter((y) => !y.codigo.startsWith("32000"))
        .sort((a, b) => {
          const yearA = parseInt(a.nome);
          const yearB = parseInt(b.nome);
          return yearB - yearA;
        });
      setFipeYears(filtered);
    } catch (err) {
      console.error("[FIPE] Erro ao buscar anos:", err);
    } finally {
      setLoadingYears(false);
    }
  }, [vehicleType]);

  // ─── Fetch FIPE Value details when year is selected ───
  useEffect(() => {
    if (!selectedBrandId || !selectedModelId || !selectedYearId) {
      setFipeValor("");
      setFipeCodigo("");
      return;
    }

    const fetchFipeDetails = async () => {
      try {
        const res = await fetch(`${FIPE_BASE}/${vehicleType}/marcas/${selectedBrandId}/modelos/${selectedModelId}/anos/${selectedYearId}`);
        const data = await res.json();
        if (data && data.Valor) {
          setFipeValor(data.Valor);
          setFipeCodigo(data.CodigoFipe);
        }
      } catch (err) {
        console.error("[FIPE] Erro ao buscar detalhes de valor:", err);
      }
    };
    fetchFipeDetails();
  }, [selectedBrandId, selectedModelId, selectedYearId, vehicleType]);

  // Fetch tracking ID on mount
  useEffect(() => {
    const uid = getActiveAgUid();
    setAgUid(uid);
    logFlowInitiated("Auto-Avaliação", uid);
  }, []);

  // Format WhatsApp input reactively as (XX) XXXXX-XXXX
  const handleWhatsappChange = (value: string) => {
    const numbersOnly = value.replace(/\D/g, "");
    let formatted = numbersOnly;

    if (numbersOnly.length > 2) {
      formatted = `(${numbersOnly.slice(0, 2)}) ${numbersOnly.slice(2)}`;
    }
    if (numbersOnly.length > 7) {
      formatted = `(${numbersOnly.slice(0, 2)}) ${numbersOnly.slice(2, 7)}-${numbersOnly.slice(7, 11)}`;
    }
    setStep3((prev) => ({ ...prev, whatsapp: formatted.slice(0, 15) }));
  };

  // ─── FIPE Cascading Handlers ───
  const handleBrandSelect = (brandId: string, brandName: string) => {
    setSelectedBrandId(brandId);
    setBrandDisplay(brandName);
    setStep1((prev) => ({ ...prev, marca: brandName, modelo: "", ano: "" }));
    // Reset downstream
    setSelectedModelId("");
    setModelDisplay("");
    setYearDisplay("");
    setFipeYears([]);
    // Fetch models
    fetchModels(brandId);
  };

  const handleBrandClear = () => {
    setSelectedBrandId("");
    setBrandDisplay("");
    setStep1({ marca: "", modelo: "", ano: "" });
    setSelectedModelId("");
    setModelDisplay("");
    setYearDisplay("");
    setFipeModels([]);
    setFipeYears([]);
  };

  const handleModelSelect = (modelId: string, modelName: string) => {
    setSelectedModelId(modelId);
    setModelDisplay(modelName);
    setStep1((prev) => ({ ...prev, modelo: modelName, ano: "" }));
    // Reset year
    setYearDisplay("");
    // Fetch years
    fetchYears(selectedBrandId, modelId);
  };

  const handleModelClear = () => {
    setSelectedModelId("");
    setModelDisplay("");
    setStep1((prev) => ({ ...prev, modelo: "", ano: "" }));
    setYearDisplay("");
    setFipeYears([]);
  };

  const handleYearSelect = (yearCode: string, yearName: string) => {
    setYearDisplay(yearName);
    setSelectedYearId(yearCode);
    // Extract just the year number for display
    const yearNum = yearName.split(" ")[0];
    setStep1((prev) => ({ ...prev, ano: yearNum }));
  };

  const handleYearClear = () => {
    setYearDisplay("");
    setSelectedYearId("");
    setFipeValor("");
    setFipeCodigo("");
    setStep1((prev) => ({ ...prev, ano: "" }));
  };

  // Navigations
  const handleNextStep = () => {
    if (step === 1) {
      if (!step1.marca || !step1.modelo || !step1.ano) return;
      setStep(2);
    } else if (step === 2) {
      if (!step2.estadoMecanico || !step2.estadoConservacao) return;
      setStep(3);
    }
  };

  const handlePrevStep = () => {
    if (step > 1 && step <= 3) {
      setStep((prev) => (prev - 1) as 1 | 2 | 3);
    }
  };

  // Submit Lead & Dispatch Telemetry Event
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!step3.nome || step3.whatsapp.length < 14) return;
    if (!turnstileToken) {
      alert("Aguardando verificação de segurança (Anti-Spam)...");
      return;
    }

    setLoading(true);

    const activeUid = getActiveAgUid();

    // POST to backend API route for Lead capturing
    try {
      const response = await fetch("/api/avaliacao", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          marca: step1.marca,
          modelo: step1.modelo,
          ano: Number(step1.ano) || step1.ano,
          estado: `${step2.estadoMecanico} / ${step2.estadoConservacao}`,
          nome: step3.nome,
          telefone: step3.whatsapp,
          ag_uid: activeUid,
          tipo_veiculo: vehicleType,
          fipe_valor: fipeValor,
          fipe_codigo: fipeCodigo,
          utm: getUtmParameters(),
          turnstileToken
        }),
      });

      if (response.ok) {
        let numericValue = 0;
        if (fipeValor) {
          numericValue = Number(fipeValor.replace(/[^\d]/g, "")) / 100;
        }
        trackAppraisalSubmit(vehicleType, step1.marca, step1.modelo, String(step1.ano), numericValue);
      }
    } catch (error) {
      console.error("[Auto-Avaliação] Failed to send lead to backend API:", error);
    }

    // Simulate premium processing delay
    await new Promise((resolve) => setTimeout(resolve, 1400));

    // Telemetry structure for data_agent and log_agent coordination
    const leadPayload = {
      agUid: agUid,
      timestamp: new Date().toISOString(),
      tipoLead: "auto_avaliacao",
      veiculo: {
        marca: step1.marca,
        modelo: step1.modelo,
        ano: step1.ano,
        tipo_veiculo: vehicleType,
        fipe_valor: fipeValor,
        fipe_codigo: fipeCodigo,
      },
      condicoes: {
        estadoMecanico: step2.estadoMecanico,
        estadoConservacao: step2.estadoConservacao,
        observacoes: step2.observacoes || "Nenhuma observação inserida",
      },
      cliente: {
        nome: step3.nome,
        whatsapp: step3.whatsapp,
      },
    };

    if (typeof window !== "undefined") {
      // 1. Log to console for real-time telemetry inspection
      console.log("📈 [Antigravity Telemetry] Lead Auto-Avaliação Enviado:", leadPayload);

      // 2. Save globally to window object for log_agent / data_agent hooks
      (window as any).ag_last_lead = leadPayload;

      // 3. Trigger a custom window event for reactive sub-modules
      const telemetryEvent = new CustomEvent("agTelemetryLead", { detail: leadPayload });
      window.dispatchEvent(telemetryEvent);

      // 4. Save to LocalStorage leads history
      const prevLeads = JSON.parse(localStorage.getItem("ag_leads_history") || "[]");
      localStorage.setItem("ag_leads_history", JSON.stringify([...prevLeads, leadPayload]));
    }

    setLoading(false);
    setStep(4); // Success screen
  };

  // Reset form
  const handleReset = () => {
    setStep1({ marca: "", modelo: "", ano: "" });
    setStep2({ estadoMecanico: "", estadoConservacao: "", observacoes: "" });
    setStep3({ nome: "", whatsapp: "" });
    setSelectedBrandId("");
    setSelectedModelId("");
    setSelectedYearId("");
    setFipeValor("");
    setFipeCodigo("");
    setBrandDisplay("");
    setModelDisplay("");
    setYearDisplay("");
    setFipeModels([]);
    setFipeYears([]);
    setVehicleType("carros");
    setTurnstileToken("");
    setStep(1);
  };

  const handleWhatsappAvaliacaoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      const vehicleName = vehicleType === "motos" ? "Moto" : (vehicleType === "caminhoes" ? "Caminhão" : "Carro");
      const leadMessage = `Olá! Enviei a avaliação do meu ${vehicleName} ${step1.marca} ${step1.modelo} no site. Gostaria de falar com um avaliador. (Ref: ${agUid})`;
      setActiveMessage(leadMessage);
      setIsLeadModalOpen(true);
    }
  };

  const handleLeadSubmit = async (leadData: { nome: string; email: string; whatsapp: string; turnstileToken: string }) => {
    const utmParams = getUtmParameters();
    
    const cleanPhone = leadData.whatsapp;
    const formattedPhone = cleanPhone.length === 10 || cleanPhone.length === 11 ? "55" + cleanPhone : cleanPhone;
    const remoteJid = formattedPhone ? `${formattedPhone}@s.whatsapp.net` : "";

    // Dispara telemetria de conversão (Lead) no GA4/Meta Pixel ANTES do POST,
    // para reaproveitar o mesmo event_id na deduplicação do CAPI (servidor)
    const fipeNumericValue = fipeValor ? Number(fipeValor.replace(/[^\d]/g, "")) / 100 : 0;
    const phoneE164 = formattedPhone ? `+${formattedPhone}` : null;
    const eventId = trackLeadSubmission(
      { marca: step1.marca, modelo: step1.modelo, preco: fipeNumericValue },
      activeMessage,
      {
        googleAdsId: companySettings?.googleAdsId,
        googleAdsConversionLabel: companySettings?.googleAdsConversionLabel,
        email: leadData.email,
        phoneE164
      }
    );
    const { fbp, fbc } = getMatchParams();

    const payload = {
      remoteJid,
      telefone: formattedPhone,
      tipo: "lead_whatsapp",
      canal: "Appraisal Chat",
      mensagem: activeMessage,
      veiculo: {
        marca: step1.marca,
        modelo: step1.modelo,
        ano: step1.ano,
        tipo_veiculo: vehicleType,
        fipe_valor: fipeValor,
        fipe_codigo: fipeCodigo,
        veiculo_contexto: {
          perfil_uso: vehicleType === "motos" ? "USO URBAN & SPORT" : (vehicleType === "caminhoes" ? "FORÇA & TRANSPORTE" : "PERFORMANCE & CUSTOM"),
          tipo_badge: "BAIXA KM"
        }
      },
      cliente: {
        nome: leadData.nome,
        email: leadData.email,
        whatsapp: leadData.whatsapp
      },
      utm: utmParams,
      intencao_busca: {},
      agUid: agUid,
      eventId,
      eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      fbp,
      fbc
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
        console.warn("[Lead Submit Avaliacao] API returned error (non-blocking):", errorData?.error || response.status);
      }
    } catch (fetchError: any) {
      console.warn("[Lead Submit Avaliacao] Network error (non-blocking):", fetchError.message);
    }

    // Save lead to history
    try {
      const rawHistory = localStorage.getItem("ag_leads_history");
      const history = rawHistory ? JSON.parse(rawHistory) : [];
      history.push({
        agUid,
        timestamp: new Date().toISOString(),
        tipoLead: "lead_whatsapp_avaliacao",
        cliente: {
          nome: leadData.nome,
          email: leadData.email,
          whatsapp: leadData.whatsapp
        },
        veiculo: {
          marca: step1.marca,
          modelo: step1.modelo,
          ano: step1.ano,
          tipo_veiculo: vehicleType,
          fipe_valor: fipeValor,
          fipe_codigo: fipeCodigo
        }
      });
      localStorage.setItem("ag_leads_history", JSON.stringify(history));
    } catch (e) {
      console.warn("[Telemetry] Failed to save lead payload to history:", e);
    }

    // Redirect to WhatsApp - ALWAYS executes regardless of API outcome
    const whatsappUrl = `https://wa.me/${companySettings.whatsappRaw}?text=${encodeURIComponent(activeMessage)}`;
    trackContactClick("whatsapp", "Avaliação - Conversão WhatsApp");
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  // Validation checkers for button enabling
  const isStep1Valid = step1.marca && step1.modelo && step1.ano;
  const isStep2Valid = step2.estadoMecanico && step2.estadoConservacao;
  const isStep3Valid = step3.nome && step3.whatsapp.replace(/\D/g, "").length >= 10;

  // Convert FIPE data to combobox items
  const brandItems = fipeBrands.map((b) => ({ key: b.codigo, label: b.nome }));
  const modelItems = fipeModels.map((m) => ({ key: String(m.codigo), label: m.nome }));
  const yearItems = fipeYears.map((y) => ({ key: y.codigo, label: y.nome }));

  return (
    <section id="avaliacao-express" aria-label="Avaliação Express" className="flex flex-col gap-4 w-full">
      <div className="text-center flex flex-col gap-1.5 px-4 sm:px-6">
        <span className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">
          Facilidade de Venda
        </span>
        <h2 className="text-2xl font-black text-brand-text tracking-tight">
          {companySettings?.avaliacaoExpressTitle || "Avaliação Express"}
        </h2>
        <p className="text-xs text-brand-text/50 max-w-xs mx-auto">
          Quer vender ou dar seu carro de entrada? Receba uma cotação rápida do mercado premium.
        </p>
      </div>
      <form
        toolname="auto_avaliacao_veiculo"
        tooldescription="Inicia a avaliação comercial de um veículo para troca ou venda na Motors Store, retornando os preços oficiais da FIPE."
        onSubmit={handleSubmit}
        className="w-full bg-brand-card border border-brand-card-border rounded-3xl p-5 md:p-8 shadow-[0_8px_30px_var(--brand-shadow)] relative transition-all duration-300"
      >
      <input type="hidden" name="tipo_veiculo" value={vehicleType} toolparamdescription="Categoria de automóvel (carros, motos ou caminhoes)." />
      <input type="hidden" name="estado_mecanico" value={step2.estadoMecanico} toolparamdescription="Estado mecânico do veículo (excelente, bom, atencao, ruim)." />
      <input type="hidden" name="estado_conservacao" value={step2.estadoConservacao} toolparamdescription="Estado de conservação da lataria/funilaria (impecavel, riscos, reparos, avariado)." />
      {/* Visual Gold glow element */}
      <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-brand-primary/5 blur-[60px] pointer-events-none" />
      <div className="absolute -left-20 -bottom-20 h-40 w-40 rounded-full bg-brand-primary/5 blur-[60px] pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col gap-1 mb-6 text-center md:text-left">
        <span className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">
          Avaliação Express
        </span>
        <h2 className="text-xl font-extrabold text-brand-text tracking-tight">
          Avalie seu Carro Usado
        </h2>
        <p className="text-xs text-brand-text/50">
          Receba uma proposta real em menos de 10 minutos via WhatsApp.
        </p>
      </div>

      {/* FIPE data source badge */}
      <div className="flex items-center gap-1.5 mb-5">
        <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
        <span className="text-[9px] font-bold text-brand-text/30 uppercase tracking-widest">
          Dados oficiais Tabela FIPE
        </span>
      </div>

      {/* Step Stepper Indicator (Only visible if not on success screen) */}
      {step < 4 && (
        <div className="relative flex items-center justify-between mb-8 max-w-xs mx-auto md:mx-0">
          {/* Progress bar line background */}
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-brand-card-border z-0" />
          {/* Active progress bar line fill */}
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-brand-primary to-brand-primary-hover z-0 transition-all duration-500"
            style={{ width: `${((step - 1) / 2) * 100}%` }}
          />

          {/* Step 1 Circle */}
          <div
            onClick={() => step > 1 && setStep(1)}
            className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs z-10 transition-all duration-300 cursor-pointer ${
              step >= 1
                ? "bg-gradient-to-r from-brand-primary to-brand-primary-hover text-white shadow-[0_0_10px_var(--brand-shadow)]"
                : "bg-brand-card-border border border-brand-border text-brand-text/40"
            }`}
          >
            1
          </div>

          {/* Step 2 Circle */}
          <div
            onClick={() => step > 2 && setStep(2)}
            className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs z-10 transition-all duration-300 ${
              step >= 2 ? "cursor-pointer" : "cursor-default"
            } ${
              step >= 2
                ? "bg-gradient-to-r from-brand-primary to-brand-primary-hover text-white shadow-[0_0_10px_var(--brand-shadow)]"
                : "bg-brand-card-border border border-brand-border text-brand-text/40"
            }`}
          >
            2
          </div>

          {/* Step 3 Circle */}
          <div
            className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs z-10 transition-all duration-300 ${
              step >= 3
                ? "bg-gradient-to-r from-brand-primary to-brand-primary-hover text-white shadow-[0_0_10px_var(--brand-shadow)]"
                : "bg-brand-card-border border border-brand-border text-brand-text/40"
            }`}
          >
            3
          </div>
        </div>
      )}

      {/* STEP 1: Brand/Model/Year — All powered by FIPE API */}
      {step === 1 && (
        <div className="flex flex-col gap-4 animate-fadeIn">
          {/* ─── Vehicle Type Switcher ─── */}
          <div className="flex bg-brand-bg p-1 rounded-xl border border-brand-card-border gap-1 mb-2">
            <button
              type="button"
              onClick={() => handleVehicleTypeChange("carros")}
              className={`flex-1 py-2.5 text-center rounded-lg uppercase text-[10px] md:text-xs tracking-wider transition-all duration-200 font-bold ${
                vehicleType === "carros"
                  ? "bg-brand-primary text-white shadow-md border border-brand-primary"
                  : "text-brand-text/50 hover:bg-brand-card/50 hover:text-brand-text"
              }`}
            >
              🚗 CARROS
            </button>
            <button
              type="button"
              onClick={() => handleVehicleTypeChange("motos")}
              className={`flex-1 py-2.5 text-center rounded-lg uppercase text-[10px] md:text-xs tracking-wider transition-all duration-200 font-bold ${
                vehicleType === "motos"
                  ? "bg-brand-primary text-white shadow-md border border-brand-primary"
                  : "text-brand-text/50 hover:bg-brand-card/50 hover:text-brand-text"
              }`}
            >
              🏍️ MOTOS
            </button>
            <button
              type="button"
              onClick={() => handleVehicleTypeChange("caminhoes")}
              className={`flex-1 py-2.5 text-center rounded-lg uppercase text-[10px] md:text-xs tracking-wider transition-all duration-200 font-bold ${
                vehicleType === "caminhoes"
                  ? "bg-brand-primary text-white shadow-md border border-brand-primary"
                  : "text-brand-text/50 hover:bg-brand-card/50 hover:text-brand-text"
              }`}
            >
              🚛 CAMINHÕES
            </button>
          </div>

          {/* ─── Brand Combobox (FIPE) ─── */}
          <SearchableCombobox
            id="brand-search-fipe"
            label="Marca do Veículo"
            placeholder="Digite ou busque a marca..."
            items={brandItems}
            value={selectedBrandId}
            displayValue={brandDisplay}
            onSelect={handleBrandSelect}
            onClear={handleBrandClear}
            loading={loadingBrands}
            toolParamDescription="Marca do automóvel de acordo com a base oficial FIPE."
          />

          {/* ─── Model Combobox (FIPE) ─── */}
          <SearchableCombobox
            id="model-search-fipe"
            label="Modelo do Veículo"
            placeholder={selectedBrandId ? "Busque o modelo..." : "Selecione a marca primeiro"}
            items={modelItems}
            value={selectedModelId}
            displayValue={modelDisplay}
            onSelect={handleModelSelect}
            onClear={handleModelClear}
            loading={loadingModels}
            disabled={!selectedBrandId}
            emptyMessage="Nenhum modelo encontrado"
            toolParamDescription="Modelo correspondente à marca na base FIPE."
          />

          {/* ─── Year Combobox (FIPE) ─── */}
          <SearchableCombobox
            id="year-search-fipe"
            label="Ano / Combustível"
            placeholder={selectedModelId ? "Busque o ano..." : "Selecione o modelo primeiro"}
            items={yearItems}
            value={yearDisplay ? fipeYears.find((y) => y.nome === yearDisplay)?.codigo || "" : ""}
            displayValue={yearDisplay}
            onSelect={handleYearSelect}
            onClear={handleYearClear}
            loading={loadingYears}
            disabled={!selectedModelId}
            emptyMessage="Nenhum ano encontrado"
            toolParamDescription="Ano modelo e combustível do veículo na base FIPE."
          />

          {/* Next Button */}
          <button
            type="button"
            disabled={!isStep1Valid}
            onClick={handleNextStep}
            className={`w-full h-12 rounded-xl font-bold uppercase tracking-wider text-xs transition-all duration-300 active:scale-95 mt-4 flex items-center justify-center gap-2 ${
              isStep1Valid
                ? "bg-gradient-to-r from-brand-primary to-brand-primary-hover text-white shadow-lg shadow-brand-primary/15 hover:opacity-95"
                : "bg-brand-card-border text-brand-text/40 border border-brand-border cursor-not-allowed"
            }`}
          >
            Avançar para Estado
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.22 5.03a.75.75 0 1 1 1.06-1.06l5.5 5.5a.75.75 0 0 1 0 1.06l-5.5 5.5a.75.75 0 1 1-1.06-1.06l4.168-4.17H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* STEP 2: Condition & Conservation */}
      {step === 2 && (
        <div className="flex flex-col gap-5 animate-fadeIn">
          {/* Mechanical State options */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-brand-text/60">Estado Mecânico</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: "excelente", label: "Excelente", desc: "Funcionamento perfeito" },
                { val: "bom", label: "Bom", desc: "Apenas revisões preventivas" },
                { val: "atencao", label: "Requer Atenção", desc: "Pequenos barulhos/ajustes" },
                { val: "ruim", label: "Ruim", desc: "Problemas mecânicos graves" },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setStep2((prev) => ({ ...prev, estadoMecanico: opt.val }))}
                  className={`p-3 text-left rounded-xl border flex flex-col gap-0.5 transition-all duration-200 active:scale-95 ${
                    step2.estadoMecanico === opt.val
                      ? "bg-brand-card border-2 border-brand-primary text-brand-gold shadow-[0_4px_12px_var(--brand-shadow)]"
                      : "bg-brand-card border border-brand-border text-brand-text/50 hover:bg-brand-bg hover:border-brand-border"
                  }`}
                >
                  <span className="text-xs font-bold text-brand-text">{opt.label}</span>
                  <span className="text-[9px] text-brand-text/40 leading-tight">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Conservation State options */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-brand-text/60">Funilaria & Conservação Externa</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: "impecavel", label: "Impecável", desc: "Sem detalhes ou riscos" },
                { val: "riscos", label: "Pequenos Riscos", desc: "Pequenos arranhões de uso" },
                { val: "reparos", label: "Amassados leves", desc: "Pequenos retoques pendentes" },
                { val: "avariado", label: "Avariado / Batido", desc: "Necessita funilaria expressa" },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setStep2((prev) => ({ ...prev, estadoConservacao: opt.val }))}
                  className={`p-3 text-left rounded-xl border flex flex-col gap-0.5 transition-all duration-200 active:scale-95 ${
                    step2.estadoConservacao === opt.val
                      ? "bg-brand-card border-2 border-brand-primary text-brand-gold shadow-[0_4px_12px_var(--brand-shadow)]"
                      : "bg-brand-card border border-brand-border text-brand-text/50 hover:bg-brand-bg hover:border-brand-border"
                  }`}
                >
                  <span className="text-xs font-bold text-brand-text">{opt.label}</span>
                  <span className="text-[9px] text-brand-text/40 leading-tight">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Additional Notes Textarea */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-brand-text/60" htmlFor="obs-textarea">
                Observações / Opcionais Extras
              </label>
              <span className="text-[9px] text-brand-text/40 font-semibold">Opcional</span>
            </div>
            <textarea
              id="obs-textarea"
              placeholder="Ex: Teto solar, pneus novos, único dono, manual e chave reserva..."
              value={step2.observacoes}
              onChange={(e) => setStep2((prev) => ({ ...prev, observacoes: e.target.value }))}
              rows={2}
              className="w-full bg-brand-card border border-brand-border focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary rounded-xl p-3 text-xs text-brand-text placeholder-brand-text/40 focus:outline-none transition-colors duration-200 resize-none shadow-sm"
              toolparamdescription="Observações ou opcionais extras instalados no veículo."
            />
          </div>

          {/* Buttons Navigation */}
          <div className="grid grid-cols-5 gap-2 mt-2">
            <button
              type="button"
              onClick={handlePrevStep}
              className="col-span-2 h-12 bg-brand-card border border-brand-border text-brand-text/60 hover:bg-brand-bg hover:border-brand-border active:scale-95 rounded-xl font-bold uppercase tracking-wider text-xs transition-all duration-200"
            >
              Voltar
            </button>
            <button
              type="button"
              disabled={!isStep2Valid}
              onClick={handleNextStep}
              className={`col-span-3 h-12 rounded-xl font-bold uppercase tracking-wider text-xs transition-all duration-300 active:scale-95 flex items-center justify-center gap-1.5 ${
                isStep2Valid
                  ? "bg-gradient-to-r from-brand-primary to-brand-primary-hover text-white shadow-lg shadow-brand-primary/15 hover:opacity-95"
                  : "bg-brand-card-border text-brand-text/40 border border-brand-border cursor-not-allowed"
              }`}
            >
              Avançar
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.22 5.03a.75.75 0 1 1 1.06-1.06l5.5 5.5a.75.75 0 0 1 0 1.06l-5.5 5.5a.75.75 0 1 1-1.06-1.06l4.168-4.17H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Contact Name/WhatsApp */}
      {step === 3 && (
        <div className="flex flex-col gap-4 animate-fadeIn">
          {/* Summary Box */}
          <div className="bg-brand-bg border border-brand-card-border p-3 rounded-2xl flex flex-col gap-1 text-[11px] text-brand-text/50">
            <span className="font-bold text-brand-gold uppercase text-[9px] tracking-wide">Resumo da Avaliação</span>
            <div className="flex justify-between">
              <span>Veículo:</span>
              <span className="font-bold text-brand-text">
                {step1.marca} {step1.modelo} ({step1.ano})
              </span>
            </div>
            <div className="flex justify-between">
              <span>Mecânica / Conservação:</span>
              <span className="font-bold text-brand-text capitalize">
                {step2.estadoMecanico} / {step2.estadoConservacao}
              </span>
            </div>
            {fipeValor && (
              <div className="flex justify-between border-t border-brand-card-border/60 pt-1 mt-1">
                <span>Valor de Ref. FIPE:</span>
                <span className="font-bold text-brand-gold">{fipeValor}</span>
              </div>
            )}
          </div>

          {/* Name Field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-brand-text/60" htmlFor="nome-input">
              Seu Nome Completo
            </label>
            <input
              id="nome-input"
              type="text"
              required
              placeholder="Digite seu nome..."
              value={step3.nome}
              onChange={(e) => setStep3((prev) => ({ ...prev, nome: e.target.value }))}
              className="w-full h-12 bg-brand-card border border-brand-border focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary rounded-xl px-4 text-sm text-brand-text placeholder-brand-text/40 focus:outline-none transition-colors duration-200 shadow-sm"
              toolparamdescription="Nome completo do responsável pela solicitação de avaliação."
            />
          </div>

          {/* WhatsApp Field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-brand-text/60" htmlFor="whatsapp-input">
              WhatsApp
            </label>
            <input
              id="whatsapp-input"
              type="tel"
              required
              placeholder="(00) 00000-0000"
              value={step3.whatsapp}
              onChange={(e) => handleWhatsappChange(e.target.value)}
              className="w-full h-12 bg-brand-card border border-brand-border focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary rounded-xl px-4 text-sm text-brand-text placeholder-brand-text/40 focus:outline-none transition-colors duration-200 shadow-sm"
              toolparamdescription="Número de WhatsApp com DDD para contato."
            />
            <span className="text-[10px] text-brand-text/40 font-medium">
              Enviaremos a estimativa de preço comercial baseada no seu estado.
            </span>
          </div>

          {/* Buttons Navigation */}
          <div className="grid grid-cols-5 gap-2 mt-2">
            <button
              type="button"
              onClick={handlePrevStep}
              className="col-span-2 h-12 bg-brand-card border border-brand-border text-brand-text/60 hover:bg-brand-bg hover:border-brand-border active:scale-95 rounded-xl font-bold uppercase tracking-wider text-xs transition-all duration-200"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={!isStep3Valid || loading || !turnstileToken}
              className={`col-span-3 h-12 rounded-xl font-bold uppercase tracking-wider text-xs transition-all duration-300 active:scale-95 flex items-center justify-center gap-2 ${
                isStep3Valid && !loading && turnstileToken
                  ? "bg-gradient-to-r from-brand-primary to-brand-primary-hover text-white shadow-lg shadow-brand-primary/15 hover:opacity-95"
                  : "bg-brand-card-border text-brand-text/40 border border-brand-border cursor-not-allowed"
              }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-1 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Calculando...
                </>
              ) : (
                <>
                  Solicitar Preço
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: SUCCESS PAGE */}
      {step === 4 && (
        <div className="flex flex-col items-center text-center py-6 px-2 animate-scaleUp">
          {/* Beautiful Gold check badge */}
          <div className="h-16 w-16 bg-brand-primary/10 border border-brand-primary rounded-full flex items-center justify-center mb-4 text-brand-primary shadow-[0_0_25px_var(--brand-shadow)] relative">
            <span className="absolute animate-ping h-full w-full rounded-full bg-brand-primary/5 opacity-75" />
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>

          <span className="text-[10px] font-bold text-brand-gold uppercase tracking-widest mb-1">
            Proposta Pronta
          </span>
          <h3 className="text-xl font-extrabold text-brand-text mb-2">
            Obrigado, {step3.nome.split(" ")[0]}!
          </h3>
          <p className="text-xs text-brand-text/50 max-w-sm leading-relaxed mb-6">
            Nossos avaliadores geraram uma estimativa para o(a) seu(sua){" "}
            <strong className="text-brand-text font-bold">
              {vehicleType === "motos" ? "moto" : (vehicleType === "caminhoes" ? "caminhão" : "carro")} {step1.marca} {step1.modelo} {step1.ano}
            </strong>
            . Acabamos de te enviar os valores de mercado e opções de troca no WhatsApp{" "}
            <strong className="text-brand-gold font-bold">{step3.whatsapp}</strong>.
          </p>

          <div className="flex flex-col gap-2 w-full max-w-xs">
            <button
              onClick={handleWhatsappAvaliacaoClick}
              className="w-full h-12 bg-green-600 hover:bg-green-500 text-white font-extrabold text-xs uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all duration-300 shadow-[0_0_15px_rgba(34,197,94,0.3)] cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className="w-4 h-4">
                <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
              </svg>
              Abrir Conversa WhatsApp
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-brand-text/40 hover:text-brand-text/70 transition-colors duration-200 mt-2 font-bold py-2 underline"
            >
              Nova Avaliação
            </button>
          </div>
        </div>
      )}
      {/* Cloudflare Turnstile Verification */}
      <Turnstile onSuccess={(token) => setTurnstileToken(token)} />

      {/* Positive Friction Lead Capture Modal */}
      <LeadCaptureModal
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        onSubmit={handleLeadSubmit}
        initialNome={step3.nome}
        initialWhatsapp={step3.whatsapp}
        vehicleInfo={{
          marca: step1.marca,
          modelo: step1.modelo,
          ano: step1.ano
        }}
      />
      </form>
    </section>
  );
}
