"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { logFlowInitiated, getActiveAgUid, getUtmParameters, trackAppraisalSubmit, trackLeadSubmission, trackContactClick } from "../lib/telemetry";
import { getMatchParams } from "../lib/tracking-identity";
import LeadCaptureModal from "./LeadCaptureModal";
import Turnstile from "./Turnstile";
import { useTheme } from "../app/ThemeContext";
import { IconeWhatsApp, Rotulo, Seta } from "./modernist/primitivos";

/**
 * Tela 05 — Avaliação Express, na linguagem Modernist.
 *
 * Duas colunas: o formulário em régua à esquerda, a prévia do resultado na
 * faixa escura à direita. A prévia mora aqui dentro, e não na página, porque
 * depende do valor que a consulta FIPE devolve enquanto o usuário preenche.
 *
 * O que NÃO mudou: a cascata marca → modelo → ano na API da FIPE, os três
 * passos, o Turnstile, as chamadas de telemetria e o payload enviado ao
 * backend. Isto aqui é troca de camada de apresentação.
 *
 * Uma diferença deliberada em relação ao design doc: o doc mostra uma "faixa
 * estimada" (R$ 61.400 — R$ 66.900) em volta do valor FIPE. Esse intervalo
 * sairia de um percentual que não existe no código nem no manual, e número
 * que não veio do dado não se inventa (CLAUDE.md). Enquanto o percentual não
 * for definido, a prévia mostra o valor FIPE real da versão exata — que é o
 * que de fato temos — e diz que a proposta depende de vistoria.
 */

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

/**
 * Trilho de passos do topo. O passo 02 é "estado e conservação", não
 * "estado e quilometragem" como no design doc: este formulário não pergunta
 * a quilometragem, e rotular um campo que não existe é promessa falsa.
 */
const PASSOS = [
  { numero: "01", titulo: "Seu veículo" },
  { numero: "02", titulo: "Estado e conservação" },
  { numero: "03", titulo: "Contato e proposta" },
];

const TIPOS_VEICULO = [
  { id: "carros", rotulo: "CARROS" },
  { id: "motos", rotulo: "MOTOS" },
  { id: "caminhoes", rotulo: "CAMINHÕES" },
] as const;

const ESTADO_MECANICO = [
  { val: "excelente", label: "Excelente", desc: "Funcionamento perfeito" },
  { val: "bom", label: "Bom", desc: "Apenas revisões preventivas" },
  { val: "atencao", label: "Requer Atenção", desc: "Pequenos barulhos/ajustes" },
  { val: "ruim", label: "Ruim", desc: "Problemas mecânicos graves" },
];

const ESTADO_CONSERVACAO = [
  { val: "impecavel", label: "Impecável", desc: "Sem detalhes ou riscos" },
  { val: "riscos", label: "Pequenos Riscos", desc: "Pequenos arranhões de uso" },
  { val: "reparos", label: "Amassados leves", desc: "Pequenos retoques pendentes" },
  { val: "avariado", label: "Avariado / Batido", desc: "Necessita funilaria expressa" },
];

/** O "como chegamos nesse número" da coluna escura, direto do design doc. */
const COMO_CHEGAMOS = [
  "Giro real do modelo no nosso estoque nos últimos 90 dias.",
  "Ajuste por opcionais, estado de pneus e histórico de revisões.",
];

/* ────────────────────────────────────────────────────────────────────────
   Campo de escolha com busca

   O sistema não usa caixa de input: usa uma linha com rótulo em cima,
   separada por régua. A régua fica vermelha quando o campo está resolvido —
   é o que substitui o antigo selo verde "Selecionado: X".
   ──────────────────────────────────────────────────────────────────────── */

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
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

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
    <div className={`relative py-4 pr-0 md:pr-6 ${disabled ? "opacity-45" : ""}`}>
      <label
        className="mt-rotulo mb-2 block text-[10px] tracking-[.14em]"
        htmlFor={id}
      >
        {label}
      </label>

      <div
        className={`flex items-center gap-3 border-b-2 pb-2 transition-colors ${
          value ? "border-mt-accent" : "border-mt-regua-fina"
        }`}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          disabled={disabled || loading}
          placeholder={loading ? "Carregando…" : placeholder}
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
          className="mt-campo mt-foco min-w-0 flex-1 disabled:cursor-not-allowed"
          toolparamdescription={toolParamDescription}
        />

        {search && !disabled ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label={`Limpar ${label.toLowerCase()}`}
            className="mt-foco shrink-0 text-mt-neutral-600 transition-colors hover:text-mt-ink"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
            className={`shrink-0 ${loading ? "mt-pulso" : ""} text-mt-accent`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        )}
      </div>

      {open && !disabled && !loading && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-[calc(100%-4px)] z-50 max-h-56 overflow-y-auto border-2 border-mt-ink bg-mt-bg md:right-6"
        >
          {filtered.length > 0 ? (
            filtered.map((item) => {
              const isSelected = value === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleSelect(item.key, item.label)}
                  className={`mt-foco flex w-full items-center justify-between gap-3 border-b border-mt-regua-fina px-4 py-2.5 text-left text-[13px] transition-colors last:border-b-0 ${
                    isSelected
                      ? "bg-mt-accent text-mt-inverso"
                      : "text-mt-neutral-800 hover:bg-mt-surface"
                  }`}
                >
                  <span>{item.label}</span>
                </button>
              );
            })
          ) : (
            <div className="px-4 py-5">
              <p className="m-0 text-xs text-mt-neutral-700">
                {emptyMessage || `Nenhum resultado para "${search}"`}
              </p>
              <p className="m-0 mt-1 text-[11px] text-mt-neutral-600">
                Verifique a ortografia e tente novamente.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Opção quadrada de estado — mesma gramática das opções do Profiler. */
function OpcaoEstado({
  label,
  desc,
  selecionada,
  onClick,
}: {
  label: string;
  desc: string;
  selecionada: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selecionada}
      className={`mt-foco flex flex-col items-start border-2 p-3.5 text-left transition-colors ${
        selecionada
          ? "border-mt-accent bg-mt-accent-100"
          : "border-mt-regua-fina hover:border-mt-regua"
      }`}
    >
      <span className="text-[13px] font-extrabold leading-tight">{label}</span>
      <span className="mt-1 text-[11px] leading-snug text-mt-neutral-600">{desc}</span>
    </button>
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
  // Mês de referência devolvido pela própria API — é o que autoriza dizer
  // "tabela de agosto/2026" sem chutar a data.
  const [fipeMesReferencia, setFipeMesReferencia] = useState("");

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
    setFipeMesReferencia("");
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
      setFipeMesReferencia("");
      return;
    }

    const fetchFipeDetails = async () => {
      try {
        const res = await fetch(`${FIPE_BASE}/${vehicleType}/marcas/${selectedBrandId}/modelos/${selectedModelId}/anos/${selectedYearId}`);
        const data = await res.json();
        if (data && data.Valor) {
          setFipeValor(data.Valor);
          setFipeCodigo(data.CodigoFipe);
          setFipeMesReferencia((data.MesReferencia || "").trim());
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
    setFipeMesReferencia("");
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
    setFipeMesReferencia("");
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

  const nomeDoVeiculo = [step1.marca, step1.modelo].filter(Boolean).join(" ").toUpperCase();
  const tituloDaTela = companySettings?.avaliacaoExpressTitle || "Avaliação Express";

  return (
    <section
      id="avaliacao-express"
      aria-label="Avaliação Express"
      className="flex flex-col bg-mt-bg font-modernist text-mt-ink lg:flex-row lg:items-stretch"
    >
      {/* ─────────── Coluna do formulário ─────────── */}
      <div className="min-w-0 flex-1 px-[18px] py-10 lg:border-r-2 lg:border-mt-regua lg:px-11 lg:py-14">
        <Rotulo accent className="text-[11px] tracking-[.18em]">
          VENDA OU TROCA
        </Rotulo>
        <h1 className="mt-titulo m-0 mt-3 text-[38px] lg:text-[64px] lg:leading-[.95]">
          {tituloDaTela}
        </h1>
        <p className="m-0 mt-5 max-w-[520px] text-sm leading-relaxed text-mt-neutral-800 lg:text-base">
          Dados oficiais da Tabela FIPE cruzados com o giro real do nosso
          estoque. Proposta no WhatsApp em menos de 10 minutos.
        </p>

        {/* Trilho de passos */}
        {step < 4 && (
          <div className="mt-9 flex border-t-2 border-mt-regua lg:mt-10">
            {PASSOS.map((passo, i) => {
              const numero = i + 1;
              const ativo = numero === step;
              const concluido = numero < step;
              return (
                <button
                  key={passo.numero}
                  type="button"
                  onClick={() => concluido && setStep(numero as 1 | 2 | 3)}
                  disabled={!concluido}
                  aria-current={ativo ? "step" : undefined}
                  className={`mt-foco flex-1 border-r border-mt-regua-fina py-4 pr-4 text-left last:border-r-0 ${
                    concluido ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  <span
                    className={`block text-[11px] font-extrabold tracking-[.12em] ${
                      ativo ? "text-mt-accent" : "text-mt-neutral-500"
                    }`}
                  >
                    {passo.numero}
                  </span>
                  <span
                    className={`mt-2 block text-[13px] font-extrabold leading-tight tracking-[-.01em] lg:text-[15px] ${
                      ativo ? "text-mt-ink" : "text-mt-neutral-500"
                    }`}
                  >
                    {passo.titulo}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <form
          toolname="auto_avaliacao_veiculo"
          tooldescription="Inicia a avaliação comercial de um veículo para troca ou venda na Motors Store, retornando os preços oficiais da FIPE."
          onSubmit={handleSubmit}
          className="mt-8"
        >
          <input type="hidden" name="tipo_veiculo" value={vehicleType} toolparamdescription="Categoria de automóvel (carros, motos ou caminhoes)." />
          <input type="hidden" name="estado_mecanico" value={step2.estadoMecanico} toolparamdescription="Estado mecânico do veículo (excelente, bom, atencao, ruim)." />
          <input type="hidden" name="estado_conservacao" value={step2.estadoConservacao} toolparamdescription="Estado de conservação da lataria/funilaria (impecavel, riscos, reparos, avariado)." />

          {/* ─── 01 · Seu veículo ─── */}
          {step === 1 && (
            <div>
              <Rotulo className="text-[10px] tracking-[.16em]">TIPO DE VEÍCULO</Rotulo>
              <div className="mt-3 flex w-full border-2 border-mt-ink md:w-max">
                {TIPOS_VEICULO.map((tipo, i) => (
                  <button
                    key={tipo.id}
                    type="button"
                    onClick={() => handleVehicleTypeChange(tipo.id)}
                    aria-pressed={vehicleType === tipo.id}
                    className={`mt-foco flex-1 px-4 py-3 text-[12px] font-extrabold tracking-[.08em] transition-colors md:flex-none md:px-7 md:text-[13px] ${
                      i > 0 ? "border-l-2 border-mt-ink" : ""
                    } ${
                      vehicleType === tipo.id
                        ? "bg-mt-accent text-mt-inverso"
                        : "text-mt-ink hover:bg-mt-surface"
                    }`}
                  >
                    {tipo.rotulo}
                  </button>
                ))}
              </div>

              <div className="mt-9 grid border-t-2 border-mt-regua md:grid-cols-2 md:gap-x-2">
                <SearchableCombobox
                  id="brand-search-fipe"
                  label="MARCA"
                  placeholder="Digite ou busque a marca…"
                  items={brandItems}
                  value={selectedBrandId}
                  displayValue={brandDisplay}
                  onSelect={handleBrandSelect}
                  onClear={handleBrandClear}
                  loading={loadingBrands}
                  toolParamDescription="Marca do automóvel de acordo com a base oficial FIPE."
                />

                <SearchableCombobox
                  id="model-search-fipe"
                  label="MODELO"
                  placeholder={selectedBrandId ? "Busque o modelo…" : "Selecione a marca primeiro"}
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

                <SearchableCombobox
                  id="year-search-fipe"
                  label="ANO / COMBUSTÍVEL"
                  placeholder={selectedModelId ? "Busque o ano…" : "Selecione o modelo primeiro"}
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
              </div>

              <button
                type="button"
                disabled={!isStep1Valid}
                onClick={handleNextStep}
                className="mt-btn mt-btn-primario mt-foco mt-9"
              >
                AVANÇAR PARA ESTADO DO VEÍCULO
                <Seta />
              </button>
            </div>
          )}

          {/* ─── 02 · Estado e conservação ─── */}
          {step === 2 && (
            <div>
              <Rotulo className="text-[10px] tracking-[.16em]">ESTADO MECÂNICO</Rotulo>
              <div className="mt-3 grid gap-0.5 sm:grid-cols-2">
                {ESTADO_MECANICO.map((opt) => (
                  <OpcaoEstado
                    key={opt.val}
                    label={opt.label}
                    desc={opt.desc}
                    selecionada={step2.estadoMecanico === opt.val}
                    onClick={() => setStep2((prev) => ({ ...prev, estadoMecanico: opt.val }))}
                  />
                ))}
              </div>

              <div className="mt-8">
                <Rotulo className="text-[10px] tracking-[.16em]">
                  FUNILARIA & CONSERVAÇÃO EXTERNA
                </Rotulo>
                <div className="mt-3 grid gap-0.5 sm:grid-cols-2">
                  {ESTADO_CONSERVACAO.map((opt) => (
                    <OpcaoEstado
                      key={opt.val}
                      label={opt.label}
                      desc={opt.desc}
                      selecionada={step2.estadoConservacao === opt.val}
                      onClick={() => setStep2((prev) => ({ ...prev, estadoConservacao: opt.val }))}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-8 border-t-2 border-mt-regua pt-4">
                <label
                  className="mt-rotulo mb-2 flex items-center justify-between text-[10px] tracking-[.14em]"
                  htmlFor="obs-textarea"
                >
                  OBSERVAÇÕES / OPCIONAIS EXTRAS
                  <span className="text-mt-neutral-500">OPCIONAL</span>
                </label>
                <textarea
                  id="obs-textarea"
                  placeholder="Ex.: teto solar, pneus novos, único dono, manual e chave reserva…"
                  value={step2.observacoes}
                  onChange={(e) => setStep2((prev) => ({ ...prev, observacoes: e.target.value }))}
                  rows={2}
                  className="mt-campo mt-foco resize-none border-b-2 border-mt-regua-fina pb-2"
                  toolparamdescription="Observações ou opcionais extras instalados no veículo."
                />
              </div>

              <div className="mt-9 flex flex-wrap gap-0.5">
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="mt-btn mt-btn-contorno mt-foco"
                >
                  VOLTAR
                </button>
                <button
                  type="button"
                  disabled={!isStep2Valid}
                  onClick={handleNextStep}
                  className="mt-btn mt-btn-primario mt-foco"
                >
                  AVANÇAR PARA CONTATO
                  <Seta />
                </button>
              </div>
            </div>
          )}

          {/* ─── 03 · Contato e proposta ─── */}
          {step === 3 && (
            <div>
              <div className="border-t-2 border-mt-regua">
                <div className="flex justify-between gap-4 border-b border-mt-regua-fina py-3 text-[13px]">
                  <span className="text-mt-neutral-600">Veículo</span>
                  <span className="text-right font-extrabold">
                    {step1.marca} {step1.modelo} ({step1.ano})
                  </span>
                </div>
                <div className="flex justify-between gap-4 border-b border-mt-regua-fina py-3 text-[13px]">
                  <span className="text-mt-neutral-600">Mecânica / conservação</span>
                  <span className="text-right font-extrabold capitalize">
                    {step2.estadoMecanico} / {step2.estadoConservacao}
                  </span>
                </div>
                {fipeValor && (
                  <div className="flex justify-between gap-4 border-b border-mt-regua-fina py-3 text-[13px]">
                    <span className="text-mt-neutral-600">Referência FIPE</span>
                    <span className="text-right font-extrabold text-mt-accent">{fipeValor}</span>
                  </div>
                )}
              </div>

              <div className="mt-8 grid md:grid-cols-2 md:gap-x-2">
                <div className="py-4 pr-0 md:pr-6">
                  <label className="mt-rotulo mb-2 block text-[10px] tracking-[.14em]" htmlFor="nome-input">
                    SEU NOME COMPLETO
                  </label>
                  <input
                    id="nome-input"
                    type="text"
                    required
                    placeholder="Digite seu nome…"
                    value={step3.nome}
                    onChange={(e) => setStep3((prev) => ({ ...prev, nome: e.target.value }))}
                    className={`mt-campo mt-foco border-b-2 pb-2 transition-colors ${
                      step3.nome ? "border-mt-accent" : "border-mt-regua-fina"
                    }`}
                    toolparamdescription="Nome completo do responsável pela solicitação de avaliação."
                  />
                </div>

                <div className="py-4 pr-0 md:pr-6">
                  <label className="mt-rotulo mb-2 block text-[10px] tracking-[.14em]" htmlFor="whatsapp-input">
                    WHATSAPP
                  </label>
                  <input
                    id="whatsapp-input"
                    type="tel"
                    required
                    placeholder="(00) 00000-0000"
                    value={step3.whatsapp}
                    onChange={(e) => handleWhatsappChange(e.target.value)}
                    className={`mt-campo mt-foco border-b-2 pb-2 transition-colors ${
                      step3.whatsapp.replace(/\D/g, "").length >= 10
                        ? "border-mt-accent"
                        : "border-mt-regua-fina"
                    }`}
                    toolparamdescription="Número de WhatsApp com DDD para contato."
                  />
                </div>
              </div>

              <p className="m-0 mt-2 text-[11px] leading-relaxed text-mt-neutral-600">
                Enviaremos a estimativa de preço comercial baseada no estado
                informado.
              </p>

              <div className="mt-8 flex flex-wrap gap-0.5">
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="mt-btn mt-btn-contorno mt-foco"
                >
                  VOLTAR
                </button>
                <button
                  type="submit"
                  disabled={!isStep3Valid || loading || !turnstileToken}
                  className="mt-btn mt-btn-primario mt-foco"
                >
                  {loading ? "CALCULANDO…" : "SOLICITAR PROPOSTA"}
                  {!loading && <Seta />}
                </button>
              </div>
            </div>
          )}

          {/* ─── 04 · Enviado ─── */}
          {step === 4 && (
            <div className="border-t-2 border-mt-regua pt-8">
              <Rotulo accent className="text-[11px] tracking-[.18em]">
                PROPOSTA A CAMINHO
              </Rotulo>
              <h2 className="mt-titulo m-0 mt-4 text-[30px] lg:text-[44px]">
                Obrigado, {step3.nome.split(" ")[0]}.
              </h2>
              <p className="m-0 mt-5 max-w-[520px] text-sm leading-relaxed text-mt-neutral-800">
                Nossos avaliadores receberam o seu{" "}
                <strong>
                  {vehicleType === "motos" ? "moto" : vehicleType === "caminhoes" ? "caminhão" : "carro"}{" "}
                  {step1.marca} {step1.modelo} {step1.ano}
                </strong>{" "}
                e enviam os valores de mercado e as opções de troca no WhatsApp{" "}
                <strong>{step3.whatsapp}</strong>.
              </p>

              <div className="mt-9 flex flex-wrap gap-0.5">
                <button
                  type="button"
                  onClick={handleWhatsappAvaliacaoClick}
                  className="mt-btn mt-btn-primario mt-foco"
                >
                  <IconeWhatsApp />
                  ABRIR CONVERSA NO WHATSAPP
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="mt-btn mt-btn-contorno mt-foco"
                >
                  NOVA AVALIAÇÃO
                </button>
              </div>
            </div>
          )}

          {/* Turnstile fica montado desde o passo 01, como em produção: ele
              resolve o desafio em segundo plano e o token já está pronto
              quando o usuário chega no envio. Montar só no passo 03 deixaria
              o botão desabilitado esperando. */}
          {step < 4 && (
            <div className="mt-9 border-t border-mt-regua-fina pt-5">
              <Turnstile onSuccess={(token) => setTurnstileToken(token)} />
            </div>
          )}
        </form>
      </div>

      {/* ─────────── Prévia do resultado ─────────── */}
      <aside
        aria-label="Prévia do resultado"
        className="shrink-0 bg-mt-inverso-fundo px-[18px] py-10 text-mt-inverso lg:w-[470px] lg:px-10 lg:py-14"
      >
        <Rotulo className="text-[11px] tracking-[.18em] text-mt-accent-400">
          PRÉVIA DO RESULTADO
        </Rotulo>
        <h2 className="mt-titulo m-0 mt-3 text-[28px] text-mt-inverso lg:text-[32px]">
          Referência FIPE
        </h2>

        <div className="mt-6 border-t-2 border-mt-inverso-regua pt-5">
          {fipeValor ? (
            <>
              <div className="text-xs tracking-[.06em] text-mt-inverso-suave">
                {nomeDoVeiculo}
                {step1.ano ? ` · ${step1.ano}` : ""}
              </div>
              <div className="mt-2.5 text-[38px] font-extrabold leading-none tracking-[-.04em] lg:text-[44px]">
                {fipeValor}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                {fipeCodigo && (
                  <span className="bg-mt-accent-800 px-2.5 py-1 text-[11px] font-semibold text-mt-accent-300">
                    CÓDIGO {fipeCodigo}
                  </span>
                )}
                {fipeMesReferencia && (
                  <span className="text-xs text-mt-inverso-suave">
                    tabela de {fipeMesReferencia}
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="m-0 text-sm leading-relaxed text-mt-neutral-400">
              Escolha marca, modelo e ano ao lado. O valor oficial da Tabela
              FIPE para a versão exata aparece aqui.
            </p>
          )}
        </div>

        <div className="mt-8 border-t border-mt-inverso-regua-fina pt-5">
          <Rotulo className="text-[10px] tracking-[.16em] text-mt-inverso-suave">
            COMO CHEGAMOS NESSE NÚMERO
          </Rotulo>
          <div className="mt-3.5">
            {[
              fipeMesReferencia
                ? `Tabela FIPE oficial de ${fipeMesReferencia} para a versão exata.`
                : "Tabela FIPE oficial para a versão exata do seu veículo.",
              ...COMO_CHEGAMOS,
            ].map((item) => (
              <div
                key={item}
                className="flex gap-3 border-b border-mt-inverso-regua-fina py-3 text-[13px] leading-snug"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="mt-1 h-3.5 w-3.5 shrink-0 text-mt-accent"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span className="text-mt-neutral-300">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <button
            type="button"
            onClick={handleWhatsappAvaliacaoClick}
            className="mt-btn mt-btn-primario mt-btn-bloco mt-foco"
          >
            <IconeWhatsApp />
            RECEBER PROPOSTA REAL
          </button>
          <p className="m-0 mt-3.5 text-[11px] leading-relaxed text-mt-neutral-500">
            O valor FIPE é referência de mercado, não é a nossa oferta. A
            proposta final depende de vistoria presencial em Curitiba.
          </p>
        </div>
      </aside>

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
    </section>
  );
}
